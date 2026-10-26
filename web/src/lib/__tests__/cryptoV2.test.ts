import { describe, it, expect, beforeAll } from "vitest";
import {
    generateDEK,
    wrapDEKData,
    unwrapDEKData,
    encryptFileV2,
    decryptFileV2,
    isV1Payload,
    testCryptoV2,
    EncryptedFileV2Result,
    AccessKeysMap,
} from "../cryptoV2";

// Ensure WebCrypto is available in the test environment (Node/happy-dom)
const crypto = globalThis.crypto || (typeof window !== "undefined" ? window.crypto : undefined);

if (!crypto || !crypto.subtle) {
    throw new Error("WebCrypto is not available in the test environment");
}

if (typeof window !== "undefined" && (!window.crypto || !window.crypto.subtle)) {
    Object.defineProperty(window, "crypto", {
        value: crypto,
        writable: true,
        configurable: true,
    });
}

describe("cryptoV2", () => {
    let rsaKeyPair: CryptoKeyPair;

    beforeAll(async () => {
        rsaKeyPair = (await crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256",
            },
            true,
            ["encrypt", "decrypt"]
        )) as CryptoKeyPair;
    });

    describe("generateDEK", () => {
        it("generates an AES-GCM CryptoKey with 256 bits", async () => {
            const dek = await generateDEK();

            expect(dek).toBeDefined();
            expect(dek.type).toBe("secret");
            expect(dek.algorithm.name).toBe("AES-GCM");
            expect((dek.algorithm as AesKeyAlgorithm).length).toBe(256);
            expect(dek.extractable).toBe(true);
            expect(dek.usages).toContain("encrypt");
            expect(dek.usages).toContain("decrypt");
        });
    });

    describe("wrapDEKData & unwrapDEKData", () => {
        it("wraps and unwraps raw DEK bytes using RSA-OAEP keys", async () => {
            const rawDek = crypto.getRandomValues(new Uint8Array(32));

            const wrapped = await wrapDEKData(rawDek.buffer, rsaKeyPair.publicKey);
            expect(wrapped.ciphertext).toBeTypeOf("string");
            expect(wrapped.ciphertext.length).toBeGreaterThan(0);
            expect(wrapped.iv).toBeUndefined();

            const unwrapped = await unwrapDEKData(wrapped.ciphertext, rsaKeyPair.privateKey);
            expect(new Uint8Array(unwrapped)).toEqual(rawDek);
        });

        it("wraps and unwraps raw DEK bytes using AES-GCM KEK with IV", async () => {
            const aesKek = await generateDEK();
            const rawDek = crypto.getRandomValues(new Uint8Array(32));

            const wrapped = await wrapDEKData(rawDek.buffer, aesKek);
            expect(wrapped.ciphertext).toBeTypeOf("string");
            expect(wrapped.iv).toBeTypeOf("string");

            const unwrapped = await unwrapDEKData(wrapped.ciphertext, aesKek, wrapped.iv);
            expect(new Uint8Array(unwrapped)).toEqual(rawDek);
        });

        it("throws when unwrapping AES-GCM without an IV", async () => {
            const aesKek = await generateDEK();
            const rawDek = crypto.getRandomValues(new Uint8Array(32));
            const wrapped = await wrapDEKData(rawDek.buffer, aesKek);

            await expect(unwrapDEKData(wrapped.ciphertext, aesKek)).rejects.toThrow(
                "Missing IV for AES-GCM unwrapping"
            );
        });
    });

    describe("encryptFileV2 & decryptFileV2", () => {
        const testUserId = "user-test-42";
        const secretContent = "Secret Note Content";

        it("encrypts a string and verifies EncryptedFileV2Result structure", async () => {
            const result: EncryptedFileV2Result = await encryptFileV2(secretContent, rsaKeyPair.publicKey);

            expect(result).toHaveProperty("content_ciphertext");
            expect(result).toHaveProperty("encrypted_dek");
            expect(result).toHaveProperty("metadata");

            expect(result.metadata.has_custom_password).toBe(false);
            expect(result.metadata.pwd_salt).toBeUndefined();
            expect(result.encrypted_dek.wrapped_key).toBeTypeOf("string");
            expect(result.encrypted_dek.pwd_iv).toBeUndefined();

            const parsedPayload = JSON.parse(result.content_ciphertext);
            expect(parsedPayload).toHaveProperty("data");
            expect(parsedPayload).toHaveProperty("iv");
        });

        it("decrypts encrypted string content back to original text", async () => {
            const result = await encryptFileV2(secretContent, rsaKeyPair.publicKey);

            const accessKeys: AccessKeysMap = {
                [testUserId]: result.encrypted_dek,
            };

            const decryptedBlob = await decryptFileV2({
                content_ciphertext: result.content_ciphertext,
                access_keys: accessKeys,
                metadata: result.metadata,
                masterKey: rsaKeyPair.privateKey,
                userID: testUserId,
            });

            const decryptedText = await decryptedBlob.text();
            expect(decryptedText).toBe(secretContent);
        });

        it("encrypts and decrypts Blob input correctly", async () => {
            const blobContent = new Blob(["Blob payload content for testing"], { type: "text/plain" });
            const result = await encryptFileV2(blobContent, rsaKeyPair.publicKey);

            const accessKeys: AccessKeysMap = {
                [testUserId]: result.encrypted_dek,
            };

            const decryptedBlob = await decryptFileV2({
                content_ciphertext: result.content_ciphertext,
                access_keys: accessKeys,
                metadata: result.metadata,
                masterKey: rsaKeyPair.privateKey,
                userID: testUserId,
            });

            expect(await decryptedBlob.text()).toBe("Blob payload content for testing");
        });

        it("supports double-wrapping with custom password", async () => {
            const customPassword = "my-super-secret-password-123";
            const result = await encryptFileV2("Double Wrapped Note", rsaKeyPair.publicKey, customPassword);

            expect(result.metadata.has_custom_password).toBe(true);
            expect(result.metadata.pwd_salt).toBeTypeOf("string");
            expect(result.encrypted_dek.pwd_iv).toBeTypeOf("string");

            const accessKeys: AccessKeysMap = {
                [testUserId]: result.encrypted_dek,
            };

            // Attempt decryption without password should throw ERR_CUSTOM_PASSWORD_REQUIRED
            await expect(
                decryptFileV2({
                    content_ciphertext: result.content_ciphertext,
                    access_keys: accessKeys,
                    metadata: result.metadata,
                    masterKey: rsaKeyPair.privateKey,
                    userID: testUserId,
                })
            ).rejects.toThrow("ERR_CUSTOM_PASSWORD_REQUIRED");

            // Decryption with correct password succeeds
            const decryptedBlob = await decryptFileV2({
                content_ciphertext: result.content_ciphertext,
                access_keys: accessKeys,
                metadata: result.metadata,
                masterKey: rsaKeyPair.privateKey,
                userID: testUserId,
                customPassword,
            });

            expect(await decryptedBlob.text()).toBe("Double Wrapped Note");
        });

        it("throws when user access key is missing", async () => {
            const result = await encryptFileV2(secretContent, rsaKeyPair.publicKey);

            await expect(
                decryptFileV2({
                    content_ciphertext: result.content_ciphertext,
                    access_keys: {},
                    metadata: result.metadata,
                    masterKey: rsaKeyPair.privateKey,
                    userID: "missing-user",
                })
            ).rejects.toThrow("No access keys found for the given user");
        });
    });

    describe("Bit-flipping / Tamper Detection", () => {
        const testUserId = "user-tamper-check";
        const originalContent = "Confidential financial data";

        it("rejects when ciphertext data is tampered with", async () => {
            const encResult = await encryptFileV2(originalContent, rsaKeyPair.publicKey);
            const parsed = JSON.parse(encResult.content_ciphertext);

            // Tamper with base64 ciphertext data by altering characters
            const originalData: string = parsed.data;
            const tamperedChar = originalData[0] === "A" ? "B" : "A";
            parsed.data = tamperedChar + originalData.slice(1);

            const tamperedCiphertext = JSON.stringify(parsed);

            await expect(
                decryptFileV2({
                    content_ciphertext: tamperedCiphertext,
                    access_keys: { [testUserId]: encResult.encrypted_dek },
                    metadata: encResult.metadata,
                    masterKey: rsaKeyPair.privateKey,
                    userID: testUserId,
                })
            ).rejects.toThrow();
        });

        it("rejects when wrapped DEK is tampered with", async () => {
            const encResult = await encryptFileV2(originalContent, rsaKeyPair.publicKey);
            const originalWrappedKey = encResult.encrypted_dek.wrapped_key;
            const tamperedChar = originalWrappedKey[0] === "A" ? "B" : "A";
            const tamperedWrappedKey = tamperedChar + originalWrappedKey.slice(1);

            await expect(
                decryptFileV2({
                    content_ciphertext: encResult.content_ciphertext,
                    access_keys: {
                        [testUserId]: {
                            ...encResult.encrypted_dek,
                            wrapped_key: tamperedWrappedKey,
                        },
                    },
                    metadata: encResult.metadata,
                    masterKey: rsaKeyPair.privateKey,
                    userID: testUserId,
                })
            ).rejects.toThrow();
        });

        it("rejects when IV is invalid or tampered with", async () => {
            const encResult = await encryptFileV2(originalContent, rsaKeyPair.publicKey);
            const parsed = JSON.parse(encResult.content_ciphertext);
            const originalIv: string = parsed.iv;
            const tamperedIvChar = originalIv[0] === "X" ? "Y" : "X";
            parsed.iv = tamperedIvChar + originalIv.slice(1);

            await expect(
                decryptFileV2({
                    content_ciphertext: JSON.stringify(parsed),
                    access_keys: { [testUserId]: encResult.encrypted_dek },
                    metadata: encResult.metadata,
                    masterKey: rsaKeyPair.privateKey,
                    userID: testUserId,
                })
            ).rejects.toThrow();
        });
    });

    describe("isV1Payload", () => {
        it("returns true for legacy payload with ciphertext without v2 envelope", () => {
            expect(isV1Payload({ ciphertext: "legacy-base64-ciphertext" })).toBe(true);
        });

        it("returns true for legacy payload with content and iv", () => {
            expect(isV1Payload({ content: "legacy text", iv: "legacy-iv-string" })).toBe(true);
        });

        it("returns true for payload with version 1 marker", () => {
            expect(isV1Payload({ version: 1, id: "legacy-1" })).toBe(true);
        });

        it("returns true for payload with secured_meta and legacy iv", () => {
            expect(isV1Payload({
                id: "doc-1",
                secured_meta: "encrypted-metadata-payload",
                public_meta: { iv: "some-iv" },
            })).toBe(true);
        });

        it("returns false for valid v2 object format", () => {
            const v2Payload = {
                version: 2,
                content_ciphertext: '{"data":"YWJj","iv":"MTIz"}',
                access_keys: {
                    "user-1": { wrapped_key: "wrapped-key-base64" },
                },
                metadata: { has_custom_password: false },
            };

            expect(isV1Payload(v2Payload)).toBe(false);
        });

        it("returns false for v2 entity with version >= 2 and content_ciphertext", () => {
            expect(isV1Payload({
                version: 2,
                content_ciphertext: "v2-ciphertext-content",
            })).toBe(false);
        });

        it("returns false for invalid or empty inputs", () => {
            expect(isV1Payload(null as unknown as Record<string, unknown>)).toBe(false);
            expect(isV1Payload(undefined as unknown as Record<string, unknown>)).toBe(false);
            expect(isV1Payload({})).toBe(false);
        });
    });

    describe("testCryptoV2", () => {
        it("runs the full testCryptoV2 verification suite and resolves to true", async () => {
            const result = await testCryptoV2();
            expect(result).toBe(true);
        });
    });
});
