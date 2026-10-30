import { arrayBufferToBase64, base64ToArrayBuffer, deriveKeyFromPassword, decryptFile, decryptMetadata, encryptMetadata, MasterKeys } from "./crypto";

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

// --- 3. Migration & Deprecation Logic ---

/**
 * @deprecated Legacy V1 encryption format (direct AES-GCM file key in RSA secured_meta) is deprecated.
 * Use V2 Envelope Encryption (AES-GCM DEK + RSA-OAEP KEK) via `encryptFileV2` / `decryptFileV2`.
 * For automatic migration of legacy entities, use `migrateV1ToV2IfNeeded`.
 */
export const LEGACY_V1_DEPRECATION_NOTICE = "Tide V1 encryption is deprecated. Migrate to V2 using migrateV1ToV2IfNeeded." as const;

export interface MigrateV1ToV2Options {
    /** The user's RSA public key (used for wrapping the DEK and encrypting metadata in V2). */
    userPublicKey?: CryptoKey;
    /** The user ID used for the access_keys map. Defaults to entity.user_id, entity.userId, or "me". */
    userID?: string;
    /** Optional custom password if double-wrapping with AES-GCM is desired. */
    customPassword?: string;
    /** Optional file key for legacy V1 files if not embedded in secured_meta. */
    legacyFileKey?: CryptoKey;
}

/**
 * Attempts to derive an RSA-OAEP public CryptoKey from an extractable private CryptoKey.
 */
export async function derivePublicKeyFromPrivateKey(privateKey: CryptoKey): Promise<CryptoKey> {
    if (!privateKey.extractable) {
        throw new Error("[CRYPTO-V2] Cannot derive public key: privateKey is non-extractable. Provide userPublicKey explicitly.");
    }
    const jwk = await window.crypto.subtle.exportKey("jwk", privateKey);
    return window.crypto.subtle.importKey(
        "jwk",
        {
            kty: jwk.kty,
            n: jwk.n,
            e: jwk.e,
            alg: jwk.alg || "RSA-OAEP-256",
            ext: true,
            key_ops: ["encrypt"],
        },
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        true,
        ["encrypt"]
    );
}

/**
 * Checks whether an entity record uses legacy V1 payload formatting
 * (e.g. lacks V2 headers/format, has V1 version/markers, or legacy encrypted fields).
 */
export function isV1Payload(entity: Record<string, unknown>): boolean {
    if (!entity || typeof entity !== "object") return false;

    const version = typeof entity.version === "number" ? entity.version : undefined;

    // If explicitly marked as version >= 2 and has V2 ciphertext or access keys, it is not V1
    if (version !== undefined && version >= 2 && (entity.content_ciphertext || entity.access_keys)) {
        return false;
    }

    // Has explicit V1 version marker
    if (version === 1) {
        return true;
    }

    // Has legacy IV or V1-specific fields without V2 format
    const hasLegacyIv = Boolean(
        (typeof entity.iv === "string" && entity.iv.length > 0) ||
        (entity.public_meta && typeof entity.public_meta === "object" && "iv" in entity.public_meta)
    );

    const hasLegacyPayload = Boolean(
        entity.content !== undefined ||
        entity.ciphertext !== undefined ||
        (typeof entity.secured_meta === "string" && entity.secured_meta.length > 0)
    );

    const lacksV2Envelope = !entity.content_ciphertext || !entity.access_keys;

    return hasLegacyPayload && (hasLegacyIv || lacksV2Envelope);
}

/**
 * Checks whether an entity uses legacy V1 payload formatting, and if so,
 * decrypts it and re-encrypts it using V2 Envelope Encryption (AES-GCM DEK + RSA-OAEP KEK).
 * If the entity is already in V2 format, it is returned unchanged.
 *
 * @param entity The entity object (e.g. Note, File, Event).
 * @param userPrivateKey The user's RSA-OAEP master private key for decrypting V1 secured_meta / payloads.
 * @param options Optional migration settings (userPublicKey, userID, customPassword, legacyFileKey).
 * @returns The migrated entity in V2 format.
 */
export async function migrateV1ToV2IfNeeded<T extends Record<string, unknown>>(
    entity: T,
    userPrivateKey: CryptoKey,
    options?: MigrateV1ToV2Options
): Promise<T> {
    if (!isV1Payload(entity)) {
        return entity;
    }

    // 1. Resolve user's public key (needed for V2 DEK wrapping)
    let publicKey = options?.userPublicKey;
    if (!publicKey) {
        try {
            publicKey = await derivePublicKeyFromPrivateKey(userPrivateKey);
        } catch {
            throw new Error(
                "[CRYPTO-V2] migrateV1ToV2IfNeeded: userPublicKey was not provided and could not be derived from userPrivateKey (non-extractable). Please pass options.userPublicKey."
            );
        }
    }

    // 2. Resolve userID for access_keys mapping
    const userID = options?.userID ||
        (typeof entity.user_id === "string" ? entity.user_id :
            (typeof entity.userId === "string" ? entity.userId : "me"));

    // 3. Decrypt secured_meta if present
    let decryptedMeta: Record<string, unknown> | null = null;
    let legacyKey: CryptoKey | undefined = options?.legacyFileKey;

    if (typeof entity.secured_meta === "string" && entity.secured_meta.trim().length > 0) {
        try {
            const meta = await decryptMetadata(entity.secured_meta, userPrivateKey, typeof entity.id === "string" ? entity.id : undefined);
            if (meta && !meta.isLocked) {
                decryptedMeta = meta;
                if (meta.fileKey && typeof meta.fileKey === "object") {
                    try {
                        legacyKey = await window.crypto.subtle.importKey(
                            "jwk",
                            meta.fileKey as JsonWebKey,
                            { name: "AES-GCM" },
                            true,
                            ["encrypt", "decrypt"]
                        );
                    } catch (importErr) {
                        console.warn("[CRYPTO-V2] Failed to import legacy fileKey from secured_meta", importErr);
                    }
                }
            }
        } catch (metaErr) {
            console.warn("[CRYPTO-V2] Failed to decrypt secured_meta during migration", metaErr);
        }
    }

    // 4. Resolve legacy IV
    let legacyIv = "";
    if (typeof entity.iv === "string" && entity.iv) {
        legacyIv = entity.iv;
    } else if (decryptedMeta && typeof decryptedMeta.iv === "string" && decryptedMeta.iv) {
        legacyIv = decryptedMeta.iv;
    } else if (typeof entity.public_meta === "object" && entity.public_meta !== null && "iv" in entity.public_meta) {
        legacyIv = String((entity.public_meta as Record<string, unknown>).iv);
    }

    // 5. Decrypt content if present
    let decryptedBlob: Blob | null = null;
    const rawContent = entity.ciphertext ?? entity.content ?? entity.data;

    if (rawContent !== undefined && rawContent !== null) {
        let blobToDecrypt: Blob;
        if (rawContent instanceof Blob) {
            blobToDecrypt = rawContent;
        } else if (typeof rawContent === "string") {
            try {
                const ab = base64ToArrayBuffer(rawContent);
                blobToDecrypt = new Blob([ab]);
            } catch {
                blobToDecrypt = new Blob([new TextEncoder().encode(rawContent)]);
            }
        } else if (rawContent instanceof ArrayBuffer) {
            blobToDecrypt = new Blob([rawContent]);
        } else {
            blobToDecrypt = new Blob([new TextEncoder().encode(JSON.stringify(rawContent))]);
        }

        if (legacyKey && legacyIv) {
            decryptedBlob = await decryptFile(blobToDecrypt, legacyIv, legacyKey, typeof entity.id === "string" ? entity.id : undefined);
        } else if (userPrivateKey.algorithm.name === "RSA-OAEP") {
            try {
                const buf = await blobToDecrypt.arrayBuffer();
                const decrypted = await window.crypto.subtle.decrypt({ name: "RSA-OAEP" }, userPrivateKey, buf);
                decryptedBlob = new Blob([decrypted]);
            } catch {
                decryptedBlob = blobToDecrypt;
            }
        } else {
            decryptedBlob = blobToDecrypt;
        }
    }

    // 6. Encrypt to V2 if content exists
    let v2Result: EncryptedFileV2Result | undefined;
    if (decryptedBlob) {
        v2Result = await encryptFileV2(decryptedBlob, publicKey, options?.customPassword);
    }

    // 7. Assemble migrated V2 entity
    const existingMetadata = typeof entity.metadata === "object" && entity.metadata !== null
        ? (entity.metadata as Record<string, unknown>)
        : {};

    const mergedMetadata: Record<string, unknown> = {
        ...existingMetadata,
        ...(decryptedMeta || {}),
        ...(v2Result ? v2Result.metadata : { has_custom_password: false }),
        ...(decryptedMeta?.title ? { title: decryptedMeta.title } : {}),
    };
    mergedMetadata.has_custom_password = Boolean(mergedMetadata.has_custom_password);

    const migrated: Record<string, unknown> = {
        ...entity,
        version: 2,
        metadata: mergedMetadata,
    };

    if (v2Result) {
        migrated.content_ciphertext = v2Result.content_ciphertext;
        migrated.access_keys = {
            [userID]: v2Result.encrypted_dek,
        };
        delete migrated.ciphertext;
        delete migrated.iv;
    }

    return migrated as T;
}

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
 * @deprecated Prefer using `migrateV1ToV2IfNeeded` for transparent entity migration.
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
        
        // Test 2b: Attempt Decrypt WITH Password
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

        // Test 3: Transparent V1 to V2 Migration
        console.log("--- Test 3: Transparent V1 to V2 Migration ---");
        const v1RawText = "Legacy V1 Secret Document Content";
        const fileKey = await window.crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
        const legacyKeyJwk = await window.crypto.subtle.exportKey("jwk", fileKey);
        const v1Iv = window.crypto.getRandomValues(new Uint8Array(12));
        const v1IvBase64 = arrayBufferToBase64(v1Iv.buffer);
        const encText = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: v1Iv },
            fileKey,
            new TextEncoder().encode(v1RawText)
        );
        const v1Blob = new Blob([encText]);
        const securedMeta = await encryptMetadata(
            { title: "Legacy Note", fileKey: legacyKeyJwk, iv: v1IvBase64 },
            masterKeys.publicKey
        );

        const v1Entity: Record<string, unknown> = {
            id: "legacy-note-1",
            version: 1,
            title: "Legacy Note",
            ciphertext: v1Blob,
            iv: v1IvBase64,
            secured_meta: securedMeta,
        };

        console.assert(isV1Payload(v1Entity) === true, "isV1Payload should identify v1Entity as V1");

        const migratedEntity = await migrateV1ToV2IfNeeded(v1Entity, masterKeys.privateKey, {
            userPublicKey: masterKeys.publicKey,
            userID: myUserID,
        });

        console.assert(migratedEntity.version === 2, "Migrated version should be 2");
        console.assert(Boolean(migratedEntity.content_ciphertext), "Migrated content_ciphertext must exist");
        console.assert(Boolean(migratedEntity.access_keys), "Migrated access_keys must exist");
        console.assert(isV1Payload(migratedEntity) === false, "isV1Payload should identify migrated entity as V2");

        // Verify that decryptFileV2 can decrypt the migrated entity
        const decMigratedBlob = await decryptFileV2({
            content_ciphertext: migratedEntity.content_ciphertext as string,
            access_keys: migratedEntity.access_keys as AccessKeysMap,
            metadata: migratedEntity.metadata as any,
            masterKey: masterKeys.privateKey,
            userID: myUserID,
        });
        const outMigratedText = await decMigratedBlob.text();
        console.assert(outMigratedText === v1RawText, "Migrated content text mismatch");
        console.log("Test 3 Passed: Successfully migrated V1 entity to V2:", outMigratedText);

        console.log("=== CRYPTO V2 VERIFICATION SUCCESSFUL ===");
        return true;
    } catch (err) {
        console.error("=== CRYPTO V2 VERIFICATION FAILED ===", err);
        return false;
    }
}
