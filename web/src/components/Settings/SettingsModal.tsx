import React, { useState, useEffect } from 'react';
import { useReferenceStore } from '@/store/useReferenceStore';
import { X, Blocks, Check, User, Puzzle, Palette, Shield, ChevronRight, LogOut, Bell, Flame, Snowflake, Settings, Lock, Users, Globe, Sparkles, Info, KeyRound, Bookmark } from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';
import Avatar from '@/components/Profile/Avatar';
import { apiFetch } from '@/lib/api';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    enabledExtensions: string[];
    onToggleExtension: (extensionId: string, enabled: boolean) => void;
    onToggleExtension: (extensionId: string, enabled: boolean) => void;
    userProfile?: { id?: string; user_id?: string; username: string; email: string; bio?: string; title?: string; avatar_seed?: string; avatar_salt?: string };
    onLogout?: () => void;
    noteLayout?: 'thin' | 'normal' | 'wide' | 'extra-wide';
    onSetNoteLayout?: (layout: 'thin' | 'normal' | 'wide' | 'extra-wide') => void;
}

export default function SettingsModal({
    isOpen,
    onClose,
    enabledExtensions,
    onToggleExtension,
    userProfile,
    onLogout,
    noteLayout = 'normal',
    onSetNoteLayout
}: SettingsModalProps) {

    const [activeTab, setActiveTab] = useState<'account' | 'extensions' | 'appearance' | 'info'>('account');
    const [pinInputValue, setPinInputValue] = useState("");
    const autoScanEnabled = useReferenceStore((state) => state.autoScanEnabled);
    const references = useReferenceStore((state) => state.references);
    const removeReference = useReferenceStore((state) => state.removeReference);

    const [showDictionary, setShowDictionary] = useState(false);
    const [editRefId, setEditRefId] = useState<string | null>(null);
    const [editRefTerm, setEditRefTerm] = useState("");

    const [nameInput, setNameInput] = useState(userProfile?.username || 'User');
    const [bioInput, setBioInput] = useState(userProfile?.bio || '');
    const [titleInput, setTitleInput] = useState(userProfile?.title || '');
    const [avatarSaltInput, setAvatarSaltInput] = useState(userProfile?.avatar_salt || '');
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [saveError, setSaveError] = useState('');

    // Reset state when modal opens/closes
    useEffect(() => {
        if (!isOpen) {
            setActiveTab('account');
        } else {
            setNameInput(userProfile?.username || 'User');
            setBioInput(userProfile?.bio || '');
            setTitleInput(userProfile?.title || '');
            setAvatarSaltInput(userProfile?.avatar_salt || '');
            setSaveError('');
        }
    }, [isOpen, userProfile]);

    if (!isOpen) return null;


    const tabs = [
        { id: 'account', label: 'Account', icon: User },
        { id: 'appearance', label: 'Appearance', icon: Palette },
        { id: 'extensions', label: 'Extensions', icon: Puzzle },
        { id: 'info', label: 'Info', icon: Info },
    ];

    const handleSaveProfile = async () => {
        setIsSavingProfile(true);
        setSaveError('');
        try {
            if (nameInput !== userProfile?.username) {
                const r = await apiFetch(`/api/v1/auth/me`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: nameInput })
                });
                if (!r.ok) throw new Error('Username update failed');
            }

            // Save full profile including avatar_salt and preserve avatar_seed
            const r = await apiFetch(`/api/v1/profiles`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: titleInput,
                    bio: bioInput,
                    avatar_salt: avatarSaltInput,
                    avatar_seed: userProfile?.avatar_seed || userProfile?.user_id || userProfile?.id, // Ensure seed isn't overwritten with empty string
                })
            });
            if (!r.ok) throw new Error('Profile save failed');

            onClose();
            window.location.reload();
        } catch (e: any) {
            console.error('Failed to save profile', e);
            setSaveError(e?.message || 'Save failed. Please try again.');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const renderAccount = () => (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Profile Information</h3>
                <div className="flex flex-col gap-6 p-6 rounded-2xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 relative">
                    <div className="flex items-center gap-6">
                        {/* Live Avatar Preview with salt applied */}
                        <div className="flex flex-col items-center gap-2">
                            <Avatar
                                seed={(userProfile?.avatar_seed || userProfile?.username || 'default') + avatarSaltInput}
                                size={80}
                            />
                            <span className="text-[10px] text-gray-400">Preview</span>
                        </div>
                        <div className="flex-1 space-y-1">
                            <label className="text-xs font-semibold text-gray-500">Name</label>
                            <input
                                type="text"
                                value={nameInput}
                                onChange={e => setNameInput(e.target.value)}
                                className="w-full bg-transparent text-xl font-black text-gray-900 dark:text-white outline-none border-b border-gray-200 dark:border-white/10 focus:border-blue-500 transition-colors pb-1"
                            />
                            <div className="pt-2">
                                <label className="text-xs font-semibold text-gray-500">Contact Email</label>
                                <input
                                    type="email"
                                    disabled
                                    defaultValue={userProfile?.email || 'user@example.com'}
                                    className="w-full bg-transparent text-sm text-gray-400 outline-none border-b border-transparent cursor-not-allowed"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Avatar Salt / Customization */}
                    <div className="p-4 rounded-xl border border-dashed border-gray-200 dark:border-white/10 bg-white/50 dark:bg-black/10">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Avatar Style Salt</label>
                                <p className="text-[11px] text-gray-400 mt-0.5">Enter any text to randomize your avatar. Same text = same look everywhere.</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={avatarSaltInput}
                                onChange={e => setAvatarSaltInput(e.target.value)}
                                placeholder="e.g. my-style-2026"
                                className="flex-1 bg-white dark:bg-black/40 text-sm text-gray-900 dark:text-white outline-none border border-gray-200 dark:border-white/10 focus:border-blue-500 transition-colors rounded-lg px-3 py-2"
                            />
                            <button
                                onClick={() => setAvatarSaltInput(Math.random().toString(36).slice(2, 10))}
                                className="px-3 py-2 text-xs font-bold bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-200 dark:hover:bg-white/10 transition-colors whitespace-nowrap"
                                title="Generate random salt"
                            >
                                🎲 Random
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 pt-4 border-t border-gray-100 dark:border-white/10">
                        <div>
                            <label className="text-xs font-semibold text-gray-500">Title / Role</label>
                            <input
                                type="text"
                                value={titleInput}
                                onChange={e => setTitleInput(e.target.value)}
                                placeholder="e.g. also there"
                                className="w-full mt-1 bg-white dark:bg-black/40 text-sm text-gray-900 dark:text-white outline-none border border-gray-200 dark:border-white/10 focus:border-blue-500 transition-colors rounded-lg px-3 py-2"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500">Bio</label>
                            <textarea
                                value={bioInput}
                                onChange={e => setBioInput(e.target.value)}
                                placeholder="Write a short bio about yourself..."
                                rows={2}
                                className="w-full mt-1 bg-white dark:bg-black/40 text-sm text-gray-900 dark:text-white outline-none border border-gray-200 dark:border-white/10 focus:border-blue-500 transition-colors rounded-lg px-3 py-2 resize-none"
                            />
                        </div>
                    </div>

                    {saveError && (
                        <p className="text-xs text-red-500 font-semibold">{saveError}</p>
                    )}

                    <div className="flex justify-end pt-2">
                        <button
                            onClick={handleSaveProfile}
                            disabled={isSavingProfile}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                        >
                            {isSavingProfile ? 'Saving...' : 'Save Profile'}
                        </button>
                    </div>
                </div>
            </div>

            <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Security</h3>
                <div className="p-6 rounded-2xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                        <KeyRound className="w-5 h-5 text-gray-400" />
                        <span className="font-semibold text-gray-900 dark:text-white">PIN Setup</span>
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 text-[10px] font-bold uppercase ml-auto">Local Encyrption</span>
                    </div>
                    <p className="text-sm text-gray-500">Set a 5-digit PIN to secure local vault cache.</p>
                    <div className="flex gap-2">
                        <input
                            type="password"
                            maxLength={5}
                            placeholder="•••••"
                            className="w-32 bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2 text-center tracking-[0.5em] font-mono outline-none focus:border-blue-500 transition-colors"
                            value={pinInputValue}
                            onChange={(e) => setPinInputValue(e.target.value.replace(/[^0-9]/g, ''))}
                        />
                        <button className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-blue-500/20">
                            Save PIN
                        </button>
                    </div>
                </div>
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-white/5">
                <button
                    onClick={onLogout}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors font-bold group w-fit"
                >
                    <LogOut className="w-5 h-5 text-rose-400 group-hover:text-rose-500" />
                    <span>Sign out of all sessions</span>
                </button>
            </div>
        </div>
    );

    const renderAppearance = () => (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Interface Options</h3>

            <div className="p-6 bg-white dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl">
                <div className="mb-4">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">Note Layout</h4>
                    <p className="text-xs text-gray-500 mt-1">Control how wide your notes are displayed in the editor.</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(['thin', 'normal', 'wide', 'extra-wide'] as const).map((l) => (
                        <button
                            key={l}
                            onClick={() => onSetNoteLayout?.(l)}
                            className={`px-4 py-3 rounded-xl border text-xs font-bold capitalize transition-all ${noteLayout === l
                                ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20'
                                : 'bg-white dark:bg-white/5 border-gray-100 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-white/20'
                                }`}
                        >
                            {l.replace('-', ' ')}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-4 flex items-center justify-between bg-white dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-xl opacity-60 grayscale cursor-not-allowed">
                <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">Language <span className="px-2 py-0.5 rounded-md bg-gray-200 dark:bg-gray-800 text-[10px]">Coming Soon</span></h4>
                    <p className="text-xs text-gray-500 mt-1">Change the application language.</p>
                </div>
                <select disabled className="bg-gray-100 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none">
                    <option>English</option>
                </select>
            </div>

            <div className="p-4 flex items-center justify-between bg-white dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-xl opacity-60 grayscale cursor-not-allowed">
                <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">Font Size <span className="px-2 py-0.5 rounded-md bg-gray-200 dark:bg-gray-800 text-[10px]">Coming Soon</span></h4>
                    <p className="text-xs text-gray-500 mt-1">Adjust scaling of text across the UI.</p>
                </div>
                <select disabled className="bg-gray-100 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none">
                    <option>Medium</option>
                </select>
            </div>
        </div>
    );

    const renderExtensions = () => (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="p-4 bg-blue-50 dark:bg-blue-500/10 rounded-xl border border-blue-100 dark:border-blue-500/20 mb-6">
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">Store / Plugins</p>
                <p className="text-sm text-blue-800 dark:text-blue-300">Enable specialized modules to customize your workflow.</p>
            </div>

            {[
                { id: 'finance', title: 'Finance Tracker', desc: 'Strict double-entry bookkeeping', version: 'v1.2.0', updated: 'Mar 1, 2026', icon: Blocks, color: 'text-emerald-500' },
                { id: 'messenger', title: 'Messenger', desc: 'Real-time chat and collaboration', version: 'v0.9.5-beta', updated: 'Mar 3, 2026', icon: User, color: 'text-blue-500' },
                { id: 'summary', title: 'Daily Summary', desc: 'Duolingo-style daily recap & streaks', version: 'v2.0.1', updated: 'Feb 28, 2026', icon: Flame, color: 'text-orange-500' },
                { id: 'smart_island', title: 'Smart Island', desc: 'Context-aware sidebar assistant', version: 'v1.0.0', updated: 'Feb 26, 2026', icon: Sparkles, color: 'text-violet-500' },
                { id: 'references', title: 'References', desc: 'Auto-link definitions across notes', version: 'v1.0.0', updated: 'Today', icon: Bookmark, color: 'text-emerald-500' },
            ].map((ext) => (
                <div key={ext.id} className="p-4 flex flex-col bg-white dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-xl hover:border-blue-200 dark:hover:border-blue-500/30 transition-colors">
                    <div className="flex items-start justify-between w-full">
                        <div className="flex gap-4">
                            <div className={`p-3 rounded-xl bg-gray-50 dark:bg-white/5 ${ext.color} shrink-0`}>
                                <ext.icon className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h4 className="text-base font-bold text-gray-900 dark:text-white">{ext.title}</h4>
                                    <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-white/10 text-[10px] font-mono font-bold text-gray-500">{ext.version}</span>
                                </div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{ext.desc}</p>
                                <p className="text-[11px] text-gray-400">Last updated: {ext.updated}</p>
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 mt-1 shrink-0 ml-4">
                            <button
                                onClick={() => onToggleExtension(ext.id, !enabledExtensions.includes(ext.id))}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${enabledExtensions.includes(ext.id) ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`}
                            >
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${enabledExtensions.includes(ext.id) ? 'translate-x-5' : 'translate-x-0'}`}>
                                    {enabledExtensions.includes(ext.id) && <Check className="absolute inset-0 m-auto h-3 w-3 text-blue-500" />}
                                </span>
                            </button>

                            {ext.id === 'references' && enabledExtensions.includes('references') && (
                                <div className="flex flex-col items-end gap-2 mt-2 w-full">
                                    <label className="flex items-center gap-2 cursor-pointer bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-md border border-emerald-100 dark:border-emerald-800">
                                        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Autopilot Scanner</span>
                                        <input
                                            type="checkbox"
                                            checked={autoScanEnabled}
                                            onChange={(e) => useReferenceStore.getState().setAutoScanEnabled(e.target.checked)}
                                            className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500 w-3 h-3 cursor-pointer"
                                        />
                                    </label>
                                    <button
                                        onClick={() => setShowDictionary(!showDictionary)}
                                        className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide px-2 py-1 rounded-md border border-blue-100 dark:border-blue-900/30 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                    >
                                        {showDictionary ? 'Hide Dictionary' : 'Manage Dictionary'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {ext.id === 'references' && showDictionary && enabledExtensions.includes('references') && (
                        <div className="w-full mt-4 pt-4 border-t border-gray-100 dark:border-white/5 animate-in slide-in-from-top-2">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Reference Dictionary ({references.length})</h4>
                            <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2">
                                {references.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic">No references saved yet.</p>
                                ) : references.map(r => (
                                    <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5">
                                        {editRefId === r.id ? (
                                            <input
                                                autoFocus
                                                value={editRefTerm}
                                                onChange={(e) => setEditRefTerm(e.target.value)}
                                                onBlur={() => {
                                                    useReferenceStore.getState().setReferences(references.map(x => x.id === r.id ? { ...x, term: editRefTerm } : x));
                                                    setEditRefId(null);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        useReferenceStore.getState().setReferences(references.map(x => x.id === r.id ? { ...x, term: editRefTerm } : x));
                                                        setEditRefId(null);
                                                    }
                                                }}
                                                className="bg-white dark:bg-black/40 border border-blue-500 rounded px-2 py-1 text-sm font-bold outline-none w-full mr-2"
                                            />
                                        ) : (
                                            <div className="flex-1 min-w-0 mr-2 cursor-text" onClick={() => { setEditRefId(r.id); setEditRefTerm(r.term); }}>
                                                <div className="text-sm font-bold text-gray-900 dark:text-white truncate">{r.term}</div>
                                                <div className="text-xs text-gray-500 truncate">{r.previewText || 'No custom preview generated'}</div>
                                            </div>
                                        )}
                                        {editRefId !== r.id && (
                                            <button onClick={() => removeReference(r.id)} className="p-1.5 shrink-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-md transition-colors">
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );

    const renderInfo = () => (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-center p-8">
                <div className="text-center">
                    <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-xl shadow-blue-500/20 transform rotate-3">
                        <Globe className="text-white w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 dark:text-white">tide system</h2>
                    <p className="text-gray-500 text-sm mt-1">E2E Encrypted Knowledge & Collaboration</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black/20 text-center">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Web Client</div>
                    <div className="font-mono text-sm font-bold text-gray-900 dark:text-white">v0.1.0-alpha</div>
                </div>
                <div className="p-4 rounded-xl border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black/20 text-center">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Cloud Node</div>
                    <div className="font-mono text-sm font-bold text-gray-900 dark:text-white">Go v1.x Core</div>
                </div>
                <div className="p-4 rounded-xl border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black/20 text-center">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Database</div>
                    <div className="font-mono text-sm font-bold text-gray-900 dark:text-white">SQLite 3</div>
                </div>
            </div>

            <div className="text-center text-xs text-gray-400 mt-8 pt-8 border-t border-gray-100 dark:border-white/5">
                © {new Date().getFullYear()} tide. All rights reserved.
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center pointer-events-none p-4 sm:p-0">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
            />

            <motion.div
                layout
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="relative bg-white dark:bg-[#1C1C1E] rounded-[32px] shadow-2xl overflow-hidden border border-white/20 dark:border-white/10 flex flex-col pointer-events-auto w-full max-w-[900px] h-[85vh] sm:h-[650px]"
                onClick={e => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 rounded-full bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 dark:text-gray-300 z-10 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="flex flex-col sm:flex-row h-full">
                    {/* Permanent Sidebar Tab List */}
                    <div className="w-full sm:w-64 border-b sm:border-b-0 sm:border-r border-gray-100 dark:border-white/5 p-6 flex flex-col gap-2 bg-gray-50/50 dark:bg-white/[0.02]">
                        <div className="mb-8 px-2 hidden sm:block">
                            <h2 className="text-2xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Settings</h2>
                        </div>

                        <div className="flex flex-row sm:flex-col overflow-x-auto sm:overflow-visible gap-2 pb-2 sm:pb-0 custom-scrollbar">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all whitespace-nowrap sm:whitespace-normal shrink-0 ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 font-medium'}`}
                                >
                                    <tab.icon className="w-5 h-5 shrink-0" />
                                    <span className={`font-bold text-sm ${activeTab === tab.id ? '' : ''}`}>{tab.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-transparent">
                        <div className="p-8 pb-4 border-b border-gray-100 dark:border-white/5 hidden sm:block">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{tabs.find(t => t.id === activeTab)?.label}</h2>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar relative">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeTab}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.15 }}
                                    className="h-full"
                                >
                                    {activeTab === 'account' && renderAccount()}
                                    {activeTab === 'appearance' && renderAppearance()}
                                    {activeTab === 'extensions' && renderExtensions()}
                                    {activeTab === 'info' && renderInfo()}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
