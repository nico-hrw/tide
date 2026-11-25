/**
 * Recovery vault: a second wrapping of the RSA private key, next to the PIN-wrapped encrypted_vault.
 *
 * Shape (stored opaque on the server):
 *   { v: 1, envelopes: [ { kind: 'mail-secret', salt, iv, ciphertext, kdf: { name, hash, iterations } } ] }
 *
 * `envelopes` is a list so later kinds (e.g. a passkey/PRF envelope) can sit next to the mail secret;
 * each kind brings its own fields. Only 'mail-secret' is implemented.
 *
 * KDF: PBKDF2-SHA-256 with 200 000 iterations (Argon2 is not available in WebCrypto). The secret
 * carries 160 bits of CSPRNG entropy, so guessing it is infeasible no matter how cheap one KDF call is;
 * unlike the 5-digit PIN the iterations are not the security barrier. They add a margin of ~17.6 bits
 * (2^17.6 ≈ 200 000) in case a secret ever leaks partially, while one unlock stays well under a
 * second on phones. The count deliberately differs from crypto.ts' 600 000/100 000, so
 * decryptPrivateKey never runs its legacy fallback for these envelopes.
 */
import { arrayBufferToBase64, decryptPrivateKey, deriveKeyFromPassword, encryptPrivateKey } from '@/lib/crypto';
import { normalizeRecoverySecret } from './recoverySecret';

export const MAIL_SECRET_KIND = 'mail-secret';
export const RECOVERY_PBKDF2_ITERATIONS = 200_000;
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 5_000_000;

export interface KdfParams {
    name: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
}

export interface MailSecretEnvelope {
    kind: typeof MAIL_SECRET_KIND;
    salt: string;
    iv: string;
    ciphertext: string;
    kdf: KdfParams;
}

/** Envelopes of kinds this client does not know yet (e.g. passkey) are kept untouched. */
export interface UnknownEnvelope {
    kind: string;
    [field: string]: unknown;
}

export type RecoveryEnvelope = MailSecretEnvelope | UnknownEnvelope;

export interface RecoveryVault {
    v: 1;
    envelopes: RecoveryEnvelope[];
}

export class RecoveryVaultError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RecoveryVaultError';
    }
}

function isMailSecretEnvelope(e: RecoveryEnvelope): e is MailSecretEnvelope {
    return e.kind === MAIL_SECRET_KIND;
}

/** Wraps an extractable private key with the recovery secret (canonical or formatted). */
export async function buildMailSecretEnvelope(privateKey: CryptoKey, secret: string): Promise<MailSecretEnvelope> {
    if (!privateKey.extractable) throw new RecoveryVaultError('Der private Schlüssel muss für die Sicherung exportierbar sein.');
    const canonical = normalizeRecoverySecret(secret);
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const kek = await deriveKeyFromPassword(canonical, salt.buffer, RECOVERY_PBKDF2_ITERATIONS);
    const wrapped = await encryptPrivateKey(privateKey, kek, salt.buffer);
    return {
        kind: MAIL_SECRET_KIND,
        salt: arrayBufferToBase64(salt.buffer),
        iv: wrapped.iv,
        ciphertext: wrapped.ciphertext,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: RECOVERY_PBKDF2_ITERATIONS },
    };
}

/** New recovery vault; keeps envelopes of other kinds from `previous` and replaces the mail secret. */
export async function buildRecoveryVault(privateKey: CryptoKey, secret: string, previous?: RecoveryVault | null): Promise<RecoveryVault> {
    const envelope = await buildMailSecretEnvelope(privateKey, secret);
    const others = (previous?.envelopes ?? []).filter((e) => e.kind !== MAIL_SECRET_KIND);
    return { v: 1, envelopes: [envelope, ...others] };
}

export function parseRecoveryVault(raw: string | RecoveryVault): RecoveryVault {
    let parsed: unknown;
    try {
        parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        throw new RecoveryVaultError('Die gespeicherte Wiederherstellung ist beschädigt.');
    }
    const v = parsed as Partial<RecoveryVault> | null;
    if (!v || v.v !== 1 || !Array.isArray(v.envelopes)) {
        throw new RecoveryVaultError('Diese Wiederherstellung hat ein unbekanntes Format.');
    }
    return v as RecoveryVault;
}

/**
 * Opens the mail-secret envelope. Throws RecoverySecretFormatError for malformed input and
 * RecoveryVaultError when the secret does not fit (AES-GCM authentication fails).
 */
export async function openRecoveryVault(raw: string | RecoveryVault, secretInput: string, extractable = true): Promise<CryptoKey> {
    const vault = parseRecoveryVault(raw);
    const envelope = vault.envelopes.find(isMailSecretEnvelope);
    if (!envelope) throw new RecoveryVaultError('Für dieses Konto ist kein Wiederherstellungsschlüssel hinterlegt.');
    const iterations = envelope.kdf?.iterations;
    if (envelope.kdf?.name !== 'PBKDF2' || envelope.kdf?.hash !== 'SHA-256' || !Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
        throw new RecoveryVaultError('Die Schlüsselableitung dieser Wiederherstellung wird nicht unterstützt.');
    }
    const canonical = normalizeRecoverySecret(secretInput);
    try {
        return await decryptPrivateKey({ salt: envelope.salt, iv: envelope.iv, ciphertext: envelope.ciphertext }, canonical, extractable, iterations);
    } catch {
        throw new RecoveryVaultError('Der Wiederherstellungsschlüssel passt nicht zu diesem Konto.');
    }
}
