import { arrayBufferToBase64, base64ToArrayBuffer } from './crypto';
import { wrapDEKData, unwrapDEKData, importDEK } from './cryptoV2';

export interface E2EEMessageEnvelope {
    _e2ee: true;
    v: number;
    iv: string;
    ciphertext: string;
    keys: Record<string, string>;
}

// In-memory cache for decrypted chat messages so re-renders don't re-run subtle crypto
const chatDecryptionCache = new Map<string, string>();

/**
 * Checks whether a raw message content string is an end-to-end encrypted envelope.
 */
export function isE2EEMessage(content: string): boolean {
    if (!content || typeof content !== 'string') return false;
    return content.startsWith('{"_e2ee":true');
}

/**
 * Encrypts a chat message with AES-256-GCM and wraps the ephemeral key
 * for both the sender and the recipient with RSA-OAEP.
 */
export async function encryptChatMessage(
    text: string,
    myId: string,
    myPublicKey: CryptoKey,
    recipientId: string,
    recipientPublicKeySpki: string
): Promise<string> {
    // 1. Generate an ephemeral 256-bit AES-GCM key
    const aesKey = await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

    // 2. Export raw AES key bytes for RSA wrapping
    const rawKey = await window.crypto.subtle.exportKey("raw", aesKey);

    // 3. Encrypt the plaintext message with AES-GCM
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedText = new TextEncoder().encode(text);
    const ciphertext = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        encodedText
    );

    // 4. Wrap the AES key with sender's public key (for history / other devices)
    const myWrapped = await wrapDEKData(rawKey, myPublicKey);

    // 5. Import recipient's public key and wrap the AES key with it
    const recipientPubKey = await window.crypto.subtle.importKey(
        "spki",
        base64ToArrayBuffer(recipientPublicKeySpki),
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"]
    );
    const recipientWrapped = await wrapDEKData(rawKey, recipientPubKey);

    // 6. Build E2EE envelope
    const envelope: E2EEMessageEnvelope = {
        _e2ee: true,
        v: 1,
        iv: arrayBufferToBase64(iv.buffer),
        ciphertext: arrayBufferToBase64(ciphertext),
        keys: {
            [myId]: myWrapped.ciphertext,
            [recipientId]: recipientWrapped.ciphertext,
        }
    };

    const envelopeString = JSON.stringify(envelope);
    // Cache our own message so we don't need to decrypt it later
    chatDecryptionCache.set(`${myId}:${envelopeString}`, text);
    return envelopeString;
}

/**
 * Decrypts a chat message content. If the message is unencrypted (e.g. legacy
 * plaintext or JSON share cards), returns the content as-is.
 */
export async function decryptChatMessage(
    content: string,
    myId: string,
    myPrivateKey: CryptoKey | null
): Promise<string> {
    if (!content || !isE2EEMessage(content)) {
        return content;
    }

    const cacheKey = `${myId}:${content}`;
    if (chatDecryptionCache.has(cacheKey)) {
        return chatDecryptionCache.get(cacheKey)!;
    }

    if (!myPrivateKey) {
        return "[Verschlüsselte Nachricht - Schlüssel wird geladen...]";
    }

    try {
        const envelope: E2EEMessageEnvelope = JSON.parse(content);
        if (!envelope._e2ee || !envelope.keys) {
            return content;
        }

        let wrappedKey = envelope.keys[myId];
        if (!wrappedKey) {
            // Fallback: if sender and recipient had a format mismatch, try the first key
            const allKeys = Object.values(envelope.keys);
            if (allKeys.length > 0) {
                wrappedKey = allKeys[0];
            }
        }

        if (!wrappedKey) {
            return "[Verschlüsselte Nachricht - Kein Zugriffsschlüssel]";
        }

        // Unwrap the ephemeral AES key using private key
        const rawKey = await unwrapDEKData(wrappedKey, myPrivateKey);
        const aesKey = await importDEK(rawKey);

        const ivBuffer = base64ToArrayBuffer(envelope.iv);
        const ciphertextBuffer = base64ToArrayBuffer(envelope.ciphertext);

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: ivBuffer },
            aesKey,
            ciphertextBuffer
        );

        const decryptedText = new TextDecoder().decode(decryptedBuffer);
        chatDecryptionCache.set(cacheKey, decryptedText);
        return decryptedText;
    } catch (err) {
        console.warn("[ChatCrypto] Decryption failed for message:", err);
        return "[Verschlüsselte Nachricht - Entschlüsselung fehlgeschlagen]";
    }
}
