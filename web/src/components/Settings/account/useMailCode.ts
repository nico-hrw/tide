import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { EncryptedPrivateKey } from '@/lib/crypto';
import { useT } from '../useT';

export interface FreshLogin {
    token: string;
    pepper: string;
    encryptedVault: EncryptedPrivateKey;
}

const readEmail = () => localStorage.getItem('tide_user_email') || sessionStorage.getItem('tide_user_email') || '';

/**
 * Mail-code step inside settings: changes to vault or passkeys need a fresh mail-code session (a
 * passkey session is not enough, so the owner gets a notice). The new token replaces the stored one
 * (verify-otp also set the cookie). A wrong code does not sign the user out.
 */
export function useMailCode(profileEmail?: string) {
    const t = useT();
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const address = () => (readEmail() || profileEmail || '').trim().toLowerCase();

    const reset = () => {
        setEmail('');
        setCode('');
        setError('');
    };

    const send = async (): Promise<boolean> => {
        const to = address();
        if (!to) {
            setError(t('recovery.noEmail'));
            return false;
        }
        setBusy(true);
        setError('');
        try {
            const res = await apiFetch('/api/v1/auth/request-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: to }),
            });
            if (!res.ok) throw new Error((await res.text()).trim() || t('recovery.failed'));
            setEmail(to);
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : t('recovery.failed'));
            return false;
        } finally {
            setBusy(false);
        }
    };

    const verify = async (): Promise<FreshLogin | null> => {
        setBusy(true);
        setError('');
        try {
            const res = await apiFetch('/api/v1/auth/verify-otp', {
                method: 'POST',
                keepSessionOn401: true,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp: code.trim() }),
            });
            if (!res.ok) throw new Error(res.status === 401 ? t('recovery.wrongCode') : (await res.text()).trim() || t('recovery.failed'));
            const data = (await res.json()) as { token?: string; pepper?: string; encrypted_vault?: string; user_id?: string };
            const currentUser = localStorage.getItem('tide_user_id');
            if (currentUser && data.user_id !== currentUser) throw new Error(t('recovery.otherAccount'));
            if (!data.token || !data.pepper || !data.encrypted_vault) throw new Error(t('recovery.failed'));
            localStorage.setItem('tide_session_token', data.token);
            return { token: data.token, pepper: data.pepper, encryptedVault: JSON.parse(data.encrypted_vault) as EncryptedPrivateKey };
        } catch (err) {
            setError(err instanceof Error ? err.message : t('recovery.failed'));
            return null;
        } finally {
            setBusy(false);
        }
    };

    return { email, address, code, setCode, busy, error, setError, send, verify, reset };
}
