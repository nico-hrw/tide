/** Server calls for vault recovery. The server only ever sees client-encrypted vaults. */
import { apiFetch } from '@/lib/api';
import type { EncryptedPrivateKey } from '@/lib/crypto';
import type { KeyProof } from './keyProof';
import type { RecoveryVault } from './recoveryVault';

/** Shown when a passkey session (or one without known notice address) tries to change the vault. */
export const MAIL_SIGN_IN_REQUIRED = 'Dafür bitte einmal per Mail-Code anmelden. Mit einer Passkey-Anmeldung lassen sich Tresor, Wiederherstellungsschlüssel und Passkeys nicht ändern.';

export class FreshSessionRequiredError extends Error {
    constructor() {
        super('Deine Anmeldung ist zu alt. Bitte melde dich neu mit einem Mail-Code an und versuche es direkt danach noch einmal.');
        this.name = 'FreshSessionRequiredError';
    }
}

async function failure(res: Response, fallback: string): Promise<Error> {
    const text = (await res.text().catch(() => '')).trim();
    if (res.status === 403) {
        if (/key proof/i.test(text)) return new Error('Der Schlüsselnachweis ist fehlgeschlagen. Bitte versuche es erneut.');
        if (/mail sign-in required/i.test(text)) return new Error(MAIL_SIGN_IN_REQUIRED);
        return new FreshSessionRequiredError();
    }
    if (res.status === 429) {
        if (/24 hours/i.test(text)) return new Error('Der Tresor wurde in den letzten 24 Stunden schon ersetzt. Aus Sicherheitsgründen geht das erst danach wieder.');
        return new Error('Zu viele Versuche. Bitte warte einen Moment.');
    }
    return new Error(text || fallback);
}

const live = { offline: 'never' as const, cache: 'no-store' as const };

/** Optional explicit session token (during sign-in it is not yet in localStorage). */
export interface AuthOpts {
    token?: string;
}

export function authHeaders(opts?: AuthOpts, extra: Record<string, string> = {}): Record<string, string> {
    return opts?.token ? { ...extra, Authorization: `Bearer ${opts.token}` } : extra;
}

/** The caller's recovery vault, or null when none is set up. */
export async function fetchRecoveryVault(opts?: AuthOpts): Promise<string | null> {
    const res = await apiFetch('/api/v1/auth/recovery-vault', { ...live, headers: authHeaders(opts) });
    if (!res.ok) throw await failure(res, 'Wiederherstellung konnte nicht geladen werden.');
    const data = (await res.json()) as { has_recovery?: boolean; recovery_vault?: string | null };
    return data.has_recovery && data.recovery_vault ? data.recovery_vault : null;
}

/** Only whether a recovery vault exists (no content transferred). */
export async function fetchRecoveryStatus(opts?: AuthOpts): Promise<boolean> {
    const res = await apiFetch('/api/v1/auth/recovery-vault?status=1', { ...live, headers: authHeaders(opts) });
    if (!res.ok) throw await failure(res, 'Status konnte nicht geladen werden.');
    const data = (await res.json()) as { has_recovery?: boolean };
    return data.has_recovery === true;
}

export async function saveRecoveryVault(vault: RecoveryVault, proof: KeyProof, opts?: AuthOpts): Promise<void> {
    const res = await apiFetch('/api/v1/auth/recovery-vault', {
        method: 'PUT',
        offline: 'never',
        headers: authHeaders(opts, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ recovery_vault: JSON.stringify(vault), ...proof }),
    });
    if (!res.ok) throw await failure(res, 'Wiederherstellungsschlüssel konnte nicht gespeichert werden.');
}

export async function replaceEncryptedVault(encryptedVault: EncryptedPrivateKey, proof: KeyProof, opts?: AuthOpts & { recoveryVault?: RecoveryVault }): Promise<void> {
    const recoveryVault = opts?.recoveryVault;
    const res = await apiFetch('/api/v1/auth/replace-vault', {
        method: 'POST',
        offline: 'never',
        headers: authHeaders(opts, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            encrypted_vault: JSON.stringify(encryptedVault),
            ...(recoveryVault ? { recovery_vault: JSON.stringify(recoveryVault) } : {}),
            ...proof,
        }),
    });
    if (!res.ok) throw await failure(res, 'Neuer PIN konnte nicht gespeichert werden.');
}
