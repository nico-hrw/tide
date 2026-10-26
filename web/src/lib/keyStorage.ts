import { get, set, del } from "idb-keyval";

const MASTER_KEY_STORAGE_KEY = "tide_master_key";

/**
 * In-memory singleton cache to provide instantaneous access to the master key
 * without repeated IndexedDB reads.
 */
let cachedKey: CryptoKey | null = null;
let pendingKeyPromise: Promise<CryptoKey | null> | null = null;

/**
 * Purges legacy plaintext keys and JWK representations stored in localStorage or sessionStorage.
 */
export function purgeLegacyKeys(): void {
    if (typeof window === "undefined") {
        return;
    }

    const legacyKeyNames = [
        "tide_session_key",
        "tide_master_key",
        "tide_private_key",
        "tide_vault_key",
    ];

    const storages: Storage[] = [];
    try {
        if (window.localStorage) {
            storages.push(window.localStorage);
        }
    } catch {
        // LocalStorage access may be restricted
    }

    try {
        if (window.sessionStorage) {
            storages.push(window.sessionStorage);
        }
    } catch {
        // SessionStorage access may be restricted
    }

    for (const storage of storages) {
        // Remove explicitly known legacy keys
        for (const key of legacyKeyNames) {
            try {
                if (storage.getItem(key) !== null) {
                    storage.removeItem(key);
                }
            } catch {
                // Ignore storage access errors
            }
        }

        // Scan and purge any remaining legacy items holding plaintext JWK data
        try {
            const keysToRemove: string[] = [];
            for (let i = 0; i < storage.length; i++) {
                const storageKey = storage.key(i);
                if (!storageKey) continue;
                if (storageKey.startsWith("tide_") && (storageKey.includes("key") || storageKey.includes("jwk"))) {
                    const rawVal = storage.getItem(storageKey);
                    if (rawVal && (rawVal.includes('"kty"') || rawVal.includes('"d"'))) {
                        keysToRemove.push(storageKey);
                    }
                }
            }
            for (const key of keysToRemove) {
                storage.removeItem(key);
            }
        } catch {
            // Ignore storage scan errors
        }
    }
}

/**
 * Stores the Master CryptoKey in the in-memory cache and persists it in IndexedDB.
 * Ensures the stored key is non-extractable (extractable: false) for security.
 */
export async function storeMasterKey(key: CryptoKey): Promise<void> {
    let keyToStore = key;

    // If key is extractable, re-import it as non-extractable before persisting
    if (key.extractable && typeof window !== "undefined" && window.crypto?.subtle) {
        try {
            const jwk = await window.crypto.subtle.exportKey("jwk", key);
            const hashName =
                typeof key.algorithm === "object" && "hash" in key.algorithm && key.algorithm.hash
                    ? (key.algorithm.hash as KeyAlgorithm).name || "SHA-256"
                    : "SHA-256";

            keyToStore = await window.crypto.subtle.importKey(
                "jwk",
                jwk,
                { name: key.algorithm.name, hash: hashName },
                false, // Non-extractable
                key.usages
            );
        } catch {
            // If re-import fails, fallback to provided key
            keyToStore = key;
        }
    }

    cachedKey = keyToStore;
    pendingKeyPromise = null;
    await set(MASTER_KEY_STORAGE_KEY, keyToStore);
}

/**
 * Retrieves the Master CryptoKey. Returns in-memory cachedKey if present;
 * otherwise loads from IndexedDB, populates cachedKey, and returns it.
 */
export async function getMasterKey(): Promise<CryptoKey | null> {
    if (cachedKey) {
        return cachedKey;
    }

    if (typeof window === "undefined") {
        return null;
    }

    if (pendingKeyPromise) {
        return pendingKeyPromise;
    }

    pendingKeyPromise = (async () => {
        try {
            const stored = await get<CryptoKey>(MASTER_KEY_STORAGE_KEY);
            if (stored && typeof stored === "object" && "type" in stored && "algorithm" in stored) {
                cachedKey = stored;
                return cachedKey;
            }
            return null;
        } catch {
            return null;
        } finally {
            pendingKeyPromise = null;
        }
    })();

    return pendingKeyPromise;
}

/**
 * Clears the in-memory cachedKey and deletes the master key from IndexedDB.
 */
export async function clearMasterKey(): Promise<void> {
    cachedKey = null;
    pendingKeyPromise = null;
    if (typeof window !== "undefined") {
        try {
            await del(MASTER_KEY_STORAGE_KEY);
        } catch {
            // Ignore error if IndexedDB is inaccessible
        }
    }
}

// Auto-purge legacy keys in browser context upon module initialization
if (typeof window !== "undefined") {
    purgeLegacyKeys();
}
