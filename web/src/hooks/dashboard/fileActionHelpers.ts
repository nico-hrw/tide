import { apiFetch } from "@/lib/api";
import * as cryptoLib from "@/lib/crypto";
import * as cryptoV2 from "@/lib/cryptoV2";
import {
    decryptSecuredEnvelope,
    encryptSecuredEnvelope,
    stripSensitiveFileMetadata,
} from "@/lib/e2eePayload";
import { useDataStore, type DataItem } from "@/store/useDataStore";

export type FileSaveStatus = "saved" | "unsaved" | "saving";

export interface DeleteConfirmState {
    isOpen?: boolean;
    fileId: string;
    isShared: boolean;
    isFolder: boolean;
}

export interface DeleteErrorState {
    fileId: string;
    title: string;
    message: string;
    isCorrupt: boolean;
}

export interface ShareModalFileState {
    id: string;
    title: string;
    type?: string;
    callerPermission?: "owner" | "view" | "edit" | "share";
}

export interface NoteSecurityModalItem {
    id: string;
    title: string;
    type: "file" | "folder" | "canvas" | "note";
    metadata?: Record<string, unknown>;
}

export interface FileActionItem {
    id: string;
    title: string;
    type: string;
    visibility?: string;
    secured_meta?: string;
    share_status?: string;
    owner_id?: string;
    can_reshare?: boolean;
    share_permission?: string;
    permission?: string;
    version?: number;
    access_keys?: string | Record<string, unknown> | undefined | null;
    metadata?: Record<string, unknown>;
    public_meta?: Record<string, unknown>;
    isLocked?: boolean;
}

export interface EventActionItem {
    id: string;
    title: string;
}

export type DecryptedMeta = Record<string, unknown> & {
    title: string;
    fileKey?: JsonWebKey;
    iv?: string;
};

export interface VisibilityUpdatePayload {
    visibility: string;
    public_meta?: Record<string, unknown>;
    secured_meta?: string | unknown[];
    version?: number;
    access_keys?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

interface ContactPartnerRecord {
    partner: {
        email: string;
        public_key: string;
    };
}

export function asRecord(value: unknown): Record<string, unknown> {
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            return {};
        }
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return {};
}

export function parseAccessKeys(raw: unknown): Record<string, { wrapped_key?: string }> {
    const rec = asRecord(raw);
    const result: Record<string, { wrapped_key?: string }> = {};
    for (const [k, v] of Object.entries(rec)) {
        if (v && typeof v === "object") {
            const entry = v as { wrapped_key?: unknown };
            result[k] = {
                wrapped_key: typeof entry.wrapped_key === "string" ? entry.wrapped_key : undefined,
            };
        }
    }
    return result;
}

export function hasV2AccessKeys(raw: unknown): boolean {
    if (!raw) return false;
    if (typeof raw === "string") return raw !== "null" && raw !== "{}";
    if (typeof raw === "object") return Object.keys(raw as Record<string, unknown>).length > 0;
    return false;
}

export async function buildEncryptedRenamePayload(
    target: DataItem,
    fileId: string,
    newTitle: string,
    publicKey: CryptoKey,
    privateKey: CryptoKey
): Promise<{ secured_meta: string; metadata: Record<string, unknown> }> {
    const existingMetadata =
        target.metadata && typeof target.metadata === "object" ? (target.metadata as Record<string, unknown>) : {};
    const hasSecured = typeof target.secured_meta === "string" && target.secured_meta.trim().length > 0;
    if (existingMetadata.unencrypted === true && !hasSecured) {
        return {
            secured_meta: "",
            metadata: { ...existingMetadata, title: newTitle },
        };
    }

    let currentSecuredMeta = typeof target.secured_meta === "string" ? target.secured_meta : undefined;
    if (!currentSecuredMeta) {
        const res = await apiFetch(`/api/v1/files/${fileId}`);
        if (res.ok) {
            const freshFile = (await res.json()) as { secured_meta?: string };
            currentSecuredMeta = freshFile.secured_meta;
        }
    }

    let decryptedBase: Record<string, unknown> = {};
    if (currentSecuredMeta) {
        const decrypted = await decryptSecuredEnvelope(currentSecuredMeta, privateKey, {
            accessKeys: target.access_keys,
        });
        if (!decrypted.isLocked) {
            decryptedBase = decrypted;
        }
    }

    const metaToEncrypt: Record<string, unknown> = {
        ...decryptedBase,
        title: newTitle,
        isLocked: false,
        ...(typeof target.safe === "string" && target.safe ? { safe: target.safe } : {}),
        ...(Array.isArray(target.linkedSafes) ? { linkedSafes: target.linkedSafes } : {}),
        ...(Array.isArray(target.tagIds) ? { tagIds: target.tagIds } : {}),
        ...(typeof target.icon === "string" && target.icon ? { icon: target.icon } : {}),
        ...(typeof target.color === "string" && target.color ? { color: target.color } : {}),
    };
    const encryptedMeta = await encryptSecuredEnvelope(metaToEncrypt, publicKey);

    return {
        secured_meta: encryptedMeta,
        metadata: stripSensitiveFileMetadata(existingMetadata),
    };
}

export async function resolveCurrentMetadata(
    file: FileActionItem,
    prevVisibility: string,
    privateKey: CryptoKey
): Promise<DecryptedMeta> {
    if (prevVisibility === "public") {
        return { title: file.title || "Untitled" };
    }
    if (file.secured_meta) {
        try {
            const dec = await decryptSecuredEnvelope(file.secured_meta, privateKey, {
                accessKeys: file.access_keys,
            });
            return { ...dec, title: typeof dec.title === "string" ? dec.title : file.title || "Untitled" };
        } catch {
            // Fall back to plaintext metadata below
        }
    }
    const parsedMeta = asRecord(file.metadata);
    const fallbackTitle = typeof parsedMeta.title === "string" ? parsedMeta.title : file.title || "Untitled";
    return { title: fallbackTitle };
}

export async function downloadAndDecryptContent(
    file: FileActionItem,
    fileId: string,
    prevVisibility: string,
    myId: string,
    privateKey: CryptoKey,
    currentMeta: DecryptedMeta
): Promise<Blob | null> {
    const resBlob = await apiFetch(`/api/v1/files/${fileId}/download`);
    if (!resBlob.ok) return null;
    if (prevVisibility === "public") return resBlob.blob();

    const isV2 = (typeof file.version === "number" && file.version >= 2) || Boolean(file.access_keys);
    if (isV2) {
        const accessKeys = parseAccessKeys(file.access_keys);
        const myAccess = accessKeys[myId];
        if (!myAccess?.wrapped_key) throw new Error("No V2 access key for visibility toggle");
        const rawDek = await cryptoV2.unwrapDEKData(myAccess.wrapped_key, privateKey);
        const dek = await cryptoV2.importDEK(rawDek);
        const blobText = await resBlob.text();
        if (!blobText) return null;
        const payload = JSON.parse(blobText) as { data?: string; iv?: string };
        if (!payload.data || !payload.iv) return null;
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: cryptoLib.base64ToArrayBuffer(payload.iv) },
            dek,
            cryptoLib.base64ToArrayBuffer(payload.data)
        );
        return new Blob([decrypted]);
    }

    const blob = await resBlob.blob();
    const fileKey = await window.crypto.subtle.importKey(
        "jwk",
        currentMeta.fileKey as JsonWebKey,
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"]
    );
    return cryptoLib.decryptFile(blob, currentMeta.iv as string, fileKey);
}

export async function prepareVisibilityUpdate(
    file: FileActionItem,
    newVisibility: string,
    contentBlob: Blob | null,
    currentMeta: DecryptedMeta,
    myId: string,
    publicKey: CryptoKey
): Promise<{ uploadBlob: Blob | null; updatePayload: VisibilityUpdatePayload; nextMeta: DecryptedMeta }> {
    const isFolder = file.type === "folder";
    let uploadBlob: Blob | null = null;
    let nextMeta = currentMeta;
    const updatePayload: VisibilityUpdatePayload = { visibility: newVisibility };

    if (newVisibility === "public") {
        if (!isFolder) uploadBlob = contentBlob || new Blob([], { type: "text/plain" });
        updatePayload.public_meta = { title: currentMeta.title };
        updatePayload.secured_meta = [];
        return { uploadBlob, updatePayload, nextMeta };
    }

    if (isFolder) {
        updatePayload.secured_meta = await encryptSecuredEnvelope({ title: currentMeta.title }, publicKey);
    } else {
        const isV2File = (typeof file.version === "number" && file.version >= 2) || Boolean(file.access_keys);
        if (isV2File) {
            const contentStr = contentBlob ? await contentBlob.text() : "";
            const v2Result = await cryptoV2.encryptFileV2(contentStr || "", publicKey);
            updatePayload.version = typeof file.version === "number" ? file.version : 2;
            updatePayload.access_keys = { [myId]: v2Result.encrypted_dek };
            updatePayload.metadata = stripSensitiveFileMetadata(v2Result.metadata);
            updatePayload.secured_meta = await encryptSecuredEnvelope({ title: currentMeta.title }, publicKey);
            uploadBlob = new Blob([v2Result.content_ciphertext], { type: "application/json" });
            nextMeta = { title: currentMeta.title };
        } else {
            const fileKey = await window.crypto.subtle.generateKey(
                { name: "AES-GCM", length: 256 },
                true,
                ["encrypt", "decrypt"]
            );
            const encrypted = await cryptoLib.encryptFile(contentBlob || new Blob([]), fileKey);
            uploadBlob = encrypted.ciphertext;
            const exportedV1Key = await window.crypto.subtle.exportKey("jwk", fileKey);
            const metaPayload: DecryptedMeta = {
                title: currentMeta.title,
                fileKey: exportedV1Key,
                iv: encrypted.iv,
            };
            updatePayload.secured_meta = await encryptSecuredEnvelope(metaPayload, publicKey);
            nextMeta = metaPayload;
        }
    }

    updatePayload.public_meta = {};
    return { uploadBlob, updatePayload, nextMeta };
}

export async function updateVisibilityWithConflictRetry(
    fileId: string,
    updatePayload: VisibilityUpdatePayload
): Promise<void> {
    let updateRes = await apiFetch(`/api/v1/files/${fileId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
    });

    if (updateRes.status === 409) {
        try {
            const conflictData = (await updateRes.json()) as { current_version?: number };
            if (typeof conflictData?.current_version === "number") {
                updatePayload.version = conflictData.current_version;
                useDataStore.setState((s) => ({
                    notes: s.notes.map((f) =>
                        f.id === fileId ? { ...f, version: conflictData.current_version } : f
                    ),
                }));
                const retryRes = await apiFetch(`/api/v1/files/${fileId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(updatePayload),
                });
                if (retryRes.ok) updateRes = retryRes;
            }
        } catch (conflictErr) {
            console.error("Conflict resolution failed for visibility update", conflictErr);
        }
    }

    if (!updateRes.ok) {
        throw new Error("Failed to update visibility");
    }

    try {
        const data = (await updateRes.json()) as { version?: number };
        if (typeof data?.version === "number") {
            useDataStore.setState((s) => ({
                notes: s.notes.map((f) => (f.id === fileId ? { ...f, version: data.version } : f)),
            }));
        }
    } catch {
        // Ignore parse error
    }
}

export async function shareV1WithContacts(fileId: string, currentMeta: DecryptedMeta): Promise<void> {
    const contactsRes = await apiFetch("/api/v1/contacts");
    if (!contactsRes.ok) return;
    const partnerList = (await contactsRes.json()) as ContactPartnerRecord[];
    for (const contact of partnerList) {
        try {
            const recipientPubKey = await window.crypto.subtle.importKey(
                "spki",
                cryptoLib.base64ToArrayBuffer(contact.partner.public_key),
                { name: "RSA-OAEP", hash: "SHA-256" },
                true,
                ["encrypt"]
            );
            const reEncMeta = await cryptoLib.encryptMetadata(currentMeta, recipientPubKey);
            await apiFetch(`/api/v1/files/${fileId}/share`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: contact.partner.email, secured_meta: reEncMeta }),
            });
        } catch (err) {
            console.error("Failed to share with contact", contact.partner.email, err);
        }
    }
}

export async function fetchShareFallbackFile(baseId: string): Promise<FileActionItem | undefined> {
    try {
        const res = await apiFetch(`/api/v1/files/${baseId}`);
        if (!res.ok) return undefined;
        const remote = (await res.json()) as {
            type?: string;
            public_meta?: { title?: string };
            metadata?: { title?: string };
        };
        const remoteTitle = remote?.public_meta?.title || remote?.metadata?.title || "Untitled";
        return { id: baseId, title: remoteTitle, type: remote?.type || "file" };
    } catch (fetchErr) {
        console.warn("handleShare: backend fallback fetch failed", fetchErr);
        return undefined;
    }
}
