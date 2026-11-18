import React, { useEffect, useState } from 'react';
import Avatar from '@/components/Profile/Avatar';
import { apiFetch } from '@/lib/api';
import { SettingsCard, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { Button, Notice, Segmented, TextField, Toggle } from '../ui/Controls';
import { useT } from '../useT';

export interface ProfileUser {
    id?: string;
    user_id?: string;
    username: string;
    email: string;
    bio?: string;
    title?: string;
    avatar_seed?: string;
    avatar_salt?: string;
    avatar_style?: string;
    is_verified?: boolean;
    profile_status?: number;
}

type AvatarStyleId = 'notionists' | 'openPeeps';

const toStyle = (s?: string): AvatarStyleId => (s === 'openPeeps' ? 'openPeeps' : 'notionists');

export interface ProfileSectionsProps {
    userProfile?: ProfileUser;
    onClose?: () => void;
}

/** Profil, Avatar, Sichtbarkeit und Kontakt-E-Mail. Requests wie im frueheren Profil-Tab. */
export function ProfileSections({ userProfile, onClose }: ProfileSectionsProps) {
    const t = useT();
    const [name, setName] = useState(userProfile?.username || 'User');
    const [bio, setBio] = useState(userProfile?.bio || '');
    const [title, setTitle] = useState(userProfile?.title || '');
    const [salt, setSalt] = useState(userProfile?.avatar_salt || '');
    const [avatarStyle, setAvatarStyle] = useState<AvatarStyleId>(toStyle(userProfile?.avatar_style));
    const [isPublic, setIsPublic] = useState(userProfile?.profile_status !== 0);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [email, setEmail] = useState(userProfile?.email || '');
    const [pin, setPin] = useState('');
    const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    useEffect(() => {
        setName(userProfile?.username || 'User');
        setBio(userProfile?.bio || '');
        setTitle(userProfile?.title || '');
        setSalt(userProfile?.avatar_salt || '');
        setAvatarStyle(toStyle(userProfile?.avatar_style));
        setIsPublic(userProfile?.profile_status !== 0);
        setEmail(userProfile?.email || '');
        setPin('');
        setEmailStatus(null);
        setSaveError('');
    }, [userProfile]);

    const save = async () => {
        setSaving(true);
        setSaveError('');
        try {
            if (name !== userProfile?.username) {
                const r = await apiFetch(`/api/v1/auth/me`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: name }),
                });
                if (!r.ok) throw new Error('Username update failed');
            }
            const r = await apiFetch(`/api/v1/profiles`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    bio,
                    avatar_salt: salt,
                    avatar_style: avatarStyle,
                    avatar_seed: userProfile?.avatar_seed || userProfile?.user_id || userProfile?.id,
                    profile_status: isPublic ? 1 : 0,
                }),
            });
            if (!r.ok) throw new Error('Profile save failed');
            onClose?.();
            window.location.reload();
        } catch (e) {
            console.error('Failed to save profile', e);
            setSaveError(e instanceof Error && e.message ? e.message : t('profile.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const changeEmail = async () => {
        setEmailStatus(null);
        if (!email || !pin) {
            setEmailStatus({ type: 'error', msg: t('profile.emailNeedsPin') });
            return;
        }
        try {
            const r = await apiFetch(`/api/v1/auth/me`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, pin }),
            });
            if (!r.ok) throw new Error((await r.text()) || t('profile.emailFailed'));
            setEmailStatus({ type: 'success', msg: t('profile.emailUpdated') });
            setPin('');
        } catch (e) {
            setEmailStatus({ type: 'error', msg: e instanceof Error && e.message ? e.message : t('profile.emailFailed') });
        }
    };

    return (
        <>
            <SettingsSection title={t('profile.section')} hint={t('profile.sectionHint')}>
                <SettingsCard>
                    <div className="flex items-center gap-3.5 p-4">
                        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full">
                            <Avatar seed={(userProfile?.avatar_seed || userProfile?.username || 'default') + salt} style={avatarStyle} size={48} />
                        </span>
                        <div className="min-w-0">
                            <b className="block truncate text-[16px] font-semibold text-t2-ink">{userProfile?.username || 'User'}</b>
                            <small className="text-[12.5px] text-t2-ink-3">{userProfile?.email}</small>
                        </div>
                    </div>
                    <SettingsRow title={t('profile.name')} description={t('profile.nameDesc')} htmlFor="set-name">
                        <TextField id="set-name" value={name} onChange={(e) => setName(e.target.value)} />
                    </SettingsRow>
                    <SettingsRow title={t('profile.role')} description={t('profile.roleDesc')} htmlFor="set-title">
                        <TextField id="set-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('profile.rolePlaceholder')} />
                    </SettingsRow>
                    <SettingsRow title={t('profile.bio')} description={t('profile.bioDesc')} htmlFor="set-bio">
                        <TextField id="set-bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t('profile.bioPlaceholder')} />
                    </SettingsRow>
                </SettingsCard>
            </SettingsSection>

            <SettingsSection title={t('profile.avatar')} hint={t('profile.avatarHint')}>
                <SettingsCard>
                    <SettingsRow title={t('profile.avatarStyle')} description={t('profile.avatarStyleDesc')} wide>
                        <Segmented
                            full
                            label={t('profile.avatarStyle')}
                            value={avatarStyle}
                            onChange={setAvatarStyle}
                            options={[
                                { value: 'notionists', label: t('profile.styleClean') },
                                { value: 'openPeeps', label: t('profile.styleHanddrawn') },
                            ]}
                        />
                    </SettingsRow>
                    <SettingsRow title={t('profile.salt')} description={t('profile.saltDesc')} wide>
                        <TextField value={salt} onChange={(e) => setSalt(e.target.value)} placeholder={t('profile.saltPlaceholder')} aria-label={t('profile.salt')} />
                        <Button onClick={() => setSalt(Math.random().toString(36).slice(2, 10))}>{t('profile.random')}</Button>
                    </SettingsRow>
                </SettingsCard>
            </SettingsSection>

            <SettingsSection title={t('profile.visibility')} hint={t('profile.visibilityHint')}>
                <SettingsCard>
                    <SettingsRow title={t('profile.discoverable')} description={isPublic ? t('profile.discoverableOn') : t('profile.discoverableOff')}>
                        <Toggle checked={isPublic} onChange={setIsPublic} label={t('profile.discoverable')} />
                    </SettingsRow>
                    <SettingsRow title={t('profile.email')} description={t('profile.emailDesc')} htmlFor="set-email">
                        <TextField id="set-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
                    </SettingsRow>
                    <SettingsRow title={t('profile.emailPin')} description={t('profile.emailPinDesc')} htmlFor="set-email-pin">
                        <TextField
                            id="set-email-pin"
                            type="password"
                            inputMode="numeric"
                            maxLength={5}
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                            placeholder="PIN"
                            mono
                            className="sm:!w-24 text-center"
                        />
                        <Button onClick={changeEmail}>{t('profile.emailChange')}</Button>
                    </SettingsRow>
                </SettingsCard>
                {emailStatus && <div className="mt-3"><Notice tone={emailStatus.type}>{emailStatus.msg}</Notice></div>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[12.5px] text-t2-ink-3">{saveError ? <span className="text-t2-late">{saveError}</span> : t('profile.saveHint')}</p>
                    <Button variant="primary" onClick={save} disabled={saving}>{saving ? t('profile.saving') : t('profile.save')}</Button>
                </div>
            </SettingsSection>
        </>
    );
}
