// Read-only access to one file's decrypted parts. Nothing here writes to the server or to the
// editor's global state (unlike YjsE2EEProvider, which registers the doc in activeNoteStore).

import * as Y from 'yjs';
import { apiFetch } from '@/lib/api';
import { base64ToArrayBuffer } from '@/lib/crypto';
import { importDEK, unwrapDEKData } from '@/lib/cryptoV2';
import { FRAME_TYPE_CRDT, decryptSnapshot, decryptWSFrame } from '@/lib/e2eeFraming';
import { decryptAssetWithBEK } from '@/lib/assetCrypto';

export interface AssetRef {
    assetId: string;
    bekBase64: string;
    ivBase64: string;
    mimeType: string;
}

type AccessKeys = Record<string, { wrapped_key?: string } | undefined>;

function parseAccessKeys(raw: unknown): AccessKeys {
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw) as AccessKeys;
        } catch {
            return {};
        }
    }
    return raw && typeof raw === 'object' ? (raw as AccessKeys) : {};
}

/** Unwraps the file's DEK for this user. Throws for custom-password files and for V1 files. */
export async function unwrapFileDek(
    file: { version?: number; metadata?: Record<string, unknown> | null; access_keys?: unknown },
    myId: string,
    masterKey: CryptoKey,
): Promise<CryptoKey> {
    if ((file.version ?? 0) < 2) throw new Error('Altes V1-Format (nicht exportierbar)');
    if (file.metadata?.has_custom_password) throw new Error('Mit eigenem Passwort geschützt');
    const wrapped = parseAccessKeys(file.access_keys)[myId]?.wrapped_key;
    if (!wrapped) throw new Error('Kein Zugriffsschlüssel für dieses Konto');
    return importDEK(await unwrapDEKData(wrapped, masterKey));
}

/** Downloads and decrypts the file blob ({data, iv} JSON) to UTF-8 text. */
export async function readContentText(fileId: string, dek: CryptoKey): Promise<string> {
    const res = await apiFetch(`/api/v1/files/${encodeURIComponent(fileId)}/download`);
    if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status})`);
    const payload = JSON.parse(await res.text()) as { data?: string; iv?: string };
    if (!payload.data || !payload.iv) throw new Error('Ungültiges Inhaltsformat');
    const plain = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToArrayBuffer(payload.iv) },
        dek,
        base64ToArrayBuffer(payload.data),
    );
    return new TextDecoder().decode(plain);
}

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
