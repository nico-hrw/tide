/**
 * Proof of key possession for vault-replacing calls. The server encrypts 32 random bytes to the
 * account's public key (RSA-OAEP, SHA-256, as generated in crypto.ts); only the private key can
 * return the plaintext. Each challenge is one-time and valid for two minutes.
 */
import { apiFetch } from '@/lib/api';
import { arrayBufferToBase64, base64ToArrayBuffer } from '@/lib/crypto';

export interface KeyProof {
    challenge_id: string;
    challenge_response: string;
}

export class KeyProofError extends Error {
    constructor(message = 'Der Schlüsselnachweis ist fehlgeschlagen. Bitte versuche es erneut.') {
        super(message);
        this.name = 'KeyProofError';
    }
}

/** Decrypts a base64 challenge with the RSA private key and returns the plaintext as base64. */
export async function decryptKeyChallenge(privateKey: CryptoKey, challengeB64: string): Promise<string> {
    try {
        const plain = await window.crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, base64ToArrayBuffer(challengeB64));
        return arrayBufferToBase64(plain);
    } catch {
        throw new KeyProofError('Der private Schlüssel passt nicht zu diesem Konto.');
    }
}

/** Fetches a fresh challenge and answers it. */
export async function requestKeyProof(privateKey: CryptoKey, token?: string): Promise<KeyProof> {
    const res = await apiFetch('/api/v1/auth/key-challenge', {
        method: 'POST',
        offline: 'never',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
        if (res.status === 429) throw new KeyProofError('Zu viele Versuche. Bitte warte einen Moment.');
        throw new KeyProofError();
    }
    const data = (await res.json()) as { challenge_id?: string; challenge?: string };
    if (!data.challenge_id || !data.challenge) throw new KeyProofError();
    return { challenge_id: data.challenge_id, challenge_response: await decryptKeyChallenge(privateKey, data.challenge) };
}
