import type { StateStorage } from "zustand/middleware";
import { idb } from "./idb";

const OFFLINE_CACHE_KEY_STORAGE_KEY = "tide_offline_cache_key";
const CACHE_PREFIX = "tide_enc_cache_";

interface EncryptedCacheEnvelope {
    _tide_cache_v1: true;
    iv: string;
    ct: string;
}

let cachedCacheKey: CryptoKey | null = null;
let pendingKeyPromise: Promise<CryptoKey | null> | null = null;

function isCryptoAndIdbAvailable(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof indexedDB !== "undefined" &&
        Boolean(globalThis.crypto?.subtle)
    );
}

function uint8ToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array<ArrayBuffer> {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function isCryptoKeyLike(value: unknown): value is CryptoKey {
    return (
        value !== null &&
        typeof value === "object" &&
        "type" in value &&
        "algorithm" in value
    );
}

function safeLocalStorageRemove(name: string): void {
    try {
        if (typeof localStorage !== "undefined") {
            localStorage.removeItem(name);
        }
    } catch {
        // Ignore localStorage access errors
    }
}

/**
 * Generates a cryptographically secure random identifier with an optional prefix.
 */
export function generateSecureId(prefix?: string): string {
    const cryptoObj = globalThis.crypto;
    let id: string;
    if (typeof cryptoObj?.randomUUID === "function") {
        id = cryptoObj.randomUUID();
    } else if (typeof cryptoObj?.getRandomValues === "function") {
        const bytes = cryptoObj.getRandomValues(new Uint8Array(16));
        id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    } else {
        id = Date.now().toString(36);
    }
    return prefix ? `${prefix}-${id}` : id;
}

async function getCacheKey(createIfMissing: boolean): Promise<CryptoKey | null> {
    if (!isCryptoAndIdbAvailable()) {
        return null;
    }
    if (cachedCacheKey) {
        return cachedCacheKey;
    }
    if (pendingKeyPromise) {
        return pendingKeyPromise;
    }

    const loadOrInitPromise = (async (): Promise<CryptoKey | null> => {
        try {
            const stored = await idb.get<CryptoKey>(OFFLINE_CACHE_KEY_STORAGE_KEY);
            if (isCryptoKeyLike(stored)) {
                cachedCacheKey = stored;
                return stored;
            }
            if (!createIfMissing) {
                return null;
            }
            const key = await globalThis.crypto.subtle.generateKey(
                { name: "AES-GCM", length: 256 },
                false,
                ["encrypt", "decrypt"]
            );
            cachedCacheKey = key;
            await idb.set(OFFLINE_CACHE_KEY_STORAGE_KEY, key);
            return key;
        } catch {
            return null;
        }
    })();

    if (createIfMissing) {
        pendingKeyPromise = loadOrInitPromise;
        void loadOrInitPromise.finally(() => {
            if (pendingKeyPromise === loadOrInitPromise) {
                pendingKeyPromise = null;
            }
        });
    }
    return loadOrInitPromise;
}

/**
 * Encrypts a UTF-8 string using the local non-extractable AES-256-GCM cache key.
 */
export async function encryptCacheValue(plaintext: string): Promise<string | null> {
    const key = await getCacheKey(true);
    if (!key || !globalThis.crypto?.subtle) {
        return null;
    }
    try {
        const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(plaintext);
        const cipherBuf = await globalThis.crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            key,
            encoded
        );
        const envelope: EncryptedCacheEnvelope = {
            _tide_cache_v1: true,
            iv: uint8ToBase64(iv),
            ct: uint8ToBase64(new Uint8Array(cipherBuf)),
        };
        return JSON.stringify(envelope);
    } catch {
        return null;
    }
}

/**
 * Decrypts a `_tide_cache_v1` envelope back into a UTF-8 string, or returns null on failure.
 */
export async function decryptCacheValue(stored: unknown): Promise<string | null> {
    if (stored === null || stored === undefined) {
        return null;
    }

    let parsed: unknown = stored;
    if (typeof stored === "string") {
        try {
            parsed = JSON.parse(stored) as unknown;
        } catch {
            return null;
        }
    }

    if (!parsed || typeof parsed !== "object") {
        return null;
    }
    const record = parsed as Record<string, unknown>;
    if (
        record._tide_cache_v1 !== true ||
        typeof record.iv !== "string" ||
        typeof record.ct !== "string"
    ) {
        return null;
    }

    const key = await getCacheKey(false);
    if (!key || !globalThis.crypto?.subtle) {
        return null;
    }

    try {
        const iv = base64ToUint8(record.iv);
        const ct = base64ToUint8(record.ct);
        const plainBuf = await globalThis.crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            key,
            ct
        );
        return new TextDecoder().decode(plainBuf);
    } catch {
        return null;
    }
}

/**
 * Serializes and encrypts data into IndexedDB under `tide_enc_cache_${key}`.
 */
export async function saveEncryptedOfflineCache<T>(key: string, data: T): Promise<void> {
    try {
        const serialized = JSON.stringify(data);
        if (typeof serialized !== "string") {
            return;
        }
        const encrypted = await encryptCacheValue(serialized);
        if (!encrypted) {
            return;
        }
        await idb.set(`${CACHE_PREFIX}${key}`, encrypted);
    } catch {
        // Best-effort offline cache write
    }
}

/**
 * Reads and decrypts cached data from IndexedDB under `tide_enc_cache_${key}`.
 */
export async function loadEncryptedOfflineCache<T>(key: string): Promise<T | null> {
    try {
        const stored = await idb.get<unknown>(`${CACHE_PREFIX}${key}`);
        if (stored === undefined || stored === null) {
            return null;
        }
        const plaintext = await decryptCacheValue(stored);
        if (plaintext === null) {
            return null;
        }
        return JSON.parse(plaintext) as T;
    } catch {
        return null;
    }
}

/**
 * Creates a Zustand-compatible encrypted IndexedDB StateStorage with legacy localStorage migration.
 */
export function createEncryptedIdbStorage(): StateStorage {
    return {
        getItem: async (name: string): Promise<string | null> => {
            try {
                const stored = await idb.get<unknown>(`${CACHE_PREFIX}${name}`);
                if (stored !== undefined && stored !== null) {
                    const decrypted = await decryptCacheValue(stored);
                    if (decrypted !== null) {
                        return decrypted;
                    }
                }
            } catch {
                // Fall through to legacy localStorage check
            }

            try {
                if (typeof localStorage !== "undefined") {
                    const legacy = localStorage.getItem(name);
                    if (legacy !== null) {
                        const encrypted = await encryptCacheValue(legacy);
                        if (encrypted) {
                            await idb.set(`${CACHE_PREFIX}${name}`, encrypted);
                        }
                        safeLocalStorageRemove(name);
                        return legacy;
                    }
                }
            } catch {
                // Ignore localStorage access errors
            }

            return null;
        },
        setItem: async (name: string, value: string): Promise<void> => {
            try {
                const encrypted = await encryptCacheValue(value);
                if (encrypted) {
                    await idb.set(`${CACHE_PREFIX}${name}`, encrypted);
                }
            } catch {
                // Best-effort IDB write
            }
            safeLocalStorageRemove(name);
        },
        removeItem: async (name: string): Promise<void> => {
            try {
                await idb.del(`${CACHE_PREFIX}${name}`);
            } catch {
                // Best-effort IDB delete
            }
            safeLocalStorageRemove(name);
        },
    };
}

/**
 * Resets cached key state and deletes the cache key and all encrypted cache entries from IndexedDB.
 */
export async function clearOfflineCacheCrypto(): Promise<void> {
    cachedCacheKey = null;
    pendingKeyPromise = null;
    if (typeof window === "undefined" || typeof indexedDB === "undefined") {
        return;
    }
    try {
        await idb.del(OFFLINE_CACHE_KEY_STORAGE_KEY);
        const allKeys = await idb.keys();
        const cacheKeys = allKeys.filter(
            (k): k is string => typeof k === "string" && k.startsWith(CACHE_PREFIX)
        );
        await Promise.all(cacheKeys.map((k) => idb.del(k)));
    } catch {
        // Best-effort cleanup
    }
}
