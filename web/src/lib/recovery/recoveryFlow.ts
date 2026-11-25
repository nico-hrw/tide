/**
 * Steps shared by registration, "PIN vergessen?" and the settings set-up.
 * Uses only existing crypto.ts exports; the PIN wrapping is the same as generateUserVault's
 * (PBKDF2-600k from the PIN, the account pepper as salt), just for an existing key.
 *
 * Every server write needs a fresh OTP session plus a key proof (keyProof.ts), so the private key
 * itself, opened by the secret or the PIN, is required to change anything.
 */
import { base64ToArrayBuffer, deriveKeyFromPassword, encryptPrivateKey, unlockVault, type EncryptedPrivateKey } from '@/lib/crypto';
import { requestKeyProof } from './keyProof';
import { replaceEncryptedVault, saveRecoveryVault } from './recoveryApi';
import { openRecoveryVault, buildRecoveryVault, parseRecoveryVault } from './recoveryVault';
import type { RecoveryVault } from './recoveryVault';

/** Wraps an extractable private key with a (new) PIN and checks the result opens again. */
export async function wrapPrivateKeyWithPin(privateKey: CryptoKey, pin: string, pepperBase64: string): Promise<EncryptedPrivateKey> {
    const salt = base64ToArrayBuffer(pepperBase64);
    const kek = await deriveKeyFromPassword(pin, salt);
    const vault = await encryptPrivateKey(privateKey, kek, salt);
    // Fail before anything is sent: the new vault must open with the new PIN.
    await unlockVault(pin, pepperBase64, vault);
    return vault;
}

export interface RecoverResult {
    /** Non-extractable key ready for storeMasterKey. */
    privateKey: CryptoKey;
    encryptedVault: EncryptedPrivateKey;
}

/**
 * "PIN vergessen?": open the recovery vault with the secret, wrap the key with the new PIN,
 * verify locally, prove key possession, and only then replace the server's encrypted_vault.
 */
export async function recoverWithSecret(params: {
    recoveryVault: string | RecoveryVault;
    secret: string;
    newPin: string;
    pepperBase64: string;
    token?: string;
}): Promise<RecoverResult> {
    const extractable = await openRecoveryVault(params.recoveryVault, params.secret, true);
    const encryptedVault = await wrapPrivateKeyWithPin(extractable, params.newPin, params.pepperBase64);
    const proof = await requestKeyProof(extractable, params.token);
    await replaceEncryptedVault(encryptedVault, proof, { token: params.token });
    const privateKey = await unlockVault(params.newPin, params.pepperBase64, encryptedVault, false);
    return { privateKey, encryptedVault };
}

/**
 * Settings set-up for existing accounts: PIN-unlock the current vault extractably, build a recovery
 * vault for `secret`, prove key possession and store it.
 */
export async function setUpRecoveryWithPin(params: {
    pin: string;
    pepperBase64: string;
    encryptedVault: EncryptedPrivateKey;
    secret: string;
    previous?: string | null;
    token?: string;
}): Promise<void> {
    const extractable = await unlockVault(params.pin, params.pepperBase64, params.encryptedVault, true);
    const previous = params.previous ? parseRecoveryVault(params.previous) : null;
    const vault = await buildRecoveryVault(extractable, params.secret, previous);
    const proof = await requestKeyProof(extractable, params.token);
    await saveRecoveryVault(vault, proof, { token: params.token });
}
