import { beforeAll, describe, expect, it, vi } from 'vitest';

const webCrypto = globalThis.crypto;
if (typeof window !== 'undefined' && (!window.crypto || !window.crypto.subtle)) {
    Object.defineProperty(window, 'crypto', { value: webCrypto, writable: true, configurable: true });
}

const replaceMock = vi.fn(async () => undefined);
vi.mock('../recoveryApi', () => ({ replaceEncryptedVault: (...args: unknown[]) => replaceMock(...(args as [])) }));
const proofMock = vi.fn(async () => ({ challenge_id: 'c1', challenge_response: 'cg==' }));
vi.mock('../keyProof', async (orig) => ({ ...(await orig<typeof import('../keyProof')>()), requestKeyProof: (...args: unknown[]) => proofMock(...(args as [])) }));

import { exportPublicKey, unlockVault } from '@/lib/crypto';
import { formatRecoverySecret, generateRecoverySecret, normalizeRecoverySecret, RecoverySecretFormatError, RECOVERY_SECRET_BITS } from '../recoverySecret';
import { buildRecoveryVault, openRecoveryVault, RecoveryVaultError, RECOVERY_PBKDF2_ITERATIONS, MAIL_SECRET_KIND, type RecoveryVault } from '../recoveryVault';
import { buildRecoveryMailto, buildRecoveryText, RECOVERY_MAIL_SUBJECT } from '../recoveryMail';
import { recoverWithSecret, wrapPrivateKeyWithPin } from '../recoveryFlow';
import { decryptKeyChallenge, KeyProofError } from '../keyProof';

async function rsaPair(): Promise<CryptoKeyPair> {
    return webCrypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true,
        ['encrypt', 'decrypt'],
    ) as Promise<CryptoKeyPair>;
}

async function canDecrypt(pair: CryptoKeyPair, privateKey: CryptoKey): Promise<boolean> {
    const msg = new TextEncoder().encode('tide');
    const ct = await webCrypto.subtle.encrypt({ name: 'RSA-OAEP' }, pair.publicKey, msg);
    const pt = await webCrypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, ct);
    return new TextDecoder().decode(pt) === 'tide';
}

describe('recovery secret', () => {
    it('has 160 bits as 32 Crockford characters in groups of four', () => {
        const s = generateRecoverySecret();
        expect(RECOVERY_SECRET_BITS).toBeGreaterThanOrEqual(160);
        expect(s).toMatch(/^[0-9A-HJKMNP-TV-Z]{32}$/);
        expect(formatRecoverySecret(s)).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
        expect(generateRecoverySecret()).not.toBe(s);
    });

    it('tolerates spaces, dashes, case and O/0, I/L/1 mix-ups', () => {
        const s = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
        expect(normalizeRecoverySecret(formatRecoverySecret(s))).toBe(s);
        expect(normalizeRecoverySecret(' o123 4567-89ab cdef ghjk mnpq rstv wxyz ')).toBe(s);
        expect(normalizeRecoverySecret('O1234567-89ABCDEF-GHJKMNPQ-RSTVWXYZ'.replace('1', 'l'))).toBe(s);
        expect(normalizeRecoverySecret('0I23456789ABCDEFGHJKMNPQRSTVWXYZ')).toBe(s);
    });

    it('rejects wrong length and characters outside the alphabet', () => {
        expect(() => normalizeRecoverySecret('ABCD-EFGH')).toThrow(RecoverySecretFormatError);
        expect(() => normalizeRecoverySecret('U123456789ABCDEFGHJKMNPQRSTVWXYZ')).toThrow(RecoverySecretFormatError);
        expect(() => normalizeRecoverySecret('')).toThrow(RecoverySecretFormatError);
    });
});

describe('recovery vault', () => {
    let pair: CryptoKeyPair;
    let secret: string;
    let vault: RecoveryVault;

    beforeAll(async () => {
        pair = await rsaPair();
        secret = generateRecoverySecret();
        vault = await buildRecoveryVault(pair.privateKey, formatRecoverySecret(secret));
    });

    it('stores a v1 envelope list with sensible KDF parameters', () => {
        expect(vault.v).toBe(1);
        expect(vault.envelopes).toHaveLength(1);
        const e = vault.envelopes[0] as Record<string, unknown>;
        expect(e.kind).toBe(MAIL_SECRET_KIND);
        expect(e.kdf).toEqual({ name: 'PBKDF2', hash: 'SHA-256', iterations: RECOVERY_PBKDF2_ITERATIONS });
        expect(RECOVERY_PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(100_000);
        expect(RECOVERY_PBKDF2_ITERATIONS).not.toBe(600_000); // no legacy fallback double work
        expect(JSON.stringify(vault)).not.toContain(secret);
    });

    it('round-trips: the secret (any formatting) opens the same private key', async () => {
        const opened = await openRecoveryVault(JSON.stringify(vault), secret.toLowerCase().replace(/(.{4})/g, '$1 '));
        expect(opened.extractable).toBe(true);
        expect(await canDecrypt(pair, opened)).toBe(true);
    });

    it('a wrong but well-formed secret fails cleanly', async () => {
        await expect(openRecoveryVault(vault, generateRecoverySecret())).rejects.toBeInstanceOf(RecoveryVaultError);
    });

    it('malformed input fails before any KDF work', async () => {
        await expect(openRecoveryVault(vault, 'zu-kurz')).rejects.toBeInstanceOf(RecoverySecretFormatError);
    });

    it('keeps envelopes of other kinds (later passkeys) when rebuilding', async () => {
        const withPasskey: RecoveryVault = { v: 1, envelopes: [...vault.envelopes, { kind: 'passkey-prf', credentialId: 'abc', iv: 'eA==', ciphertext: 'eA==' }] };
        const rebuilt = await buildRecoveryVault(pair.privateKey, secret, withPasskey);
        expect(rebuilt.envelopes.map((e) => e.kind)).toEqual([MAIL_SECRET_KIND, 'passkey-prf']);
    });

    it('rejects vaults without mail envelope or with odd KDF settings', async () => {
        await expect(openRecoveryVault({ v: 1, envelopes: [] }, secret)).rejects.toBeInstanceOf(RecoveryVaultError);
        const weak = { v: 1 as const, envelopes: [{ ...vault.envelopes[0], kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 10 } }] };
        await expect(openRecoveryVault(weak, secret)).rejects.toBeInstanceOf(RecoveryVaultError);
        await expect(openRecoveryVault('{"v":2}', secret)).rejects.toBeInstanceOf(RecoveryVaultError);
    });
});

describe('recovery flow', () => {
    it('re-wraps with the new PIN and only then replaces the server vault', async () => {
        const pair = await rsaPair();
        const pepper = btoa(String.fromCharCode(...webCrypto.getRandomValues(new Uint8Array(32))));
        const secret = generateRecoverySecret();
        const vault = await buildRecoveryVault(pair.privateKey, secret);
        replaceMock.mockClear();

        proofMock.mockClear();
        const result = await recoverWithSecret({ recoveryVault: vault, secret, newPin: '13579', pepperBase64: pepper });
        expect(replaceMock).toHaveBeenCalledTimes(1);
        expect(replaceMock.mock.calls[0]).toEqual([result.encryptedVault, { challenge_id: 'c1', challenge_response: 'cg==' }]);
        // The key proof is answered with the key opened from the secret.
        const proofKey = (proofMock.mock.calls[0] as unknown as [CryptoKey])[0];
        expect(await canDecrypt(pair, proofKey)).toBe(true);
        expect(result.privateKey.extractable).toBe(false);
        expect(await canDecrypt(pair, await unlockVault('13579', pepper, result.encryptedVault))).toBe(true);
        await expect(unlockVault('00000', pepper, result.encryptedVault)).rejects.toBeTruthy();
    });

    it('sends nothing when the secret is wrong', async () => {
        const pair = await rsaPair();
        const pepper = btoa(String.fromCharCode(...webCrypto.getRandomValues(new Uint8Array(32))));
        const vault = await buildRecoveryVault(pair.privateKey, generateRecoverySecret());
        replaceMock.mockClear();
        await expect(recoverWithSecret({ recoveryVault: vault, secret: generateRecoverySecret(), newPin: '13579', pepperBase64: pepper })).rejects.toBeInstanceOf(RecoveryVaultError);
        expect(replaceMock).not.toHaveBeenCalled();
    });

    it('wrapPrivateKeyWithPin yields the same vault format as registration', async () => {
        const pair = await rsaPair();
        const pepper = btoa(String.fromCharCode(...webCrypto.getRandomValues(new Uint8Array(32))));
        const v = await wrapPrivateKeyWithPin(pair.privateKey, '24680', pepper);
        expect(Object.keys(v).sort()).toEqual(['ciphertext', 'iv', 'salt']);
        expect(v.salt).toBe(pepper);
        expect(typeof (await exportPublicKey(pair.publicKey))).toBe('string');
    });
});

describe('key proof', () => {
    it('decrypts an RSA-OAEP challenge to the original bytes, and fails cleanly with a foreign key', async () => {
        const pair = await rsaPair();
        const other = await rsaPair();
        const plain = webCrypto.getRandomValues(new Uint8Array(32));
        const ct = await webCrypto.subtle.encrypt({ name: 'RSA-OAEP' }, pair.publicKey, plain);
        const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ct)));
        expect(await decryptKeyChallenge(pair.privateKey, ctB64)).toBe(btoa(String.fromCharCode(...plain)));
        await expect(decryptKeyChallenge(other.privateKey, ctB64)).rejects.toBeInstanceOf(KeyProofError);
    });
});

describe('recovery mail', () => {
    it('builds a mailto draft to the own address with subject, secret and keep-safe hint', () => {
        const formatted = formatRecoverySecret('0123456789ABCDEFGHJKMNPQRSTVWXYZ');
        const link = buildRecoveryMailto('ich@example.test', formatted);
        expect(link.startsWith('mailto:ich%40example.test?subject=')).toBe(true);
        const query = new URLSearchParams(link.split('?')[1]);
        expect(query.get('subject')).toBe(RECOVERY_MAIL_SUBJECT);
        expect(query.get('body')).toContain(formatted);
        expect(query.get('body')).toMatch(/gut auf/);
        expect(buildRecoveryText(formatted)).not.toMatch(/https?:\/\//);
    });
});
