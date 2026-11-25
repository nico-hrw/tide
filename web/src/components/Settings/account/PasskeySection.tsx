import React, { useCallback, useEffect, useState } from 'react';
import { unlockVault } from '@/lib/crypto';
import { getMasterKey } from '@/lib/keyStorage';
import { deletePasskey, listPasskeys, type PasskeyList } from '@/lib/passkey/passkeyApi';
import { PasskeyCancelledError, PasskeyPrfUnsupportedError, registerPasskey } from '@/lib/passkey/passkeyFlow';
import { isWebAuthnAvailable } from '@/lib/passkey/passkeySupport';
import { requestKeyProof } from '@/lib/recovery/keyProof';
import { fetchRecoveryVault } from '@/lib/recovery/recoveryApi';
import { SettingsCard, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { Button, ConfirmButton, Notice, TextField } from '../ui/Controls';
import { useLocale, useT } from '../useT';
import { useMailCode, type FreshLogin } from './useMailCode';

type Mode = 'idle' | 'add-name' | 'add-code' | 'add-pin' | 'del-code';

/**
 * Settings > Konto > Passkeys: list, add (mail code, PIN, passkey with PRF envelope), remove
 * (mail code, key proof). Accounts that never add a passkey see only this list.
 */
export function PasskeySection({ email: profileEmail }: { email?: string }) {
    const t = useT();
    const locale = useLocale();
    const mail = useMailCode(profileEmail);
    const [supported] = useState(() => isWebAuthnAvailable());
    const [list, setList] = useState<PasskeyList | null>(null);
    const [mode, setMode] = useState<Mode>('idle');
    const [name, setName] = useState('');
    const [pin, setPin] = useState('');
    const [fresh, setFresh] = useState<FreshLogin | null>(null);
    const [target, setTarget] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const reload = useCallback(() => {
        listPasskeys().then(setList).catch(() => setList(null));
    }, []);
    useEffect(reload, [reload]);

    const reset = () => {
        setMode('idle');
        setName('');
        setPin('');
        setFresh(null);
        setTarget(null);
        setError('');
        mail.reset();
    };

    const fmt = (iso: string) => new Date(iso).toLocaleDateString(locale, { dateStyle: 'medium' });

    const verifyCode = async () => {
        const login = await mail.verify();
        if (!login) return;
        setFresh(login);
        if (mode === 'add-code') {
            setMode('add-pin');
            return;
        }
        // Removing: the stored (non-extractable) key is enough for the key proof.
        setBusy(true);
        try {
            const key = await getMasterKey();
            if (!key || !target) throw new Error(t('passkey.noKey'));
            await deletePasskey(target, await requestKeyProof(key, login.token), { token: login.token });
            reset();
            setNotice(t('passkey.removed'));
            reload();
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
        try {
            let privateKey: CryptoKey;
            try {
                privateKey = await unlockVault(pin, fresh.pepper, fresh.encryptedVault, true);
            } catch {
                throw new Error(t('recovery.wrongPin'));
            }
            const currentRecoveryVault = await fetchRecoveryVault({ token: fresh.token });
            await registerPasskey({ privateKey, email: mail.email, name: name.trim(), currentRecoveryVault }, { token: fresh.token });
            reset();
            setNotice(t('passkey.added'));
            reload();
        } catch (err) {
            if (err instanceof PasskeyCancelledError) setError('');
            else if (err instanceof PasskeyPrfUnsupportedError) setError(t('passkey.noPrf'));
            else setError(err instanceof Error ? err.message : t('recovery.failed'));
        } finally {
            setBusy(false);
        }
    };

    const startCode = async (next: Mode) => {
        setError('');
        setNotice('');
        setMode(next);
        await mail.send();
    };

    const passkeys = list?.passkeys ?? [];
    const canAdd = supported && list?.enabled && passkeys.length < (list?.max ?? 10);
    const shownError = error || mail.error;

    return (
        <SettingsSection title={t('passkey.section')} hint={t('passkey.sectionHint')}>
            <SettingsCard>
                {!supported && <SettingsRow title={t('passkey.section')} description={t('passkey.unsupported')}>{null}</SettingsRow>}
                {supported && list && !list.enabled && <SettingsRow title={t('passkey.section')} description={t('passkey.disabled')}>{null}</SettingsRow>}
                {passkeys.length === 0 && supported && list?.enabled && mode === 'idle' && (
                    <SettingsRow title={t('passkey.none')} description={t('passkey.prfHint')}>
                        <Button variant="primary" onClick={() => setMode('add-name')}>{t('passkey.add')}</Button>
                    </SettingsRow>
                )}
                {passkeys.map((p) => (
                    <SettingsRow
                        key={p.credential_id}
                        title={p.name}
                        description={`${t('passkey.created', { date: fmt(p.created_at) })} · ${p.last_used_at ? t('passkey.lastUsed', { date: fmt(p.last_used_at) }) : t('passkey.neverUsed')}`}
                    >
                        {mode === 'idle' && (
                            <ConfirmButton
                                label={t('passkey.delete')}
                                confirmLabel={t('passkey.deleteConfirm')}
                                onConfirm={() => { setTarget(p.credential_id); void startCode('del-code'); }}
                            />
                        )}
                    </SettingsRow>
                ))}
                {passkeys.length > 0 && canAdd && mode === 'idle' && (
                    <SettingsRow title={t('passkey.add')} description={t('passkey.prfHint')}>
                        <Button onClick={() => setMode('add-name')}>{t('passkey.add')}</Button>
                    </SettingsRow>
                )}

                {mode === 'add-name' && (
                    <SettingsRow title={t('passkey.name')} description={t('passkey.nameDesc')} htmlFor="passkey-name">
                        <TextField id="passkey-name" maxLength={64} value={name} placeholder={t('passkey.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
                        <Button onClick={reset}>{t('common.cancel')}</Button>
                        <Button variant="primary" disabled={!name.trim() || mail.busy} onClick={() => startCode('add-code')}>{t('passkey.continue')}</Button>
                    </SettingsRow>
                )}

                {(mode === 'add-code' || mode === 'del-code') && (
                    <SettingsRow title={t('recovery.code')} description={t(mode === 'add-code' ? 'passkey.codeIntro' : 'passkey.deleteIntro', { email: mail.email || mail.address() })} htmlFor="passkey-code">
                        <TextField id="passkey-code" mono autoComplete="one-time-code" maxLength={6} className="sm:!w-28 text-center" value={mail.code} onChange={(e) => mail.setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))} />
                        <Button onClick={reset}>{t('common.cancel')}</Button>
                        <Button variant="primary" onClick={verifyCode} disabled={mail.busy || busy || !mail.email || mail.code.trim().length !== 6}>
                            {mail.busy || busy ? t('recovery.working') : mode === 'add-code' ? t('recovery.codeAction') : t('passkey.removeAction')}
                        </Button>
                    </SettingsRow>
                )}

                {mode === 'add-pin' && (
                    <SettingsRow title={t('recovery.pin')} description={t('passkey.pinDesc')} htmlFor="passkey-pin">
                        <TextField id="passkey-pin" type="password" inputMode="numeric" maxLength={5} mono className="sm:!w-24 text-center" placeholder="•••••" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
                        <Button onClick={reset}>{t('common.cancel')}</Button>
                        <Button variant="primary" onClick={create} disabled={busy || pin.length !== 5}>{busy ? t('recovery.working') : t('passkey.create')}</Button>
                    </SettingsRow>
                )}
            </SettingsCard>
            {shownError && <div className="mt-3"><Notice tone="error">{shownError}</Notice></div>}
            {notice && !shownError && <div className="mt-3"><Notice tone="success">{notice}</Notice></div>}
        </SettingsSection>
    );
}
