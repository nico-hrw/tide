import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { EncryptedPrivateKey } from '@/lib/crypto';
import { fetchRecoveryStatus, fetchRecoveryVault } from '@/lib/recovery/recoveryApi';
import { setUpRecoveryWithPin } from '@/lib/recovery/recoveryFlow';
import { formatRecoverySecret, generateRecoverySecret } from '@/lib/recovery/recoverySecret';
import { RecoverySecretCard } from '@/components/Auth/RecoverySecretCard';
import { SettingsCard, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { Button, Notice, StatusPill, TextField } from '../ui/Controls';
import { useT } from '../useT';

interface FreshLogin {
    token: string;
    pepper: string;
    encryptedVault: EncryptedPrivateKey;
}

type Stage = 'idle' | 'code' | 'pin' | 'show';

const readEmail = () => localStorage.getItem('tide_user_email') || sessionStorage.getItem('tide_user_email') || '';

/**
 * "Wiederherstellungsschlüssel einrichten" for existing accounts. Writing it needs a fresh OTP
 * sign-in and a key proof, so the section runs a short mail-code step, then asks for the PIN to
 * open the private key on this device. The secret only lives in component state while shown.
 */
export function RecoverySection({ email: profileEmail }: { email?: string }) {
    const t = useT();
    const [hasRecovery, setHasRecovery] = useState<boolean | null>(null);
    const [stage, setStage] = useState<Stage>('idle');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [pin, setPin] = useState('');
    const [fresh, setFresh] = useState<FreshLogin | null>(null);
    const [secret, setSecret] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        fetchRecoveryStatus()
            .then((has) => { if (!cancelled) setHasRecovery(has); })
            .catch(() => { if (!cancelled) setHasRecovery(null); });
        return () => { cancelled = true; };
    }, []);

    const reset = () => {
        setStage('idle');
        setCode('');
        setPin('');
        setFresh(null);
        setSecret(null);
        setError('');
    };

    const sendCode = async () => {
        const address = (readEmail() || profileEmail || '').trim().toLowerCase();
        if (!address) return setError(t('recovery.noEmail'));
        setBusy(true);
        setError('');
        try {
            const res = await apiFetch('/api/v1/auth/request-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: address }),
            });
            if (!res.ok) throw new Error((await res.text()).trim() || t('recovery.failed'));
            setEmail(address);
            setStage('code');
        } catch (err) {
            setError(err instanceof Error ? err.message : t('recovery.failed'));
        } finally {
            setBusy(false);
        }
    };

    const verifyCode = async () => {
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
            // verify-otp also replaced the session cookie; keep the header token in step with it.
            localStorage.setItem('tide_session_token', data.token);
            setFresh({ token: data.token, pepper: data.pepper, encryptedVault: JSON.parse(data.encrypted_vault) as EncryptedPrivateKey });
            setStage('pin');
        } catch (err) {
            setError(err instanceof Error ? err.message : t('recovery.failed'));
        } finally {
            setBusy(false);
        }
    };

    const create = async () => {
        if (!fresh) return;
        setBusy(true);
        setError('');
        const raw = generateRecoverySecret();
        try {
            const previous = await fetchRecoveryVault({ token: fresh.token });
            await setUpRecoveryWithPin({ pin, pepperBase64: fresh.pepper, encryptedVault: fresh.encryptedVault, secret: raw, previous, token: fresh.token });
            setPin('');
            setSecret(formatRecoverySecret(raw));
            setHasRecovery(true);
            setStage('show');
        } catch (err) {
            // unlockVault throws a DOMException (OperationError) for a wrong PIN.
            const wrongPin = err instanceof DOMException || (err instanceof Error && err.name === 'OperationError');
            setError(wrongPin ? t('recovery.wrongPin') : err instanceof Error ? err.message : t('recovery.failed'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <SettingsSection
            title={t('recovery.section')}
            hint={t('recovery.sectionHint')}
            action={hasRecovery === null ? undefined : <StatusPill tone={hasRecovery ? 'on' : 'warn'}>{hasRecovery ? t('recovery.statusOn') : t('recovery.statusOff')}</StatusPill>}
        >
            <SettingsCard>
                {stage === 'idle' && (
                    <SettingsRow title={t('recovery.row')} description={hasRecovery ? t('recovery.rowDescOn') : t('recovery.rowDescOff')}>
                        <Button variant={hasRecovery ? 'default' : 'primary'} onClick={() => { setError(''); setStage('code'); setEmail(''); }}>
                            {hasRecovery ? t('recovery.renew') : t('recovery.setup')}
                        </Button>
                    </SettingsRow>
                )}

                {stage === 'code' && !email && (
                    <SettingsRow title={t('recovery.row')} description={t('recovery.codeIntro', { email: readEmail() || profileEmail || '' })}>
                        <Button onClick={reset}>{t('common.cancel')}</Button>
                        <Button variant="primary" onClick={sendCode} disabled={busy}>{busy ? t('recovery.working') : t('recovery.sendCode')}</Button>
                    </SettingsRow>
                )}

                {stage === 'code' && email && (
                    <SettingsRow title={t('recovery.code')} description={t('recovery.codeDesc')} htmlFor="recovery-code">
                        <TextField id="recovery-code" mono autoComplete="one-time-code" maxLength={6} className="sm:!w-28 text-center" value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))} />
                        <Button onClick={reset}>{t('common.cancel')}</Button>
                        <Button variant="primary" onClick={verifyCode} disabled={busy || code.trim().length !== 6}>{busy ? t('recovery.working') : t('recovery.codeAction')}</Button>
                    </SettingsRow>
                )}

                {stage === 'pin' && (
                    <SettingsRow title={t('recovery.pin')} description={t('recovery.pinDesc')} htmlFor="recovery-pin">
                        <TextField id="recovery-pin" type="password" inputMode="numeric" maxLength={5} mono className="sm:!w-24 text-center" placeholder="•••••" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
                        <Button onClick={reset}>{t('common.cancel')}</Button>
                        <Button variant="primary" onClick={create} disabled={busy || pin.length !== 5}>{busy ? t('recovery.working') : t('recovery.create')}</Button>
                    </SettingsRow>
                )}

                {stage === 'show' && secret && (
                    <div className="p-4">
                        <p className="mb-3 text-[13px] text-t2-ink-2">{t('recovery.showHint')}</p>
                        <RecoverySecretCard
                            secret={secret}
                            email={email}
                            labels={{ mail: t('recovery.mail'), copy: t('common.copy'), copied: t('common.copied'), download: t('recovery.download'), copyFailed: t('recovery.copyFailed') }}
                        />
                        <div className="mt-4">
                            <Button variant="primary" onClick={reset}>{t('recovery.done')}</Button>
                        </div>
                    </div>
                )}
            </SettingsCard>
            {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
        </SettingsSection>
    );
}
