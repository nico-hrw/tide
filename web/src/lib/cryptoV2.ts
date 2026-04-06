import { arrayBufferToBase64, base64ToArrayBuffer, deriveKeyFromPassword, decryptFile, MasterKeys } from "./crypto";

// --- Types ---

export interface EncryptedFileV2Result {
    content_ciphertext: string; // JSON.stringify({ data: "base64...", iv: "base64..." })
    encrypted_dek: { wrapped_key: string; pwd_iv?: string };
    metadata: { has_custom_password: boolean; pwd_salt?: string; [key: string]: any };
}

export interface AccessKeysMap {
    [userID: string]: { wrapped_key: string; pwd_iv?: string };
}

export interface DecryptFileV2Options {
    content_ciphertext: string; // JSON string of data & iv
    access_keys: AccessKeysMap;
    metadata: { has_custom_password: boolean; pwd_salt?: string; [key: string]: any };
    masterKey: CryptoKey;
    userID: string;
    customPassword?: string;
}

// --- 1. DEK Management ---

/**
 * Generates a random 256-bit AES-GCM Document Encryption Key (DEK).
 */
export async function generateDEK(): Promise<CryptoKey> {
    return window.crypto.subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256,
        },
        true, // Must be extractable so we can wrap it
        ["encrypt", "decrypt"]
    );
}

/**
 * Wraps a raw DEK Buffer using a KEK (Key Encryption Key).
 * Supports both RSA-OAEP (masterKey) and AES-GCM (pwdKey).
 */
export async function wrapDEKData(rawDek: ArrayBuffer, kek: CryptoKey): Promise<{ ciphertext: string; iv?: string }> {
    const algorithmName = kek.algorithm.name;

    if (algorithmName === "RSA-OAEP") {
        // Encrypt directly (no IV)
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: "RSA-OAEP" },
            kek,
            rawDek
        );
        return { ciphertext: arrayBufferToBase64(ciphertext) };
    } else if (algorithmName === "AES-GCM") {
        // Need an IV for AES
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            kek,
            rawDek
        );
        return {
            ciphertext: arrayBufferToBase64(ciphertext),
            iv: arrayBufferToBase64(iv.buffer),
        };
    } else {
        throw new Error(`[CRYPTO-V2] Unsupported KEK algorithm for wrapping: ${algorithmName}`);
    }
}

/**
 * Unwraps a wrapped DEK Buffer using a KEK.
 */
export async function unwrapDEKData(ciphertextBase64: string, kek: CryptoKey, ivBase64?: string): Promise<ArrayBuffer> {
    const algorithmName = kek.algorithm.name;
    const ciphertext = base64ToArrayBuffer(ciphertextBase64);

    if (algorithmName === "RSA-OAEP") {
        return window.crypto.subtle.decrypt(
            { name: "RSA-OAEP" },
            kek,
            ciphertext
        );
    } else if (algorithmName === "AES-GCM") {
        if (!ivBase64) throw new Error("[CRYPTO-V2] Missing IV for AES-GCM unwrapping.");
        const iv = base64ToArrayBuffer(ivBase64);
        return window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            kek,
            ciphertext
        );
    } else {
        throw new Error(`[CRYPTO-V2] Unsupported KEK algorithm for unwrapping: ${algorithmName}`);
    }
}

/**
 * Utility to convert raw buffer back to a CryptoKey for DEK.
 */
export async function importDEK(rawDek: ArrayBuffer): Promise<CryptoKey> {
    return window.crypto.subtle.importKey(
        "raw",
        rawDek,
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"]
    );
}

// --- 2. Core Encryption / Decryption ---

/**
 * Encrypts file content using Envelope Encryption V2.
 * If customPassword is provided, the DEK is double-wrapped.
 */
export async function encryptFileV2(
    content: Blob | File | string,
    masterKey: CryptoKey,
    customPassword?: string
): Promise<EncryptedFileV2Result> {
    // 1. Generate new DEK
    const dek = await generateDEK();

    // 2. Encrypt Content with DEK
    let contentBuffer: ArrayBuffer;
    if (typeof content === "string") {
        contentBuffer = new TextEncoder().encode(content).buffer;
    } else {
        contentBuffer = await content.arrayBuffer();
    }

    const contentIv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedContentBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: contentIv },
        dek,
        contentBuffer
    );
    const contentIvBase64 = arrayBufferToBase64(contentIv.buffer);
    const contentDataBase64 = arrayBufferToBase64(encryptedContentBuffer);

    // 3. Export DEK for wrapping
    const rawDek = await window.crypto.subtle.exportKey("raw", dek);

    const metadata: EncryptedFileV2Result["metadata"] = {
        has_custom_password: false,
    };
    let dekToWrapWithMaster = rawDek;
    let pwdIvBase64: string | undefined;

    // 4. Double Wrapping if Custom Password
    if (customPassword) {
        metadata.has_custom_password = true;
        // Generate random salt for PBKDF2
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        metadata.pwd_salt = arrayBufferToBase64(salt.buffer);

        // Derive KEK from password
        const pwdKey = await deriveKeyFromPassword(customPassword, salt.buffer);

        // First Wrap: Wrap DEK with pwdKey
        const { ciphertext, iv } = await wrapDEKData(rawDek, pwdKey);
        
        // We pass the ciphertext buffer forward to the second wrap
        dekToWrapWithMaster = base64ToArrayBuffer(ciphertext);
        pwdIvBase64 = iv;
    }

    // 5. Final/Primary Wrap: Wrap with MasterKey
    const masterWrapped = await wrapDEKData(dekToWrapWithMaster, masterKey);

    return {
        content_ciphertext: JSON.stringify({ data: contentDataBase64, iv: contentIvBase64 }),
        encrypted_dek: {
            wrapped_key: masterWrapped.ciphertext,
            pwd_iv: pwdIvBase64
        },
        metadata
    };
}

/**
 * Decrypts file content using Envelope Encryption V2.
 * Throws "ERR_CUSTOM_PASSWORD_REQUIRED" if password is required but missing.
 */
export async function decryptFileV2(opts: DecryptFileV2Options): Promise<Blob> {
    const { content_ciphertext, access_keys, metadata, masterKey, userID, customPassword } = opts;

    // 1. Get user's access keys
    const myAccess = access_keys[userID];
    if (!myAccess || !myAccess.wrapped_key) {
        throw new Error("[CRYPTO-V2] No access keys found for the given user.");
    }

    // 2. Unwrap 1st layer using MasterKey (RSA)
    let currentRawDek = await unwrapDEKData(myAccess.wrapped_key, masterKey);

    // 3. Check for Double Wrapping
    if (metadata.has_custom_password) {
        if (!customPassword) {
            // Interceptor / UI must catch this specific error text
            throw new Error("ERR_CUSTOM_PASSWORD_REQUIRED");
        }
        if (!metadata.pwd_salt) {
            throw new Error("[CRYPTO-V2] Missing password salt in metadata.");
        }

        // Derive KEK
        const saltBuffer = base64ToArrayBuffer(metadata.pwd_salt);
        const pwdKey = await deriveKeyFromPassword(customPassword, saltBuffer);

        // Convert unwrapped buffer back to Base64 to feed into unwrap again (or bypass base64 if refactored)
        const innerCiphertextBase64 = arrayBufferToBase64(currentRawDek);
        
        // Unwrap 2nd layer using pwdKey (AES)
        currentRawDek = await unwrapDEKData(innerCiphertextBase64, pwdKey, myAccess.pwd_iv);
    }

    // 4. Import the final DEK
    const dek = await importDEK(currentRawDek);

    // 5. Decrypt File Content
    const payload = JSON.parse(content_ciphertext);
    if (!payload.data || !payload.iv) {
        throw new Error("[CRYPTO-V2] Invalid content_ciphertext JSON payload.");
    }

    const ivBuffer = base64ToArrayBuffer(payload.iv);
    const contentBuffer = base64ToArrayBuffer(payload.data);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBuffer },
        dek,
        contentBuffer
    );

    return new Blob([decryptedBuffer]);
}

// --- 3. Lazy Migration Logic ---

export interface MigratedDataPayload {
    needsMigration: boolean;
    content: Blob;
    v2Data?: {
        content_ciphertext: string;
        access_keys: AccessKeysMap;
        metadata: any;
        version: number;
    }
}

/**
 * Wrapper function for UI components to load files seamlessly and trigger lazy migrations.
 */
export async function loadAndMigrateFile(
    fileRecord: any, 
    masterKey: CryptoKey, 
    userID: string, 
    customPassword?: string
): Promise<MigratedDataPayload> {
    const version = fileRecord.version || 1;

    try {
        if (version === 1) {
            console.log(`[CRYPTO-V2] Migrating File ID ${fileRecord.id} from V1 to V2...`);
            
            // 1. Decrypt using V1 logic
            // Requires 'secured_meta' extraction in V1, assumed legacy data format.
            // Often V1 has iv globally stored or at the beginning of blob.
            // This assumes the legacy decryptFile works for this blob. 
            // In Tide V1, we passed the File blob, the IV (from publicMeta or blobPath), and the masterKey.
            // Adjust IV fetching based on legacy Tide implementation:
            let legacyIv = "";
            if (typeof fileRecord.public_meta === 'object' && fileRecord.public_meta?.iv) {
                legacyIv = fileRecord.public_meta.iv;
            } else if (fileRecord.iv) {
                 legacyIv = fileRecord.iv;
            } else {
                 console.warn("[CRYPTO-V2] Missing IV for V1 file decryption, migration might fail.");
            }

            // Using old generic decryptFile from crypto.ts (assuming blob content is passed inside fileRecord)
            let blobContent: Blob;
            if (fileRecord.ciphertext instanceof Blob) {
                blobContent = fileRecord.ciphertext;
            } else if (fileRecord.content) {
                // If the API already loaded it as text or blob
                blobContent = (typeof fileRecord.content === 'string') ? new Blob([fileRecord.content]) : fileRecord.content;
            } else {
                throw new Error("[CRYPTO-V2] File blob not provided for V1 migration.");
            }

            const decryptedBlob = await decryptFile(blobContent, legacyIv, masterKey, fileRecord.id);

            // 2. Encrypt using new V2 logic immediately
            const v2Result = await encryptFileV2(decryptedBlob, masterKey, customPassword);

            // 3. Prepare access keys map for the owner
            const accessKeysMap: AccessKeysMap = {
                [userID]: v2Result.encrypted_dek
            };

            return {
                needsMigration: true,
                content: decryptedBlob,
                v2Data: {
                    content_ciphertext: v2Result.content_ciphertext,
                    metadata: v2Result.metadata,
                    access_keys: accessKeysMap,
                    version: 2
                }
            };

        } else if (version >= 2) {
            // Valid V2 Execution
            const content = await decryptFileV2({
                content_ciphertext: fileRecord.content_ciphertext,
                access_keys: typeof fileRecord.access_keys === 'string' ? JSON.parse(fileRecord.access_keys) : fileRecord.access_keys,
                metadata: typeof fileRecord.metadata === 'string' ? JSON.parse(fileRecord.metadata) : fileRecord.metadata,
                masterKey,
                userID,
                customPassword
            });

            return {
                needsMigration: false,
                content
            };
        } else {
            throw new Error(`[CRYPTO-V2] Unsupported file version: ${version}`);
        }
    } catch (error: any) {
        if (error.message === "ERR_CUSTOM_PASSWORD_REQUIRED") {
            // Rethrow exactly so the Interceptor catches it
            throw error;
        }
        console.error("[CRYPTO-V2] Validation/Decryption failed", error);
        throw error;
    }
}

// --- 4. Verification & Testing ---

/**
 * Isolated unit block to test all Crypto V2 branches.
 * This can be wired into a "Diagnostics" hidden menu or run in vitest.
 */
export async function testCryptoV2() {
    console.log("=== STARTING CRYPTO V2 VERIFICATION ===");
    try {
        // 1. Generate Mock MasterKey (RSA)
        const masterKeys = await window.crypto.subtle.generateKey(
            { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
            true, ["encrypt", "decrypt"]
        ) as MasterKeys;
        const myUserID = "user-123";

        // Test 1: Standard Encryption (No Custom Password)
        console.log("--- Test 1: Standard E2EE ---");
        const msg1 = "Hello Envelope Encryption!";
        const r1 = await encryptFileV2(msg1, masterKeys.publicKey);
        
        console.assert(r1.metadata.has_custom_password === false, "Metadata flag should be false");
        console.assert(r1.encrypted_dek.pwd_iv === undefined, "Pwd IV should be undefined");

        const accessMap1: AccessKeysMap = { [myUserID]: r1.encrypted_dek };
        const decBlob1 = await decryptFileV2({
            content_ciphertext: r1.content_ciphertext,
            access_keys: accessMap1,
            metadata: r1.metadata,
            masterKey: masterKeys.privateKey,
            userID: myUserID
        });
        const outMsg1 = await decBlob1.text();
        console.assert(outMsg1 === msg1, "Decrypted text mismatch in Test 1");
        console.log("Test 1 Passed: ", outMsg1);

        // Test 2: Double-Wrapped (With Custom Password)
        console.log("--- Test 2: Password Protected E2EE (Double Wrapping) ---");
        const msg2 = "My Super Secret Diary";
        const customPwd = "correct_horse_battery_staple";
        const r2 = await encryptFileV2(msg2, masterKeys.publicKey, customPwd);

        console.assert(r2.metadata.has_custom_password === true, "Metadata flag should be true");
        console.assert(!!r2.metadata.pwd_salt, "Salt must exist");
        console.assert(!!r2.encrypted_dek.pwd_iv, "Pwd IV must exist");

        const accessMap2: AccessKeysMap = { [myUserID]: r2.encrypted_dek };

        // 2a. Attempt Decrypt WITHOUT Password (should throw ERR_CUSTOM_PASSWORD_REQUIRED)
        let didThrow = false;
        try {
            await decryptFileV2({
                content_ciphertext: r2.content_ciphertext,
                access_keys: accessMap2,
                metadata: r2.metadata,
                masterKey: masterKeys.privateKey,
                userID: myUserID
            });
        } catch (e: any) {
            didThrow = e.message === "ERR_CUSTOM_PASSWORD_REQUIRED";
        }
        console.assert(didThrow, "Should throw ERR_CUSTOM_PASSWORD_REQUIRED");
        
        // 2b. Attempt Decrypt WITH Password
        const decBlob2 = await decryptFileV2({
            content_ciphertext: r2.content_ciphertext,
            access_keys: accessMap2,
            metadata: r2.metadata,
            masterKey: masterKeys.privateKey,
            userID: myUserID,
            customPassword: customPwd
        });
        const outMsg2 = await decBlob2.text();
        console.assert(outMsg2 === msg2, "Decrypted text mismatch in Test 2");
        console.log("Test 2 Passed: ", outMsg2);

        console.log("=== CRYPTO V2 VERIFICATION SUCCESSFUL ===");
        return true;
    } catch (err) {
        console.error("=== CRYPTO V2 VERIFICATION FAILED ===", err);
        return false;
    }
}
