import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch } from '@/lib/api';
import {
    deriveKeyFromPassword,
    encryptPrivateKey,
    decryptPrivateKey,
    LEGACY_PBKDF2_ITERATIONS,
} from '@/lib/crypto';

describe('Phase 1 Security Hardening', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        localStorage.clear();
        sessionStorage.clear();
        vi.restoreAllMocks();
    });

    it('apiFetch preserves an explicit Authorization header over localStorage tide_session_token (H-10)', async () => {
        localStorage.setItem('tide_session_token', 'stale-local-storage-token');
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        await apiFetch('/api/v1/auth/key-challenge', {
            method: 'POST',
            headers: { Authorization: 'Bearer fresh-otp-token' },
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        const headers = init.headers as Record<string, string>;
        expect(headers['Authorization']).toBe('Bearer fresh-otp-token');
    });

    it('encryptPrivateKey records iterations and decryptPrivateKey blocks silent 100k downgrade when iterations is explicit (H-06)', async () => {
        const pair = await window.crypto.subtle.generateKey(
            { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
            true,
            ['encrypt', 'decrypt']
        );
        const salt = window.crypto.getRandomValues(new Uint8Array(16)).buffer;
        const customIterations = 120000;
        const kek = await deriveKeyFromPassword('strong-passphrase-test', salt, customIterations);
        const wrapped = await encryptPrivateKey(pair.privateKey, kek, salt, customIterations);

        expect(wrapped.iterations).toBe(customIterations);

        // Decryption succeeds with matching passphrase
        const unwrapped = await decryptPrivateKey(wrapped, 'strong-passphrase-test');
        expect(unwrapped.algorithm.name).toBe('RSA-OAEP');

        // Even if a legacy 100k-encrypted blob is given an explicit modern iteration count, no silent downgrade occurs
        const legacyKek = await deriveKeyFromPassword('legacy-pass', salt, LEGACY_PBKDF2_ITERATIONS);
        const legacyWrapped = await encryptPrivateKey(pair.privateKey, legacyKek, salt, LEGACY_PBKDF2_ITERATIONS);
        const tampered = { ...legacyWrapped, iterations: 120000 };
        await expect(decryptPrivateKey(tampered, 'legacy-pass')).rejects.toThrow();
    });
});
