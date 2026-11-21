import * as cryptoV2 from './cryptoV2';
import { apiFetch } from './api';

/** Server file type of the saved-views file (a free-form TEXT column, no schema change needed). */
export const VIEWS_FILE_TYPE = 'views';

export type SavedViewMode = 'day' | 'week' | 'month' | 'continuous';

/** A saved calendar view ("Ansicht"): a tag filter plus the calendar mode. */
export interface SavedView {
    id: string;
    name: string;
    tagIds: string[];
    untagged: boolean;
    viewMode: SavedViewMode;
}

export interface ViewsStorage {
    load(): Promise<SavedView[]>;
    save(views: SavedView[]): Promise<void>;
}

export interface ViewsKeys {
    privateKey: CryptoKey;
    publicKey: CryptoKey;
    userId: string;
}

interface ViewsFileRecord {
    id: string;
    type: string;
    owner_id?: string;
    blob_path?: string | null;
    content_ciphertext?: string;
    access_keys?: unknown;
    metadata?: unknown;
}

const VIEW_MODES: readonly SavedViewMode[] = ['day', 'week', 'month', 'continuous'];

const asObject = (v: unknown, fallback: object): object =>
    typeof v === 'string' ? JSON.parse(v) : (v && typeof v === 'object' ? v : fallback);

/** Tolerant parser for the decrypted payload: drops invalid entries, unknown viewMode becomes 'week'. */
export function parseViews(raw: unknown): SavedView[] {
    if (!Array.isArray(raw)) return [];
    const out: SavedView[] = [];
    for (const e of raw) {
        if (!e || typeof e !== 'object') continue;
        const r = e as Record<string, unknown>;
        if (typeof r.id !== 'string' || !r.id) continue;
        if (typeof r.name !== 'string' || !r.name.trim()) continue;
        const tagIds = Array.isArray(r.tagIds) ? r.tagIds.filter((t): t is string => typeof t === 'string') : [];
        const viewMode = VIEW_MODES.includes(r.viewMode as SavedViewMode) ? (r.viewMode as SavedViewMode) : 'week';
        out.push({ id: r.id, name: r.name, tagIds, untagged: r.untagged === true, viewMode });
    }
    return out;
}

/**
 * Saved views as one encrypted file (same pattern as the variable registry): content is AES-GCM encrypted with a DEK
 * that is RSA-wrapped for the user. `getKeys` returns null while the vault is locked.
 */
export function createApiViewsStorage(getKeys: () => ViewsKeys | null): ViewsStorage {
    let fileId: string | null = null;
    let fileOwnerId: string | null = null;
    let queue: Promise<unknown> = Promise.resolve();

    const requireKeys = (): ViewsKeys => {
        const k = getKeys();
        if (!k) throw new Error('[views] keys not available');
        return k;
    };

    async function findFile(keys: ViewsKeys): Promise<ViewsFileRecord | null> {
        const res = await apiFetch(`/api/v1/files?type=${VIEWS_FILE_TYPE}&recursive=true`);
        if (!res.ok) throw new Error('[views] could not list files');
        const files: ViewsFileRecord[] = await res.json().catch(() => []);
        return (
            files.find(
                (f) => f.type === VIEWS_FILE_TYPE && (f.owner_id === undefined || f.owner_id === keys.userId)
            ) ?? null
        );
    }

    async function create(ciphertext: string, metadata: unknown, accessKeys: unknown): Promise<string | null> {
        const res = await apiFetch('/api/v1/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: VIEWS_FILE_TYPE,
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

    async function doSave(views: SavedView[]): Promise<void> {
        const keys = requireKeys();
        const enc = await cryptoV2.encryptFileV2(JSON.stringify(views), keys.publicKey);
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
                if (!id) throw new Error('[views] could not create views file');
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
        if (!res.ok) throw new Error('[views] could not save views file');
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
                    if (dlRes.status === 404 && !file.blob_path) return [];
                    throw new Error(`Failed to download views blob: ${dlRes.status}`);
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
            let parsed: unknown;
            try {
                parsed = JSON.parse(await blob.text());
            } catch {
                return [];
            }
            return parseViews(parsed);
        },

        save(views) {
            // saves run one after another: the first creates the file, later ones update it
            const run = queue.then(() => doSave(views));
            queue = run.catch(() => undefined);
            return run;
        },
    };
}
