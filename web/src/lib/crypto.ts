// Core Cryptography Library for Tide
// Uses Web Crypto API for all operations.

// --- Types ---

export interface EncryptedPrivateKey {
    salt: string; // Base64
    iv: string;   // Base64
    ciphertext: string; // Base64
}

export interface EncryptedFile {
    iv: string; // Base64
    ciphertext: Blob;
}

export interface MasterKeys {
    publicKey: CryptoKey;
    privateKey: CryptoKey;
}

// --- Utils ---

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

// Helper to safely fingerprint a key without exposing its full value
export async function getKeyFingerprint(key: CryptoKey): Promise<string> {
    if (!key || !(key instanceof CryptoKey)) {
        console.warn("[CRYPTO-WARN] getKeyFingerprint called with non-CryptoKey:", key);
        return "not-a-cryptokey";
    }
    try {
        // Export to JWK to get a stable representation
        const exported = await window.crypto.subtle.exportKey("jwk", key);
        const str = JSON.stringify(exported);
        // Use a simple hash-like slice (first 4 and last 4 chars of the serialized key)
        return `${str.slice(0, 10)}...${str.slice(-10)}`;
    } catch {
        return "fingerprint-error";
    }
}

// --- Auth / Master Keys ---

// 1. Generate Master Key Pair (RSA-OAEP-256, 4096-bit)
// User Identity.
export async function generateMasterKeys(): Promise<MasterKeys> {
    const keyPair = await window.crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 4096,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
        },
        true, // Extractable
        ["encrypt", "decrypt"]
    );

    return keyPair as MasterKeys;
}

// 2. Derive Key from Password (PBKDF2)
// Used to encrypt/decrypt the Master Private Key.
export async function deriveKeyFromPassword(password: string, salt: ArrayBuffer): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const passwordKey = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    return window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256",
        },
        passwordKey,
        { name: "AES-GCM", length: 256 },
        false, // Not extractable
        ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
    );
}

// 3. Encrypt Private Key
// Wraps the Master Private Key with the Derived Key.
export async function encryptPrivateKey(privateKey: CryptoKey, derivedKey: CryptoKey, salt: ArrayBuffer): Promise<EncryptedPrivateKey> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // Export Private Key to PKCS#8
    const privateKeyData = await window.crypto.subtle.exportKey("pkcs8", privateKey);

    // Encrypt with AES-GCM
    const ciphertext = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        derivedKey,
        privateKeyData
    );

    return {
        salt: arrayBufferToBase64(salt),
        iv: arrayBufferToBase64(iv.buffer),
        ciphertext: arrayBufferToBase64(ciphertext),
    };
}

// 4. Decrypt Private Key
// Unwraps the Master Private Key.
export async function decryptPrivateKey(encryptedKey: EncryptedPrivateKey, password: string): Promise<CryptoKey> {
    const salt = base64ToArrayBuffer(encryptedKey.salt);
    const iv = base64ToArrayBuffer(encryptedKey.iv);
    const ciphertext = base64ToArrayBuffer(encryptedKey.ciphertext);

    // Re-derive key
    const derivedKey = await deriveKeyFromPassword(password, salt);

    // Decrypt
    const privateKeyData = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        derivedKey,
        ciphertext
    );

    // Import
    return window.crypto.subtle.importKey(
        "pkcs8",
        privateKeyData,
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        true,
        ["decrypt"]
    );
}

// Export Public Key (SPKI) for server storage
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey("spki", publicKey);
    return arrayBufferToBase64(exported);
}

// 5. Generate User Vault (Zero-Knowledge Architecture)
export async function generateUserVault(pin: string, pepperBase64: string): Promise<{ masterKeys: MasterKeys, encryptedVault: EncryptedPrivateKey }> {
    // 1. Generate RSA-OAEP-256 Keypair
    const masterKeys = await generateMasterKeys();

    // 2. Decode pepper to use as salt
    const salt = base64ToArrayBuffer(pepperBase64);

    // 3. Derive KEK via PBKDF2 (pin is password, pepper is salt)
    const derivedKey = await deriveKeyFromPassword(pin, salt);

    // 4. Encrypt Private Key with KEK
    const encryptedVault = await encryptPrivateKey(masterKeys.privateKey, derivedKey, salt);

    return { masterKeys, encryptedVault };
}

// 6. Unlock User Vault
export async function unlockVault(pin: string, pepperBase64: string, encryptedVault: EncryptedPrivateKey): Promise<CryptoKey> {
    const salt = base64ToArrayBuffer(pepperBase64);
    
    // Re-derive KEK via PBKDF2
    const derivedKey = await deriveKeyFromPassword(pin, salt);

    // Decrypt the vault
    const iv = base64ToArrayBuffer(encryptedVault.iv);
    const ciphertext = base64ToArrayBuffer(encryptedVault.ciphertext);

    const privateKeyData = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        derivedKey,
        ciphertext
    );

    return window.crypto.subtle.importKey(
        "pkcs8",
        privateKeyData,
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        true,
        ["decrypt"]
    );
}


// --- Files ---

// 5. Generate File Key (AES-GCM)
export async function generateFileKey(): Promise<CryptoKey> {
    return window.crypto.subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256,
        },
        true,
        ["encrypt", "decrypt"]
    );
}

// 6. Encrypt File Content
export async function encryptFile(file: File | Blob, key: CryptoKey, fileId?: string): Promise<EncryptedFile> {
    if (!key || !(key instanceof CryptoKey)) {
        throw new TypeError(`[CRYPTO-ERROR] encryptFile called with invalid key type for ID: ${fileId || "unknown"}`);
    }
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const fingerprint = await getKeyFingerprint(key);
    console.log(`[CRYPTO-AUDIT] Encrypting File | ID: ${fileId || "unknown"} | Key: ${fingerprint} | IV Start: ${arrayBufferToBase64(iv.buffer as ArrayBuffer).slice(0, 8)}`);

    if (!file || (file instanceof Blob && file.size === 0 && !fileId)) {
        console.warn(`[CRYPTO-AUDIT] Encrypting potentially empty file | ID: ${fileId || "unknown"}`);
    }

    const arrayBuffer = await file.arrayBuffer();

    const ciphertext = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        key,
        arrayBuffer
    );

    return {
        iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
        ciphertext: new Blob([ciphertext]),
    };
}

// 7. Decrypt File Content
export async function decryptFile(encryptedBlob: Blob, iv: string, key: CryptoKey, fileId?: string): Promise<Blob> {
    if (!key || !(key instanceof CryptoKey)) {
        throw new TypeError(`[CRYPTO-ERROR] decryptFile called with invalid key type for ID: ${fileId || "unknown"}`);
    }
    const fingerprint = await getKeyFingerprint(key);
    console.log(`[CRYPTO-AUDIT] Decrypting File | ID: ${fileId || "unknown"} | Key: ${fingerprint} | IV Start: ${iv.slice(0, 8)}`);

    const ivBuffer = base64ToArrayBuffer(iv);
    const arrayBuffer = await encryptedBlob.arrayBuffer();

    const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: ivBuffer,
        },
        key,
        arrayBuffer
    );

    return new Blob([decryptedBuffer]);
}

// 8. Encrypt Metadata (SecuredMeta)
// Encrypts metadata using the User's Master Public Key (RSA-OAEP).
// This ensures only the user (holding Private Key) can decrypt it.
export async function encryptMetadata(metadata: Record<string, unknown>, publicKey: CryptoKey, label?: string): Promise<string> {
    const fingerprint = await getKeyFingerprint(publicKey);
    console.log(`[CRYPTO-AUDIT] Encrypting Metadata | Label: ${label || "unknown"} | PublicKey: ${fingerprint}`);

    if (!metadata || Object.keys(metadata).length === 0) {
        console.warn("[CRYPTO-AUDIT] Encrypting empty metadata object.");
    }

    const enc = new TextEncoder();
    const encoded = enc.encode(JSON.stringify(metadata || {}));

    const ciphertext = await window.crypto.subtle.encrypt(
        {
            name: "RSA-OAEP"
        },
        publicKey,
        encoded
    );

    // Returns Base64 of ciphertext (no IV needed for RSA-OAEP)
    return arrayBufferToBase64(ciphertext);
}

export async function decryptMetadata(encryptedBase64: string, privateKey: CryptoKey, label?: string): Promise<Record<string, unknown>> {
    if (!encryptedBase64 || typeof encryptedBase64 !== 'string' || encryptedBase64.length < 16) {
        return { title: "Locked Note (Invalid Metadata)", isLocked: true };
    }

    try {
        const fingerprint = await getKeyFingerprint(privateKey);
        console.log(`[CRYPTO-AUDIT] Decrypting Metadata | Label: ${label || "unknown"} | PrivateKey: ${fingerprint} | Ciphertext Sample: ${encryptedBase64.slice(0, 16)}...`);

        const ciphertext = base64ToArrayBuffer(encryptedBase64);

        const decrypted = await window.crypto.subtle.decrypt(
            {
                name: "RSA-OAEP",
                // Explicitly specify hash to ensure compatibility with keys imported with SHA-256
                // @ts-ignore - some TS versions might not expect hash here but subtle crypto often needs it
                hash: "SHA-256" 
            },
            privateKey,
            ciphertext
        );

        const dec = new TextDecoder();
        const decoded = dec.decode(decrypted);
        if (!decoded) return { title: "Untitled (Empty)", isLocked: false };
        
        try {
            const parsed = JSON.parse(decoded);
            // Ensure title exists to satisfy useDataStore check
            if (!parsed.title && parsed.name) parsed.title = parsed.name; 
            return parsed;
        } catch (e) {
            console.error("[CRYPTO-AUDIT] JSON Parse failed in decryptMetadata", e, decoded);
            return { title: "Untitled (Corrupted)", isLocked: false };
        }
    } catch (err: any) {
        console.warn(`[CRYPTO-AUDIT] Decryption failed for ${label || 'unknown'}. Error: ${err?.name || 'UnknownError'} - ${err?.message || ''}`);
        // If it's a size mismatch, it's a huge hint for V1 vs V2 key issues
        if (err?.message?.includes("data size")) {
            console.error("[CRYPTO-AUDIT] RSA Size Mismatch: Ciphertext length does not match key modulus. (Key mismatch?)");
        }
        return { title: "Locked Note (Decryption Failed)", isLocked: true };
    }
}
