import React, { useState, useEffect, useRef } from 'react';
import { useReferenceStore, ReferenceDisplayMode, ReferenceItem } from '@/store/useReferenceStore';
import { X, Blocks, Check, User, Puzzle, Palette, Shield, ChevronRight, LogOut, Bell, Flame, Snowflake, Settings, Lock, Users, Globe, Sparkles, Info, KeyRound, Bookmark, Sun, Moon, Calendar, Share, Plus, Briefcase, Download, Copy, Upload, Key, Wrench, ListTodo } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { useJobPlannerStore } from '@/store/useJobPlannerStore';

import { motion, AnimatePresence } from 'framer-motion';
import Avatar from '@/components/Profile/Avatar';
import { apiFetch } from '@/lib/api';
import APIAccessSettings from './APIAccessSettings';
import DebugPluginSettings from './DebugPluginSettings';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: 'account' | 'calendar' | 'extensions' | 'appearance' | 'info' | 'access' | 'debug';
    enabledExtensions: string[];
    onToggleExtension: (extensionId: string, enabled: boolean) => void;
    userProfile?: { id?: string; user_id?: string; username: string; email: string; bio?: string; title?: string; avatar_seed?: string; avatar_salt?: string; avatar_style?: string; is_verified?: boolean; profile_status?: number };
    onLogout?: () => void;
    noteLayout?: 'thin' | 'normal' | 'wide' | 'extra-wide';
    onSetNoteLayout?: (layout: 'thin' | 'normal' | 'wide' | 'extra-wide') => void;
    groups?: { id: string; title: string; effect?: string; color?: string }[];
    hiddenGroupIds?: string[];
    onToggleGroupVisibility?: (id: string) => void;
    onUpdateGroup?: (id: string, updates: any) => void;
    onShareGroup?: (e: any, id: string) => void;
    onDeleteGroup?: (e: any, id: string) => void;
    onCreateGroup?: (title: string, color?: string, effect?: string) => Promise<string | undefined>;
}

function GroupItem({ group, hiddenGroupIds, onToggleVisibility, onUpdate, onShare, onDelete, isProtected }: any) {
    const [localTitle, setLocalTitle] = useState(group.title);

    useEffect(() => {
        setLocalTitle(group.title);
    }, [group.title]);

    const handleBlur = () => {
        if (localTitle !== group.title) {
            onUpdate(group.id, { title: localTitle });
        }
    };

    return (
        <div className="group relative flex flex-col gap-2 p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 hover:bg-white dark:hover:bg-white/10 hover:shadow-sm transition-all">
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={!(hiddenGroupIds || []).includes(group.id)}
                    onChange={() => onToggleVisibility(group.id)}
                    className="w-4 h-4 rounded border-gray-300 dark:border-zinc-700 text-[#111827] focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 bg-white dark:bg-zinc-800 cursor-pointer"
                    title="Toggle Visibility"
                />
                <input
                    type="text"
                    value={localTitle}
                    onChange={(e) => setLocalTitle(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
                    className="bg-transparent border-none p-0 text-[13px] font-bold focus:ring-0 outline-none text-gray-800 dark:text-white flex-1 placeholder:text-gray-400"
                    placeholder="Group name..."
                />
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    <button
                        onClick={(e) => onShare(e, group.id)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded text-gray-400 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                        title="Share Group"
                    >
                        <Share size={11} />
                    </button>
                    {isProtected ? (
                        <span
                            className="p-1 text-blue-500/80 cursor-not-allowed font-semibold"
                            title="Vom Job Planner Plugin geschützt (nicht löschbar)"
                        >
                            <Lock size={12} />
                        </span>
                    ) : (
                        <button
                            onClick={(e) => onDelete(e, group.id)}
                            className="p-1 hover:bg-rose-50 dark:hover:bg-rose-500/20 rounded text-gray-400 dark:text-gray-300 hover:text-rose-500 transition-all font-semibold"
                            title="Delete Group"
                        >
                            ✗
                        </button>
                    )}
                </div>
            </div>
            
            <div className="flex flex-col gap-2 pl-6">
                <div className="flex flex-wrap gap-1">
                    {([
                        { id: 'none',    label: 'Solid'   },
                        { id: 'stripes', label: 'Streifen' },
                        { id: 'waves',   label: 'Wellen'  },
                        { id: 'dots',    label: 'Punkte'  },
                        { id: 'chess',   label: 'Karo'    },
                        { id: 'diamonds',label: 'Diamant' },
                        { id: 'gradient',label: 'Verlauf' },
                        { id: 'bars',    label: 'Balken'  },
                        { id: 'dimmed',  label: 'Gedimmt' },
                    ] as const).map(({ id, label }) => {
                        const active = (group.effect || 'none') === id;
                        const swatchColor = group.color || '#3b82f6';
                        return (
                            <button
                                key={id}
                                onClick={() => onUpdate(group.id, { effect: id })}
                                title={label}
                                className={`flex flex-col items-center gap-0.5 p-0.5 rounded border transition-all ${active ? 'border-[#111827] dark:border-white scale-105 shadow-sm' : 'border-transparent hover:border-gray-300 dark:hover:border-zinc-700'}`}
                            >
                                <div
                                    className={`w-6 h-3 rounded-sm ${id !== 'none' ? `effect-${id}` : ''}`}
                                    style={{
                                        backgroundColor: swatchColor,
                                        opacity: id === 'dimmed' ? 0.55 : 1,
                                    }}
                                />
                                <span className="text-[6.5px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</span>
                            </button>
                        );
                    })}
                </div>
                
                <div className="flex flex-wrap gap-1 mt-0.5">
                    {[
                        '#3b82f6', // blue
                        '#10b981', // green
                        '#f59e0b', // orange
                        '#ef4444', // red
                        '#8b5cf6', // purple/lila
                        '#6366f1', // indigo
                        '#ec4899', // pink
                        '#64748b', // slate
                    ].map(c => {
                        const active = group.color === c;
                        return (
                            <button
                                key={c}
                                onClick={() => onUpdate(group.id, { color: c })}
                                className={`w-3.5 h-3.5 rounded-full border transition-all ${active ? 'border-gray-900 dark:border-white scale-110 shadow-sm' : 'border-transparent hover:scale-105'}`}
                                style={{ backgroundColor: c }}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function JobPlannerExtensionConfig({ groups }: { groups?: { id: string; title: string; color?: string }[] }) {
    const { mode, setMode, showWeekends, setShowWeekends, pluginGroupId } = useJobPlannerStore();
    const activeGroup = groups?.find(g => g.id === pluginGroupId);

    return (
        <div className="w-full mt-4 pt-4 border-t border-gray-100 dark:border-white/5 space-y-4 animate-in slide-in-from-top-2">
            <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                    Modus
                </label>
                <div className="grid grid-cols-3 gap-2">
                    {([
                        { id: 'job', label: 'Job' },
                        { id: 'study', label: 'Studium' },
                        { id: 'both', label: 'Beides' }
                    ] as const).map(item => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setMode(item.id)}
                            className={`px-3 py-2 text-xs font-semibold rounded-[8px] border transition-all text-center ${
                                mode === item.id
                                    ? 'bg-[#111827] border-[#111827] text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                                    : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10'
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200/60 dark:border-white/5">
                <div>
                    <h5 className="text-xs font-bold text-gray-900 dark:text-white">Wochenende im Stundenplan</h5>
                    <p className="text-[11px] text-gray-500">Zeigt Samstag und Sonntag in der Kalenderansicht an</p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowWeekends(!showWeekends)}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer ${
                        showWeekends ? 'bg-[#111827] dark:bg-white' : 'bg-gray-200 dark:bg-zinc-700'
                    }`}
                >
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full ${showWeekends ? 'bg-white dark:bg-zinc-900' : 'bg-white'} shadow transition duration-200 ${
                        showWeekends ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                </button>
            </div>

            <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                <div className="flex items-center justify-between">
                    <div>
                        <h5 className="text-xs font-bold text-gray-900 dark:text-white">Zugeordnete Terminart</h5>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            Termine für diesen Planer werden in dieser Kategorie gespeichert
                        </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-[8px] bg-[#111827] text-white dark:bg-white dark:text-zinc-900 text-xs font-semibold shadow-xs">
                        {activeGroup?.title || (mode === 'both' ? 'Job & Studium' : (mode === 'job' ? 'Job' : 'Studium'))}
                    </span>
                </div>
            </div>
        </div>
    );
}

const REFERENCE_PALETTE = [
    { label: 'Blue', value: '#3b82f6' },
    { label: 'Green', value: '#10b981' },
    { label: 'Amber', value: '#f59e0b' },
    { label: 'Red', value: '#ef4444' },
    { label: 'Purple', value: '#8b5cf6' },
    { label: 'Pink', value: '#ec4899' },
] as const;

const QUICK_EMOJIS = ['🔖', '💡', '📌', '⭐', '🏷️', '📖'] as const;

export default function SettingsModal({
    isOpen,
    onClose,
    initialTab,
    enabledExtensions,
    onToggleExtension,
    userProfile,
    onLogout,
    noteLayout = 'normal',
    onSetNoteLayout,
    groups = [],
    hiddenGroupIds = [],
    onToggleGroupVisibility,
    onUpdateGroup,
    onShareGroup,
    onDeleteGroup,
    onCreateGroup
}: SettingsModalProps) {

    const [activeTab, setActiveTab] = useState<'account' | 'calendar' | 'extensions' | 'appearance' | 'info' | 'access' | 'debug'>(initialTab || 'account');

    useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    const [pinInputValue, setPinInputValue] = useState("");
    const autoScanEnabled = useReferenceStore((state) => state.autoScanEnabled);
    const references = useReferenceStore((state) => state.references);
    const removeReference = useReferenceStore((state) => state.removeReference);
    const displayMode = useReferenceStore((state) => state.displayMode);
    const setDisplayMode = useReferenceStore((state) => state.setDisplayMode);
    const updateReference = useReferenceStore((state) => state.updateReference);
    const addReference = useReferenceStore((state) => state.addReference);

    const [showDictionary, setShowDictionary] = useState(false);
    const [editRefId, setEditRefId] = useState<string | null>(null);
    const [editRefTerm, setEditRefTerm] = useState("");
    const [editRefColor, setEditRefColor] = useState<string | undefined>(undefined);
    const [editRefEmoji, setEditRefEmoji] = useState("");
    const [isAddingRef, setIsAddingRef] = useState(false);
    const [newRefTerm, setNewRefTerm] = useState("");
    const [newRefPreview, setNewRefPreview] = useState("");
    const [newRefColor, setNewRefColor] = useState<string | undefined>(undefined);
    const [newRefEmoji, setNewRefEmoji] = useState("");

    const handleStartEditRef = (r: ReferenceItem) => {
        setEditRefId(r.id);
        setEditRefTerm(r.term);
        setEditRefColor(r.color);
        setEditRefEmoji(r.emoji || "");
    };

    const handleSaveEditRef = () => {
        if (!editRefId) return;
        const trimmed = editRefTerm.trim();
        if (trimmed) {
            updateReference(editRefId, {
                term: trimmed,
                color: editRefColor,
                emoji: editRefEmoji.trim() || undefined,
            });
        }
        setEditRefId(null);
        setEditRefTerm("");
        setEditRefColor(undefined);
        setEditRefEmoji("");
    };

    const handleCancelEditRef = () => {
        setEditRefId(null);
        setEditRefTerm("");
        setEditRefColor(undefined);
        setEditRefEmoji("");
    };

    const handleCreateRef = () => {
        const trimmed = newRefTerm.trim();
        if (!trimmed) return;
        addReference({
            term: trimmed,
            previewText: newRefPreview.trim() || `Definition für "${trimmed}"`,
            sourceNoteId: '',
            color: newRefColor,
            emoji: newRefEmoji.trim() || undefined,
        });
        setNewRefTerm("");
        setNewRefPreview("");
        setNewRefColor(undefined);
        setNewRefEmoji("");
        setIsAddingRef(false);
    };

    const [nameInput, setNameInput] = useState(userProfile?.username || 'User');
    const [bioInput, setBioInput] = useState(userProfile?.bio || '');
    const [titleInput, setTitleInput] = useState(userProfile?.title || '');
    const [avatarSaltInput, setAvatarSaltInput] = useState(userProfile?.avatar_salt || '');
    const [avatarStyleInput, setAvatarStyleInput] = useState<'notionists' | 'openPeeps'>((userProfile?.avatar_style as any) || 'notionists');
    const [profilePublic, setProfilePublic] = useState(userProfile?.is_verified !== false); // default open
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [saveError, setSaveError] = useState('');

    const [emailInput, setEmailInput] = useState(userProfile?.email || '');
    const [emailPinInput, setEmailPinInput] = useState('');
    const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

    const [copyFeedback, setCopyFeedback] = useState(false);
    const [backupStatus, setBackupStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { themePreference, setThemePreference, language, setLanguage, calendarColorPalette, setCalendarColorPalette, calendarOverlapMode, setCalendarOverlapMode, calendarHolidaysEnabled, setCalendarHolidaysEnabled, calendarHolidayPackage, setCalendarHolidayPackage, eventMentionStyle, setEventMentionStyle, eventMentionPreview, setEventMentionPreview } = useDataStore();

    const [newGroupName, setNewGroupName] = useState('');

    // Reset state when modal opens/closes
    useEffect(() => {
        if (!isOpen) {
            setActiveTab('account');
        } else {
            setNameInput(userProfile?.username || 'User');
            setBioInput(userProfile?.bio || '');
            setTitleInput(userProfile?.title || '');
            setAvatarSaltInput(userProfile?.avatar_salt || '');
            setAvatarStyleInput((userProfile?.avatar_style as any) || 'notionists');
            setProfilePublic(userProfile?.profile_status !== 0); // profile_status 0 = hidden
            setEmailInput(userProfile?.email || '');
            setEmailPinInput('');
            setEmailStatus(null);
            setSaveError('');
        }
    }, [isOpen, userProfile]);

    // Handle Escape key to close modal
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;


    const tabs = [
        { id: 'account', label: 'Account', icon: User },
        { id: 'calendar', label: 'Calendar', icon: Calendar },
        { id: 'appearance', label: 'Appearance', icon: Palette },
        { id: 'extensions', label: 'Extensions', icon: Puzzle },
        { id: 'access', label: language === 'de' ? 'Zugriff' : 'Access', icon: KeyRound },
        { id: 'info', label: 'Info', icon: Info },
        { id: 'debug', label: 'Debug & Diagnose', icon: Wrench },
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

            // Save full profile including avatar_salt, avatar_style, bio, title, and profile_status
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
                body: JSON.stringify({ email: emailInput, pin: emailPinInput })
            });
            if (!r.ok) {
                const msg = await r.text();
                throw new Error(msg || 'Failed to update email');
            }
            setEmailStatus({ type: 'success', msg: 'Email updated successfully' });
            setEmailPinInput('');
        } catch (e: any) {
            setEmailStatus({ type: 'error', msg: e.message });
        }
    };

    const handleExportMasterKey = () => {
        try {
            const rawKey = localStorage.getItem("tide_session_key") || sessionStorage.getItem("tide_session_key");
            if (!rawKey) {
                setBackupStatus({ type: 'error', msg: 'Kein aktiver Master-Schlüssel im Browser-Speicher gefunden.' });
                return;
            }

            let privateKeyJwk: any;
            try {
                privateKeyJwk = typeof rawKey === 'string' ? JSON.parse(rawKey) : rawKey;
            } catch {
                privateKeyJwk = rawKey;
            }

            const email = localStorage.getItem("tide_user_email") || sessionStorage.getItem("tide_user_email") || userProfile?.email || "";
            const userId = localStorage.getItem("tide_user_id") || sessionStorage.getItem("tide_user_id") || userProfile?.id || userProfile?.user_id || "";
            const publicKeySpki = localStorage.getItem("tide_user_public_key") || sessionStorage.getItem("tide_user_public_key") || "";

            const backupData = {
                app: "tide",
                version: 2,
                timestamp: new Date().toISOString(),
                email,
                userId,
                publicKeySpki,
                privateKeyJwk
            };

            const dataStr = JSON.stringify(backupData, null, 2);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const safeEmail = (email || 'user').replace(/[^a-zA-Z0-9@._-]/g, '_');
            a.href = url;
            a.download = `tide-master-key-${safeEmail}-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setBackupStatus({ type: 'success', msg: 'Master-Schlüssel erfolgreich exportiert!' });
            setTimeout(() => setBackupStatus(null), 4000);
        } catch (err: any) {
            console.error("Export Master Key failed:", err);
            setBackupStatus({ type: 'error', msg: err?.message || 'Export fehlgeschlagen.' });
        }
    };

    const handleCopyMasterKey = async () => {
        try {
            const rawKey = localStorage.getItem("tide_session_key") || sessionStorage.getItem("tide_session_key");
            if (!rawKey) {
                setBackupStatus({ type: 'error', msg: 'Kein aktiver Master-Schlüssel im Browser-Speicher gefunden.' });
                return;
            }

            let privateKeyJwk: any;
            try {
                privateKeyJwk = typeof rawKey === 'string' ? JSON.parse(rawKey) : rawKey;
            } catch {
                privateKeyJwk = rawKey;
            }

            const email = localStorage.getItem("tide_user_email") || sessionStorage.getItem("tide_user_email") || userProfile?.email || "";
            const userId = localStorage.getItem("tide_user_id") || sessionStorage.getItem("tide_user_id") || userProfile?.id || userProfile?.user_id || "";
            const publicKeySpki = localStorage.getItem("tide_user_public_key") || sessionStorage.getItem("tide_user_public_key") || "";

            const backupData = {
                app: "tide",
                version: 2,
                timestamp: new Date().toISOString(),
                email,
                userId,
                publicKeySpki,
                privateKeyJwk
            };

            const jsonStr = JSON.stringify(backupData, null, 2);
            await navigator.clipboard.writeText(jsonStr);
            setCopyFeedback(true);
            setTimeout(() => setCopyFeedback(false), 2000);
        } catch (err: any) {
            console.error("Copy Master Key failed:", err);
            setBackupStatus({ type: 'error', msg: 'Kopieren fehlgeschlagen.' });
        }
    };

    const handleImportMasterKey = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target?.result as string;
                if (!text) throw new Error("Datei ist leer.");

                const parsed = JSON.parse(text);
                const privateKey = parsed.privateKeyJwk || parsed;

                // Validate privateKeyJwk: checks for kty === "RSA" and existence of n and d
                if (!privateKey || privateKey.kty !== "RSA" || !privateKey.n || !privateKey.d) {
                    throw new Error("Ungültiges RSA-Schlüsselformat: kty muss 'RSA' sein und Komponenten 'n' & 'd' müssen existieren.");
                }

                // Update localStorage and sessionStorage
                const keyStr = JSON.stringify(privateKey);
                localStorage.setItem("tide_session_key", keyStr);
                sessionStorage.setItem("tide_session_key", keyStr);

                if (parsed.userId) {
                    localStorage.setItem("tide_user_id", parsed.userId);
                    sessionStorage.setItem("tide_user_id", parsed.userId);
                }
                if (parsed.email) {
                    localStorage.setItem("tide_user_email", parsed.email);
                    sessionStorage.setItem("tide_user_email", parsed.email);
                }
                if (parsed.publicKeySpki) {
                    localStorage.setItem("tide_user_public_key", parsed.publicKeySpki);
                    sessionStorage.setItem("tide_user_public_key", parsed.publicKeySpki);
                }

                setBackupStatus({
                    type: 'success',
                    msg: 'Schlüssel erfolgreich importiert! Die Seite wird neu geladen...'
                });

                setTimeout(() => {
                    window.location.reload();
                }, 1200);
            } catch (err: any) {
                console.error("Import Master Key failed:", err);
                setBackupStatus({
                    type: 'error',
                    msg: err?.message || 'Fehler beim Lesen oder Validieren der Schlüsseldatei.'
                });
            } finally {
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
            }
        };

        reader.onerror = () => {
            setBackupStatus({ type: 'error', msg: 'Fehler beim Lesen der Datei.' });
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        };

        reader.readAsText(file);
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
                                style={avatarStyleInput}
                                size={80}
                            />

                        </div>
                        <div className="flex-1 space-y-1">
                            <label className="text-xs font-semibold text-gray-500">Name</label>
                            <input
                                type="text"
                                value={nameInput}
                                onChange={e => setNameInput(e.target.value)}
                                className="w-full bg-transparent text-xl font-black text-gray-900 dark:text-white outline-none border-b border-gray-200 dark:border-white/10 focus:border-[#111827] dark:focus:border-white transition-colors pb-1"
                            />
                            <div className="pt-2">
                                <label className="text-xs font-semibold text-gray-500">Contact Email</label>
                                <div className="flex flex-col gap-2 mt-1">
                                    <input
                                        type="email"
                                        value={emailInput}
                                        onChange={e => setEmailInput(e.target.value)}
                                        className="w-full bg-transparent text-sm text-gray-900 dark:text-white outline-none border-b border-gray-200 dark:border-white/10 focus:border-[#111827] dark:focus:border-white transition-colors pb-1"
                                        placeholder="your@email.com"
                                    />
                                    <div className="flex items-center gap-2 mt-1">
                                        <input
                                            type="password"
                                            maxLength={5}
                                            placeholder="PIN"
                                            value={emailPinInput}
                                            onChange={e => setEmailPinInput(e.target.value.replace(/\D/g, ''))}
                                            className="w-20 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-[8px] px-2 py-1 text-xs text-center font-mono outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400"
                                        />
                                        <button
                                            onClick={handleUpdateEmail}
                                            className="px-3 py-1 bg-[#111827] hover:bg-[#2c2c2c] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 text-white text-[11px] font-semibold rounded-[8px] transition-all"
                                        >
                                            Change Email
                                        </button>
                                    </div>
                                    {emailStatus && (
                                        <p className={`text-[10px] font-bold ${emailStatus.type === 'success' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {emailStatus.msg}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Avatar Customization */}
                    <div className="space-y-4">
                        <div className="p-4 rounded-xl border border-dashed border-gray-200 dark:border-white/10 bg-white/50 dark:bg-black/10">
                            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 block">Avatar Style</label>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { id: 'notionists', label: 'Clean / Notion', desc: 'Minimal & Corporate' },
                                    { id: 'openPeeps', label: 'Hand-drawn / Peeps', desc: 'Artsy & Casual' }
                                ].map((style) => (
                                    <button
                                        key={style.id}
                                        onClick={() => setAvatarStyleInput(style.id as any)}
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
                                <input
                                    type="text"
                                    value={avatarSaltInput}
                                    onChange={e => setAvatarSaltInput(e.target.value)}
                                    placeholder="e.g. my-style-2026"
                                    className="flex-1 bg-white dark:bg-black/40 text-sm text-gray-900 dark:text-white outline-none border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 transition-colors rounded-lg px-3 py-2"
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
                    </div>

                    <div className="grid grid-cols-1 gap-4 pt-4 border-t border-gray-100 dark:border-white/10">
                        <div>
                            <label className="text-xs font-semibold text-gray-500">Title / Role</label>
                            <input
                                type="text"
                                value={titleInput}
                                onChange={e => setTitleInput(e.target.value)}
                                placeholder="e.g. also there"
                                className="w-full mt-1 bg-white dark:bg-black/40 text-sm text-gray-900 dark:text-white outline-none border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 transition-colors rounded-lg px-3 py-2"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500">Bio</label>
                            <textarea
                                value={bioInput}
                                onChange={e => setBioInput(e.target.value)}
                                placeholder="Write a short bio about yourself..."
                                rows={2}
                                className="w-full mt-1 bg-white dark:bg-black/40 text-sm text-gray-900 dark:text-white outline-none border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 transition-colors rounded-lg px-3 py-2 resize-none"
                            />
                        </div>

                        {/* Profile Visibility Toggle */}
                        <div className="flex items-center justify-between pt-2 pb-1 border-t border-gray-100 dark:border-white/10">
                            <div>
                                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Profile Visibility</label>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                    {profilePublic ? 'Others can discover you via search.' : 'Your profile is hidden — you won\'t appear in search results.'}
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

            <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Security</h3>
                <div className="space-y-4">
                    {/* Master-Key Vault Backup */}
                    <div className="p-6 rounded-2xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 space-y-4">
                        <div className="flex items-center gap-3 mb-2">
                            <Shield className="w-5 h-5 text-gray-400" />
                            <span className="font-semibold text-gray-900 dark:text-white">Master-Key Vault Backup</span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 text-[10px] font-bold uppercase ml-auto">
                                Zero Knowledge
                            </span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Sichere deinen privaten RSA-Master-Schlüssel als JSON-Datei. Bei einem Rechner- oder Browserwechsel kannst du deine Notizen damit sofort wiederherstellen.
                        </p>

                        {backupStatus && (
                            <div className={`p-3 rounded-xl text-xs font-semibold ${backupStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
                                {backupStatus.msg}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2.5 pt-1">
                            <button
                                type="button"
                                onClick={handleExportMasterKey}
                                className="inline-flex items-center gap-2 bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] h-[44px] px-4 font-semibold text-[14px] transition-all active:scale-95"
                            >
                                <Download className="w-4 h-4" />
                                <span>Schlüssel herunterladen (JSON)</span>
                            </button>

                            <button
                                type="button"
                                onClick={handleCopyMasterKey}
                                className="inline-flex items-center gap-2 px-4 h-[44px] bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 border border-[#e5e7eb] dark:border-zinc-700 rounded-[8px] text-[14px] font-semibold transition-all active:scale-95"
                            >
                                {copyFeedback ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                <span>{copyFeedback ? "Kopiert!" : "In Zwischenablage kopieren"}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="inline-flex items-center gap-2 px-4 h-[44px] bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 border border-[#e5e7eb] dark:border-zinc-700 rounded-[8px] text-[14px] font-semibold transition-all active:scale-95"
                            >
                                <Upload className="w-4 h-4" />
                                <span>Schlüssel importieren (JSON)</span>
                            </button>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json,application/json"
                                className="hidden"
                                onChange={handleImportMasterKey}
                            />
                        </div>
                    </div>

                    {/* PIN Setup */}
                    <div className="p-6 rounded-2xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 space-y-4">
                        <div className="flex items-center gap-3 mb-2">
                            <KeyRound className="w-5 h-5 text-gray-400" />
                            <span className="font-semibold text-gray-900 dark:text-white">PIN Setup</span>
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300 text-[10px] font-bold uppercase ml-auto">Local Encryption</span>
                        </div>
                        <p className="text-sm text-gray-500">Set a 5-digit PIN to secure local vault cache.</p>
                        <div className="flex gap-2">
                            <input
                                type="password"
                                maxLength={5}
                                placeholder="•••••"
                                className="w-32 bg-white dark:bg-black/40 border border-[#e5e7eb] dark:border-zinc-700 rounded-[8px] px-4 py-2 text-center tracking-[0.5em] font-mono outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 transition-colors"
                                value={pinInputValue}
                                onChange={(e) => setPinInputValue(e.target.value.replace(/[^0-9]/g, ''))}
                            />
                            <button className="bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] h-[44px] px-4 font-semibold text-[14px] transition-all active:scale-95">
                                Save PIN
                            </button>
                        </div>
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

            <div className="p-6 bg-white dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl mb-6">
                <div className="mb-4">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">Color Theme</h4>
                    <p className="text-xs text-gray-500 mt-1">Switch between light and dark modes.</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <button
                        onClick={() => setThemePreference('light')}
                        className={`flex flex-col items-center justify-center gap-2 px-4 py-3 rounded-[8px] border text-[11px] font-semibold transition-all ${themePreference === 'light'
                            ? 'bg-[#111827] border-[#111827] text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                            : 'bg-white dark:bg-white/5 border-[#e5e7eb] dark:border-zinc-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-zinc-700'
                            }`}
                    >
                        <Sun className="w-4 h-4" />
                        Light
                    </button>
                    <button
                        onClick={() => setThemePreference('system')}
                        className={`flex flex-col items-center justify-center gap-2 px-4 py-3 rounded-[8px] border text-[11px] font-semibold transition-all ${themePreference === 'system'
                            ? 'bg-[#111827] border-[#111827] text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                            : 'bg-white dark:bg-white/5 border-[#e5e7eb] dark:border-zinc-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-zinc-700'
                            }`}
                    >
                        <Settings className="w-4 h-4" />
                        Auto
                    </button>
                    <button
                        onClick={() => setThemePreference('dark')}
                        className={`flex flex-col items-center justify-center gap-2 px-4 py-3 rounded-[8px] border text-[11px] font-semibold transition-all ${themePreference === 'dark'
                            ? 'bg-[#111827] border-[#111827] text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                            : 'bg-white dark:bg-white/5 border-[#e5e7eb] dark:border-zinc-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-zinc-700'
                            }`}
                    >
                        <Moon className="w-4 h-4" />
                        Dark
                    </button>
                </div>
            </div>

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
                            className={`px-4 py-3 rounded-[8px] border text-xs font-semibold capitalize transition-all ${noteLayout === l
                                ? 'bg-[#111827] border-[#111827] text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                                : 'bg-white dark:bg-white/5 border-[#e5e7eb] dark:border-zinc-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-zinc-700'
                                }`}
                        >
                            {l.replace('-', ' ')}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-4 flex items-center justify-between bg-white dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-xl">
                <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">Language</h4>
                    <p className="text-xs text-gray-500 mt-1">Change the application language.</p>
                </div>
                <select 
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as 'en' | 'de')}
                    className="bg-gray-100 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none text-gray-900 dark:text-white"
                >
                    <option value="en">English</option>
                    <option value="de">Deutsch</option>
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
            <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl border border-[#e5e7eb] dark:border-zinc-800 mb-6">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">Store / Plugins</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Enable specialized modules to customize your workflow.</p>
            </div>

            {[
                { id: 'todos', title: 'Todos & Tasks', desc: 'Aufgabenverwaltung mit Fälligkeiten, Wiederholungen und Kalender-Synchronisation', version: 'v1.0.0', updated: 'Today', icon: ListTodo, color: 'text-indigo-500' },
                { id: 'job_planner', title: 'Job & Study Planner', desc: 'Arbeitszeiten, Stundenplan, Semester und Quick-Links verwalten', version: 'v1.0.0', updated: 'Today', icon: Briefcase, color: 'text-blue-500' },
                { id: 'finance', title: 'Finance Tracker', desc: 'Strict double-entry bookkeeping', version: 'v1.2.0', updated: 'Mar 1, 2026', icon: Blocks, color: 'text-emerald-500' },
                { id: 'messenger', title: 'Messenger', desc: 'Under Maintenance', version: 'v0.9.5-beta', updated: 'Mar 3, 2026', icon: User, color: 'text-gray-500 dark:text-slate-400', disabled: true },
                { id: 'summary', title: 'Daily Summary', desc: 'Duolingo-style daily recap & streaks', version: 'v2.0.1', updated: 'Feb 28, 2026', icon: Flame, color: 'text-orange-500' },
                { id: 'smart_island', title: 'Smart Island', desc: 'Context-aware sidebar assistant', version: 'v1.0.0', updated: 'Feb 26, 2026', icon: Sparkles, color: 'text-violet-500' },
                { id: 'smart_date_detection', title: 'Smart Date Detection', desc: 'Erkennt Datum + Uhrzeit beim Tippen und schlägt Termine vor', version: 'v1.0.0', updated: 'Today', icon: Sparkles, color: 'text-blue-500' },
                { id: 'references', title: 'References', desc: 'Auto-link definitions across notes', version: 'v1.0.0', updated: 'Today', icon: Bookmark, color: 'text-emerald-500' },
            ].map((ext) => (
                <div key={ext.id} className="p-4 flex flex-col bg-white dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-xl hover:border-gray-200 dark:hover:border-zinc-700 transition-colors">
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
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                                    {(ext as any).disabled ? (
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 text-[10px] font-bold uppercase tracking-wider">
                                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                                            {ext.desc}
                                        </span>
                                    ) : ext.desc}
                                </p>
                                <p className="text-[11px] text-gray-400">Last updated: {ext.updated}</p>
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 mt-1 shrink-0 ml-4">
                            <button
                                onClick={() => !(ext as any).disabled && onToggleExtension(ext.id, !enabledExtensions.includes(ext.id))}
                                disabled={(ext as any).disabled}
                                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${enabledExtensions.includes(ext.id) ? 'bg-[#111827] dark:bg-white' : 'bg-gray-200 dark:bg-gray-700'} ${(ext as any).disabled ? 'opacity-40 cursor-not-allowed grayscale' : 'cursor-pointer'}`}
                            >
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full ${enabledExtensions.includes(ext.id) ? 'bg-white dark:bg-zinc-900' : 'bg-white'} shadow transition duration-200 ${enabledExtensions.includes(ext.id) ? 'translate-x-5' : 'translate-x-0'}`}>
                                    {enabledExtensions.includes(ext.id) && <Check className="absolute inset-0 m-auto h-3 w-3 text-[#111827] dark:text-white" />}
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
                                            className="rounded border-gray-300 text-[#111827] focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 w-3 h-3 cursor-pointer"
                                        />
                                    </label>
                                    <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-white/5 px-2 py-1 rounded-md border border-gray-200 dark:border-white/10">
                                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Stil</span>
                                        <select
                                            value={displayMode}
                                            onChange={(e) => setDisplayMode(e.target.value as ReferenceDisplayMode)}
                                            className="text-[10px] font-semibold bg-transparent text-gray-800 dark:text-gray-200 outline-none cursor-pointer"
                                        >
                                            <option value="magic" className="bg-white dark:bg-zinc-900 text-gray-900 dark:text-white">Magisch (Verlauf)</option>
                                            <option value="underline-black" className="bg-white dark:bg-zinc-900 text-gray-900 dark:text-white">Unterstrichen (Schwarz)</option>
                                            <option value="underline-color" className="bg-white dark:bg-zinc-900 text-gray-900 dark:text-white">Unterstrichen (Farbig)</option>
                                            <option value="icon" className="bg-white dark:bg-zinc-900 text-gray-900 dark:text-white">Lesezeichen-Icon</option>
                                            <option value="emoji" className="bg-white dark:bg-zinc-900 text-gray-900 dark:text-white">Emoji</option>
                                        </select>
                                    </div>
                                    <button
                                        onClick={() => setShowDictionary(!showDictionary)}
                                        className="text-[10px] font-semibold text-[#111827] dark:text-white uppercase tracking-wide px-2 py-1 rounded-[8px] border border-[#e5e7eb] dark:border-zinc-700 hover:bg-[#f5f5f5] dark:hover:bg-zinc-800 transition-colors"
                                    >
                                        {showDictionary ? 'Hide Dictionary' : 'Manage Dictionary'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {ext.id === 'job_planner' && enabledExtensions.includes('job_planner') && (
                        <JobPlannerExtensionConfig groups={groups} />
                    )}

                    {ext.id === 'references' && enabledExtensions.includes('references') && (
                        <div className="w-full mt-4 pt-3 border-t border-gray-100 dark:border-white/5 space-y-3">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                        Darstellungsstil in Notizen
                                    </label>
                                    <span className="text-[11px] text-gray-400">
                                        {displayMode === 'magic' && 'Magisch (Verlauf)'}
                                        {displayMode === 'underline-black' && 'Unterstrichen (Schwarz)'}
                                        {displayMode === 'underline-color' && 'Unterstrichen (Farbig)'}
                                        {displayMode === 'icon' && 'Lesezeichen-Icon'}
                                        {displayMode === 'emoji' && 'Emoji'}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                                    {[
                                        { id: 'magic' as const, label: 'Magisch (Verlauf)', preview: <span className="font-semibold bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent">Beispiel</span> },
                                        { id: 'underline-black' as const, label: 'Unterstrichen (Schwarz)', preview: <span className="font-medium underline decoration-black dark:decoration-white decoration-2 underline-offset-2 text-gray-900 dark:text-white">Beispiel</span> },
                                        { id: 'underline-color' as const, label: 'Unterstrichen (Farbig)', preview: <span className="font-medium underline decoration-blue-500 decoration-2 underline-offset-2 text-blue-600 dark:text-blue-400">Beispiel</span> },
                                        { id: 'icon' as const, label: 'Lesezeichen-Icon', preview: <span className="inline-flex items-center gap-1 font-medium text-gray-900 dark:text-white"><Bookmark className="w-3 h-3 text-blue-500 inline fill-blue-500/20" />Beispiel</span> },
                                        { id: 'emoji' as const, label: 'Emoji', preview: <span className="inline-flex items-center gap-1 font-medium text-gray-900 dark:text-white"><span>🔖</span>Beispiel</span> },
                                    ].map((opt) => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => setDisplayMode(opt.id)}
                                            className={`p-2.5 rounded-[8px] border text-left flex flex-col justify-between transition-all ${
                                                displayMode === opt.id
                                                    ? 'bg-[#111827] border-[#111827] text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                                                    : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/20'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-bold truncate">{opt.label}</span>
                                                {displayMode === opt.id && <Check className="w-3.5 h-3.5 text-white dark:text-zinc-900 shrink-0" />}
                                            </div>
                                            <div className="text-[11px] py-1 px-1.5 rounded bg-white dark:bg-black/30 border border-gray-100 dark:border-white/5 truncate flex items-center justify-center">
                                                {opt.preview}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {ext.id === 'references' && showDictionary && enabledExtensions.includes('references') && (
                        <div className="w-full mt-4 pt-4 border-t border-gray-100 dark:border-white/5 animate-in slide-in-from-top-2">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Reference Dictionary ({references.length})</h4>
                                <button
                                    type="button"
                                    onClick={() => setIsAddingRef(!isAddingRef)}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#111827] dark:text-white hover:underline cursor-pointer"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    {isAddingRef ? 'Abbrechen' : 'Begriff hinzufügen'}
                                </button>
                            </div>

                            {isAddingRef && (
                                <div className="p-3 mb-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-[#e5e7eb] dark:border-zinc-700 space-y-3">
                                    <div className="text-xs font-bold text-[#111827] dark:text-white">Neuen Begriff hinzufügen</div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <input
                                            type="text"
                                            placeholder="Begriff (z.B. API, Docker...)"
                                            value={newRefTerm}
                                            onChange={(e) => setNewRefTerm(e.target.value)}
                                            className="bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Beschreibung / Vorschau (optional)"
                                            value={newRefPreview}
                                            onChange={(e) => setNewRefPreview(e.target.value)}
                                            className="bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400"
                                        />
                                    </div>

                                    {/* Color & Emoji selection */}
                                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] font-medium text-gray-500">Farbe:</span>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setNewRefColor(undefined)}
                                                    className={`w-5 h-5 rounded-full border text-[9px] flex items-center justify-center transition-all ${
                                                        !newRefColor ? 'border-gray-900 dark:border-white ring-2 ring-gray-900/30' : 'border-gray-300 dark:border-zinc-600'
                                                    }`}
                                                    title="Keine Farbe"
                                                >
                                                    ✕
                                                </button>
                                                {REFERENCE_PALETTE.map((c) => (
                                                    <button
                                                        key={c.value}
                                                        type="button"
                                                        onClick={() => setNewRefColor(c.value)}
                                                        className={`w-5 h-5 rounded-full transition-transform ${
                                                            newRefColor === c.value ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white scale-110' : 'hover:scale-105'
                                                        }`}
                                                        style={{ backgroundColor: c.value }}
                                                        title={c.label}
                                                    />
                                                ))}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] font-medium text-gray-500">Emoji:</span>
                                            <div className="flex items-center gap-1">
                                                {QUICK_EMOJIS.map((em) => (
                                                    <button
                                                        key={em}
                                                        type="button"
                                                        onClick={() => setNewRefEmoji(newRefEmoji === em ? '' : em)}
                                                        className={`w-6 h-6 rounded-md text-xs flex items-center justify-center transition-all ${
                                                            newRefEmoji === em
                                                                ? 'bg-gray-200 dark:bg-white/20 border border-gray-400'
                                                                : 'hover:bg-gray-100 dark:hover:bg-white/10'
                                                        }`}
                                                    >
                                                        {em}
                                                    </button>
                                                ))}
                                                <input
                                                    type="text"
                                                    maxLength={4}
                                                    placeholder="Emoji"
                                                    value={newRefEmoji}
                                                    onChange={(e) => setNewRefEmoji(e.target.value)}
                                                    className="w-12 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md px-1.5 py-0.5 text-xs text-center text-gray-900 dark:text-white outline-none"
                                                    title="Eigenes Emoji eingeben"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsAddingRef(false);
                                                setNewRefTerm('');
                                                setNewRefPreview('');
                                                setNewRefColor(undefined);
                                                setNewRefEmoji('');
                                            }}
                                            className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                        >
                                            Abbrechen
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleCreateRef}
                                            disabled={!newRefTerm.trim()}
                                            className="px-3 py-1 bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                        >
                                            Hinzufügen
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="max-h-[220px] overflow-y-auto space-y-2 pr-2">
                                {references.length === 0 ? (
                                    <p className="text-xs text-gray-400 italic">No references saved yet.</p>
                                ) : references.map(r => (
                                    <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5">
                                        {editRefId === r.id ? (
                                            <div className="p-2 rounded-lg bg-gray-50 dark:bg-white/5 border border-[#e5e7eb] dark:border-zinc-700 space-y-2 w-full">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        autoFocus
                                                        value={editRefTerm}
                                                        onChange={(e) => setEditRefTerm(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleSaveEditRef();
                                                            if (e.key === 'Escape') {
                                                                e.stopPropagation();
                                                                handleCancelEditRef();
                                                            }
                                                        }}
                                                        className="bg-white dark:bg-black/40 border border-[#e5e7eb] dark:border-zinc-700 focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 rounded px-2 py-1 text-sm font-bold text-gray-900 dark:text-white outline-none flex-1"
                                                        placeholder="Begriff..."
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={handleSaveEditRef}
                                                        className="px-2.5 py-1 bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] text-xs font-semibold transition-all"
                                                    >
                                                        Speichern
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleCancelEditRef}
                                                        className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                                    >
                                                        Abbrechen
                                                    </button>
                                                </div>

                                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-blue-200/60 dark:border-blue-800/60">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">Farbe:</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditRefColor(undefined)}
                                                            className={`w-4 h-4 rounded-full border text-[8px] flex items-center justify-center transition-all ${
                                                                !editRefColor ? 'border-blue-500 ring-2 ring-blue-500/30 font-bold' : 'border-gray-300 dark:border-zinc-600'
                                                            }`}
                                                            title="Keine Farbe"
                                                        >
                                                            ✕
                                                        </button>
                                                        {REFERENCE_PALETTE.map((c) => (
                                                            <button
                                                                key={c.value}
                                                                type="button"
                                                                onClick={() => setEditRefColor(c.value)}
                                                                className={`w-4 h-4 rounded-full transition-transform ${
                                                                    editRefColor === c.value ? 'ring-2 ring-offset-1 ring-blue-500 scale-110' : 'hover:scale-105'
                                                                }`}
                                                                style={{ backgroundColor: c.value }}
                                                                title={c.label}
                                                            />
                                                        ))}
                                                    </div>

                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">Emoji:</span>
                                                        {QUICK_EMOJIS.map((em) => (
                                                            <button
                                                                key={em}
                                                                type="button"
                                                                onClick={() => setEditRefEmoji(editRefEmoji === em ? '' : em)}
                                                                className={`w-5 h-5 rounded text-xs flex items-center justify-center transition-all ${
                                                                    editRefEmoji === em
                                                                        ? 'bg-blue-200 dark:bg-blue-800 border border-blue-500'
                                                                        : 'hover:bg-gray-100 dark:hover:bg-white/10'
                                                                }`}
                                                            >
                                                                {em}
                                                            </button>
                                                        ))}
                                                        <input
                                                            type="text"
                                                            maxLength={4}
                                                            placeholder="Emoji"
                                                            value={editRefEmoji}
                                                            onChange={(e) => setEditRefEmoji(e.target.value)}
                                                            className="w-10 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded px-1 py-0.5 text-xs text-center text-gray-900 dark:text-white outline-none"
                                                            title="Eigenes Emoji"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div
                                                    className="flex-1 min-w-0 mr-2 cursor-pointer group"
                                                    onClick={() => handleStartEditRef(r)}
                                                    title="Klicken zum Bearbeiten"
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        {r.color && (
                                                            <span
                                                                className="w-2.5 h-2.5 rounded-full inline-block shrink-0 ring-1 ring-black/10 dark:ring-white/20"
                                                                style={{ backgroundColor: r.color }}
                                                                title={`Farbe: ${r.color}`}
                                                            />
                                                        )}
                                                        {r.emoji && (
                                                            <span className="text-sm leading-none shrink-0" title={`Emoji: ${r.emoji}`}>
                                                                {r.emoji}
                                                            </span>
                                                        )}
                                                        <span className="text-sm font-bold text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                            {r.term}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-gray-500 truncate mt-0.5">{r.previewText || 'No custom preview generated'}</div>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleStartEditRef(r)}
                                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/20 rounded-md transition-colors"
                                                        title="Bearbeiten"
                                                    >
                                                        <Bookmark className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeReference(r.id)}
                                                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-md transition-colors"
                                                        title="Löschen"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </>
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
                    <div className="w-16 h-16 bg-[#111827] dark:bg-zinc-800 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg transform rotate-3">
                        <Globe className="text-white w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 dark:text-white">inside tide</h2>
                    <p className="text-gray-500 text-sm mt-1">E2E Encrypted Knowledge & Collaboration</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black/20 text-center">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Web Client</div>
                    <div className="font-mono text-sm font-bold text-gray-900 dark:text-white">v1.2.0-alpha</div>
                </div>
                <div className="p-4 rounded-xl border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black/20 text-center">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Cloud Node</div>
                    <div className="font-mono text-sm font-bold text-gray-900 dark:text-white">Go v1.3 Core</div>
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

    const handleCreateGroupLocal = async () => {
        if (!newGroupName.trim() || !onCreateGroup) return;
        await onCreateGroup(newGroupName.trim());
        setNewGroupName('');
    };

    const renderCalendarSettings = () => {
        const palette = calendarColorPalette;
        const overlap = calendarOverlapMode;

        const getDummyStyle = (color: string) => {
            let bg = '#7c3aed';
            let text = '#ffffff';
            
            if (palette === 'soft-pastels') {
                if (color === 'blue') { bg = '#E2E8F0'; text = '#1F2937'; }
                else if (color === 'pink') { bg = '#EDE9FE'; text = '#1F2937'; }
                else if (color === 'green') { bg = '#D1FAE5'; text = '#1F2937'; }
            } else if (palette === 'classic-tide') {
                if (color === 'blue') { bg = '#3B82F6'; text = '#FFFFFF'; }
                else if (color === 'pink') { bg = '#6366F1'; text = '#FFFFFF'; }
                else if (color === 'green') { bg = '#10B981'; text = '#FFFFFF'; }
            } else {
                if (color === 'blue') { bg = '#0284C7'; text = '#FFFFFF'; }
                else if (color === 'pink') { bg = '#7C3AED'; text = '#FFFFFF'; }
                else if (color === 'green') { bg = '#059669'; text = '#FFFFFF'; }
            }

            return {
                backgroundColor: bg,
                color: text,
                border: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
            };
        };

        let layout1, layout2, layout3;
        if (overlap === 'overlap') {
            layout1 = { left: '0%', width: '80%', top: '15px', height: '55px' };
            layout2 = { left: '15%', width: '70%', top: '40px', height: '55px' };
            layout3 = { left: '30%', width: '60%', top: '70px', height: '55px' };
        } else {
            layout1 = { left: '0%', width: '31%', top: '15px', height: '55px' };
            layout2 = { left: '33%', width: '31%', top: '40px', height: '55px' };
            layout3 = { left: '66%', width: '31%', top: '70px', height: '55px' };
        }

        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-6">
                        <div className="p-4 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl">
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Color Palette</h4>
                            <p className="text-xs text-gray-500 mb-3">Choose the appearance theme for calendar events.</p>
                            <div className="flex flex-col gap-2">
                                {[
                                    { id: 'modern-dark', label: 'Modern Dark', desc: 'Richer solid colors with white text' },
                                    { id: 'soft-pastels', label: 'Soft Pastels', desc: 'Pale backgrounds with dark text' },
                                    { id: 'classic-tide', label: 'Classic Tide', desc: 'Tide classic colors with white text' }
                                ].map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => setCalendarColorPalette(p.id as any)}
                                        className={`flex items-center justify-between p-3 rounded-[8px] border text-left transition-all ${palette === p.id
                                            ? 'bg-[#111827] border-[#111827] text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                                            : 'bg-white dark:bg-white/5 border-[#e5e7eb] dark:border-zinc-800 text-gray-600 dark:text-gray-400 hover:border-gray-200 dark:hover:border-zinc-700'
                                        }`}
                                    >
                                        <div>
                                            <div className={`text-sm font-semibold ${palette === p.id ? 'text-white dark:text-zinc-900' : 'text-gray-900 dark:text-white'}`}>{p.label}</div>
                                            <div className="text-[10px] opacity-80 mt-0.5">{p.desc}</div>
                                        </div>
                                        {palette === p.id && <Check className="w-4 h-4 shrink-0 text-white dark:text-zinc-900" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="p-4 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl">
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Event Arrangement</h4>
                            <p className="text-xs text-gray-500 mb-3">Decide how overlapping events are displayed.</p>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { id: 'stack', label: 'Side-by-Side', desc: 'Equal split width' },
                                    { id: 'overlap', label: 'Overlap / Stacking', desc: 'Layered cards' }
                                ].map((o) => (
                                    <button
                                        key={o.id}
                                        onClick={() => setCalendarOverlapMode(o.id as any)}
                                        className={`flex flex-col p-3 rounded-[8px] border text-left transition-all ${overlap === o.id
                                            ? 'bg-[#111827] border-[#111827] text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                                            : 'bg-white dark:bg-white/5 border-[#e5e7eb] dark:border-zinc-800 text-gray-600 dark:text-gray-400 hover:border-gray-200 dark:hover:border-zinc-700'
                                        }`}
                                    >
                                        <div className={`text-sm font-semibold ${overlap === o.id ? 'text-white dark:text-zinc-900' : 'text-gray-900 dark:text-white'}`}>{o.label}</div>
                                        <div className="text-[10px] opacity-80 mt-1">{o.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Darstellung von Terminen in Notizen */}
                        <div className="p-4 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl">
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Darstellung von Terminen in Notizen</h4>
                            <p className="text-xs text-gray-500 mb-3">Wähle, ob Termine in Notizen im einheitlichen Blau oder in der jeweiligen Kalenderfarbe hervorgehoben werden.</p>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { id: 'blue', label: 'Blau', desc: 'Einheitlicher blauer Stil' },
                                    { id: 'calendar', label: 'Kalenderfarbe', desc: 'Farbe der jeweiligen Kategorie' }
                                ].map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setEventMentionStyle(item.id as 'blue' | 'calendar')}
                                        className={`flex flex-col p-3 rounded-[8px] border text-left transition-all ${eventMentionStyle === item.id
                                            ? 'bg-[#111827] border-[#111827] text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                                            : 'bg-white dark:bg-white/5 border-[#e5e7eb] dark:border-zinc-800 text-gray-600 dark:text-gray-400 hover:border-gray-200 dark:hover:border-zinc-700'
                                        }`}
                                    >
                                        <div className={`text-sm font-semibold ${eventMentionStyle === item.id ? 'text-white dark:text-zinc-900' : 'text-gray-900 dark:text-white'}`}>{item.label}</div>
                                        <div className="text-[10px] opacity-80 mt-1">{item.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Vorschau anzeigen */}
                        <div className="p-4 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl">
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Vorschau anzeigen</h4>
                            <p className="text-xs text-gray-500 mb-3">Steuert die Terminvorschau: &apos;Immer&apos; bettet einen Terminkasten ein, &apos;Hovern&apos; zeigt einen Tooltip beim Überfahren, &apos;Aus&apos; zeigt nur den Textlink.</p>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { id: 'always', label: 'Immer', desc: 'Terminkasten' },
                                    { id: 'hover', label: 'Hovern', desc: 'Tooltip beim Überfahren' },
                                    { id: 'off', label: 'Aus', desc: 'Nur Textlink' }
                                ].map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setEventMentionPreview(item.id as 'always' | 'hover' | 'off')}
                                        className={`flex flex-col p-3 rounded-[8px] border text-left transition-all ${eventMentionPreview === item.id
                                            ? 'bg-[#111827] border-[#111827] text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                                            : 'bg-white dark:bg-white/5 border-[#e5e7eb] dark:border-zinc-800 text-gray-600 dark:text-gray-400 hover:border-gray-200 dark:hover:border-zinc-700'
                                        }`}
                                    >
                                        <div className={`text-sm font-semibold ${eventMentionPreview === item.id ? 'text-white dark:text-zinc-900' : 'text-gray-900 dark:text-white'}`}>{item.label}</div>
                                        <div className="text-[10px] opacity-80 mt-1">{item.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Public Holidays Section */}
                        <div className="p-4 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-0.5">Gesetzliche Feiertage</h4>
                                    <p className="text-xs text-gray-500">Feiertage im Kalender und in der Suche anzeigen.</p>
                                </div>
                                <button
                                    onClick={() => setCalendarHolidaysEnabled(!calendarHolidaysEnabled)}
                                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${calendarHolidaysEnabled ? 'bg-[#111827] dark:bg-white' : 'bg-gray-200 dark:bg-gray-700'}`}
                                >
                                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full ${calendarHolidaysEnabled ? 'bg-white dark:bg-zinc-900' : 'bg-white'} shadow transition duration-200 ${calendarHolidaysEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            {calendarHolidaysEnabled && (
                                <div className="pt-3 border-t border-gray-200/50 dark:border-white/5 flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Feiertagspaket (Land)</span>
                                    <select
                                        value={calendarHolidayPackage}
                                        onChange={(e) => setCalendarHolidayPackage(e.target.value as any)}
                                        className="bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1 text-xs font-bold text-gray-900 dark:text-white outline-none"
                                    >
                                        <option value="DE">Deutschland (DE)</option>
                                        <option value="AT">Österreich (AT)</option>
                                        <option value="CH">Schweiz (CH)</option>
                                        <option value="US">United States (US)</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col border border-gray-100 dark:border-white/5 rounded-2xl p-4 bg-gray-50/50 dark:bg-white/[0.02]">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Live Preview</h4>
                        <div className="relative border border-gray-200 dark:border-white/10 rounded-xl bg-white dark:bg-slate-900 h-[170px] overflow-hidden select-none mb-4">
                            <div className="absolute left-0 top-0 bottom-0 w-[45px] border-r border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black/10 flex flex-col justify-between py-3 text-[9px] text-gray-400 font-semibold px-2">
                                <span>09:00</span>
                                <span>10:00</span>
                                <span>11:00</span>
                            </div>
                            
                            <div className="absolute left-[45px] right-0 top-0 bottom-0">
                                <div className="absolute top-[15px] left-0 right-0 border-b border-dashed border-gray-100 dark:border-white/5" />
                                <div className="absolute top-[70px] left-0 right-0 border-b border-dashed border-gray-100 dark:border-white/5" />
                                
                                <div 
                                    className="absolute rounded-[8px] p-1.5 text-[9px] font-bold transition-all duration-300"
                                    style={{ ...layout1, ...getDummyStyle('blue') }}
                                >
                                    Meeting
                                    <div className="text-[7.5px] opacity-70 mt-0.5">09:00 - 10:30</div>
                                </div>
                                <div 
                                    className="absolute rounded-[8px] p-1.5 text-[9px] font-bold transition-all duration-300"
                                    style={{ ...layout2, ...getDummyStyle('pink') }}
                                >
                                    Vorlesung
                                    <div className="text-[7.5px] opacity-70 mt-0.5">09:30 - 11:00</div>
                                </div>
                                <div 
                                    className="absolute rounded-[8px] p-1.5 text-[9px] font-bold transition-all duration-300"
                                    style={{ ...layout3, ...getDummyStyle('green') }}
                                >
                                    Sport
                                    <div className="text-[7.5px] opacity-70 mt-0.5">10:15 - 11:45</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-gray-100 dark:border-white/5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Calendar Groups</h3>
                            <p className="text-xs text-gray-500 mt-0.5">Manage event categories and styles.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={newGroupName}
                                onChange={e => setNewGroupName(e.target.value)}
                                placeholder="New group name..."
                                className="bg-white dark:bg-black/40 text-xs text-gray-900 dark:text-white outline-none border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 transition-colors rounded-[8px] px-3 py-1.5 w-40"
                                onKeyDown={e => e.key === 'Enter' && handleCreateGroupLocal()}
                            />
                            <button
                                onClick={handleCreateGroupLocal}
                                className="p-1.5 bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] transition-colors"
                                title="Create Group"
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[220px] overflow-y-auto pr-1">
                        {groups.map(group => {
                            const isJobPlannerActive = enabledExtensions.includes('job_planner');
                            const plannerGroupId = useJobPlannerStore.getState().pluginGroupId;
                            const isProtected = isJobPlannerActive && Boolean(plannerGroupId && group.id === plannerGroupId);
                            return (
                                <GroupItem
                                    key={group.id}
                                    group={group}
                                    hiddenGroupIds={hiddenGroupIds}
                                    onToggleVisibility={onToggleGroupVisibility}
                                    onUpdate={onUpdateGroup}
                                    onShare={onShareGroup}
                                    onDelete={onDeleteGroup}
                                    isProtected={isProtected}
                                />
                            );
                        })}
                        {groups.length === 0 && (
                            <p className="text-xs text-gray-400 italic col-span-2 text-center py-4">No custom groups created yet.</p>
                        )}
                    </div>
                </div>
            </div>
        );
    };



    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center pointer-events-none p-4 sm:p-0">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-[#111827]/20 pointer-events-auto"
            />

            <motion.div
                layout
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="relative bg-white dark:bg-[#18181b] rounded-[24px] shadow-[0px_24px_64px_rgba(17,24,39,0.16)] overflow-hidden border border-[#e5e7eb] dark:border-zinc-800 flex flex-col pointer-events-auto w-full max-w-[900px] h-[85vh] sm:h-[650px]"
                onClick={e => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 h-[44px] w-[44px] rounded-[12px] bg-[#f9fafb] hover:bg-[#f3f4f6] dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-[#e5e7eb] dark:border-zinc-700 flex items-center justify-center text-[#111827] dark:text-zinc-200 cursor-pointer z-10 transition-colors"
                    aria-label="Close settings"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="flex flex-col sm:flex-row h-full">
                    {/* Permanent Sidebar Tab List */}
                    <div className="w-full sm:w-64 border-b sm:border-b-0 sm:border-r border-[#e5e7eb] dark:border-zinc-800 p-6 flex flex-col gap-2 bg-[#f9fafb] dark:bg-[#18181b]/50">
                        <div className="mb-8 px-2 hidden sm:block">
                            <h2 className="text-2xl font-semibold text-[#111827] dark:text-white">Settings</h2>
                        </div>

                        <div className="flex flex-row sm:flex-col overflow-x-auto sm:overflow-visible gap-2 pb-2 sm:pb-0 custom-scrollbar">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-[8px] transition-all whitespace-nowrap sm:whitespace-normal shrink-0 ${activeTab === tab.id ? 'bg-[#111827] text-white dark:bg-white dark:text-zinc-900 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-[#f5f5f5] dark:hover:bg-zinc-800 font-medium'}`}
                                >
                                    <tab.icon className="w-5 h-5 shrink-0" />
                                    <span className="font-medium text-sm">{tab.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-transparent">
                        <div className="p-8 pb-4 border-b border-[#e5e7eb] dark:border-zinc-800 hidden sm:block">
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
                                    {activeTab === 'calendar' && renderCalendarSettings()}
                                    {activeTab === 'appearance' && renderAppearance()}
                                    {activeTab === 'extensions' && renderExtensions()}
                                    {activeTab === 'access' && <APIAccessSettings />}
                                    {activeTab === 'info' && renderInfo()}
                                    {activeTab === 'debug' && <DebugPluginSettings />}
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
