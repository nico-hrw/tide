/**
 * Steps shared by registration, "PIN vergessen?" and the settings set-up.
 * Uses only existing crypto.ts exports; the PIN wrapping is the same as generateUserVault's
 * (PBKDF2-600k from the PIN, the account pepper as salt), just for an existing key.
 */
import { base64ToArrayBuffer, deriveKeyFromPassword, encryptPrivateKey, unlockVault, type EncryptedPrivateKey } from '@/lib/crypto';
import { replaceEncryptedVault } from './recoveryApi';
import { openRecoveryVault, buildRecoveryVault, parseRecoveryVault, type RecoveryVault } from './recoveryVault';

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
 * verify locally, and only then replace the server's encrypted_vault (fresh session required).
 */
export async function recoverWithSecret(params: {
    recoveryVault: string | RecoveryVault;
    secret: string;
    newPin: string;
    pepperBase64: string;
}): Promise<RecoverResult> {
    const extractable = await openRecoveryVault(params.recoveryVault, params.secret, true);
    const encryptedVault = await wrapPrivateKeyWithPin(extractable, params.newPin, params.pepperBase64);
    await replaceEncryptedVault(encryptedVault);
    const privateKey = await unlockVault(params.newPin, params.pepperBase64, encryptedVault, false);
    return { privateKey, encryptedVault };
}

/** Settings set-up for existing accounts: PIN-unlock the current vault extractably, build a recovery vault. */
export async function buildRecoveryVaultFromPin(params: {
    pin: string;
    pepperBase64: string;
    encryptedVault: EncryptedPrivateKey;
    secret: string;
    previous?: string | null;
}): Promise<RecoveryVault> {
    const extractable = await unlockVault(params.pin, params.pepperBase64, params.encryptedVault, true);
    const previous = params.previous ? parseRecoveryVault(params.previous) : null;
    return buildRecoveryVault(extractable, params.secret, previous);
}
