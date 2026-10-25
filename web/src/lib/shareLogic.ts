import * as cryptoV2 from './cryptoV2';
import * as cryptoLib from './crypto';
import { apiFetch } from './api';
import { useDataStore } from '../store/useDataStore';

export async function performMessengerShare(
    shareModalFile: { id: string; title: string; type?: string },
    myId: string,
    privateKey: CryptoKey,
    publicKey: CryptoKey,
    events: any[],
    recipientId: string,
    recipientEmail: string,
    recipientPubKeySpki: string,
    permission: 'view' | 'edit' | 'share' = 'view',
    dependencyFileIds: string[] = [],
    canReshare: boolean = false
) {
    if (!shareModalFile || !privateKey || !publicKey) {
        throw new Error("Invalid state");
    }

    const fileId = shareModalFile.id;

    try {
        // 1. Fetch file to get current access_keys
        const res = await apiFetch(`/api/v1/files/${fileId}`);
        if (!res.ok) throw new Error("Failed to fetch file");
        const file = await res.json().catch(() => null);
        if (!file) throw new Error("Failed to parse file metadata");

        // 2. Import Recipient Public Key First
        const recipientPubKey = await window.crypto.subtle.importKey(
            "spki",
            cryptoLib.base64ToArrayBuffer(recipientPubKeySpki),
            { name: "RSA-OAEP", hash: "SHA-256" },
            true,
            ["encrypt"]
        );

        // 3. True Zero-Knowledge Sharing via DEK unwrapping/wrapping
        const accessKeysMap = typeof file.access_keys === 'string' ? JSON.parse(file.access_keys) : (file.access_keys || {});
        const myAccess = accessKeysMap[myId];
        
        if (!myAccess || !myAccess.wrapped_key) {
            throw new Error("No access key found for the owner. Ensure file is V2 encrypted.");
        }

        // Unwrap the DEK using the owner's private key
        const rawDek = await cryptoV2.unwrapDEKData(myAccess.wrapped_key, privateKey);
        
        // Wrap the DEK using the recipient's public key
        const recipientWrapped = await cryptoV2.wrapDEKData(rawDek, recipientPubKey);

        // Prepare full metadata object for recipient
        const isEvent = file.type === 'event' || shareModalFile.type === 'event';
        let recipientMetaObj: any = { title: shareModalFile.title };

        if (isEvent) {
            const ev = events.find((e: any) => e.id === fileId);
            if (ev) {
                recipientMetaObj = {
                    title: ev.title || shareModalFile.title,
                    start: ev.start,
                    end: ev.end,
                    color: ev.color,
                    description: ev.description,
                    recurrence_rule: ev.recurrence_rule,
                    recurrence_end: ev.recurrence_end,
                    exdates: ev.exdates,
                    completed_dates: ev.completed_dates,
                    is_task: ev.is_task,
                    is_completed: ev.is_completed,
                    is_cancelled: ev.is_cancelled,
                    allDay: ev.allDay,
                };
            } else if (file.secured_meta) {
                const dec = await cryptoLib.decryptMetadata(file.secured_meta, privateKey, `share-event-${fileId}`);
                if (!dec.isLocked) {
                    recipientMetaObj = { ...dec, title: shareModalFile.title || dec.title };
                }
            }
        } else if (file.secured_meta) {
            const dec = await cryptoLib.decryptMetadata(file.secured_meta, privateKey, `share-meta-${fileId}`);
            if (!dec.isLocked) {
                recipientMetaObj = { ...dec, title: shareModalFile.title || dec.title };
            }
        }

        // Encrypt the full metadata with recipient's public key
        const recipientSecuredMeta = await cryptoLib.encryptMetadata(
            recipientMetaObj,
            recipientPubKey
        );
        
        // Push the sharing update to the backend.
        const shareRes = await apiFetch(`/api/v1/files/${fileId}/share`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                recipient_id: recipientId,
                email: recipientEmail,
                secured_meta: recipientSecuredMeta,   // RSA-encrypted metadata for recipient
                wrapped_dek: recipientWrapped.ciphertext, // wrapped DEK for access_keys
                permission,                            // 'view' | 'edit' | 'share'
                can_reshare: canReshare ?? false,
            })
        });

        if (!shareRes.ok) {
            const errText = await shareRes.text();
            throw new Error(`Failed to share file: ${shareRes.status} - ${errText}`);
        }

        // 3b. Batch-share selected dependency files/assets
        if (dependencyFileIds && dependencyFileIds.length > 0) {
            for (const depId of dependencyFileIds) {
                try {
                    const depRes = await apiFetch(`/api/v1/files/${depId}`);
                    if (!depRes.ok) continue;
                    const depFile = await depRes.json().catch(() => null);
                    if (!depFile) continue;

                    const depAccessKeys = typeof depFile.access_keys === 'string' ? JSON.parse(depFile.access_keys) : (depFile.access_keys || {});
                    const depMyAccess = depAccessKeys[myId];
                    if (!depMyAccess || !depMyAccess.wrapped_key) continue;

                    const depRawDek = await cryptoV2.unwrapDEKData(depMyAccess.wrapped_key, privateKey);
                    const depRecipientWrapped = await cryptoV2.wrapDEKData(depRawDek, recipientPubKey);

                    // Encrypt dep title for recipient
                    const depTitle = depFile.metadata?.title || depFile.title || 'Untitled';
                    const depSecuredMeta = await cryptoLib.encryptMetadata(
                        { title: depTitle },
                        recipientPubKey
                    );

                    await apiFetch(`/api/v1/files/${depId}/share`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            recipient_id: recipientId,
                            email: recipientEmail,
                            secured_meta: depSecuredMeta,
                            wrapped_dek: depRecipientWrapped.ciphertext,
                            permission,
                        })
                    });
                } catch (depErr) {
                    console.warn(`[Share] Failed to share dependency ${depId}:`, depErr);
                }
            }
        }

        // Build a readable share-card payload for the chat. Events get start/end metadata.
        const eventMeta = isEvent ? (() => {
            try {
                const ev = events.find((e: any) => e.id === fileId);
                if (ev) {
                    return {
                        start: ev.start,
                        end: ev.end,
                        title: ev.title || shareModalFile.title,
                        color: ev.color,
                        description: ev.description,
                        allDay: ev.allDay
                    };
                }
            } catch { /* ignore */ }
            return null;
        })() : null;

        const currentUser = (useDataStore.getState() as any).user;
        const senderName = currentUser?.name || currentUser?.email || (typeof window !== 'undefined' ? localStorage.getItem('tide_user_name') || '' : '') || '';

        const messageRes = await apiFetch("/api/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                recipient_id: recipientId,
                recipient_email: recipientEmail,
                content: JSON.stringify({
                    type: isEvent ? "event_share" : "file_share_request",
                    file_id: fileId,
                    file_name: shareModalFile.title,
                    file_type: file.type,
                    file_preview: isEvent ? "" : "Shared document",
                    permission,
                    can_reshare: canReshare ?? false,
                    event_meta: eventMeta,
                    sender_name: senderName,
                })
            })
        });

        if (!messageRes.ok) {
            const errText = await messageRes.text();
            throw new Error(`Failed to send share request: ${messageRes.status} - ${errText}`);
        }
    } catch (err) {
        console.error("Share failed:", err);
        throw err;
    }
}

/**
 * Share a folder with a recipient by re-encrypting its secured_meta (title) for them,
 * and recursively wrapping DEKs and sharing all nested descendant items.
 */
export async function performFolderShare(
    folderId: string,
    folderTitle: string,
    myId: string,
    privateKey: CryptoKey,
    publicKey: CryptoKey,
    recipientId: string,
    recipientEmail: string,
    recipientPubKeySpki: string,
    permission: 'view' | 'edit' | 'share' = 'view'
) {
    const recipientPubKey = await window.crypto.subtle.importKey(
        "spki",
        cryptoLib.base64ToArrayBuffer(recipientPubKeySpki),
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"]
    );

    // 1. Re-encrypt folder metadata (title) for recipient
    const recipientSecuredMeta = await cryptoLib.encryptMetadata(
        { title: folderTitle },
        recipientPubKey
    );

    const shareRes = await apiFetch(`/api/v1/files/${folderId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            recipient_id: recipientId,
            email: recipientEmail,
            secured_meta: recipientSecuredMeta,
            permission,
        })
    });

    if (!shareRes.ok) {
        const errText = await shareRes.text();
        throw new Error(`Failed to share folder: ${shareRes.status} - ${errText}`);
    }

    // 2. Recursively find and share all descendant files, canvases, and events
    try {
        const [filesRes, eventsRes] = await Promise.all([
            apiFetch('/api/v1/files?recursive=true'),
            apiFetch('/api/v1/files?type=event&recursive=true')
        ]);

        const allItems: any[] = [];
        if (filesRes.ok) {
            const list = await filesRes.json().catch(() => []);
            if (Array.isArray(list)) allItems.push(...list);
        }
        if (eventsRes.ok) {
            const evList = await eventsRes.json().catch(() => []);
            if (Array.isArray(evList)) allItems.push(...evList);
        }

        // Trace all descendants under folderId
        const descendantMap = new Map<string, any>();
        const queue = [folderId];
        while (queue.length > 0) {
            const currentParent = queue.shift()!;
            for (const item of allItems) {
                if (item.parent_id === currentParent && !descendantMap.has(item.id)) {
                    descendantMap.set(item.id, item);
                    if (item.type === 'folder') {
                        queue.push(item.id);
                    }
                }
            }
        }

        // Share each descendant item
        for (const child of Array.from(descendantMap.values())) {
            try {
                if (child.type === 'folder') {
                    const childTitle = child.metadata?.title || child.title || "Untitled";
                    const childSecuredMeta = await cryptoLib.encryptMetadata(
                        { title: childTitle },
                        recipientPubKey
                    );
                    await apiFetch(`/api/v1/files/${child.id}/share`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            recipient_id: recipientId,
                            email: recipientEmail,
                            secured_meta: childSecuredMeta,
                            permission,
                        })
                    });
                } else {
                    // For files and events: unwrap DEK and re-wrap for recipient
                    const childAccessKeys = typeof child.access_keys === 'string'
                        ? JSON.parse(child.access_keys)
                        : (child.access_keys || {});
                    const childMyAccess = childAccessKeys[myId];
                    if (!childMyAccess || !childMyAccess.wrapped_key) continue;

                    const rawDek = await cryptoV2.unwrapDEKData(childMyAccess.wrapped_key, privateKey);
                    const childRecipientWrapped = await cryptoV2.wrapDEKData(rawDek, recipientPubKey);

                    let childMetaObj: any = { title: child.title || child.metadata?.title || "Untitled" };
                    if (child.secured_meta) {
                        const dec = await cryptoLib.decryptMetadata(child.secured_meta, privateKey, `folder-child-${child.id}`);
                        if (!dec.isLocked) {
                            childMetaObj = { ...dec, title: childMetaObj.title || dec.title };
                        }
                    }

                    const childSecuredMeta = await cryptoLib.encryptMetadata(childMetaObj, recipientPubKey);

                    await apiFetch(`/api/v1/files/${child.id}/share`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            recipient_id: recipientId,
                            email: recipientEmail,
                            secured_meta: childSecuredMeta,
                            wrapped_dek: childRecipientWrapped.ciphertext,
                            permission,
                        })
                    });
                }
            } catch (childErr) {
                console.warn(`[FolderShare] Failed to share nested child ${child.id}:`, childErr);
            }
        }
    } catch (descendantErr) {
        console.warn("[FolderShare] Failed to scan descendants:", descendantErr);
    }

    const currentUser = (useDataStore.getState() as any).user;
    const senderName = currentUser?.name || currentUser?.email || (typeof window !== 'undefined' ? localStorage.getItem('tide_user_name') || '' : '') || '';

    // 3. Send chat notification
    await apiFetch("/api/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            recipient_id: recipientId,
            recipient_email: recipientEmail,
            content: JSON.stringify({
                type: "file_share_request",
                file_id: folderId,
                file_name: folderTitle,
                file_type: "folder",
                file_preview: "Shared folder and all nested contents",
                permission,
                sender_name: senderName,
            })
        })
    });
}
