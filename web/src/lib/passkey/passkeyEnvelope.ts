/**
 * Passkey envelope in the recovery vault's envelope list:
 *   { kind: 'passkey-prf', credentialId, prfSalt, hkdfSalt, iv, ciphertext, metaIv, metaCiphertext }
 *
 * Key: HKDF-SHA-256(PRF output, salt = hkdfSalt (16 random bytes), info = 'tide-vault-passkey-v1')
 * -> AES-256-GCM. `ciphertext` holds the PKCS#8 private key (via crypto.ts encryptPrivateKey),
 * `metaCiphertext` the account e-mail (the server only has its blind index, but a passkey sign-in has
 * no e-mail step). The PRF output never leaves the device.
 */
import { arrayBufferToBase64, base64ToArrayBuffer, encryptPrivateKey, importPrivateKey } from '@/lib/crypto';
import { parseRecoveryVault, type RecoveryEnvelope, type RecoveryVault, type UnknownEnvelope } from '@/lib/recovery/recoveryVault';
import { PRF_INPUT_LABEL } from './passkeySupport';

export const PASSKEY_KIND = 'passkey-prf';
const HKDF_INFO = 'tide-vault-passkey-v1';

export interface PasskeyEnvelope extends UnknownEnvelope {
    kind: typeof PASSKEY_KIND;
    credentialId: string;
    prfSalt: string;
    hkdfSalt: string;
    iv: string;
    ciphertext: string;
    metaIv: string;
    metaCiphertext: string;
}

export class PasskeyEnvelopeError extends Error {
    constructor(message = 'Der Passkey passt nicht zu diesem Tresor.') {
        super(message);
        this.name = 'PasskeyEnvelopeError';
    }
}

export function isPasskeyEnvelope(e: RecoveryEnvelope): e is PasskeyEnvelope {
    return e.kind === PASSKEY_KIND && typeof (e as Partial<PasskeyEnvelope>).credentialId === 'string';
}

export async function deriveEnvelopeKey(prf: ArrayBuffer, hkdfSalt: ArrayBuffer): Promise<CryptoKey> {
    const ikm = await window.crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey']);
    return window.crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: hkdfSalt, info: new TextEncoder().encode(HKDF_INFO) },
        ikm,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

/** Wraps an extractable private key (and the account e-mail) with a passkey's PRF output. */
export async function buildPasskeyEnvelope(params: { privateKey: CryptoKey; prf: ArrayBuffer; credentialId: string; email: string }): Promise<PasskeyEnvelope> {
    if (!params.privateKey.extractable) throw new PasskeyEnvelopeError('Der private Schlüssel muss für die Sicherung exportierbar sein.');
    if (params.prf.byteLength < 32) throw new PasskeyEnvelopeError('Der Passkey hat kein brauchbares PRF-Ergebnis geliefert.');
    const hkdfSalt = window.crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveEnvelopeKey(params.prf, hkdfSalt.buffer);
    const wrapped = await encryptPrivateKey(params.privateKey, key, hkdfSalt.buffer);
    const metaIv = window.crypto.getRandomValues(new Uint8Array(12));
    const meta = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: metaIv }, key, new TextEncoder().encode(JSON.stringify({ email: params.email })));
    return {
        kind: PASSKEY_KIND,
        credentialId: params.credentialId,
        prfSalt: arrayBufferToBase64(new TextEncoder().encode(PRF_INPUT_LABEL).buffer as ArrayBuffer),
        hkdfSalt: wrapped.salt,
        iv: wrapped.iv,
        ciphertext: wrapped.ciphertext,
        metaIv: arrayBufferToBase64(metaIv.buffer),
        metaCiphertext: arrayBufferToBase64(meta),
    };
}

/** Opens a passkey envelope. Throws PasskeyEnvelopeError when the PRF output does not fit. */
export async function openPasskeyEnvelope(env: PasskeyEnvelope, prf: ArrayBuffer, extractable = false): Promise<{ privateKey: CryptoKey; email: string | null }> {
    let key: CryptoKey;
    let pkcs8: ArrayBuffer;
    try {
        key = await deriveEnvelopeKey(prf, base64ToArrayBuffer(env.hkdfSalt));
        pkcs8 = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToArrayBuffer(env.iv) }, key, base64ToArrayBuffer(env.ciphertext));
    } catch {
        throw new PasskeyEnvelopeError();
    }
    const privateKey = await importPrivateKey(pkcs8, extractable);
    let email: string | null = null;
    try {
        const meta = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToArrayBuffer(env.metaIv) }, key, base64ToArrayBuffer(env.metaCiphertext));
        const parsed = JSON.parse(new TextDecoder().decode(meta)) as { email?: unknown };
        email = typeof parsed.email === 'string' ? parsed.email : null;
    } catch {
        email = null;
    }
    return { privateKey, email };
}

export function passkeyEnvelopes(vault: string | RecoveryVault | null | undefined): PasskeyEnvelope[] {
    if (!vault) return [];
    try {
        return parseRecoveryVault(vault).envelopes.filter(isPasskeyEnvelope);
    } catch {
        return [];
    }
}

/** Adds (or replaces, same credential) a passkey envelope; all other envelopes stay as they are. */
export function withPasskeyEnvelope(vault: string | RecoveryVault | null | undefined, env: PasskeyEnvelope): RecoveryVault {
    const base = vault ? parseRecoveryVault(vault) : { v: 1 as const, envelopes: [] };
    const others = base.envelopes.filter((e) => !(isPasskeyEnvelope(e) && e.credentialId === env.credentialId));
    return { v: 1, envelopes: [...others, env] };
}
