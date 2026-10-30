// Asset Cryptography for Tide (BUG-18 & BUG-19)
// Provides per-asset Binary Encryption Key (BEK) encryption and decryption.

import { arrayBufferToBase64, base64ToArrayBuffer } from "./crypto";

export interface EncryptedAssetResult {
    encryptedBlob: Blob;
    bekBase64: string;
    ivBase64: string;
    mimeType: string;
}

/**
 * Encrypts an asset (Blob or File) with a freshly generated 256-bit AES-GCM Binary Encryption Key (BEK).
 */
export async function encryptAssetWithNewBEK(blob: Blob): Promise<EncryptedAssetResult> {
    // 1. Generate random 256-bit AES-GCM BEK
    const bek = await window.crypto.subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256,
        },
        true, // Must be extractable so we can export bekBase64
        ["encrypt", "decrypt"]
    );

    // 2. Export raw BEK to Base64
    const rawBek = await window.crypto.subtle.exportKey("raw", bek);
    const bekBase64 = arrayBufferToBase64(rawBek);

    // 3. Generate 12-byte IV
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ivBase64 = arrayBufferToBase64(iv.buffer as ArrayBuffer);

    // 4. Encrypt blob data with AES-GCM
    const dataBuffer = await blob.arrayBuffer();
    const ciphertext = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv,
        },
        bek,
        dataBuffer
    );

    const mimeType = blob.type || "application/octet-stream";
    const encryptedBlob = new Blob([ciphertext], { type: "application/octet-stream" });

    return {
        encryptedBlob,
        bekBase64,
        ivBase64,
        mimeType,
    };
}

/**
 * Decrypts an encrypted asset buffer using its BEK and IV, returning a Blob with the original MIME type.
 */
export async function decryptAssetWithBEK(
    encryptedBuffer: ArrayBuffer,
    bekBase64: string,
    ivBase64: string,
    mimeType: string
): Promise<Blob> {
    const rawBek = base64ToArrayBuffer(bekBase64);
    const ivBuffer = base64ToArrayBuffer(ivBase64);

    const bek = await window.crypto.subtle.importKey(
        "raw",
        rawBek,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    );

    const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: new Uint8Array(ivBuffer),
        },
        bek,
        encryptedBuffer
    );

    return new Blob([decryptedBuffer], { type: mimeType || "application/octet-stream" });
}
