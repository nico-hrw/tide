import * as cryptoLib from './crypto';

export async function performMessengerShare(
    shareModalFile: { id: string; title: string },
    myId: string,
    privateKey: CryptoKey,
    publicKey: CryptoKey,
    events: any[],
    recipientEmail: string,
    recipientPubKeySpki: string
) {
    if (!shareModalFile || !privateKey || !publicKey) {
        throw new Error("Invalid state");
    }

    const fileId = shareModalFile.id;

    try {
        // 1. Fetch full file metadata  
        const res = await fetch(`/api/v1/files/${fileId}`, {
            headers: { "X-User-ID": myId }
        });
        if (!res.ok) throw new Error("Failed to fetch file");
        const file = await res.json();

        // 2. Get metadata - NEVER decrypt public files
        let meta;
        if (file.visibility === 'public') {
            if (file.public_meta && file.public_meta.title) {
                meta = file.public_meta;
            } else {
                // Fallback for legacy public files without public_meta
                meta = { title: shareModalFile.title, content: "" };
            }
        } else if (file.secured_meta) {
            // Private file: decrypt metadata
            let securedMetaBase64 = "";
            if (typeof file.secured_meta === 'string') {
                securedMetaBase64 = file.secured_meta;
            } else {
                securedMetaBase64 = cryptoLib.arrayBufferToBase64(new Uint8Array(file.secured_meta).buffer as ArrayBuffer);
            }
            meta = await cryptoLib.decryptMetadata(securedMetaBase64, privateKey);
        } else {
            throw new Error("No metadata available");
        }

        // 3. Import Recipient Public Key First (Need it for both Note and Images)
        const recipientPubKey = await window.crypto.subtle.importKey(
            "spki",
            cryptoLib.base64ToArrayBuffer(recipientPubKeySpki),
            { name: "RSA-OAEP", hash: "SHA-256" },
            true,
            ["encrypt"]
        );

        // 4. Handle Note Content (Deep copy and re-encrypt images if present)
        if (file.type === 'note') {
            const resBlob = await fetch(`/api/v1/files/${fileId}/download`, { headers: { "X-User-ID": myId } });
            if (resBlob.ok) {
                const blob = await resBlob.blob();
                const fileKeyInfo = await window.crypto.subtle.importKey(
                    "jwk", meta.fileKey,
                    { name: "AES-GCM" },
                    true, ["encrypt", "decrypt"]
                );
                const decBlob = await cryptoLib.decryptFile(blob, meta.iv, fileKeyInfo);
                const text = await decBlob.text();

                try {
                    const contentJson = JSON.parse(text);
                    let modified = false;

                    // Check for canvas elements
                    if (contentJson.canvasElements && Array.isArray(contentJson.canvasElements)) {
                        for (let i = 0; i < contentJson.canvasElements.length; i++) {
                            const el = contentJson.canvasElements[i];
                            if (el.type === 'image' && el.blobId && el.blobId !== '__pending__' && el.encryptedKey) {
                                try {
                                    // 1. Decrypt image metadata and download image
                                    const imgMeta = await cryptoLib.decryptMetadata(el.encryptedKey, privateKey);
                                    const imgFileKeyInfo = await window.crypto.subtle.importKey(
                                        'jwk', imgMeta.fileKey as any,
                                        { name: 'AES-GCM' }, false, ['decrypt']
                                    );
                                    const imgRes = await fetch(`/api/v1/files/${el.blobId}/download`, { headers: { 'X-User-ID': myId } });
                                    if (imgRes.ok) {
                                        const imgDecBlob = await cryptoLib.decryptFile(await imgRes.blob(), imgMeta.iv as string, imgFileKeyInfo);

                                        // 2. Re-encrypt image for recipient
                                        const newImgFileKey = await cryptoLib.generateFileKey();
                                        const newImgFileKeyJwk = await window.crypto.subtle.exportKey('jwk', newImgFileKey);
                                        const { iv: newImgIv, ciphertext: newImgCiphertext } = await cryptoLib.encryptFile(imgDecBlob, newImgFileKey);
                                        const newImgEncryptedMeta = await cryptoLib.encryptMetadata({ title: imgMeta.title, fileKey: newImgFileKeyJwk, iv: newImgIv }, recipientPubKey);

                                        // 3. Upload as new file for recipient
                                        const createRes = await fetch('/api/v1/files', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json', 'X-User-ID': myId },
                                            body: JSON.stringify({
                                                type: 'note',
                                                size: newImgCiphertext.size,
                                                public_meta: {},
                                                secured_meta: Array.from(new Uint8Array(cryptoLib.base64ToArrayBuffer(newImgEncryptedMeta))),
                                                visibility: 'private'
                                            }),
                                        });
                                        if (createRes.ok) {
                                            const newImgFile = await createRes.json();
                                            await fetch(`/api/v1/files/${newImgFile.id}/upload`, {
                                                method: 'POST', headers: { 'X-User-ID': myId }, body: newImgCiphertext
                                            });

                                            el.blobId = newImgFile.id;
                                            el.encryptedKey = newImgEncryptedMeta;
                                            el.iv = newImgIv;
                                            modified = true;
                                        }
                                    }
                                } catch (e) { console.error("Could not process image for sharing", e); }
                            }
                        }
                    }

                    if (modified) {
                        const newText = JSON.stringify(contentJson);
                        const newBlob = new Blob([newText], { type: 'application/json' });
                        const newNoteFileKey = await cryptoLib.generateFileKey();
                        const newNoteFileKeyJwk = await window.crypto.subtle.exportKey('jwk', newNoteFileKey);
                        const { iv: newNoteIv, ciphertext: newNoteCiphertext } = await cryptoLib.encryptFile(newBlob, newNoteFileKey);
                        const newNoteMeta = { ...meta, fileKey: newNoteFileKeyJwk, iv: newNoteIv };
                        const newNoteEncryptedMeta = await cryptoLib.encryptMetadata(newNoteMeta, recipientPubKey);

                        const createNoteRes = await fetch('/api/v1/files', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-User-ID': myId },
                            body: JSON.stringify({
                                type: 'note',
                                size: newNoteCiphertext.size,
                                public_meta: {},
                                secured_meta: Array.from(new Uint8Array(cryptoLib.base64ToArrayBuffer(newNoteEncryptedMeta))),
                                visibility: 'private'
                            }),
                        });

                        if (createNoteRes.ok) {
                            const newNoteFile = await createNoteRes.json();
                            await fetch(`/api/v1/files/${newNoteFile.id}/upload`, {
                                method: 'POST', headers: { 'X-User-ID': myId }, body: newNoteCiphertext
                            });

                            const shareRes = await fetch(`/api/v1/files/${newNoteFile.id}/share`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json", "X-User-ID": myId },
                                body: JSON.stringify({
                                    email: recipientEmail,
                                    secured_meta: Array.from(new Uint8Array(cryptoLib.base64ToArrayBuffer(newNoteEncryptedMeta)))
                                })
                            });

                            if (!shareRes.ok) throw new Error("Failed to share copied file");

                            await fetch("/api/v1/messages", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", "X-User-ID": myId },
                                body: JSON.stringify({
                                    recipient_email: recipientEmail,
                                    content: JSON.stringify({
                                        type: "file_share_request",
                                        file_id: newNoteFile.id,
                                        file_name: meta.title,
                                        file_type: "note",
                                        file_preview: newText.replace(/<[^>]*>?/gm, '').substring(0, 150)
                                    })
                                })
                            });

                            return;
                        }
                    }
                } catch (e) { console.error("Failed to parse note json", e); }
            }
        }

        if (file.type === 'folder' && file.isGroup && events) {
            const groupEvents = events.filter(e => e.parent_id === fileId);
            for (const ev of groupEvents) {
                try {
                    const evMeta = { title: ev.title, start: ev.start, end: ev.end, color: ev.color, description: ev.description, allDay: ev.allDay, isGroup: false };
                    const evEncrypted = await cryptoLib.encryptMetadata(evMeta, recipientPubKey);
                    await fetch(`/api/v1/files/${ev.id}/share`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "X-User-ID": myId },
                        body: JSON.stringify({
                            email: recipientEmail,
                            secured_meta: Array.from(new Uint8Array(cryptoLib.base64ToArrayBuffer(evEncrypted)))
                        })
                    });
                } catch (err) {
                    console.error("Failed to share child event", ev.id, err);
                }
            }
        }

        const reEncryptedMeta = await cryptoLib.encryptMetadata(meta, recipientPubKey);
        const shareRes = await fetch(`/api/v1/files/${fileId}/share`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-User-ID": myId },
            body: JSON.stringify({
                email: recipientEmail,
                secured_meta: Array.from(new Uint8Array(cryptoLib.base64ToArrayBuffer(reEncryptedMeta)))
            })
        });

        if (!shareRes.ok) throw new Error("Failed to share file");

        const messageRes = await fetch("/api/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-User-ID": myId },
            body: JSON.stringify({
                recipient_email: recipientEmail,
                content: JSON.stringify({
                    type: "file_share_request",
                    file_id: fileId,
                    file_name: shareModalFile.title,
                    file_type: file.type,
                    file_preview: file.type === 'event'
                        ? { start: meta.start, end: meta.end, description: meta.description }
                        : (meta.content ? meta.content.substring(0, 150) : "")
                })
            })
        });

        if (!messageRes.ok) throw new Error("Failed to send share request");
    } catch (err) {
        console.error("Share failed:", err);
        throw err;
    }
}
