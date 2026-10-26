import React, { useState, useEffect } from 'react';
import Avatar from '@/components/Profile/Avatar';
import { apiFetch } from '@/lib/api';

export interface ProfileTabProps {
    userProfile?: {
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
    };
    onClose?: () => void;
}

const AVATAR_STYLES = [
    { id: 'notionists' as const, label: 'Clean / Notion', desc: 'Minimal & Corporate' },
    { id: 'openPeeps' as const, label: 'Hand-drawn / Peeps', desc: 'Artsy & Casual' },
];

export function ProfileTab({ userProfile, onClose }: ProfileTabProps) {
    const [nameInput, setNameInput] = useState(userProfile?.username || 'User');
    const [bioInput, setBioInput] = useState(userProfile?.bio || '');
    const [titleInput, setTitleInput] = useState(userProfile?.title || '');
    const [avatarSaltInput, setAvatarSaltInput] = useState(userProfile?.avatar_salt || '');
    const [avatarStyleInput, setAvatarStyleInput] = useState<'notionists' | 'openPeeps'>((userProfile?.avatar_style as 'notionists' | 'openPeeps') || 'notionists');
    const [profilePublic, setProfilePublic] = useState(userProfile?.profile_status !== 0);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [emailInput, setEmailInput] = useState(userProfile?.email || '');
    const [emailPinInput, setEmailPinInput] = useState('');
    const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    useEffect(() => {
        setNameInput(userProfile?.username || 'User');
        setBioInput(userProfile?.bio || '');
        setTitleInput(userProfile?.title || '');
        setAvatarSaltInput(userProfile?.avatar_salt || '');
        setAvatarStyleInput((userProfile?.avatar_style as 'notionists' | 'openPeeps') || 'notionists');
        setProfilePublic(userProfile?.profile_status !== 0);
        setEmailInput(userProfile?.email || '');
        setEmailPinInput('');
        setEmailStatus(null);
        setSaveError('');
    }, [userProfile]);

    const handleSaveProfile = async () => {
        setIsSavingProfile(true);
        setSaveError('');
        try {
            if (nameInput !== userProfile?.username) {
                const r = await apiFetch(`/api/v1/auth/me`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: nameInput }),
                });
                if (!r.ok) throw new Error('Username update failed');
            }

            const r = await apiFetch(`/api/v1/profiles`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: titleInput,
                    bio: bioInput,
                    avatar_salt: avatarSaltInput,
                    avatar_style: avatarStyleInput,
                    avatar_seed: userProfile?.avatar_seed || userProfile?.user_id || userProfile?.id,
                    profile_status: profilePublic ? 1 : 0,
                }),
            });
            if (!r.ok) throw new Error('Profile save failed');

            onClose?.();
            window.location.reload();
        } catch (e: any) {
            console.error('Failed to save profile', e);
            setSaveError(e?.message || 'Save failed. Please try again.');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleUpdateEmail = async () => {
        setEmailStatus(null);
        if (!emailInput || !emailPinInput) {
            setEmailStatus({ type: 'error', msg: 'Email and PIN required' });
            return;
        }
        try {
            const r = await apiFetch(`/api/v1/auth/me`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailInput, pin: emailPinInput }),
            });
            if (!r.ok) {
                const msg = await r.text();
                throw new Error(msg || 'Failed to update email');
            }
            setEmailStatus({ type: 'success', msg: 'Email updated successfully' });
            setEmailPinInput('');
        } catch (e: any) {
            setEmailStatus({ type: 'error', msg: e?.message || 'Failed to update email' });
        }
    };

    return (
        <div>
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Profile Information</h3>
            <div className="flex flex-col gap-6 p-6 rounded-2xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 relative">
                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-center gap-2">
                        <Avatar seed={(userProfile?.avatar_seed || userProfile?.username || 'default') + avatarSaltInput} style={avatarStyleInput} size={80} />
                    </div>
                    <div className="flex-1 space-y-1">
                        <label className="text-xs font-semibold text-gray-500">Name</label>
                        <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)} className="w-full bg-transparent text-xl font-black text-gray-900 dark:text-white outline-none border-b border-gray-200 dark:border-white/10 focus:border-[#111827] dark:focus:border-white transition-colors pb-1" />
                        <div className="pt-2">
                            <label className="text-xs font-semibold text-gray-500">Contact Email</label>
                            <div className="flex flex-col gap-2 mt-1">
                                <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)} className="w-full bg-transparent text-sm text-gray-900 dark:text-white outline-none border-b border-gray-200 dark:border-white/10 focus:border-[#111827] dark:focus:border-white transition-colors pb-1" placeholder="your@email.com" />
                                <div className="flex items-center gap-2 mt-1">
                                    <input type="password" maxLength={5} placeholder="PIN" value={emailPinInput} onChange={e => setEmailPinInput(e.target.value.replace(/\D/g, ''))} className="w-20 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[8px] px-2 py-1 text-xs text-center font-mono outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400" />
                                    <button onClick={handleUpdateEmail} className="px-3 py-1 bg-[#111827] hover:bg-[#2c2c2c] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 text-white text-[11px] font-semibold rounded-[8px] transition-all">Change Email</button>
                                </div>
                                {emailStatus && (
                                    <p className={`text-[10px] font-bold ${emailStatus.type === 'success' ? 'text-emerald-500' : 'text-rose-500'}`}>{emailStatus.msg}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="p-4 rounded-xl border border-dashed border-gray-200 dark:border-white/10 bg-white/50 dark:bg-black/10">
                        <label className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 block">Avatar Style</label>
                        <div className="grid grid-cols-2 gap-3">
                            {AVATAR_STYLES.map((style) => (
                                <button
                                    key={style.id}
                                    onClick={() => setAvatarStyleInput(style.id)}
                                    className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${avatarStyleInput === style.id
                                        ? 'border-[#111827] dark:border-white bg-[#111827]/5 dark:bg-white/10'
                                        : 'border-transparent bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10'}`}
                                >
                                    <span className="text-sm font-bold text-gray-900 dark:text-white">{style.label}</span>
                                    <span className="text-[10px] text-gray-400 mt-0.5">{style.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="p-4 rounded-xl border border-dashed border-gray-200 dark:border-white/10 bg-white/50 dark:bg-black/10">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Custom Seed / Salt</label>
                                <p className="text-[11px] text-gray-400 mt-0.5">Enter any text to vary your look. Same text = same look.</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <input type="text" value={avatarSaltInput} onChange={e => setAvatarSaltInput(e.target.value)} placeholder="e.g. my-style-2026" className="flex-1 bg-white dark:bg-black/40 text-sm text-gray-900 dark:text-white outline-none border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 transition-colors rounded-lg px-3 py-2" />
                            <button onClick={() => setAvatarSaltInput(Math.random().toString(36).slice(2, 10))} className="px-3 py-2 text-xs font-bold bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors whitespace-nowrap" title="Generate random salt">
                                🎲 Random
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 pt-4 border-t border-gray-100 dark:border-white/10">
                    <div>
                        <label className="text-xs font-semibold text-gray-500">Title / Role</label>
                        <input type="text" value={titleInput} onChange={e => setTitleInput(e.target.value)} placeholder="e.g. also there" className="w-full mt-1 bg-white dark:bg-black/40 text-sm text-gray-900 dark:text-white outline-none border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 transition-colors rounded-lg px-3 py-2" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-500">Bio</label>
                        <textarea value={bioInput} onChange={e => setBioInput(e.target.value)} placeholder="Write a short bio about yourself..." rows={2} className="w-full mt-1 bg-white dark:bg-black/40 text-sm text-gray-900 dark:text-white outline-none border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 transition-colors rounded-lg px-3 py-2 resize-none" />
                    </div>

                    <div className="flex items-center justify-between pt-2 pb-1 border-t border-gray-100 dark:border-white/10">
                        <div>
                            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Profile Visibility</label>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                                {profilePublic ? 'Others can discover you via search.' : "Your profile is hidden — you won't appear in search results."}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setProfilePublic(!profilePublic)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${profilePublic ? 'bg-[#111827] dark:bg-white' : 'bg-gray-200 dark:bg-gray-700'}`}
                        >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full ${profilePublic ? 'bg-white dark:bg-zinc-900' : 'bg-white'} shadow transition duration-200 ${profilePublic ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>
                </div>

                {saveError && (
                    <p className="text-xs text-red-500 font-semibold">{saveError}</p>
                )}

                <div className="flex justify-end pt-2">
                    <button
                        onClick={handleSaveProfile}
                        disabled={isSavingProfile}
                        className="bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] h-[44px] px-6 font-semibold text-[14px] transition-all disabled:opacity-50"
                    >
                        {isSavingProfile ? 'Saving...' : 'Save Profile'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ProfileTab;
