import { apiFetch } from "@/lib/api";
import { useDataStore } from "@/store/useDataStore";
import * as cryptoLib from "@/lib/crypto";
import * as cryptoV2 from "@/lib/cryptoV2";
import { createLinePatch, applyLinePatch } from "@/lib/diff";

interface ProseMirrorNodeLike {
    type?: string;
    content?: ProseMirrorNodeLike[];
    text?: string;
}

export function isDocEmpty(parsed: unknown): boolean {
    if (!parsed) return true;
    if (typeof parsed === 'string') return parsed.trim().length === 0;
    if (typeof parsed === 'object' && parsed !== null) {
        const obj = parsed as ProseMirrorNodeLike;
        if (obj.type === 'doc') {
            if (!obj.content || obj.content.length === 0) return true;
            for (const node of obj.content) {
                if (node.type !== 'paragraph') return false;
                if (node.content && node.content.length > 0) {
                    for (const textNode of node.content) {
                        if (textNode.type && textNode.type !== 'text') return false;
                        if (textNode.text && textNode.text.trim().length > 0) return false;
                    }
                }
            }
            return true;
        }
    }
    return false;
}

export function countWordsInTipTapJson(node: any): number {
    if (!node) return 0;
    let count = 0;
    if (node.text && typeof node.text === 'string') {
        count += node.text.trim().split(/\s+/).filter(Boolean).length;
    }
    if (node.content && Array.isArray(node.content)) {
        for (const child of node.content) count += countWordsInTipTapJson(child);
    }
    return count;
}

export function recordNoteStats(noteId: string, json: any, lastWordCounts: Record<string, number>): void {
    if (typeof window === 'undefined') return;
    try {
        const editedStr = localStorage.getItem('tide_stats_edited_notes');
        const editedNotes = editedStr ? JSON.parse(editedStr) : [];
        if (Array.isArray(editedNotes) && !editedNotes.includes(noteId)) {
            editedNotes.push(noteId);
            localStorage.setItem('tide_stats_edited_notes', JSON.stringify(editedNotes));
        }
    } catch (e) {
        console.error("Failed to update edited notes stats", e);
    }

    if (json) {
        try {
            const currentWordCount = countWordsInTipTapJson(json);
            if (lastWordCounts[noteId] === undefined) {
                lastWordCounts[noteId] = currentWordCount;
            } else {
                const prev = lastWordCounts[noteId];
                if (currentWordCount > prev) {
                    const diff = currentWordCount - prev;
                    const total = parseInt(localStorage.getItem('tide_stats_words_written') || '0', 10);
                    localStorage.setItem('tide_stats_words_written', (total + diff).toString());
                }
                lastWordCounts[noteId] = currentWordCount;
            }
        } catch (e) {
            console.error("Failed to update words written stats", e);
        }
    }
}

export async function encryptContentV2(contentString: string, dek: CryptoKey): Promise<string> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, new TextEncoder().encode(contentString));
    return JSON.stringify({
        data: cryptoLib.arrayBufferToBase64(encrypted),
        iv: cryptoLib.arrayBufferToBase64(iv.buffer as ArrayBuffer)
    });
}

export async function decryptContentV2(blobText: string, dek: CryptoKey): Promise<string> {
    const payload = JSON.parse(blobText);
    if (!payload.data || !payload.iv) return "";
    const ivBuf = cryptoLib.base64ToArrayBuffer(payload.iv);
    const dataBuf = cryptoLib.base64ToArrayBuffer(payload.data);
    const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, dek, dataBuf);
    return new TextDecoder().decode(decrypted);
}

export async function decryptBackupSlot(
    backupData: any,
    bytes: Uint8Array,
    privKey: CryptoKey,
    myId: string,
    fileId: string
): Promise<string> {
    const isV2 = (backupData.version ?? 1) >= 2 || !backupData.access_keys;
    if (isV2) {
        const ak = typeof backupData.access_keys === 'string' ? JSON.parse(backupData.access_keys) : (backupData.access_keys || {});
        const myAccess = ak[myId] || Object.values(ak)[0] as any;
        if (myAccess?.wrapped_key) {
            const rawDek = await cryptoV2.unwrapDEKData(myAccess.wrapped_key, privKey);
            const dek = await cryptoV2.importDEK(rawDek);
            return decryptContentV2(new TextDecoder().decode(bytes), dek);
        }
    } else if (backupData.secured_meta) {
        const meta = await cryptoLib.decryptMetadata(backupData.secured_meta, privKey, `backup-${fileId}`);
        if (!meta.isLocked) {
            const fk = await window.crypto.subtle.importKey("jwk", meta.fileKey as JsonWebKey, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
            const decBlob = await cryptoLib.decryptFile(new Blob([bytes as any]), meta.iv as string, fk, fileId);
            return decBlob.text();
        }
    }
    return "";
}

export async function runClientBackupCascade(params: {
    fileId: string;
    contentString: string;
    dek: CryptoKey | null;
    accessKeysMap: Record<string, { wrapped_key: string }>;
    currentFile: any;
    myId: string;
    privateKey: CryptoKey;
}): Promise<void> {
    const { fileId, contentString, dek, accessKeysMap, currentFile, myId, privateKey } = params;
    try {
        const bListRes = await apiFetch(`/api/v1/files/${fileId}/backups`);
        if (!bListRes.ok) return;
        const backups = await bListRes.json();
        const slotMap: Record<string, any> = {};
        if (Array.isArray(backups)) {
            for (const b of backups) slotMap[b.slot_name.trim()] = b;
        }

        if (!slotMap["1 week"]) {
            if (!dek) return;
            const baseCiphertext = await encryptContentV2(contentString, dek);
            await apiFetch(`/api/v1/files/${fileId}/backups/${encodeURIComponent("1 week")}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version: 2, encrypted_blob: btoa(baseCiphertext), access_keys: accessKeysMap })
            });
            return;
        }

        let basePlainJson = "";
        let baseSlot = slotMap["1 week"];
        if (baseSlot && !baseSlot.encrypted_blob) {
            try {
                const fullBaseRes = await apiFetch(`/api/v1/files/${fileId}/backups/${encodeURIComponent("1 week")}`);
                if (fullBaseRes.ok) baseSlot = await fullBaseRes.json();
            } catch (err) {
                console.warn("[Backup Cascade] Failed to fetch full 1 week base backup slot", err);
            }
        }

        try {
            if (baseSlot && baseSlot.encrypted_blob) {
                const bin = atob(baseSlot.encrypted_blob);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                basePlainJson = await decryptBackupSlot(baseSlot, bytes, privateKey, myId, fileId);
            }
        } catch (e) {
            console.warn("[Backup Cascade] Failed to decrypt base slot", e);
        }

        if (!basePlainJson) return;

        const now = new Date();
        const deltaSlots = [
            { name: "10 minutes", dur: 10 * 60 * 1000 },
            { name: "30 minutes", dur: 30 * 60 * 1000 },
            { name: "1 hour", dur: 60 * 60 * 1000 },
            { name: "1 day", dur: 24 * 60 * 60 * 1000 },
            { name: "2 days", dur: 2 * 24 * 60 * 60 * 1000 },
        ];

        for (const slot of deltaSlots) {
            const b = slotMap[slot.name];
            if (!b || (now.getTime() - new Date(b.updated_at).getTime()) > slot.dur) {
                const patch = createLinePatch(basePlainJson, contentString);
                const patchStr = JSON.stringify(patch);

                if (currentFile?.version === 2 && dek) {
                    const patchCiphertext = await encryptContentV2(patchStr, dek);
                    await apiFetch(`/api/v1/files/${fileId}/backups/${encodeURIComponent(slot.name)}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ version: 2, encrypted_blob: btoa(patchCiphertext), access_keys: accessKeysMap })
                    });
                } else {
                    const metaStr = typeof currentFile?.secured_meta === 'string'
                        ? currentFile.secured_meta : JSON.stringify(currentFile?.secured_meta || {});
                    await apiFetch(`/api/v1/files/${fileId}/backups/${encodeURIComponent(slot.name)}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ version: 1, encrypted_blob: btoa(patchStr), secured_meta: metaStr })
                    });
                }
            }
        }
    } catch (bErr) {
        console.error("[Backup Cascade Error]", bErr);
    }
}

export async function restoreFromBackupHistory(
    fileId: string,
    effectivePrivKey: CryptoKey,
    effectiveMyId: string
): Promise<any | null> {
    try {
        const bListRes = await apiFetch(`/api/v1/files/${fileId}/backups`);
        if (!bListRes.ok) return null;
        const backups = await bListRes.json();
        if (!Array.isArray(backups) || backups.length === 0) return null;

        const sortedSlots = [...backups].sort((a, b) => {
            const aIsBase = a.slot_name?.trim() === '1 week' ? -1 : 0;
            const bIsBase = b.slot_name?.trim() === '1 week' ? -1 : 0;
            if (aIsBase !== bIsBase) return aIsBase - bIsBase;
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });

        let basePlainText = "";
        const baseSlotEntry = backups.find(s => s.slot_name?.trim() === '1 week');

        for (const slot of sortedSlots) {
            if (!effectivePrivKey) break;
            const bRes = await apiFetch(`/api/v1/files/${fileId}/backups/${encodeURIComponent(slot.slot_name)}`);
            if (bRes.ok) {
                const backupData = await bRes.json();
                if (backupData.encrypted_blob) {
                    const bin = atob(backupData.encrypted_blob);
                    const bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

                    const decryptedText = await decryptBackupSlot(backupData, bytes, effectivePrivKey, effectiveMyId, fileId);

                    if (decryptedText) {
                        if (slot.slot_name.trim() === '1 week') basePlainText = decryptedText;
                        let parsedDecrypted: any = null;
                        try { parsedDecrypted = JSON.parse(decryptedText); } catch { parsedDecrypted = decryptedText; }

                        if (Array.isArray(parsedDecrypted)) {
                            if (!basePlainText && baseSlotEntry) {
                                try {
                                    const baseRes = await apiFetch(`/api/v1/files/${fileId}/backups/${encodeURIComponent(baseSlotEntry.slot_name)}`);
                                    if (baseRes.ok) {
                                        const bData = await baseRes.json();
                                        if (bData.encrypted_blob) {
                                            const bBin = atob(bData.encrypted_blob);
                                            const bBytes = new Uint8Array(bBin.length);
                                            for (let bi = 0; bi < bBin.length; bi++) bBytes[bi] = bBin.charCodeAt(bi);
                                            basePlainText = await decryptBackupSlot(bData, bBytes, effectivePrivKey, effectiveMyId, fileId);
                                        }
                                    }
                                } catch (baseErr) {
                                    console.warn("[RECOVERY] Failed to decrypt base for delta reconstruction", baseErr);
                                }
                            }
                            if (basePlainText) {
                                try {
                                    parsedDecrypted = JSON.parse(applyLinePatch(basePlainText, parsedDecrypted));
                                } catch {
                                    continue;
                                }
                            } else {
                                continue;
                            }
                        }

                        if (!isDocEmpty(parsedDecrypted)) return parsedDecrypted;
                    }
                }
            }
        }
    } catch (recoveryErr) {
        console.error("[RECOVERY] Error during auto-restore:", recoveryErr);
    }
    return null;
}

const makeDecErrorDoc = (version: string) => JSON.stringify({
    type: 'doc',
    content: [{
        type: 'paragraph',
        content: [
            { type: 'text', marks: [{ type: 'bold' }], text: `⚠️ ${version} DECRYPTION ERROR: ` },
            { type: 'text', text: 'Content corrupted or key mismatch.' }
        ]
    }]
});

export interface DecryptedNotePayload {
    contentText: string;
    fileKeyToUse: CryptoKey | null;
    title?: string;
}

export async function decryptNotePayload(params: {
    target: any;
    fileId: string;
    effectivePrivKey: CryptoKey;
    effectiveMyId: string;
    onNotFound: () => void;
}): Promise<DecryptedNotePayload> {
    const { target, fileId, effectivePrivKey, effectiveMyId, onNotFound } = params;

    if (target.visibility === 'public') {
        const resBlob = await apiFetch(`/api/v1/files/${fileId}/download`);
        if (resBlob.status === 404) {
            onNotFound();
            throw new Error("File not found on server (404)");
        }
        return { contentText: resBlob.ok ? await resBlob.text() : "", fileKeyToUse: null };
    }

    if ((target.version ?? 1) >= 2 && target.access_keys) {
        const accessKeys = typeof target.access_keys === 'string' ? JSON.parse(target.access_keys) : (target.access_keys || {});
        const myAccess = (effectiveMyId ? accessKeys[effectiveMyId] : null) || Object.values(accessKeys)[0] as any;
        if (!myAccess?.wrapped_key) throw new Error(`[V2-Load] No access key found for user ${effectiveMyId}.`);

        let rawDek = await cryptoV2.unwrapDEKData(myAccess.wrapped_key, effectivePrivKey);
        if (target.metadata?.has_custom_password) {
            const { getSessionPin } = await import('@/lib/pinSecurity');
            const sessionPin = getSessionPin(fileId);
            if (sessionPin && target.metadata.pwd_salt) {
                try {
                    const saltBuffer = cryptoLib.base64ToArrayBuffer(target.metadata.pwd_salt);
                    const pwdKey = await cryptoLib.deriveKeyFromPassword(sessionPin, saltBuffer);
                    rawDek = await cryptoV2.unwrapDEKData(cryptoLib.arrayBufferToBase64(rawDek), pwdKey, myAccess.pwd_iv);
                } catch (pwdErr) {
                    console.warn('[V2-Load] PIN unwrap with session PIN failed:', pwdErr);
                }
            }
        }
        const dek = await cryptoV2.importDEK(rawDek);

        let title = (target.metadata as any)?.title || target.title;
        if (target.secured_meta) {
            try {
                const parsedMeta = JSON.parse(await decryptContentV2(target.secured_meta, dek));
                if (parsedMeta.title) title = parsedMeta.title;
            } catch {
                try {
                    const mMeta = await cryptoLib.decryptMetadata(target.secured_meta, effectivePrivKey, `load-v2-${fileId}`);
                    if (mMeta.title) title = mMeta.title as string;
                } catch (_) {}
            }
        }

        const resBlob = await apiFetch(`/api/v1/files/${fileId}/download`);
        if (resBlob.status === 404) {
            onNotFound();
            throw new Error("File not found on server (404)");
        }
        let contentText = "";
        if (resBlob.ok) {
            const blobText = await resBlob.text();
            if (blobText) {
                try {
                    contentText = await decryptContentV2(blobText, dek);
                } catch (_) {
                    contentText = makeDecErrorDoc("V2");
                }
            }
        }
        return { contentText, fileKeyToUse: dek, title };
    }

    if (!target.secured_meta) throw new Error("Missing metadata");
    const meta = await cryptoLib.decryptMetadata(target.secured_meta, effectivePrivKey, `load-${fileId}`);
    if (!meta.fileKey || typeof meta.fileKey !== 'object' || !(meta.fileKey as any).kty) {
        throw new Error("Invalid or missing FileKey structure.");
    }
    const importedFileKey = await window.crypto.subtle.importKey("jwk", meta.fileKey as JsonWebKey, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);

    const resBlob = await apiFetch(`/api/v1/files/${fileId}/download`);
    if (resBlob.status === 404) {
        onNotFound();
        throw new Error("File not found on server (404)");
    }
    let contentText = "";
    if (resBlob.ok) {
        const blob = await resBlob.blob();
        if (blob.size > 0) {
            try {
                const decBlob = await cryptoLib.decryptFile(blob, meta.iv as string, importedFileKey, fileId);
                contentText = await decBlob.text();
            } catch (_) {
                contentText = makeDecErrorDoc("V1");
            }
        }
    }
    return { contentText, fileKeyToUse: importedFileKey, title: meta.title as string };
}

export async function resolveSaveDEK(
    currentFile: any,
    freshMyId: string,
    freshPrivKey: CryptoKey,
    freshPubKey: CryptoKey
): Promise<{ dek: CryptoKey; accessKeysMap: Record<string, { wrapped_key: string }>; generatedNewDek: boolean }> {
    let dek: CryptoKey | null = null;
    let accessKeysMap: Record<string, { wrapped_key: string }> = {};

    if (currentFile?.version >= 2 && currentFile?.access_keys) {
        const existingKeys = typeof currentFile.access_keys === 'string'
            ? JSON.parse(currentFile.access_keys) : (currentFile.access_keys || {});
        const myAccess = existingKeys[freshMyId];
        if (myAccess?.wrapped_key) {
            try {
                const rawDek = await cryptoV2.unwrapDEKData(myAccess.wrapped_key, freshPrivKey);
                dek = await cryptoV2.importDEK(rawDek);
                accessKeysMap = existingKeys;
            } catch (_) {}
        } else {
            accessKeysMap = existingKeys;
        }
    }

    let generatedNewDek = false;
    if (!dek) {
        dek = await cryptoV2.generateDEK();
        const rawDek = await window.crypto.subtle.exportKey('raw', dek);
        const wrapped = await cryptoV2.wrapDEKData(rawDek, freshPubKey);
        accessKeysMap = { ...accessKeysMap, [freshMyId]: { wrapped_key: wrapped.ciphertext } };
        generatedNewDek = true;
    }
    return { dek, accessKeysMap, generatedNewDek };
}

export async function uploadPublicFile(
    fileId: string,
    contentString: string,
    fallbackTitle: string,
    onNotFound: () => void
): Promise<void> {
    const blob = new Blob([contentString], { type: 'application/json' });
    await apiFetch(`/api/v1/files/${fileId}/upload`, { method: 'POST', body: blob });
    const allPublic = [...useDataStore.getState().notes, ...useDataStore.getState().events] as any[];
    const title = allPublic.find((f: any) => f.id === fileId)?.title || fallbackTitle || 'Untitled';
    const putRes = await apiFetch(`/api/v1/files/${fileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_meta: { title } })
    });
    if (putRes.status === 404) {
        onNotFound();
        return;
    }
    useDataStore.getState().updateFileRaw(fileId, { public_meta: { title }, title });
    try { localStorage.removeItem(`tide_backup_${fileId}`); } catch (_) {}
}
