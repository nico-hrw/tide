import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const webCrypto = globalThis.crypto;
if (typeof window !== 'undefined' && (!window.crypto || !window.crypto.subtle)) {
    Object.defineProperty(window, 'crypto', { value: webCrypto, writable: true, configurable: true });
}

const { api, proofMock } = vi.hoisted(() => ({
    api: {
        passkeyRegisterOptions: vi.fn(),
        passkeyRegisterFinish: vi.fn(async () => undefined),
        passkeyLoginOptions: vi.fn(),
        passkeyLoginVerify: vi.fn(),
    },
    proofMock: vi.fn(async () => ({ challenge_id: 'c', challenge_response: 'r' })),
}));
vi.mock('../passkeyApi', () => api);
vi.mock('@/lib/recovery/keyProof', () => ({ requestKeyProof: (...a: unknown[]) => proofMock(...(a as [])) }));

import { buildPasskeyEnvelope, openPasskeyEnvelope, PasskeyEnvelopeError, passkeyEnvelopes, withPasskeyEnvelope } from '../passkeyEnvelope';
import { isWebAuthnAvailable, prfMaybeEnabled, prfResult } from '../passkeySupport';
import { assertionToJSON, bytesToB64url, b64urlToBytes, creationToJSON } from '../webauthnJson';
import { PasskeyPrfUnsupportedError, registerPasskey, signInWithPasskey } from '../passkeyFlow';

async function rsaPair(): Promise<CryptoKeyPair> {
    return webCrypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true,
        ['encrypt', 'decrypt'],
    ) as Promise<CryptoKeyPair>;
}

async function canDecrypt(pair: CryptoKeyPair, key: CryptoKey): Promise<boolean> {
    const ct = await webCrypto.subtle.encrypt({ name: 'RSA-OAEP' }, pair.publicKey, new TextEncoder().encode('tide'));
    return new TextDecoder().decode(await webCrypto.subtle.decrypt({ name: 'RSA-OAEP' }, key, ct)) === 'tide';
}

const prfBytes = () => webCrypto.getRandomValues(new Uint8Array(32)).buffer;
const MAIL_ENV = { kind: 'mail-secret', salt: 'c2FsdA==', iv: 'aXY=', ciphertext: 'Y3Q=', kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 200000 } };

/** Minimal stand-in for a PublicKeyCredential with given extension outputs. */
function fakeCredential(id: string, kind: 'create' | 'get', ext: Record<string, unknown>): PublicKeyCredential {
    const buf = (s: string) => new TextEncoder().encode(s).buffer;
    const response = kind === 'create'
        ? { clientDataJSON: buf('cd'), attestationObject: buf('att'), getTransports: () => ['internal'] }
        : { clientDataJSON: buf('cd'), authenticatorData: buf('ad'), signature: buf('sig'), userHandle: buf('user') };
    return {
        id,
        rawId: b64urlToBytes(id).buffer,
        type: 'public-key',
        authenticatorAttachment: 'platform',
        response,
        getClientExtensionResults: () => ext,
    } as unknown as PublicKeyCredential;
}

function installCredentials(create: () => PublicKeyCredential | null, get: () => PublicKeyCredential | null) {
    Object.defineProperty(navigator, 'credentials', { value: { create: vi.fn(async () => create()), get: vi.fn(async () => get()) }, configurable: true });
    Object.defineProperty(window, 'PublicKeyCredential', { value: function PublicKeyCredential() {}, configurable: true, writable: true });
}

describe('passkey envelope', () => {
    let pair: CryptoKeyPair;
    beforeAll(async () => { pair = await rsaPair(); });

    it('round-trips the private key and the e-mail with the same PRF output', async () => {
        const prf = prfBytes();
        const env = await buildPasskeyEnvelope({ privateKey: pair.privateKey, prf, credentialId: 'cred-1', email: 'ich@example.test' });
        expect(env.kind).toBe('passkey-prf');
        expect(JSON.stringify(env)).not.toContain('ich@example.test');
        const opened = await openPasskeyEnvelope(env, prf, true);
        expect(opened.email).toBe('ich@example.test');
        expect(opened.privateKey.extractable).toBe(true);
        expect(await canDecrypt(pair, opened.privateKey)).toBe(true);
        expect((await openPasskeyEnvelope(env, prf)).privateKey.extractable).toBe(false);
    });

    it('a wrong PRF output fails cleanly', async () => {
        const env = await buildPasskeyEnvelope({ privateKey: pair.privateKey, prf: prfBytes(), credentialId: 'c', email: 'x@example.test' });
        await expect(openPasskeyEnvelope(env, prfBytes())).rejects.toBeInstanceOf(PasskeyEnvelopeError);
    });

    it('lives in the envelope list next to the mail secret; same credential is replaced', async () => {
        const env1 = await buildPasskeyEnvelope({ privateKey: pair.privateKey, prf: prfBytes(), credentialId: 'a', email: 'x@example.test' });
        const env2 = await buildPasskeyEnvelope({ privateKey: pair.privateKey, prf: prfBytes(), credentialId: 'a', email: 'x@example.test' });
        let vault = withPasskeyEnvelope(JSON.stringify({ v: 1, envelopes: [MAIL_ENV] }), env1);
        vault = withPasskeyEnvelope(vault, env2);
        expect(vault.envelopes.map((e) => e.kind)).toEqual(['mail-secret', 'passkey-prf']);
        expect(passkeyEnvelopes(vault)[0].iv).toBe(env2.iv);
        expect(passkeyEnvelopes(null)).toEqual([]);
        expect(withPasskeyEnvelope(null, env1).envelopes).toHaveLength(1);
    });
});

describe('feature detection and JSON', () => {
    it('reports WebAuthn as unavailable without PublicKeyCredential', () => {
        Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true, writable: true });
        expect(isWebAuthnAvailable()).toBe(false);
    });

    it('reads PRF results and the explicit "no PRF" signal', () => {
        const prf = prfBytes();
        expect(prfResult(fakeCredential('YQ', 'get', { prf: { results: { first: prf } } }))).not.toBeNull();
        expect(prfResult(fakeCredential('YQ', 'get', {}))).toBeNull();
        expect(prfMaybeEnabled(fakeCredential('YQ', 'create', { prf: { enabled: false } }))).toBe(false);
        expect(prfMaybeEnabled(fakeCredential('YQ', 'create', {}))).toBe(true);
    });

    it('never forwards the PRF output to the server', () => {
        const secret = { prf: { results: { first: new Uint8Array(32).fill(7).buffer } } };
        expect(creationToJSON(fakeCredential('YWJj', 'create', secret)).clientExtensionResults).toEqual({});
        expect(assertionToJSON(fakeCredential('YWJj', 'get', secret)).clientExtensionResults).toEqual({});
        expect(bytesToB64url(b64urlToBytes('YWJj-_8'))).toBe('YWJj-_8');
    });
});

describe('passkey flows', () => {
    let pair: CryptoKeyPair;
    beforeAll(async () => { pair = await rsaPair(); });
    beforeEach(() => {
        Object.values(api).forEach((m) => m.mockReset());
        proofMock.mockClear();
        api.passkeyRegisterFinish.mockResolvedValue(undefined);
        api.passkeyRegisterOptions.mockResolvedValue({
            ceremony_id: 'reg',
            publicKey: { challenge: 'Y2g', rp: { id: 'localhost', name: 'Tide' }, user: { id: 'dQ', name: 'u', displayName: 'u' }, pubKeyCredParams: [] },
        });
    });

    it('takes the PRF output from a follow-up get() when create() gives none', async () => {
        const prf = prfBytes();
        installCredentials(() => fakeCredential('Y3JlZA', 'create', { prf: { enabled: true } }), () => fakeCredential('Y3JlZA', 'get', { prf: { results: { first: prf } } }));
        await registerPasskey({ privateKey: pair.privateKey, email: 'ich@example.test', name: 'Laptop', currentRecoveryVault: JSON.stringify({ v: 1, envelopes: [MAIL_ENV] }) });
        expect(api.passkeyRegisterFinish).toHaveBeenCalledTimes(1);
        const arg = (api.passkeyRegisterFinish.mock.calls[0] as unknown as [{ recoveryVault: { envelopes: Array<{ kind: string; credentialId?: string }> }; credential: Record<string, unknown> }])[0];
        expect(arg.recoveryVault.envelopes.map((e) => e.kind)).toEqual(['mail-secret', 'passkey-prf']);
        expect(arg.recoveryVault.envelopes[1].credentialId).toBe('Y3JlZA');
        expect(arg.credential.clientExtensionResults).toEqual({});
        const env = passkeyEnvelopes(JSON.stringify(arg.recoveryVault))[0];
        expect(await canDecrypt(pair, (await openPasskeyEnvelope(env, prf)).privateKey)).toBe(true);
    });

    it('does not register a passkey without PRF', async () => {
        installCredentials(() => fakeCredential('bm9wcmY', 'create', { prf: { enabled: false } }), () => null);
        await expect(registerPasskey({ privateKey: pair.privateKey, email: 'x', name: 'n', currentRecoveryVault: null })).rejects.toBeInstanceOf(PasskeyPrfUnsupportedError);
        expect(api.passkeyRegisterFinish).not.toHaveBeenCalled();
        expect(proofMock).not.toHaveBeenCalled();
    });

    it('sign-in without PRF creates no server session', async () => {
        api.passkeyLoginOptions.mockResolvedValue({ ceremony_id: 'login', publicKey: { challenge: 'Y2g', rpId: 'localhost' } });
        installCredentials(() => null, () => fakeCredential('YQ', 'get', {}));
        await expect(signInWithPasskey()).rejects.toBeInstanceOf(PasskeyPrfUnsupportedError);
        expect(api.passkeyLoginVerify).not.toHaveBeenCalled();
    });

    it('sign-in opens the vault from the returned envelope', async () => {
        const prf = prfBytes();
        const env = await buildPasskeyEnvelope({ privateKey: pair.privateKey, prf, credentialId: 'Y3JlZA', email: 'ich@example.test' });
        api.passkeyLoginOptions.mockResolvedValue({ ceremony_id: 'login', publicKey: { challenge: 'Y2g', rpId: 'localhost' } });
        api.passkeyLoginVerify.mockResolvedValue({ user_id: 'u', public_key: 'pk', encrypted_vault: '{}', pepper: 'p', credential_id: 'Y3JlZA', recovery_vault: JSON.stringify({ v: 1, envelopes: [env] }) });
        installCredentials(() => null, () => fakeCredential('Y3JlZA', 'get', { prf: { results: { first: prf } } }));
        const res = await signInWithPasskey();
        expect(res.email).toBe('ich@example.test');
        expect(res.privateKey.extractable).toBe(false);
        expect(await canDecrypt(pair, res.privateKey)).toBe(true);
    });
});
