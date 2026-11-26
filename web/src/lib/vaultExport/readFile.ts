// Read-only access to one file's decrypted parts. Nothing here writes to the server or to the
// editor's global state (unlike YjsE2EEProvider, which registers the doc in activeNoteStore).

import * as Y from 'yjs';
import { apiFetch } from '@/lib/api';
import { base64ToArrayBuffer, decryptFile, decryptMetadata } from '@/lib/crypto';
import { derivePublicNoteDEK, importDEK, unwrapDEKData } from '@/lib/cryptoV2';
import { FRAME_TYPE_CRDT, decryptSnapshot, decryptWSFrame } from '@/lib/e2eeFraming';
import { decryptAssetWithBEK } from '@/lib/assetCrypto';
import type { VaultIssueKind } from './types';

export interface AssetRef {
    assetId: string;
    bekBase64: string;
    ivBase64: string;
    mimeType: string;
}

type AccessKeys = Record<string, { wrapped_key?: string; pwd_iv?: string } | undefined>;

interface FileLike {
    id?: string;
    version?: number;
    visibility?: string;
    metadata?: Record<string, unknown> | null;
    secured_meta?: string | null;
    access_keys?: unknown;
}

/** A read failure with a known cause, so the export can report it precisely. */
export class VaultReadError extends Error {
    constructor(readonly kind: VaultIssueKind, message: string) {
        super(message);
        this.name = 'VaultReadError';
    }
}

export function parseAccessKeys(raw: unknown): AccessKeys {
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw) as unknown;
            return parsed && typeof parsed === 'object' ? (parsed as AccessKeys) : {};
        } catch {
            return {};
        }
    }
    return raw && typeof raw === 'object' ? (raw as AccessKeys) : {};
}

/**
 * Same rule as the note loader (`decryptNotePayload`): public notes and files flagged `unencrypted`
 * (written by the external API / MCP tools, or the old canvas style sidecars) hold their content as plain text.
 */
export function isPlaintextFile(file: FileLike): boolean {
    return file.visibility === 'public' || file.metadata?.unencrypted === true;
}

/**
 * Unwraps the file's DEK for this user, the way the app does when it opens a file: first the entry under the
 * user's id, then any other entry (the app falls back to the first one; events saved without a session id were
 * stored under the key ""). Only entries wrapped for this user's key can succeed.
 */
export async function unwrapFileDek(file: FileLike, myId: string, masterKey: CryptoKey): Promise<CryptoKey> {
    if ((file.version ?? 0) < 2) throw new VaultReadError('v1-unreadable', 'Altes V1-Format');
    const keys = parseAccessKeys(file.access_keys);
    const candidates = [keys[myId], ...Object.entries(keys).filter(([k]) => k !== myId).map(([, v]) => v)]
        .filter((v): v is { wrapped_key: string; pwd_iv?: string } => !!v && typeof v.wrapped_key === 'string' && v.wrapped_key.length > 0);
    if (candidates.length === 0) throw new VaultReadError('no-access-key', 'Kein Zugriffsschlüssel für dieses Konto');
    for (const entry of candidates) {
        let raw: ArrayBuffer;
        try {
            raw = await unwrapDEKData(entry.wrapped_key, masterKey);
        } catch {
            continue;
        }
        // Custom password: only a second wrap (pwd_iv / not a 32-byte key) needs the PIN; otherwise the PIN is a UI lock.
        if (file.metadata?.has_custom_password && (entry.pwd_iv || raw.byteLength !== 32)) {
            throw new VaultReadError('custom-password', 'Mit eigenem Passwort (PIN) verschlüsselt, ohne PIN nicht lesbar');
        }
        return importDEK(raw);
    }
    throw new VaultReadError('no-access-key', `Kein passender Zugriffsschlüssel für dieses Konto (${candidates.length} Einträge für andere Schlüssel)`);
}

/** The server holds no blob for this file (normal for events created from a todo). */
export class ContentMissingError extends Error {
    constructor(fileId: string) {
        super(`Kein Inhalt vorhanden (${fileId})`);
        this.name = 'ContentMissingError';
    }
}

/** The blob is not the {data, iv} envelope: `raw` is what the server returned (e.g. Markdown). */
export class NotEnvelopeError extends Error {
    constructor(readonly raw: string, cause: unknown) {
        super(`Inhalt ist kein verschlüsselter Block (${cause instanceof Error ? cause.message : String(cause)})`);
        this.name = 'NotEnvelopeError';
    }
}

async function download(fileId: string): Promise<Response> {
    const res = await apiFetch(`/api/v1/files/${encodeURIComponent(fileId)}/download`);
    if (res.status === 404) throw new ContentMissingError(fileId);
    if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status})`);
    return res;
}

/** Downloads the blob as it is stored (for plaintext files). */
export async function readRawText(fileId: string): Promise<string> {
    return (await download(fileId)).text();
}

/** Decrypts a {data, iv} JSON envelope with the given key. */
export async function decryptEnvelope(text: string, dek: CryptoKey): Promise<string> {
    let payload: { data?: string; iv?: string };
    try {
        payload = JSON.parse(text) as { data?: string; iv?: string };
    } catch (e) {
        throw new NotEnvelopeError(text, e);
    }
    if (!payload || !payload.data || !payload.iv) throw new NotEnvelopeError(text, 'kein data/iv');
    const plain = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToArrayBuffer(payload.iv) },
        dek,
        base64ToArrayBuffer(payload.data),
    );
    return new TextDecoder().decode(plain);
}

/** Downloads and decrypts the file blob ({data, iv} JSON) to UTF-8 text. */
export async function readContentText(fileId: string, dek: CryptoKey): Promise<string> {
    return decryptEnvelope(await (await download(fileId)).text(), dek);
}

export interface V1Content {
    bytes: Uint8Array;
    /** Key the app uses for this file's live document (V1 file key, or the public note key). */
    docKey: CryptoKey;
    meta: Record<string, unknown>;
}

/**
 * Reads a V1 file exactly like the note loader does for files without a V2 envelope: `secured_meta` is RSA-encrypted
 * for the owner and carries the AES file key (JWK) and the IV of the blob.
 */
export async function readV1(file: FileLike & { id: string }, privateKey: CryptoKey): Promise<V1Content> {
    if (!file.secured_meta) throw new VaultReadError('v1-unreadable', 'Altes V1-Format ohne Schlüssel-Metadaten');
    const meta = await decryptMetadata(file.secured_meta, privateKey, `export-v1-${file.id}`);
    if (meta.isLocked) throw new VaultReadError('v1-unreadable', 'Altes V1-Format: Schlüssel-Metadaten passen nicht zu diesem Kontoschlüssel');
    if (meta.unencrypted === true) {
        const res = await download(file.id);
        return { bytes: new Uint8Array(await res.arrayBuffer()), docKey: await derivePublicNoteDEK(file.id), meta };
    }
    const jwk = meta.fileKey as JsonWebKey | undefined;
    if (!jwk || typeof jwk !== 'object' || !jwk.kty || typeof meta.iv !== 'string') {
        throw new VaultReadError('v1-unreadable', 'Altes V1-Format ohne Dateischlüssel');
    }
    const key = await window.crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    const blob = await (await download(file.id)).blob();
    const plain = await decryptFile(blob, meta.iv, key, file.id);
    return { bytes: new Uint8Array(await plain.arrayBuffer()), docKey: key, meta };
}

/** Tries the two ways the app reads `secured_meta`: AES with the file key ({data, iv}), then RSA for the owner. */
export async function readSecuredMeta(raw: string, dek: CryptoKey | null, privateKey: CryptoKey): Promise<Record<string, unknown> | null> {
    if (dek) {
        try {
            const parsed = JSON.parse(await decryptEnvelope(raw, dek)) as unknown;
            if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
        } catch {
            /* not AES with the file key */
        }
    }
    const meta = await decryptMetadata(raw, privateKey, 'export');
    return meta.isLocked ? null : meta;
}

/** Why `secured_meta` could not be read, from its shape alone (the ciphertext says nothing more). */
export function diagnoseSecuredMeta(raw: string, privateKey: CryptoKey): string {
    if (raw.trim().startsWith('{')) return 'mit einem Dateischlüssel verschlüsselt, der nicht mehr passt';
    let bytes = 0;
    try {
        bytes = base64ToArrayBuffer(raw).byteLength;
    } catch {
        return 'kein gültiges Base64';
    }
    if (bytes < 16) return 'leer oder ungültig';
    const modulus = (privateKey.algorithm as RsaHashedKeyAlgorithm).modulusLength;
    if (modulus && bytes !== modulus / 8) return `RSA-Block mit ${bytes * 8} Bit passt nicht zum ${modulus}-Bit-Kontoschlüssel (anderer Schlüssel)`;
    return 'RSA-Block, mit einem anderen öffentlichen Schlüssel verschlüsselt (vermutlich ein früherer Kontoschlüssel) oder beschädigt';
}

/** Key for the live document of a plaintext note (same as the note loader). */
export const plaintextDocKey = (fileId: string): Promise<CryptoKey> => derivePublicNoteDEK(fileId);

interface CrdtState {
    snapshot_iv?: string;
    snapshot_ciphertext?: string;
    key_epoch?: number;
    wal?: Array<{ iv?: string; ciphertext?: string; key_epoch?: number }>;
}

/**
 * Rebuilds the note's Yjs document from the server snapshot and write-ahead log.
 * Strict: any entry that cannot be decrypted throws, so the export never hands out a partial document
 * as if it were complete. Returns null when the server holds no CRDT state for the file.
 */
export async function readYDoc(fileId: string, dek: CryptoKey): Promise<Y.Doc | null> {
    const res = await apiFetch(`/api/v1/files/${encodeURIComponent(fileId)}/crdt-state`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`CRDT-Zustand nicht lesbar (HTTP ${res.status})`);
    const data = (await res.json().catch(() => ({}))) as CrdtState;
    const epoch = data.key_epoch || 1;
    const wal = Array.isArray(data.wal) ? data.wal : [];
    if (!data.snapshot_ciphertext && wal.length === 0) return null;

    const doc = new Y.Doc();
    if (data.snapshot_iv && data.snapshot_ciphertext) {
        Y.applyUpdate(doc, await decryptSnapshot(fileId, epoch, data.snapshot_iv, data.snapshot_ciphertext, dek), 'export');
    }
    for (const entry of wal) {
        if (!entry.iv || !entry.ciphertext) continue;
        const iv = new Uint8Array(base64ToArrayBuffer(entry.iv));
        const cipher = new Uint8Array(base64ToArrayBuffer(entry.ciphertext));
        const frame = new Uint8Array(1 + 4 + iv.length + cipher.length);
        const view = new DataView(frame.buffer);
        view.setUint8(0, FRAME_TYPE_CRDT);
        view.setUint32(1, entry.key_epoch || epoch, false);
        frame.set(iv, 5);
        frame.set(cipher, 5 + iv.length);
        Y.applyUpdate(doc, (await decryptWSFrame(fileId, frame, dek)).plaintext, 'export');
    }
    return doc;
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Finds every image reference (asset id + key + iv) in the document's maps. */
export function collectAssetRefs(doc: Y.Doc): AssetRef[] {
    const found = new Map<string, AssetRef>();
    const visit = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(visit);
        if (!node || typeof node !== 'object') return;
        const o = node as Record<string, unknown>;
        const assetId = o.assetId ?? o.blobId;
        const bek = o.bekBase64 ?? o.bek;
        const iv = o.ivBase64 ?? o.iv;
        if (isStr(assetId) && isStr(bek) && isStr(iv) && !found.has(assetId)) {
            found.set(assetId, { assetId, bekBase64: bek, ivBase64: iv, mimeType: isStr(o.mimeType) ? o.mimeType : 'application/octet-stream' });
        }
        Object.values(o).forEach(visit);
    };
    for (const name of ['assets', 'canvas', 'overlay']) visit(doc.getMap(name).toJSON());
    return [...found.values()];
}

/** Downloads one encrypted image and returns its decrypted bytes. */
export async function readAsset(ref: AssetRef): Promise<Uint8Array> {
    const res = await apiFetch(`/api/v1/files/${encodeURIComponent(ref.assetId)}/download`);
    if (!res.ok) throw new Error(`Bild nicht ladbar (HTTP ${res.status})`);
    const blob = await decryptAssetWithBEK(await res.arrayBuffer(), ref.bekBase64, ref.ivBase64, ref.mimeType);
    return new Uint8Array(await blob.arrayBuffer());
}

/** Old canvas image element: the file key is RSA-wrapped for the owner in `encryptedKey` (see CanvasImageWidget). */
export interface LegacyImageRef {
    blobId: string;
    encryptedKey: string;
    iv: string;
    mimeType: string;
}

/** Finds old image elements (blobId + encryptedKey + iv, no own key) in any JSON value. */
export function collectLegacyImageRefs(value: unknown): LegacyImageRef[] {
    const found = new Map<string, LegacyImageRef>();
    const visit = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(visit);
        if (!node || typeof node !== 'object') return;
        const o = node as Record<string, unknown>;
        if (isStr(o.blobId) && o.blobId !== '__pending__' && isStr(o.encryptedKey) && isStr(o.iv) && !isStr(o.bek) && !isStr(o.bekBase64) && !found.has(o.blobId)) {
            found.set(o.blobId, { blobId: o.blobId, encryptedKey: o.encryptedKey, iv: o.iv, mimeType: isStr(o.mimeType) ? o.mimeType : '' });
        }
        Object.values(o).forEach(visit);
    };
    visit(value);
    return [...found.values()];
}

export function collectLegacyImageRefsFromDoc(doc: Y.Doc): LegacyImageRef[] {
    return collectLegacyImageRefs(['assets', 'canvas', 'overlay'].map((name) => doc.getMap(name).toJSON()));
}

/** Image type from the first bytes (old image files do not store their type). */
export function sniffMime(bytes: Uint8Array): string {
    const b = bytes;
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
    const head = new TextDecoder().decode(b.slice(0, 256)).trimStart().toLowerCase();
    if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
    return 'application/octet-stream';
}

/** Old canvas image, read like CanvasImageWidget's legacy path (element key first, then the file's own secured_meta). */
export async function readLegacyImage(
    file: { id: string; secured_meta?: string | null },
    privateKey: CryptoKey,
    ref?: LegacyImageRef,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const sources = [ref?.encryptedKey, file.secured_meta].filter(isStr);
    if (sources.length === 0) throw new VaultReadError('orphan-asset', 'Kein Schlüssel vorhanden (nur in einer Notiz gespeichert, die nicht mehr darauf verweist)');
    for (const source of sources) {
        const meta = await decryptMetadata(source, privateKey, `export-img-${file.id}`);
        const jwk = meta.fileKey as JsonWebKey | undefined;
        const iv = ref && source === ref.encryptedKey ? ref.iv : meta.iv;
        if (meta.isLocked || !jwk || typeof jwk !== 'object' || !isStr(iv)) continue;
        const key = await window.crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
        const res = await apiFetch(`/api/v1/files/${encodeURIComponent(file.id)}/download`);
        if (!res.ok) throw new VaultReadError('asset-missing', `Bild nicht ladbar (HTTP ${res.status})`);
        const plain = new Uint8Array(await (await decryptFile(await res.blob(), iv, key, file.id)).arrayBuffer());
        return { bytes: plain, mimeType: ref?.mimeType || sniffMime(plain) };
    }
    throw new VaultReadError('orphan-asset', 'Bildschlüssel nicht lesbar (nur in der Notiz gespeichert oder anderer Kontoschlüssel)');
}
