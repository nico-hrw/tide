import { apiFetch } from "@/lib/api";
import { useDataStore } from "@/store/useDataStore";
import * as cryptoLib from "@/lib/crypto";
import * as cryptoV2 from "@/lib/cryptoV2";
import { derivePublicNoteDEK } from "@/lib/cryptoV2";
import { decryptSecuredEnvelope } from "@/lib/e2eePayload";
import { applyLinePatch, type LinePatchOp } from "@/lib/diff";
import {
    BACKUP_TIERS,
    isBackupSlotName,
    chooseArchiveCandidate,
    planBackupCascade,
    type BackupSlotMeta,
    type BackupSlotName,
} from "@/lib/noteBackupCascade";
import { markdownToTipTap } from "../lib/bundleImportExport";

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

const NOTE_STATS_DEBOUNCE_MS = 1000;
const noteStatsTimers = new Map<string, ReturnType<typeof setTimeout>>();

function flushNoteStats(noteId: string, json: unknown, lastWordCounts: Record<string, number>): void {
    try {
        const editedStr = localStorage.getItem('tide_stats_edited_notes');
        const editedNotes = editedStr ? JSON.parse(editedStr) : [];
        if (Array.isArray(editedNotes) && !editedNotes.includes(noteId)) {
            editedNotes.push(noteId);
            localStorage.setItem('tide_stats_edited_notes', JSON.stringify(editedNotes));
        }
    } catch (e) { console.error("Failed to update edited notes stats", e); }
    if (!json) return;
    try {
        const currentWordCount = countWordsInTipTapJson(json);
        const prev = lastWordCounts[noteId];
        if (prev !== undefined && currentWordCount > prev) {
            const total = parseInt(localStorage.getItem('tide_stats_words_written') || '0', 10);
            localStorage.setItem('tide_stats_words_written', (total + (currentWordCount - prev)).toString());
        }
        lastWordCounts[noteId] = currentWordCount;
    } catch (e) { console.error("Failed to update words written stats", e); }
}

export function recordNoteStats(noteId: string, json: unknown, lastWordCounts: Record<string, number>): void {
    if (typeof window === 'undefined') return;
    const existing = noteStatsTimers.get(noteId);
    if (existing) clearTimeout(existing);
    noteStatsTimers.set(noteId, setTimeout(() => {
        noteStatsTimers.delete(noteId);
        flushNoteStats(noteId, json, lastWordCounts);
    }, NOTE_STATS_DEBOUNCE_MS));
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
    previousContentString?: string | null;
    previousTimestampMs?: number | null;
    dek: CryptoKey | null;
    accessKeysMap?: Record<string, { wrapped_key: string }> | null;
    currentFile: any;
    myId: string;
    privateKey: CryptoKey;
    publicKey?: CryptoKey | null;
}

type ServerBackupSlot = { slot_name: string; updated_at: string; encrypted_blob?: string; version?: number; access_keys?: unknown; secured_meta?: string };

const parsePatchArray = (raw: string): LinePatchOp[] | null => {
    try { const p: unknown = JSON.parse(raw); return Array.isArray(p) ? (p as LinePatchOp[]) : null; } catch { return null; }
};

async function fetchDecryptedBackupSlot(
    fileId: string, slotName: string, privKey: CryptoKey, myId: string, slotMap?: Partial<Record<BackupSlotName, ServerBackupSlot>>
): Promise<string | null> {
    let slotData = isBackupSlotName(slotName) ? slotMap?.[slotName] : undefined;
    if (!slotData?.encrypted_blob) {
        try {
            const res = await apiFetch(`/api/v1/files/${fileId}/backups/${encodeURIComponent(slotName)}`);
            if (!res.ok) return null;
            slotData = (await res.json()) as ServerBackupSlot;
            if (slotMap && isBackupSlotName(slotName) && slotData) slotMap[slotName] = slotData;
        } catch { return null; }
    }
    if (!slotData?.encrypted_blob) return null;
    try { return (await decryptBackupSlot(slotData, decodeB64ToBytes(slotData.encrypted_blob), privKey, myId, fileId)) || null; } catch { return null; }
}

async function derivePublicKeyFromPrivate(privateKey: CryptoKey): Promise<CryptoKey | null> {
    try {
        const jwk = await window.crypto.subtle.exportKey("jwk", privateKey);
        if (!jwk.n || !jwk.e) return null;
        return await window.crypto.subtle.importKey(
            "jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RSA-OAEP-256", ext: true, key_ops: ["encrypt"] },
            { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]
        );
    } catch { return null; }
}

export async function runClientBackupCascade(params: RunClientBackupCascadeParams): Promise<void> {
    const { fileId, contentString, previousContentString, previousTimestampMs, dek, accessKeysMap, currentFile, myId, privateKey, publicKey } = params;
    try {
        const bListRes = await apiFetch(`/api/v1/files/${fileId}/backups`);
        if (!bListRes.ok) return;
        const backups: unknown = await bListRes.json();
        const slotMap: Partial<Record<BackupSlotName, ServerBackupSlot>> = {};
        const existingSlots: Partial<Record<BackupSlotName, BackupSlotMeta>> = {};
        if (Array.isArray(backups)) {
            for (const raw of backups) {
                if (!raw || typeof raw !== "object") continue;
                const b = raw as Partial<ServerBackupSlot>;
                const trimmed = typeof b.slot_name === "string" ? b.slot_name.trim() : "";
                const updatedAtMs = typeof b.updated_at === "string" ? Date.parse(b.updated_at) : Number.NaN;
                if (!isBackupSlotName(trimmed) || !Number.isFinite(updatedAtMs)) continue;
                slotMap[trimmed] = { ...b, slot_name: trimmed, updated_at: b.updated_at as string };
                existingSlots[trimmed] = { slotName: trimmed, updatedAtMs };
            }
        }

        const nowMs = Date.now();
        const candidate = chooseArchiveCandidate({
            previousContent: previousContentString ?? null, previousCapturedAtMs: previousTimestampMs ?? null,
            currentContent: contentString, hasExistingBackups: Object.keys(existingSlots).length > 0, nowMs,
        });
        if (!candidate) return;

        const fetchAndMaterializeSlot = async (slotName: BackupSlotName, cachedBaseRef: { value: string | null }): Promise<string | null> => {
            const decrypted = await fetchDecryptedBackupSlot(fileId, slotName, privateKey, myId, slotMap);
            if (!decrypted) return null;
            const patch = parsePatchArray(decrypted);
            if (!patch) return decrypted;
            if (slotName === "1 week") return null;
            if (cachedBaseRef.value === null) cachedBaseRef.value = await fetchDecryptedBackupSlot(fileId, "1 week", privateKey, myId, slotMap);
            if (!cachedBaseRef.value) return null;
            try { return applyLinePatch(cachedBaseRef.value, patch); } catch { return null; }
        };

        const cachedBaseRef: { value: string | null } = { value: null };
        const newestSlotName = (Object.entries(existingSlots) as [BackupSlotName, BackupSlotMeta][]).reduce<BackupSlotName | null>(
            (best, [name, meta]) => (!best || meta.updatedAtMs > (existingSlots[best]?.updatedAtMs ?? -Infinity) ? name : best), null
        );
        const newestSlotContent = newestSlotName ? await fetchAndMaterializeSlot(newestSlotName, cachedBaseRef) : null;
        const actions = planBackupCascade({ existingSlots, newestSlotContent, incomingContent: candidate.contentString, incomingCapturedAtMs: candidate.capturedAtMs, nowMs });
        if (actions.length === 0) return;

        const effectivePubKey = publicKey || (privateKey ? await derivePublicKeyFromPrivate(privateKey) : null);
        const isV2 = (currentFile?.version ?? 1) >= 2 || Boolean(currentFile?.access_keys);
        const effectiveAccessKeys: Record<string, { wrapped_key: string }> = accessKeysMap && Object.keys(accessKeysMap).length > 0
            ? { ...accessKeysMap }
            : (typeof currentFile?.access_keys === 'string'
                ? (() => { try { return JSON.parse(currentFile.access_keys); } catch { return {}; } })()
                : { ...(currentFile?.access_keys || {}) });

        if (myId && !effectiveAccessKeys[myId]?.wrapped_key && dek && effectivePubKey) {
            try {
                const rawDek = await window.crypto.subtle.exportKey('raw', dek);
                effectiveAccessKeys[myId] = { wrapped_key: (await cryptoV2.wrapDEKData(rawDek, effectivePubKey)).ciphertext };
            } catch (e) { console.warn("[Backup Cascade] Could not wrap DEK for user", e); }
        }

        let v1Key: CryptoKey | null = dek;
        if (!isV2 && !v1Key && currentFile?.secured_meta && privateKey) {
            try {
                const meta = await cryptoLib.decryptMetadata(currentFile.secured_meta, privateKey, `backup-v1-${fileId}`);
                if (meta.fileKey) v1Key = await window.crypto.subtle.importKey("jwk", meta.fileKey as JsonWebKey, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
            } catch (_) {}
        }

        const encryptSlotPayload = async (text: string, updatedAtMs?: number) => {
            const tsField = typeof updatedAtMs === "number" && Number.isFinite(updatedAtMs) ? { updated_at: new Date(updatedAtMs).toISOString() } : {};
            if (isV2 && dek) return { version: 2, encrypted_blob: btoa(await encryptContentV2(text, dek)), access_keys: effectiveAccessKeys, ...tsField };
            if (v1Key && effectivePubKey) {
                const enc = await cryptoLib.encryptFile(new Blob([text]), v1Key, fileId);
                const jwk = await window.crypto.subtle.exportKey("jwk", v1Key);
                const secured_meta = await cryptoLib.encryptMetadata({ fileKey: jwk, iv: enc.iv }, effectivePubKey, `backup-${fileId}`);
                return { version: 1, encrypted_blob: cryptoLib.arrayBufferToBase64(await enc.ciphertext.arrayBuffer()), secured_meta, ...tsField };
            }
            return null;
        };

        const putSlot = async (slotName: BackupSlotName, text: string, updatedAtMs?: number): Promise<boolean> => {
            const payload = await encryptSlotPayload(text, updatedAtMs);
            if (!payload) return false;
            const res = await apiFetch(`/api/v1/files/${fileId}/backups/${encodeURIComponent(slotName)}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            });
            if (res.ok) delete slotMap[slotName];
            return res.ok;
        };

        const overwrittenTargets = new Set<BackupSlotName>(actions.map(a => a.toSlot));
        if (overwrittenTargets.has("1 week") && existingSlots["1 week"]) {
            if (cachedBaseRef.value === null) cachedBaseRef.value = await fetchDecryptedBackupSlot(fileId, "1 week", privateKey, myId, slotMap);
            for (const tier of BACKUP_TIERS) {
                const slotName = tier.name;
                if (slotName === "1 week" || overwrittenTargets.has(slotName) || !existingSlots[slotName]) continue;
                const rawText = await fetchDecryptedBackupSlot(fileId, slotName, privateKey, myId, slotMap);
                const patch = rawText ? parsePatchArray(rawText) : null;
                if (!patch) continue;
                if (!cachedBaseRef.value) return;
                let materialized: string;
                try { materialized = applyLinePatch(cachedBaseRef.value, patch); } catch { return; }
                if (!(await putSlot(slotName, materialized, existingSlots[slotName]!.updatedAtMs))) return;
            }
        }

        for (const action of actions) {
            if (action.type === "promote") {
                const materialized = await fetchAndMaterializeSlot(action.fromSlot, cachedBaseRef);
                if (!materialized || !(await putSlot(action.toSlot, materialized, action.updatedAtMs))) return;
            } else if (!(await putSlot(action.toSlot, action.contentString, action.updatedAtMs))) { return; }
        }
    } catch (bErr) { console.error("[Backup Cascade Error]", bErr); }
}

export async function restoreFromBackupHistory(fileId: string, effectivePrivKey: CryptoKey, effectiveMyId: string): Promise<any | null> {
    try {
        const bListRes = await apiFetch(`/api/v1/files/${fileId}/backups`);
        if (!bListRes.ok) return null;
        const backups = await bListRes.json();
        if (!Array.isArray(backups) || backups.length === 0) return null;
        const sortedSlots = [...backups].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        let basePlainText = "";
        const baseSlotEntry = backups.find(s => s.slot_name?.trim() === '1 week');
        for (const slot of sortedSlots) {
            if (!effectivePrivKey) break;
            const decryptedText = await fetchDecryptedBackupSlot(fileId, slot.slot_name, effectivePrivKey, effectiveMyId);
            if (!decryptedText) continue;
            if (slot.slot_name.trim() === '1 week') basePlainText = decryptedText;
            let parsedDecrypted: any = null;
            try { parsedDecrypted = JSON.parse(decryptedText); } catch { parsedDecrypted = decryptedText; }
            if (Array.isArray(parsedDecrypted)) {
                if (!basePlainText && baseSlotEntry) basePlainText = (await fetchDecryptedBackupSlot(fileId, baseSlotEntry.slot_name, effectivePrivKey, effectiveMyId)) || "";
                if (!basePlainText) continue;
                try { parsedDecrypted = JSON.parse(applyLinePatch(basePlainText, parsedDecrypted)); } catch { continue; }
            }
            if (!isDocEmpty(parsedDecrypted)) return parsedDecrypted;
        }
    } catch (recoveryErr) { console.error("[RECOVERY] Error during auto-restore:", recoveryErr); }
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

export function parseUnencryptedNoteContent(rawText: string): string {
    const trimmed = rawText.trim();
    if (!trimmed) {
        return JSON.stringify(markdownToTipTap(''));
    }
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed: unknown = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as ProseMirrorNodeLike).type === 'doc') {
                return ensureTipTapContent(trimmed);
            }
        } catch {
            // Fall through to Markdown parsing if invalid JSON
        }
    }
    return JSON.stringify(markdownToTipTap(rawText));
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

    const parsedAccessKeys = typeof target?.access_keys === 'string'
        ? (() => { try { return JSON.parse(target.access_keys); } catch { return {}; } })()
        : (target?.access_keys || {});
    const hasEncryptedKeyMaterial = Boolean(
        (typeof target?.secured_meta === 'string' && target.secured_meta.length > 0)
        || (effectiveMyId && parsedAccessKeys?.[effectiveMyId]?.wrapped_key)
    );

    const isExplicitlyUnencrypted = target?.visibility === 'public'
        || (
            !hasEncryptedKeyMaterial && (
                target?.unencrypted === true
                || target?.is_unencrypted === true
                || parsedTargetMeta?.unencrypted === true
            )
        );

    const fetchDownload = async () => {
        const res = await apiFetch(`/api/v1/files/${fileId}/download`);
        if (res.status === 404) { onNotFound(); throw new Error("File not found on server (404)"); }
        return res;
    };

    if (isExplicitlyUnencrypted) {
        const resBlob = await fetchDownload();
        const rawText = resBlob.ok ? await resBlob.text() : "";
        return { contentText: parseUnencryptedNoteContent(rawText), fileKeyToUse: await derivePublicNoteDEK(fileId), title: parsedTargetMeta?.title || target?.title };
    }

    if ((target.version ?? 1) >= 2 && target.access_keys) {
        const accessKeys = typeof target.access_keys === 'string' ? JSON.parse(target.access_keys) : (target.access_keys || {});
        const myAccess = (effectiveMyId ? accessKeys[effectiveMyId] : null) || Object.values(accessKeys)[0] as any;
        if (!myAccess?.wrapped_key) throw new Error(`[V2-Load] No access key found for user ${effectiveMyId}.`);

        let rawDek = await cryptoV2.unwrapDEKData(myAccess.wrapped_key, effectivePrivKey);
        const hasCustomPassword = Boolean(parsedTargetMeta?.has_custom_password || target.metadata?.has_custom_password);
        if (hasCustomPassword) {
            const { getSessionPin, isItemUnlocked, verifyPin } = await import('@/lib/pinSecurity');
            const sessionPin = getSessionPin(fileId);
            const pwdSalt = (parsedTargetMeta?.pwd_salt || target.metadata?.pwd_salt) as string | undefined;
            if (myAccess.pwd_iv || rawDek.byteLength !== 32) {
                if (!sessionPin || !pwdSalt) throw new Error('PIN_REQUIRED');
                try {
                    const pwdKey = await cryptoLib.deriveKeyFromPassword(sessionPin, cryptoLib.base64ToArrayBuffer(pwdSalt));
                    rawDek = await cryptoV2.unwrapDEKData(cryptoLib.arrayBufferToBase64(rawDek), pwdKey, myAccess.pwd_iv);
                } catch (pwdErr) { throw new Error('PIN_REQUIRED', { cause: pwdErr }); }
            } else {
                const pinHash = (parsedTargetMeta?.pin_hash || target.metadata?.pin_hash) as string | undefined;
                const secSettings = parsedTargetMeta?.security_settings || (hasCustomPassword ? parsedTargetMeta : null);
                if (sessionPin && pwdSalt && pinHash) {
                    if (!(await verifyPin(sessionPin, pwdSalt, pinHash))) throw new Error('PIN_REQUIRED');
                } else if (!sessionPin && (!secSettings || !isItemUnlocked(fileId, secSettings))) {
                    throw new Error('PIN_REQUIRED');
                }
            }
        }
        const dek = await cryptoV2.importDEK(rawDek);

        let title = (target.metadata as Record<string, unknown> | undefined)?.title as string | undefined || target.title;
        if (target.secured_meta) {
            try {
                const parsedMeta = JSON.parse(await decryptContentV2(target.secured_meta, dek));
                if (parsedMeta.title) title = parsedMeta.title;
            } catch {
                try {
                    const mMeta = await decryptSecuredEnvelope(target.secured_meta, effectivePrivKey, {
                        accessKeys: target.access_keys,
                        myId: effectiveMyId,
                        cacheId: `load-v2-${fileId}`,
                    });
                    if (typeof mMeta.title === 'string' && !mMeta.isLocked) title = mMeta.title;
                } catch {
                    // Keep existing title fallback
                }
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
        return { contentText: parseUnencryptedNoteContent(rawText), fileKeyToUse: await derivePublicNoteDEK(fileId), title: (meta.title || target?.title) as string };
    }
    if (!meta.fileKey || typeof meta.fileKey !== 'object' || !(meta.fileKey as any).kty) throw new Error("Invalid or missing FileKey structure.");
    const importedFileKey = await window.crypto.subtle.importKey("jwk", meta.fileKey as JsonWebKey, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);

    const resBlob = await fetchDownload();
    let contentText = "";
    if (resBlob.ok) {
        const blob = await resBlob.blob();
        if (blob.size > 0) {
            try { contentText = await (await cryptoLib.decryptFile(blob, meta.iv as string, importedFileKey, fileId)).text(); } catch (_) { contentText = makeDecErrorDoc("V1"); }
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
    const putRes = await apiFetch(`/api/v1/files/${fileId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ public_meta: { title } }) });
    if (putRes.status === 404) { onNotFound(); return; }
    useDataStore.getState().updateFileRaw(fileId, { public_meta: { title }, title });
    try { localStorage.removeItem(`tide_backup_${fileId}`); } catch (_) {}
}
