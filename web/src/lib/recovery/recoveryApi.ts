/** Server calls for vault recovery. The server only ever sees client-encrypted vaults. */
import { apiFetch } from '@/lib/api';
import type { EncryptedPrivateKey } from '@/lib/crypto';
import type { RecoveryVault } from './recoveryVault';

export class FreshSessionRequiredError extends Error {
    constructor() {
        super('Deine Anmeldung ist zu alt. Bitte melde dich neu mit einem Mail-Code an und versuche es direkt danach noch einmal.');
        this.name = 'FreshSessionRequiredError';
    }
}

async function failure(res: Response, fallback: string): Promise<Error> {
    if (res.status === 403) return new FreshSessionRequiredError();
    if (res.status === 429) return new Error('Zu viele Versuche. Bitte warte einen Moment.');
    const text = await res.text().catch(() => '');
    return new Error(text.trim() || fallback);
}

const live = { offline: 'never' as const, cache: 'no-store' as const };

/** The caller's recovery vault, or null when none is set up. */
export async function fetchRecoveryVault(): Promise<string | null> {
    const res = await apiFetch('/api/v1/auth/recovery-vault', live);
    if (!res.ok) throw await failure(res, 'Wiederherstellung konnte nicht geladen werden.');
    const data = (await res.json()) as { has_recovery?: boolean; recovery_vault?: string | null };
    return data.has_recovery && data.recovery_vault ? data.recovery_vault : null;
}

/** Only whether a recovery vault exists (no content transferred). */
export async function fetchRecoveryStatus(): Promise<boolean> {
    const res = await apiFetch('/api/v1/auth/recovery-vault?status=1', live);
    if (!res.ok) throw await failure(res, 'Status konnte nicht geladen werden.');
    const data = (await res.json()) as { has_recovery?: boolean };
    return data.has_recovery === true;
}

export async function saveRecoveryVault(vault: RecoveryVault): Promise<void> {
    const res = await apiFetch('/api/v1/auth/recovery-vault', {
        method: 'PUT',
        offline: 'never',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recovery_vault: JSON.stringify(vault) }),
    });
    if (!res.ok) throw await failure(res, 'Wiederherstellungsschlüssel konnte nicht gespeichert werden.');
}

export async function replaceEncryptedVault(encryptedVault: EncryptedPrivateKey, recoveryVault?: RecoveryVault): Promise<void> {
    const res = await apiFetch('/api/v1/auth/replace-vault', {
        method: 'POST',
        offline: 'never',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            encrypted_vault: JSON.stringify(encryptedVault),
            ...(recoveryVault ? { recovery_vault: JSON.stringify(recoveryVault) } : {}),
        }),
    });
    if (!res.ok) throw await failure(res, 'Neuer PIN konnte nicht gespeichert werden.');
}
