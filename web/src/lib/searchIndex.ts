import * as cryptoV2 from './cryptoV2';
import { apiFetch } from './api';

const INDEX_FILE_NAME = "search_index.enc";

export interface SearchIndexEntry {
    id: string;
    title: string;
    date: string;
    type: 'event' | 'note' | 'task';
}

let cachedIndex: SearchIndexEntry[] | null = null;
let indexFileId: string | null = null;

/** Remove duplicate entries by id, keeping the most recent (last wins). */
function deduplicateIndex(entries: SearchIndexEntry[]): SearchIndexEntry[] {
    const map = new Map<string, SearchIndexEntry>();
    for (const e of entries) {
        // Strip recurrence phantoms: "baseId_timestamp" → always use base id for dedup key.
        // The UI dispatches calendar:scroll-to with the base event id anyway.
        const baseId = e.id.includes('_') ? e.id.split('_')[0] : e.id;
        map.set(baseId, { ...e, id: baseId }); // normalise to base id
    }
    return Array.from(map.values());
}

export async function loadSearchIndex(masterKey: CryptoKey, userID: string): Promise<SearchIndexEntry[]> {
    if (cachedIndex) return cachedIndex;

    const res = await apiFetch(`/api/v1/files?type=index&recursive=true`);
    const files = await res.json().catch(() => []);
    
    // Find index file (using a pseudo tag or just the filename in metadata)
    const indexFile = files.find((f: any) => f.type === 'index');
    if (!indexFile) {
        cachedIndex = [];
        return cachedIndex;
    }
    indexFileId = indexFile.id;

    try {
        const decryptedBlob = await cryptoV2.decryptFileV2({
            content_ciphertext: indexFile.content_ciphertext || "{}", // Assuming downloaded or included in payload
            access_keys: typeof indexFile.access_keys === 'string' ? JSON.parse(indexFile.access_keys) : indexFile.access_keys,
            metadata: typeof indexFile.metadata === 'string' ? JSON.parse(indexFile.metadata) : indexFile.metadata,
            masterKey,
            userID
        });
        
        const content = await decryptedBlob.text();
        const parsed: SearchIndexEntry[] = JSON.parse(content);
        // [FIX-1] Deduplicate on load to recover from any previously persisted duplicates.
        cachedIndex = deduplicateIndex(parsed);
    } catch (e) {
        console.error("Failed to decrypt search index", e);
        cachedIndex = [];
    }
    return cachedIndex || [];
}


export async function rebuildIndex(items: SearchIndexEntry[], masterKey: CryptoKey, userID: string) {
    cachedIndex = items;
    
    // We need to ensure we know the indexFileId if it exists but is empty
    if (!indexFileId) {
        const res = await apiFetch(`/api/v1/files?type=index&recursive=true`);
        const files = await res.json().catch(() => []);
        const indexFile = files.find((f: any) => f.type === 'index');
        if (indexFile) indexFileId = indexFile.id;
    }

    const v2Result = await cryptoV2.encryptFileV2(JSON.stringify(items), masterKey);
    const accessKeysMap = { [userID]: v2Result.encrypted_dek };

    if (!indexFileId) {
        const createRes = await apiFetch('/api/v1/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'index',
                size: new Blob([v2Result.content_ciphertext]).size,
                public_meta: {},
                secured_meta: "",
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
                method: "POST", body: v2Result.content_ciphertext 
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

export async function updateSearchIndex(entry: SearchIndexEntry, masterKey: CryptoKey, userID: string) {
    const index = await loadSearchIndex(masterKey, userID);
    const baseId = entry.id.includes('_') ? entry.id.split('_')[0] : entry.id;
    const normalizedEntry = { ...entry, id: baseId };
    const existingIdx = index.findIndex(e => e.id === baseId);
    if (existingIdx !== -1) {
        index[existingIdx] = normalizedEntry;
    } else {
        index.push(normalizedEntry);
    }

    // [FIX-1] Always deduplicate before persisting to avoid accumulation from rapid succession of calls.
    const deduped = deduplicateIndex(index);
    cachedIndex = deduped;

    const v2Result = await cryptoV2.encryptFileV2(JSON.stringify(deduped), masterKey);
    const accessKeysMap = { [userID]: v2Result.encrypted_dek };

    if (!indexFileId) {
        // Create new index file
        const createRes = await apiFetch('/api/v1/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'index',
                size: new Blob([v2Result.content_ciphertext]).size,
                public_meta: {},
                secured_meta: "",
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
                method: "POST", body: v2Result.content_ciphertext 
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
