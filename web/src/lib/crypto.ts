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
            iterations: 250000,
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
export async function encryptFile(file: File | Blob, key: CryptoKey): Promise<EncryptedFile> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
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
export async function decryptFile(encryptedBlob: Blob, iv: string, key: CryptoKey): Promise<Blob> {
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
export async function encryptMetadata(metadata: Record<string, unknown>, publicKey: CryptoKey): Promise<string> {
    const enc = new TextEncoder();
    const encoded = enc.encode(JSON.stringify(metadata));

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

export async function decryptMetadata(encryptedBase64: string, privateKey: CryptoKey): Promise<Record<string, unknown>> {
    const ciphertext = base64ToArrayBuffer(encryptedBase64);

    const decrypted = await window.crypto.subtle.decrypt(
        {
            name: "RSA-OAEP"
        },
        privateKey,
        ciphertext
    );

    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decrypted));
}
