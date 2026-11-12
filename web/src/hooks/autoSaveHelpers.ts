import { apiFetch } from "@/lib/api";
import { useDataStore } from "@/store/useDataStore";
import * as cryptoLib from "@/lib/crypto";
import * as cryptoV2 from "@/lib/cryptoV2";
import { derivePublicNoteDEK } from "@/lib/cryptoV2";
import { createLinePatch, applyLinePatch } from "@/lib/diff";

interface ProseMirrorNodeLike {
    type?: string;
    content?: ProseMirrorNodeLike[];
    text?: string;
}

export function isDocEmpty(parsed: unknown): boolean {
    if (!parsed) return true;
    if (typeof parsed === 'string') return parsed.trim().length === 0;
    if (typeof parsed === 'object' && parsed !== null && (parsed as ProseMirrorNodeLike).type === 'doc') {
        const content = (parsed as ProseMirrorNodeLike).content;
        if (!content || content.length === 0) return true;
        for (const node of content) {
            if (node.type !== 'paragraph') return false;
            if (node.content?.some(t => (t.type && t.type !== 'text') || (t.text && t.text.trim().length > 0))) return false;
        }
        return true;
    }
    return false;
}

export function countWordsInTipTapJson(node: any): number {
    if (!node) return 0;
    let count = 0;
    if (node.text && typeof node.text === 'string') count += node.text.trim().split(/\s+/).filter(Boolean).length;
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
    } catch (e) { console.error("Failed to update edited notes stats", e); }

    if (json) {
        try {
            const currentWordCount = countWordsInTipTapJson(json);
            const prev = lastWordCounts[noteId];
            if (prev === undefined) {
                lastWordCounts[noteId] = currentWordCount;
            } else {
                if (currentWordCount > prev) {
                    const total = parseInt(localStorage.getItem('tide_stats_words_written') || '0', 10);
                    localStorage.setItem('tide_stats_words_written', (total + (currentWordCount - prev)).toString());
                }
                lastWordCounts[noteId] = currentWordCount;
            }
        } catch (e) { console.error("Failed to update words written stats", e); }
    }
}

export async function encryptContentV2(contentString: string, dek: CryptoKey): Promise<string> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, new TextEncoder().encode(contentString));
    return JSON.stringify({ data: cryptoLib.arrayBufferToBase64(encrypted), iv: cryptoLib.arrayBufferToBase64(iv.buffer as ArrayBuffer) });
}

export async function decryptContentV2(blobText: string, dek: CryptoKey): Promise<string> {
    const payload = JSON.parse(blobText);
    if (!payload.data || !payload.iv) return "";
    const ivBuf = cryptoLib.base64ToArrayBuffer(payload.iv);
    const dataBuf = cryptoLib.base64ToArrayBuffer(payload.data);
    const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, dek, dataBuf);
    return new TextDecoder().decode(decrypted);
}

const decodeB64ToBytes = (b64: string): Uint8Array => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
};

export async function decryptBackupSlot(
    backupData: any,
    bytes: Uint8Array,
    privKey: CryptoKey,
    myId: string,
    fileId: string
): Promise<string> {
    const ak = typeof backupData.access_keys === 'string' ? JSON.parse(backupData.access_keys) : (backupData.access_keys || {});
    const hasAccessKeys = Boolean(ak && typeof ak === 'object' && Object.keys(ak).length > 0);
    const isV2 = (backupData.version ?? 1) >= 2 || hasAccessKeys;
    if (isV2 && hasAccessKeys) {
        try {
            const myAccess = ak[myId] || Object.values(ak)[0] as any;
            if (myAccess?.wrapped_key) {
                const dek = await cryptoV2.importDEK(await cryptoV2.unwrapDEKData(myAccess.wrapped_key, privKey));
                return decryptContentV2(new TextDecoder().decode(bytes), dek);
            }
        } catch (_) {}
    }
    if (backupData.secured_meta) {
        try {
            const meta = await cryptoLib.decryptMetadata(backupData.secured_meta, privKey, `backup-${fileId}`);
            if (!meta.isLocked && meta.fileKey) {
                const fk = await window.crypto.subtle.importKey("jwk", meta.fileKey as JsonWebKey, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
                return (await cryptoLib.decryptFile(new Blob([bytes as any]), meta.iv as string, fk, fileId)).text();
            }
        } catch (_) {}
    }
    return "";
}

export interface RunClientBackupCascadeParams {
    fileId: string;
    contentString: string;
    dek: CryptoKey | null;
    accessKeysMap?: Record<string, { wrapped_key: string }> | null;
    currentFile: any;
    myId: string;
    privateKey: CryptoKey;
    publicKey?: CryptoKey | null;
}

export async function runClientBackupCascade(params: RunClientBackupCascadeParams): Promise<void> {
    const { fileId, contentString, dek, accessKeysMap, currentFile, myId, privateKey, publicKey } = params;
    try {
        const bListRes = await apiFetch(`/api/v1/files/${fileId}/backups`);
        if (!bListRes.ok) return;
        const backups = await bListRes.json();
        const slotMap: Record<string, any> = {};
        if (Array.isArray(backups)) {
            for (const b of backups) slotMap[b.slot_name.trim()] = b;
        }

        let effectivePubKey = publicKey || null;
        if (!effectivePubKey && privateKey) {
            try {
                const jwk = await window.crypto.subtle.exportKey("jwk", privateKey);
                if (jwk.n && jwk.e) {
                    effectivePubKey = await window.crypto.subtle.importKey(
                        "jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RSA-OAEP-256", ext: true, key_ops: ["encrypt"] },
                        { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]
                    );
                }
            } catch (_) {}
        }

        const isV2 = (currentFile?.version ?? 1) >= 2 || Boolean(currentFile?.access_keys);
        let effectiveAccessKeys: Record<string, { wrapped_key: string }> = accessKeysMap && Object.keys(accessKeysMap).length > 0
            ? { ...accessKeysMap }
            : (typeof currentFile?.access_keys === 'string'
                ? (() => { try { return JSON.parse(currentFile.access_keys); } catch { return {}; } })()
                : { ...(currentFile?.access_keys || {}) });

        if (!effectiveAccessKeys[myId]?.wrapped_key && dek && effectivePubKey) {
            try {
                const rawDek = await window.crypto.subtle.exportKey('raw', dek);
                effectiveAccessKeys[myId] = { wrapped_key: (await cryptoV2.wrapDEKData(rawDek, effectivePubKey)).ciphertext };
            } catch (e) {
                console.warn("[Backup Cascade] Could not wrap DEK for user", e);
            }
        }
        if (myId && !effectiveAccessKeys[myId]?.wrapped_key) {
            const firstAccess = Object.values(effectiveAccessKeys)[0];
            if (firstAccess?.wrapped_key) effectiveAccessKeys[myId] = firstAccess;
        }

        let v1Key: CryptoKey | null = dek;
        if (!isV2 && !v1Key && currentFile?.secured_meta && privateKey) {
            try {
                const meta = await cryptoLib.decryptMetadata(currentFile.secured_meta, privateKey, `backup-v1-${fileId}`);
                if (meta.fileKey) v1Key = await window.crypto.subtle.importKey("jwk", meta.fileKey as JsonWebKey, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
            } catch (_) {}
        }

        const encryptSlotPayload = async (text: string) => {
            if (isV2 && dek) {
                const cipher = await encryptContentV2(text, dek);
                return { version: 2, encrypted_blob: btoa(cipher), access_keys: effectiveAccessKeys };
            }
            if (v1Key && effectivePubKey) {
                const enc = await cryptoLib.encryptFile(new Blob([text]), v1Key, fileId);
                const jwk = await window.crypto.subtle.exportKey("jwk", v1Key);
                const metaPayload = { fileKey: jwk, iv: enc.iv };
                const secured_meta = await cryptoLib.encryptMetadata(metaPayload, effectivePubKey, `backup-${fileId}`);
                const encrypted_blob = cryptoLib.arrayBufferToBase64(await enc.ciphertext.arrayBuffer());
                return { version: 1, encrypted_blob, secured_meta };
            }
            return null;
        };

        if (!slotMap["1 week"]) {
            const payload = await encryptSlotPayload(contentString);
            if (!payload) return;
            await apiFetch(`/api/v1/files/${fileId}/backups/${encodeURIComponent("1 week")}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
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

        if (baseSlot && baseSlot.encrypted_blob) {
            try {
                basePlainJson = await decryptBackupSlot(baseSlot, decodeB64ToBytes(baseSlot.encrypted_blob), privateKey, myId, fileId);
            } catch (e) {
                console.warn("[Backup Cascade] Failed to decrypt base slot", e);
            }
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
                const payload = await encryptSlotPayload(JSON.stringify(patch));
                if (payload) {
                    await apiFetch(`/api/v1/files/${fileId}/backups/${encodeURIComponent(slot.name)}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
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
                    const decryptedText = await decryptBackupSlot(backupData, decodeB64ToBytes(backupData.encrypted_blob), effectivePrivKey, effectiveMyId, fileId);
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
                                            basePlainText = await decryptBackupSlot(bData, decodeB64ToBytes(bData.encrypted_blob), effectivePrivKey, effectiveMyId, fileId);
                                        }
                                    }
                                } catch (baseErr) {
                                    console.warn("[RECOVERY] Failed to decrypt base for delta reconstruction", baseErr);
                                }
                            }
                            if (basePlainText) {
                                try { parsedDecrypted = JSON.parse(applyLinePatch(basePlainText, parsedDecrypted)); } catch { continue; }
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

const makeDecErrorDoc = (ver: string) => JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: `⚠️ ${ver} DECRYPTION ERROR: ` }, { type: 'text', text: 'Content corrupted or key mismatch.' }] }]
});

export interface DecryptedNotePayload {
    contentText: string;
    fileKeyToUse: CryptoKey | null;
    title?: string;
}

function ensureTipTapContent(rawText: string): string {
    if (!rawText) return "";
    const trimmed = rawText.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(rawText);
            if (parsed && typeof parsed === 'object') return rawText;
        } catch (_) {}
    }
    return JSON.stringify({
        type: 'doc',
        content: rawText.split(/\r?\n/).map(line => ({
            type: 'paragraph',
            attrs: { blockId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) },
            content: line.length > 0 ? [{ type: 'text', text: line }] : []
        }))
    });
}

export async function decryptNotePayload(params: {
    target: any;
    fileId: string;
    effectivePrivKey: CryptoKey;
    effectiveMyId: string;
    onNotFound: () => void;
}): Promise<DecryptedNotePayload> {
    const { target, fileId, effectivePrivKey, effectiveMyId, onNotFound } = params;

    const parsedTargetMeta = typeof target?.metadata === 'string'
        ? (() => { try { return JSON.parse(target.metadata); } catch { return {}; } })()
        : (target?.metadata || {});

    const isExplicitlyUnencrypted = target?.visibility === 'public'
        || target?.unencrypted === true
        || target?.is_unencrypted === true
        || parsedTargetMeta?.unencrypted === true;

    const fetchDownload = async () => {
        const res = await apiFetch(`/api/v1/files/${fileId}/download`);
        if (res.status === 404) { onNotFound(); throw new Error("File not found on server (404)"); }
        return res;
    };

    if (isExplicitlyUnencrypted) {
        const resBlob = await fetchDownload();
        const rawText = resBlob.ok ? await resBlob.text() : "";
        return { contentText: ensureTipTapContent(rawText), fileKeyToUse: await derivePublicNoteDEK(fileId), title: parsedTargetMeta?.title || target?.title };
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
                    const pwdKey = await cryptoLib.deriveKeyFromPassword(sessionPin, cryptoLib.base64ToArrayBuffer(target.metadata.pwd_salt));
                    rawDek = await cryptoV2.unwrapDEKData(cryptoLib.arrayBufferToBase64(rawDek), pwdKey, myAccess.pwd_iv);
                } catch (pwdErr) { console.warn('[V2-Load] PIN unwrap with session PIN failed:', pwdErr); }
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

        const resBlob = await fetchDownload();
        let contentText = "";
        if (resBlob.ok) {
            const blobText = await resBlob.text();
            if (blobText) {
                try { contentText = await decryptContentV2(blobText, dek); } catch (_) { contentText = makeDecErrorDoc("V2"); }
            }
        }
        return { contentText, fileKeyToUse: dek, title };
    }

    if (!target.secured_meta) throw new Error("Missing metadata");
    const meta = await cryptoLib.decryptMetadata(target.secured_meta, effectivePrivKey, `load-${fileId}`);
    if (meta?.unencrypted === true) {
        const resBlob = await fetchDownload();
        const rawText = resBlob.ok ? await resBlob.text() : "";
        return { contentText: ensureTipTapContent(rawText), fileKeyToUse: await derivePublicNoteDEK(fileId), title: (meta.title || target?.title) as string };
    }
    if (!meta.fileKey || typeof meta.fileKey !== 'object' || !(meta.fileKey as any).kty) {
        throw new Error("Invalid or missing FileKey structure.");
    }
    const importedFileKey = await window.crypto.subtle.importKey("jwk", meta.fileKey as JsonWebKey, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);

    const resBlob = await fetchDownload();
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
        accessKeysMap = typeof currentFile.access_keys === 'string' ? JSON.parse(currentFile.access_keys) : (currentFile.access_keys || {});
        const myAccess = accessKeysMap[freshMyId];
        if (myAccess?.wrapped_key) {
            try { dek = await cryptoV2.importDEK(await cryptoV2.unwrapDEKData(myAccess.wrapped_key, freshPrivKey)); } catch (_) {}
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

export async function uploadPublicFile(fileId: string, contentString: string, fallbackTitle: string, onNotFound: () => void): Promise<void> {
    await apiFetch(`/api/v1/files/${fileId}/upload`, { method: 'POST', body: new Blob([contentString], { type: 'application/json' }) });
    const allPublic = [...useDataStore.getState().notes, ...useDataStore.getState().events] as any[];
    const title = allPublic.find((f: any) => f.id === fileId)?.title || fallbackTitle || 'Untitled';
    const putRes = await apiFetch(`/api/v1/files/${fileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_meta: { title } })
    });
    if (putRes.status === 404) { onNotFound(); return; }
    useDataStore.getState().updateFileRaw(fileId, { public_meta: { title }, title });
    try { localStorage.removeItem(`tide_backup_${fileId}`); } catch (_) {}
}
