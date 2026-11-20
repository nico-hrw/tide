import * as cryptoV2 from './cryptoV2';
import { apiFetch } from './api';
import { isDefinition } from './formula/scope';
import type { RegistryEntry, RegistryStorage } from './variableRegistry';

/** Server file type of the registry file (a free-form TEXT column, no schema change needed). */
export const REGISTRY_FILE_TYPE = 'variables';

export interface RegistryKeys {
    privateKey: CryptoKey;
    publicKey: CryptoKey;
    userId: string;
}

interface RegistryFileRecord {
    id: string;
    type: string;
    owner_id?: string;
    blob_path?: string | null;
    content_ciphertext?: string;
    access_keys?: unknown;
    metadata?: unknown;
}

const asObject = (v: unknown, fallback: object): object =>
    typeof v === 'string' ? JSON.parse(v) : (v && typeof v === 'object' ? v : fallback);

function toEntries(raw: unknown): RegistryEntry[] {
    if (!Array.isArray(raw)) return [];
    const out: RegistryEntry[] = [];
    for (const e of raw) {
        if (!isDefinition(e)) continue;
        const src = (e as { sourceNoteId?: unknown }).sourceNoteId;
        if (src !== null && typeof src !== 'string') continue;
        out.push({ name: e.name, expr: e.expr, ...(e.params ? { params: e.params } : {}), global: true, sourceNoteId: src });
    }
    return out;
}

/**
 * The registry as one encrypted file (same pattern as the search index): content is AES-GCM encrypted with a DEK that is
 * RSA-wrapped for the user. The server only ever sees ciphertext. `getKeys` returns null while the vault is locked.
 */
export function createApiRegistryStorage(getKeys: () => RegistryKeys | null): RegistryStorage {
    let fileId: string | null = null;
    let fileOwnerId: string | null = null;
    let queue: Promise<unknown> = Promise.resolve();

    const requireKeys = (): RegistryKeys => {
        const k = getKeys();
        if (!k) throw new Error('[variables] keys not available');
        return k;
    };

    async function findFile(keys: RegistryKeys): Promise<RegistryFileRecord | null> {
        const res = await apiFetch(`/api/v1/files?type=${REGISTRY_FILE_TYPE}&recursive=true`);
        if (!res.ok) throw new Error('[variables] could not list files');
        const files: RegistryFileRecord[] = await res.json().catch(() => []);
        return (
            files.find(
                (f) =>
                    f.type === REGISTRY_FILE_TYPE &&
                    (f.owner_id === undefined || f.owner_id === keys.userId)
            ) ?? null
        );
    }

    async function create(ciphertext: string, metadata: unknown, accessKeys: unknown): Promise<string | null> {
        const res = await apiFetch('/api/v1/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: REGISTRY_FILE_TYPE,
                size: new Blob([ciphertext]).size,
                public_meta: {},
                secured_meta: '',
                visibility: 'private',
                version: 2,
                metadata,
                access_keys: accessKeys,
            }),
        });
        if (!res.ok) return null;
        const created: { id: string } = await res.json();
        const upRes = await apiFetch(`/api/v1/files/${created.id}/upload`, { method: 'POST', body: ciphertext });
        if (!upRes.ok) return null;
        return created.id;
    }

    return {
        async load() {
            const keys = requireKeys();
            const file = await findFile(keys);
            if (!file) {
                fileId = null;
                fileOwnerId = null;
                return [];
            }
            fileId = file.id;
            fileOwnerId = file.owner_id ?? keys.userId;
            let ciphertext = file.content_ciphertext;
            if (!ciphertext) {
                const dlRes = await apiFetch(`/api/v1/files/${file.id}/download`);
                if (!dlRes.ok) {
                    if (dlRes.status === 404 && !file.blob_path) {
                        return [];
                    }
                    throw new Error(`Failed to download variable registry blob: ${dlRes.status}`);
                }
                ciphertext = await dlRes.text();
                if (!ciphertext.trim()) return [];
            }
            const blob = await cryptoV2.decryptFileV2({
                content_ciphertext: ciphertext,
                access_keys: asObject(file.access_keys, {}) as Record<string, never>,
                metadata: asObject(file.metadata, { has_custom_password: false }) as { has_custom_password: boolean },
                masterKey: keys.privateKey,
                userID: keys.userId,
            });
            return toEntries(JSON.parse(await blob.text()));
        },

        save(entries) {
            // saves run one after another: the first creates the file, later ones update it
            const run = queue.then(() => doSave(entries));
            queue = run.catch(() => undefined);
            return run;
        },
    };

    async function doSave(entries: RegistryEntry[]): Promise<void> {
        const keys = requireKeys();
        const enc = await cryptoV2.encryptFileV2(JSON.stringify(entries), keys.publicKey);
        const accessKeys = { [keys.userId]: enc.encrypted_dek };
        if (!fileId || fileOwnerId !== keys.userId) {
            fileId = null;
            fileOwnerId = null;
            const existing = await findFile(keys);
            if (existing) {
                fileId = existing.id;
                fileOwnerId = existing.owner_id ?? keys.userId;
            } else {
                const id = await create(enc.content_ciphertext, enc.metadata, accessKeys);
                if (!id) throw new Error('[variables] could not create registry file');
                fileId = id;
                fileOwnerId = keys.userId;
                return; // the new file already holds this content
            }
        }
        const res = await apiFetch(`/api/v1/files/${fileId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content_ciphertext: enc.content_ciphertext, metadata: enc.metadata, access_keys: accessKeys }),
        });
        if (!res.ok) throw new Error('[variables] could not save registry file');
    }
}
