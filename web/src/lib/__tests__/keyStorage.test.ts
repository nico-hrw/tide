import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// In-memory store to mock IndexedDB / idb-keyval
const mockIdbStore = new Map<string, any>();

vi.mock("idb-keyval", () => ({
    get: vi.fn(async (key: string) => mockIdbStore.get(key) ?? undefined),
    set: vi.fn(async (key: string, val: any) => {
        mockIdbStore.set(key, val);
    }),
    del: vi.fn(async (key: string) => {
        mockIdbStore.delete(key);
    }),
    clear: vi.fn(async () => {
        mockIdbStore.clear();
    }),
    keys: vi.fn(async () => Array.from(mockIdbStore.keys())),
}));

// Ensure WebCrypto is available on window for happy-dom environment
const crypto = globalThis.crypto || (typeof window !== "undefined" ? window.crypto : undefined);
if (!crypto || !crypto.subtle) {
    throw new Error("WebCrypto is not available in test environment");
}
if (typeof window !== "undefined" && (!window.crypto || !window.crypto.subtle)) {
    Object.defineProperty(window, "crypto", {
        value: crypto,
        writable: true,
        configurable: true,
    });
}

import {
    storeMasterKey,
    getMasterKey,
    clearMasterKey,
    storeEncryptedVault,
    getEncryptedVault,
    clearEncryptedVault,
    purgeLegacyKeys,
} from "../keyStorage";

describe("keyStorage", () => {
    beforeEach(async () => {
        mockIdbStore.clear();
        if (typeof window !== "undefined") {
            window.localStorage?.clear();
            window.sessionStorage?.clear();
        }
        await clearMasterKey();
        await clearEncryptedVault();
    });

    describe("1. Non-extractable Master Key Security", () => {
        it("stores an extractable key and persists it as non-extractable", async () => {
            // Generate extractable RSA-OAEP private key
            const keyPair = (await crypto.subtle.generateKey(
                {
                    name: "RSA-OAEP",
                    modulusLength: 2048,
                    publicExponent: new Uint8Array([1, 0, 1]),
                    hash: "SHA-256",
                },
                true, // extractable: true
                ["decrypt", "unwrapKey"]
            )) as CryptoKeyPair;

            expect(keyPair.privateKey.extractable).toBe(true);

            // Store key using storeMasterKey
            await storeMasterKey(keyPair.privateKey);

            // Retrieve key using getMasterKey
            const masterKey = await getMasterKey();
            expect(masterKey).not.toBeNull();
            expect(masterKey!.algorithm.name).toBe("RSA-OAEP");

            // Guarantee that stored key is non-extractable
            expect(masterKey!.extractable).toBe(false);

            // Verify that calling crypto.subtle.exportKey rejects with InvalidAccessError DOMException
            await expect(
                crypto.subtle.exportKey("jwk", masterKey!)
            ).rejects.toThrowError();

            try {
                await crypto.subtle.exportKey("jwk", masterKey!);
                expect.unreachable("Exporting non-extractable key should have failed");
            } catch (err: any) {
                expect(err.name).toBe("InvalidAccessError");
            }
        });

        it("serves the master key from in-memory cache without repeated storage reads", async () => {
            const keyPair = (await crypto.subtle.generateKey(
                {
                    name: "RSA-OAEP",
                    modulusLength: 2048,
                    publicExponent: new Uint8Array([1, 0, 1]),
                    hash: "SHA-256",
                },
                true,
                ["decrypt", "unwrapKey"]
            )) as CryptoKeyPair;

            await storeMasterKey(keyPair.privateKey);

            const key1 = await getMasterKey();
            const key2 = await getMasterKey();
            expect(key1).toBe(key2); // Exact same object reference in memory
        });
    });

    describe("2. Encrypted Vault Storage", () => {
        it("stores and retrieves the encrypted vault payload", async () => {
            const vaultData = {
                ciphertext: "xyz",
                salt: "abc",
                iv: "123",
            };

            await storeEncryptedVault(vaultData);

            const retrieved = await getEncryptedVault();
            expect(retrieved).toEqual(vaultData);
            expect(retrieved.ciphertext).toBe("xyz");
            expect(retrieved.salt).toBe("abc");
            expect(retrieved.iv).toBe("123");
        });

        it("preserves metadata fields in the encrypted vault payload", async () => {
            const fullVault = {
                ciphertext: "encrypted-vault-payload-base64",
                salt: "random-salt-bytes",
                iv: "initialization-vector",
                pepper: "pepper-hash",
                email: "user@tide.local",
                userId: "user-123",
            };

            await storeEncryptedVault(fullVault);

            const retrieved = await getEncryptedVault();
            expect(retrieved).toEqual(fullVault);
        });

        it("returns null when no vault payload exists", async () => {
            const empty = await getEncryptedVault();
            expect(empty).toBeNull();
        });
    });

    describe("3. Clear & Purge Functions", () => {
        it("clearMasterKey removes the key from cache and IndexedDB", async () => {
            const keyPair = (await crypto.subtle.generateKey(
                {
                    name: "RSA-OAEP",
                    modulusLength: 2048,
                    publicExponent: new Uint8Array([1, 0, 1]),
                    hash: "SHA-256",
                },
                true,
                ["decrypt", "unwrapKey"]
            )) as CryptoKeyPair;

            await storeMasterKey(keyPair.privateKey);
            expect(await getMasterKey()).not.toBeNull();

            await clearMasterKey();
            expect(await getMasterKey()).toBeNull();
            expect(mockIdbStore.has("tide_master_key")).toBe(false);
        });

        it("clearEncryptedVault removes the vault from IndexedDB", async () => {
            await storeEncryptedVault({ ciphertext: "xyz", salt: "abc", iv: "123" });
            expect(await getEncryptedVault()).not.toBeNull();

            await clearEncryptedVault();
            expect(await getEncryptedVault()).toBeNull();
            expect(mockIdbStore.has("encrypted_vault")).toBe(false);
        });

        it("purgeLegacyKeys scrubs legacy plaintext keys from localStorage and sessionStorage", () => {
            if (typeof window === "undefined") return;

            window.localStorage.setItem("tide_session_key", "raw-secret-session");
            window.localStorage.setItem("tide_master_key", "raw-secret-master");
            window.localStorage.setItem("tide_private_key", "raw-secret-private");
            window.localStorage.setItem("tide_vault_key", "raw-secret-vault");
            window.localStorage.setItem(
                "tide_custom_jwk",
                JSON.stringify({ kty: "RSA", d: "private-exponent" })
            );
            window.localStorage.setItem("tide_user_theme", "dark");

            window.sessionStorage.setItem("tide_session_key", "session-store-secret");
            window.sessionStorage.setItem("tide_active_tab", "notes");

            purgeLegacyKeys();

            // Explicit legacy keys removed
            expect(window.localStorage.getItem("tide_session_key")).toBeNull();
            expect(window.localStorage.getItem("tide_master_key")).toBeNull();
            expect(window.localStorage.getItem("tide_private_key")).toBeNull();
            expect(window.localStorage.getItem("tide_vault_key")).toBeNull();

            // JWK pattern keys removed
            expect(window.localStorage.getItem("tide_custom_jwk")).toBeNull();

            // Safe user settings preserved
            expect(window.localStorage.getItem("tide_user_theme")).toBe("dark");

            // SessionStorage sanitized
            expect(window.sessionStorage.getItem("tide_session_key")).toBeNull();
            expect(window.sessionStorage.getItem("tide_active_tab")).toBe("notes");
        });
    });
});
