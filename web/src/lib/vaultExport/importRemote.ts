// Strict server writes for the vault import. Unlike the store's createNote/addTask (which fall back to a
// local-only item and report success when the server fails), every call here checks the response,
// retries transient failures and throws otherwise.

import { apiFetch } from '@/lib/api';
import { encryptMetadata } from '@/lib/crypto';
import { encryptFileV2 } from '@/lib/cryptoV2';
import { encryptSnapshot } from '@/lib/e2eeFraming';
import { arrayBufferToBase64 } from '@/lib/crypto';
import { encryptAssetWithNewBEK } from '@/lib/assetCrypto';
import { unwrapFileDek } from './readFile';
import type { NewAssetRef } from './rewriteIds';

const RETRIES = 3;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Runs the request up to RETRIES times; 4xx answers other than 409 (when allowed) are not retried. */
async function send(label: string, run: () => Promise<Response>, allowConflict = false): Promise<Response> {
    let last = 'unbekannter Fehler';
    for (let attempt = 0; attempt < RETRIES; attempt++) {
        try {
            const res = await run();
            if (res.ok || (allowConflict && res.status === 409)) return res;
            last = `HTTP ${res.status}`;
            if (res.status >= 400 && res.status < 500) break;
        } catch (e) {
            last = e instanceof Error ? e.message : String(e);
        }
        await wait(400 * (attempt + 1));
    }
    throw new Error(`${label}: ${last}`);
}

const post = (url: string, body: BodyInit, json: boolean) =>
    apiFetch(url, { method: 'POST', ...(json ? { headers: JSON_HEADERS } : {}), body });

export interface NewFileInput {
    id: string;
    type: string;
    parentId: string | null;
    publicMeta: Record<string, unknown>;
    /** Plain metadata; the encryption fields are added here. */
    metadata: Record<string, unknown>;
    securedMeta: Record<string, unknown>;
    /** Decrypted content to encrypt and upload (omit for folders). */
    content?: string;
}

/** Creates a file (and uploads its content) under the user's own key; returns the file's DEK when it has content. */
export async function createFile(
    input: NewFileInput,
    publicKey: CryptoKey,
    privateKey: CryptoKey,
    myId: string,
): Promise<CryptoKey | null> {
    const secured = await encryptMetadata(input.securedMeta, publicKey, 'import');
    const base = {
        id: input.id, type: input.type, parent_id: input.parentId, public_meta: input.publicMeta,
        secured_meta: secured, visibility: 'private',
    };
    if (input.content === undefined) {
        await send(`Anlegen von „${String(input.metadata.title ?? input.id)}“`, () =>
            post('/api/v1/files', JSON.stringify({ ...base, size: 0, metadata: input.metadata }), true), true);
        return null;
    }
    const v2 = await encryptFileV2(input.content, publicKey);
    const accessKeys = { [myId]: v2.encrypted_dek };
    await send(`Anlegen von „${String(input.metadata.title ?? input.id)}“`, () =>
        post('/api/v1/files', JSON.stringify({
            ...base, size: new Blob([v2.content_ciphertext]).size, version: 2,
            metadata: { ...input.metadata, ...v2.metadata }, access_keys: accessKeys,
        }), true), true);
    await send(`Inhalt von „${String(input.metadata.title ?? input.id)}“`, () => post(`/api/v1/files/${input.id}/upload`, v2.content_ciphertext, false));
    return unwrapFileDek({ version: 2, metadata: v2.metadata, access_keys: accessKeys }, myId, privateKey);
}

/** Encrypts an image with a fresh key and stores it as a child of the note under a pre-allocated id. */
export async function createAsset(assetId: string, noteId: string, bytes: Uint8Array, mimeType: string): Promise<NewAssetRef> {
    const { encryptedBlob, bekBase64, ivBase64 } = await encryptAssetWithNewBEK(new Blob([bytes as BlobPart], { type: mimeType }));
    await send('Bild anlegen', () => post('/api/v1/files', JSON.stringify({
        id: assetId, type: 'canvas-asset', parent_id: noteId, parent_file_id: noteId, size: encryptedBlob.size,
        public_meta: {}, secured_meta: '', visibility: 'private',
    }), true), true);
    await send('Bild hochladen', () => post(`/api/v1/files/${assetId}/upload?parent_file_id=${encodeURIComponent(noteId)}`, encryptedBlob, false));
    return { assetId, bekBase64, ivBase64, mimeType };
}

/** Replaces a file's content, encrypted with its existing DEK (same {data, iv} layout as encryptFileV2). */
export async function replaceContent(fileId: string, dek: CryptoKey, text: string): Promise<void> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const data = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, new TextEncoder().encode(text));
    const payload = JSON.stringify({ data: arrayBufferToBase64(data), iv: arrayBufferToBase64(iv.buffer as ArrayBuffer) });
    await send('Inhalt aktualisieren', () => post(`/api/v1/files/${fileId}/upload`, payload, false));
}

/** Stores the Yjs state as the file's encrypted snapshot (key epoch 1, empty write-ahead log). */
export async function writeSnapshot(fileId: string, dek: CryptoKey, state: Uint8Array): Promise<void> {
    const { ivBase64, ciphertextBase64 } = await encryptSnapshot(fileId, 1, dek, state);
    await send('Notiz-Zustand speichern', () => post(`/api/v1/files/${fileId}/compact`, JSON.stringify({ upToSeqId: 0, keyEpoch: 1, ivBase64, ciphertextBase64 }), true));
}

export async function createTodo(payload: Record<string, unknown>): Promise<void> {
    await send(`Todo „${String(payload.title ?? '')}“`, () => post('/api/v1/todos', JSON.stringify(payload), true), true);
}

export async function listIds(query: string): Promise<Set<string>> {
    const res = await send('Dateiliste', () => apiFetch(`/api/v1/files?${query}`));
    const data = (await res.json()) as Array<{ id: string }>;
    return new Set(Array.isArray(data) ? data.map((f) => f.id) : []);
}

export async function countTodoIds(): Promise<Set<string>> {
    const res = await send('Todo-Liste', () => apiFetch('/api/v1/todos?limit=500&include_archived=true'));
    const data = (await res.json()) as unknown;
    const list = Array.isArray(data) ? data : ((data as { items?: unknown[]; todos?: unknown[] }).items ?? (data as { todos?: unknown[] }).todos ?? []);
    return new Set((list as Array<{ id: string }>).map((t) => t.id));
}
