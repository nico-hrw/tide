/** Server calls for passkeys. PRF outputs are never part of any request. */
import { apiFetch } from '@/lib/api';
import { authHeaders, MAIL_SIGN_IN_REQUIRED, type AuthOpts } from '@/lib/recovery/recoveryApi';
import type { KeyProof } from '@/lib/recovery/keyProof';
import type { RecoveryVault } from '@/lib/recovery/recoveryVault';
import type { CreationOptionsJSON, RequestOptionsJSON } from './webauthnJson';

export interface PasskeyInfo {
    credential_id: string;
    name: string;
    created_at: string;
    last_used_at: string | null;
}

export interface PasskeyList {
    enabled: boolean;
    max: number;
    passkeys: PasskeyInfo[];
}

export interface PasskeyLoginData {
    user_id: string;
    username?: string;
    public_key: string;
    encrypted_vault: string;
    pepper: string;
    token?: string;
    vault_replaced_at?: string;
    credential_id: string;
    recovery_vault: string | null;
}

export class PasskeyApiError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = 'PasskeyApiError';
    }
}

async function fail(res: Response, fallback: string): Promise<PasskeyApiError> {
    const text = (await res.text().catch(() => '')).trim();
    if (res.status === 403 && /mail sign-in required/i.test(text)) return new PasskeyApiError(MAIL_SIGN_IN_REQUIRED, 403);
    if (res.status === 403 && !/key proof/i.test(text)) {
        return new PasskeyApiError('Deine Anmeldung ist zu alt. Bitte bestätige dich erneut mit einem Mail-Code.', 403);
    }
    if (res.status === 429) return new PasskeyApiError('Zu viele Versuche. Bitte warte einen Moment.', 429);
    if (res.status === 503) return new PasskeyApiError('Passkeys sind auf diesem Server nicht eingerichtet.', 503);
    if (res.status === 409) return new PasskeyApiError('Es sind schon zu viele Passkeys hinterlegt.', 409);
    return new PasskeyApiError(text || fallback, res.status);
}

const json = (opts?: AuthOpts) => authHeaders(opts, { 'Content-Type': 'application/json' });

export async function listPasskeys(opts?: AuthOpts): Promise<PasskeyList> {
    const res = await apiFetch('/api/v1/auth/passkeys', { offline: 'never', cache: 'no-store', headers: authHeaders(opts) });
    if (!res.ok) throw await fail(res, 'Passkeys konnten nicht geladen werden.');
    return (await res.json()) as PasskeyList;
}

export async function passkeyRegisterOptions(opts?: AuthOpts): Promise<{ ceremony_id: string; publicKey: CreationOptionsJSON }> {
    const res = await apiFetch('/api/v1/auth/passkey/register/options', { method: 'POST', offline: 'never', headers: json(opts), body: '{}' });
    if (!res.ok) throw await fail(res, 'Passkey konnte nicht vorbereitet werden.');
    return res.json();
}

export async function passkeyRegisterFinish(params: {
    ceremonyId: string;
    name: string;
    credential: Record<string, unknown>;
    recoveryVault: RecoveryVault;
    proof: KeyProof;
}, opts?: AuthOpts): Promise<void> {
    const res = await apiFetch('/api/v1/auth/passkey/register/finish', {
        method: 'POST',
        offline: 'never',
        headers: json(opts),
        body: JSON.stringify({
            ceremony_id: params.ceremonyId,
            name: params.name,
            credential: params.credential,
            recovery_vault: JSON.stringify(params.recoveryVault),
            ...params.proof,
        }),
    });
    if (!res.ok) throw await fail(res, 'Passkey konnte nicht gespeichert werden.');
}

export async function deletePasskey(credentialId: string, proof: KeyProof, opts?: AuthOpts): Promise<void> {
    const res = await apiFetch('/api/v1/auth/passkey/delete', {
        method: 'POST',
        offline: 'never',
        headers: json(opts),
        body: JSON.stringify({ credential_id: credentialId, ...proof }),
    });
    if (!res.ok) throw await fail(res, 'Passkey konnte nicht entfernt werden.');
}

export async function passkeyLoginOptions(): Promise<{ ceremony_id: string; publicKey: RequestOptionsJSON }> {
    const res = await apiFetch('/api/v1/auth/passkey/login/options', { method: 'POST', offline: 'never', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!res.ok) throw await fail(res, 'Passkey-Anmeldung ist gerade nicht möglich.');
    return res.json();
}

export async function passkeyLoginVerify(ceremonyId: string, credential: Record<string, unknown>): Promise<PasskeyLoginData> {
    const res = await apiFetch('/api/v1/auth/passkey/login/verify', {
        method: 'POST',
        offline: 'never',
        keepSessionOn401: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ceremony_id: ceremonyId, credential }),
    });
    if (res.status === 401) throw new PasskeyApiError('Dieser Passkey wurde nicht akzeptiert. Melde dich mit Mail-Code und PIN an.', 401);
    if (!res.ok) throw await fail(res, 'Passkey-Anmeldung fehlgeschlagen.');
    return res.json();
}
