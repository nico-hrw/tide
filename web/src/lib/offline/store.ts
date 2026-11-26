/**
 * Offline mirror of GET responses.
 *
 * Only what the server already delivers (ciphertext / metadata as returned by the API) is mirrored,
 * and every entry is additionally sealed with the device-local, non-extractable cache key from
 * `offlineCacheCrypto`. Keys carry the user id, so one account can never be served another
 * account's data. The `api_cache_` prefix is kept so the logout cleanup in `api.ts` still matches.
 */
import { idb } from '../idb';
import { decryptCacheValue, encryptCacheValue } from '../offlineCacheCrypto';

export const MIRROR_PREFIX = 'api_cache_';
const META_PREFIX = 'api_cache_meta_';

interface MirrorEnvelope {
    _tide_mirror_v1: true;
    t: number;
    b: string;
}

export interface MirrorHit {
    body: string;
    /** Epoch ms of the last successful online fetch; null for legacy entries without a timestamp. */
    cachedAt: number | null;
}

/**
 * Id of the signed-in user, or null (then nothing is mirrored or served). localStorage wins on purpose:
 * `apiFetch` sends the token from localStorage, so the mirror key must belong to that same account. A tab
 * whose sessionStorage still holds the id of an account another tab has since replaced would otherwise
 * store the new account's responses under the old account's key. sessionStorage is only the fallback.
 */
export function getOfflineUserId(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const id = localStorage.getItem('tide_user_id') || sessionStorage.getItem('tide_user_id');
        return id && id.trim() ? id.trim() : null;
    } catch {
        return null;
    }
}

function userPrefix(userId: string): string {
    return `${MIRROR_PREFIX}u:${userId}:`;
}

export function mirrorKey(userId: string, endpoint: string): string {
    return `${userPrefix(userId)}${endpoint}`;
}

/** Only plain GETs are ever mirrored; mutations and everything else are not. */
export function isMirrorableMethod(method: string | undefined): boolean {
    return !method || method.toUpperCase() === 'GET';
}

/** Bumped by every `clearOfflineData`: a write that started before it must not land (or must be undone) afterwards. */
let clearGeneration = 0;

/**
 * Mirror one successful GET body. Best-effort, never throws. `lastMirroredAt` is only set when the entry
 * really was stored (a full quota must not claim a fresh offline state) and never after a clear.
 */
export async function mirrorWrite(endpoint: string, body: string, userId = getOfflineUserId()): Promise<void> {
    if (!userId) return;
    const generation = clearGeneration;
    try {
        const now = Date.now();
        const envelope: MirrorEnvelope = { _tide_mirror_v1: true, t: now, b: body };
        const sealed = await encryptCacheValue(JSON.stringify(envelope));
        if (sealed === null || generation !== clearGeneration) return;
        const key = mirrorKey(userId, endpoint);
        const stored = await idb.setChecked(key, sealed);
        if (generation !== clearGeneration) {
            // The user logged out / cleared the mirror while this write was in flight: take it back.
            await idb.del(key);
            return;
        }
        if (!stored) return;
        const metaKey = `${META_PREFIX}${userId}`;
        await idb.setChecked(metaKey, { lastMirroredAt: now });
        if (generation !== clearGeneration) await idb.del(metaKey);
    } catch {
        // best effort
    }
}

/** Read the mirrored body for this endpoint and the current user (undecryptable entries are dropped). */
export async function mirrorRead(endpoint: string, userId = getOfflineUserId()): Promise<MirrorHit | null> {
    if (!userId) return null;
    const key = mirrorKey(userId, endpoint);
    try {
        const raw = await idb.get<unknown>(key);
        if (raw === undefined) return null;
        const text = await decryptCacheValue(raw);
        if (text === null) {
            await idb.del(key);
            return null;
        }
        try {
            const parsed = JSON.parse(text) as Partial<MirrorEnvelope> | null;
            if (parsed && parsed._tide_mirror_v1 === true && typeof parsed.b === 'string') {
                return { body: parsed.b, cachedAt: typeof parsed.t === 'number' ? parsed.t : null };
            }
        } catch {
            // legacy entry: the plain body itself
        }
        return { body: text, cachedAt: null };
    } catch {
        return null;
    }
}

/** Delete the mirror of one user, or of all users on this device when no id is given. */
export async function clearOfflineData(userId?: string | null): Promise<void> {
    clearGeneration++;
    try {
        const prefix = userId ? userPrefix(userId) : MIRROR_PREFIX;
        const metaPrefix = userId ? `${META_PREFIX}${userId}` : META_PREFIX;
        const keys = await idb.keys();
        const doomed = keys.filter(
            (k): k is string => typeof k === 'string' && (k.startsWith(prefix) || k.startsWith(metaPrefix)),
        );
        await Promise.all(doomed.map((k) => idb.del(k)));
    } catch {
        // best effort
    }
}

/** Epoch ms of the most recent successful mirror write for this user. */
export async function getLastMirroredAt(userId = getOfflineUserId()): Promise<number | null> {
    if (!userId) return null;
    const meta = await idb.get<{ lastMirroredAt?: number }>(`${META_PREFIX}${userId}`);
    return typeof meta?.lastMirroredAt === 'number' ? meta.lastMirroredAt : null;
}

export interface StorageStatus {
    supported: boolean;
    persisted: boolean | null;
    usage: number | null;
    quota: number | null;
}

/** Ask the browser quietly to keep our data (no dialog on most browsers). */
export async function requestPersistentStorage(): Promise<boolean> {
    try {
        if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
        if (navigator.storage.persisted && (await navigator.storage.persisted())) return true;
        return await navigator.storage.persist();
    } catch {
        return false;
    }
}

export async function getStorageStatus(): Promise<StorageStatus> {
    if (typeof navigator === 'undefined' || !navigator.storage) {
        return { supported: false, persisted: null, usage: null, quota: null };
    }
    let persisted: boolean | null = null;
    let usage: number | null = null;
    let quota: number | null = null;
    try {
        persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
    } catch {
        persisted = null;
    }
    try {
        const est = navigator.storage.estimate ? await navigator.storage.estimate() : null;
        usage = est?.usage ?? null;
        quota = est?.quota ?? null;
    } catch {
        // estimate unavailable
    }
    return { supported: true, persisted, usage, quota };
}
