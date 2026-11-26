import * as cryptoV2 from './cryptoV2';
import { apiFetch } from './api';

export interface SingletonKeys {
    privateKey: CryptoKey;
    publicKey: CryptoKey;
    userId: string;
}

interface SingletonFileRecord {
    id: string;
    type: string;
    owner_id?: string;
    blob_path?: string | null;
    content_ciphertext?: string;
    access_keys?: unknown;
    metadata?: unknown;
}

export interface EncryptedSingletonOptions<T> {
    /** Server file type (a free-form TEXT column, no schema change needed). */
    type: string;
    /** Prefix for error messages, e.g. 'variables'. */
    label: string;
    /** Human name used in create/save error messages ('could not save <blobName> file'). */
    blobName: string;
    /** Name used in the download error message; defaults to blobName. */
    downloadName?: string;
    /** Value returned when no file / no content exists yet. */
    empty: () => T;
    /** Parses the decrypted text. May throw (the load then fails and nothing gets overwritten). */
    parse: (text: string) => T;
    /** Chooses among several matching files (default: the first the server lists). */
    pick?: (files: Array<{ id: string }>) => { id: string } | undefined;
    /** Every call goes to the live server: no mirror answer, no offline queue (see `apiFetch` `offline: 'never'`). */
    liveOnly?: boolean;
}

const asObject = (v: unknown, fallback: object): object =>
    typeof v === 'string' ? JSON.parse(v) : (v && typeof v === 'object' ? v : fallback);

/**
 * One value stored as ONE encrypted file per user: content is AES-GCM encrypted with a DEK that is RSA-wrapped for the
 * user, the server only ever sees ciphertext. `getKeys` returns null while the vault is locked. Saves run one after
 * another through a queue: the first creates the file, later ones update it.
 */
export function createEncryptedSingletonStorage<T>(
    getKeys: () => SingletonKeys | null,
    opts: EncryptedSingletonOptions<T>
): { load(): Promise<T>; save(value: T): Promise<void> } {
    const { type, label } = opts;
    const live: { offline?: 'never' } = opts.liveOnly ? { offline: 'never' } : {};
    let fileId: string | null = null;
    let fileOwnerId: string | null = null;
    let queue: Promise<unknown> = Promise.resolve();

    const requireKeys = (): SingletonKeys => {
        const k = getKeys();
        if (!k) throw new Error(`[${label}] keys not available`);
        return k;
    };

    async function findFile(keys: SingletonKeys): Promise<SingletonFileRecord | null> {
        const res = await apiFetch(`/api/v1/files?type=${encodeURIComponent(type)}&recursive=true`, live);
        if (!res.ok) throw new Error(`[${label}] could not list files`);
        const files: SingletonFileRecord[] = await res.json().catch(() => []);
        const mine = files.filter((f) => f.type === type && (f.owner_id === undefined || f.owner_id === keys.userId));
        if (!opts.pick) return mine[0] ?? null;
        const chosen = opts.pick(mine);
        return mine.find((f) => f.id === chosen?.id) ?? null;
    }

    async function create(ciphertext: string, metadata: unknown, accessKeys: unknown): Promise<string | null> {
        const res = await apiFetch('/api/v1/files', {
            ...live,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type,
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
        const upRes = await apiFetch(`/api/v1/files/${encodeURIComponent(created.id)}/upload`, { ...live, method: 'POST', body: ciphertext });
        if (!upRes.ok) return null;
        return created.id;
    }

    async function doSave(value: T): Promise<void> {
        const keys = requireKeys();
        const enc = await cryptoV2.encryptFileV2(JSON.stringify(value), keys.publicKey);
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
                if (!id) throw new Error(`[${label}] could not create ${opts.blobName} file`);
                fileId = id;
                fileOwnerId = keys.userId;
                return; // the new file already holds this content
            }
        }
        const res = await apiFetch(`/api/v1/files/${encodeURIComponent(fileId)}`, {
            ...live,
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content_ciphertext: enc.content_ciphertext, metadata: enc.metadata, access_keys: accessKeys }),
        });
        if (!res.ok) throw new Error(`[${label}] could not save ${opts.blobName} file`);
    }

    return {
        async load() {
            const keys = requireKeys();
            const file = await findFile(keys);
            if (!file) {
                fileId = null;
                fileOwnerId = null;
                return opts.empty();
            }
            fileId = file.id;
            fileOwnerId = file.owner_id ?? keys.userId;
            let ciphertext = file.content_ciphertext;
            if (!ciphertext) {
                const dlRes = await apiFetch(`/api/v1/files/${encodeURIComponent(file.id)}/download`, live);
                if (!dlRes.ok) {
                    if (dlRes.status === 404 && !file.blob_path) return opts.empty();
                    throw new Error(`Failed to download ${opts.downloadName ?? opts.blobName} blob: ${dlRes.status}`);
                }
                ciphertext = await dlRes.text();
                if (!ciphertext.trim()) return opts.empty();
            }
            const blob = await cryptoV2.decryptFileV2({
                content_ciphertext: ciphertext,
                access_keys: asObject(file.access_keys, {}) as Record<string, never>,
                metadata: asObject(file.metadata, { has_custom_password: false }) as { has_custom_password: boolean },
                masterKey: keys.privateKey,
                userID: keys.userId,
            });
            return opts.parse(await blob.text());
        },

        save(value) {
            const run = queue.then(() => doSave(value));
            queue = run.catch(() => undefined);
            return run;
        },
    };
}
