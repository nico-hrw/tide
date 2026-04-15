import * as cryptoV2 from './cryptoV2';
import { apiFetch } from './api';

export interface SearchIndexEntry {
    id: string;
    title: string;
    date: string;
    type: 'event' | 'note' | 'task';
}

let cachedIndex: SearchIndexEntry[] | null = null;
let indexFileId: string | null = null;

// ── Same-tab write serialization ────────────────────────────────────────────
// Prevents rapid successive saves within one tab from interleaving.
let writeInProgress = false;
const writeQueue: Array<() => Promise<void>> = [];

async function drainWriteQueue() {
    if (writeInProgress || writeQueue.length === 0) return;
    writeInProgress = true;
    const next = writeQueue.shift()!;
    try {
        await next();
    } finally {
        writeInProgress = false;
        drainWriteQueue();
    }
}
// ────────────────────────────────────────────────────────────────────────────

/** Remove duplicate entries by id, keeping the most recent (last wins). */
function deduplicateIndex(entries: SearchIndexEntry[]): SearchIndexEntry[] {
    const map = new Map<string, SearchIndexEntry>();
    for (const e of entries) {
        // Strip recurrence phantoms: "baseId_timestamp" → always use base id for dedup key.
        const baseId = e.id.includes('_') ? e.id.split('_')[0] : e.id;
        map.set(baseId, { ...e, id: baseId });
    }
    return Array.from(map.values());
}

/**
 * Always fetches and decrypts the index file from the server.
 * Used before any write to avoid operating on stale module-level state
 * (critical for multi-tab correctness).
 */
async function fetchIndexFromServer(
    masterKey: CryptoKey,
    userID: string
): Promise<{ entries: SearchIndexEntry[]; fileId: string | null }> {
    const res = await apiFetch(`/api/v1/files?type=index&recursive=true`);
    const files = await res.json().catch(() => []);

    const indexFile = files.find((f: any) => f.type === 'index');
    if (!indexFile) return { entries: [], fileId: null };

    // No ciphertext yet (newly created record) — return empty entries but keep the ID
    const ciphertext = indexFile.content_ciphertext;
    if (!ciphertext) return { entries: [], fileId: indexFile.id };

    try {
        const decryptedBlob = await cryptoV2.decryptFileV2({
            content_ciphertext: ciphertext,
            access_keys: typeof indexFile.access_keys === 'string'
                ? JSON.parse(indexFile.access_keys)
                : (indexFile.access_keys || {}),
            metadata: typeof indexFile.metadata === 'string'
                ? JSON.parse(indexFile.metadata)
                : (indexFile.metadata || { has_custom_password: false }),
            masterKey,
            userID
        });

        const parsed: SearchIndexEntry[] = JSON.parse(await decryptedBlob.text());
        return { entries: deduplicateIndex(parsed), fileId: indexFile.id };
    } catch (e) {
        console.error('[searchIndex] Failed to decrypt index from server', e);
        return { entries: [], fileId: indexFile.id };
    }
}

/** Encrypt and persist the given index snapshot. Requires `indexFileId` to be set if updating. */
async function persistIndex(
    deduped: SearchIndexEntry[],
    masterKey: CryptoKey,
    userID: string
): Promise<void> {
    const v2Result = await cryptoV2.encryptFileV2(JSON.stringify(deduped), masterKey);
    const accessKeysMap = { [userID]: v2Result.encrypted_dek };

    if (!indexFileId) {
        // First save — create the index file
        const createRes = await apiFetch('/api/v1/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'index',
                size: new Blob([v2Result.content_ciphertext]).size,
                public_meta: {},
                secured_meta: '',
                visibility: 'private',
                version: 2,
                metadata: v2Result.metadata,
                access_keys: accessKeysMap
            }),
        });
        if (createRes.ok) {
            const newFile = await createRes.json();
            indexFileId = newFile.id;
            await apiFetch(`/api/v1/files/${indexFileId}/upload`, {
                method: 'POST',
                body: v2Result.content_ciphertext
            });
        }
    } else {
        await apiFetch(`/api/v1/files/${indexFileId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                version: 2,
                content_ciphertext: v2Result.content_ciphertext,
                metadata: v2Result.metadata,
                access_keys: accessKeysMap
            })
        });
    }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function loadSearchIndex(
    masterKey: CryptoKey,
    userID: string
): Promise<SearchIndexEntry[]> {
    if (cachedIndex) return cachedIndex;

    const { entries, fileId } = await fetchIndexFromServer(masterKey, userID);
    indexFileId = fileId;
    cachedIndex = entries;
    return cachedIndex;
}

export async function rebuildIndex(
    items: SearchIndexEntry[],
    masterKey: CryptoKey,
    userID: string
) {
    const deduped = deduplicateIndex(items);

    // Resolve index file ID if we don't know it yet
    if (!indexFileId) {
        const { fileId } = await fetchIndexFromServer(masterKey, userID);
        if (fileId) indexFileId = fileId;
    }

    cachedIndex = deduped;
    await persistIndex(deduped, masterKey, userID);
}

export async function updateSearchIndex(
    entry: SearchIndexEntry,
    masterKey: CryptoKey,
    userID: string
): Promise<void> {
    // Enqueue the write to serialize same-tab rapid saves
    return new Promise<void>((resolve, reject) => {
        writeQueue.push(async () => {
            try {
                // [RACE-FIX] Always load fresh from the server before mutating.
                // The module-level cachedIndex is stale if another tab wrote concurrently.
                const { entries: fresh, fileId } = await fetchIndexFromServer(masterKey, userID);
                if (fileId) indexFileId = fileId;

                const baseId = entry.id.includes('_') ? entry.id.split('_')[0] : entry.id;
                const normalizedEntry = { ...entry, id: baseId };

                const existingIdx = fresh.findIndex(e => e.id === baseId);
                if (existingIdx !== -1) {
                    fresh[existingIdx] = normalizedEntry;
                } else {
                    fresh.push(normalizedEntry);
                }

                const deduped = deduplicateIndex(fresh);
                cachedIndex = deduped;

                await persistIndex(deduped, masterKey, userID);
                resolve();
            } catch (e) {
                reject(e);
            }
        });
        drainWriteQueue();
    });
}
