import React, { useState } from 'react';
import {
    Blocks,
    Bookmark,
    Briefcase,
    Check,
    Flame,
    ListTodo,
    Smartphone,
    Sparkles,
    User,
} from 'lucide-react';
import { useReferenceStore, ReferenceDisplayMode } from '@/store/useReferenceStore';
import { useMobileConnectionStore } from '@/store/useMobileConnectionStore';
import MobileConnectionSettings from '../MobileConnectionSettings';
import { JobPlannerExtensionConfig, JobPlannerExtensionConfigProps } from './JobPlannerExtensionConfig';
import { SmartIslandExtensionConfig, SmartIslandExtensionConfigProps } from './SmartIslandExtensionConfig';
import { ReferencesDictionary, REFERENCE_PALETTE, QUICK_EMOJIS } from './ReferencesDictionary';

export {
    JobPlannerExtensionConfig,
    SmartIslandExtensionConfig,
    ReferencesDictionary,
    REFERENCE_PALETTE,
    QUICK_EMOJIS,
};
export type { JobPlannerExtensionConfigProps, SmartIslandExtensionConfigProps };

export interface IntegrationsTabProps {
    enabledExtensions: string[];
    onToggleExtension: (extensionId: string, enabled: boolean) => void;
    groups?: { id: string; title: string; color?: string; effect?: string }[];
}

interface ExtensionItem {
    id: string;
    title: string;
    desc: string;
    version: string;
    updated: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    disabled?: boolean;
}

const EXTENSIONS: ExtensionItem[] = [
    { id: 'todos', title: 'Todos & Tasks', desc: 'Aufgabenverwaltung mit Fälligkeiten, Wiederholungen und Kalender-Synchronisation', version: 'v1.0.0', updated: 'Today', icon: ListTodo, color: 'text-indigo-500' },
    { id: 'job_planner', title: 'Job & Study Planner', desc: 'Arbeitszeiten, Stundenplan, Semester und Quick-Links verwalten', version: 'v1.0.0', updated: 'Today', icon: Briefcase, color: 'text-blue-500' },
    { id: 'finance', title: 'Finance Tracker', desc: 'Strict double-entry bookkeeping', version: 'v1.2.0', updated: 'Mar 1, 2026', icon: Blocks, color: 'text-emerald-500' },
    { id: 'messenger', title: 'Messenger', desc: 'Under Maintenance', version: 'v0.9.5-beta', updated: 'Mar 3, 2026', icon: User, color: 'text-gray-500 dark:text-slate-400', disabled: true },
    { id: 'summary', title: 'Daily Summary', desc: 'Duolingo-style daily recap & streaks', version: 'v2.0.1', updated: 'Feb 28, 2026', icon: Flame, color: 'text-orange-500' },
    { id: 'smart_island', title: 'Smart Island', desc: 'Context-aware sidebar assistant', version: 'v1.0.0', updated: 'Feb 26, 2026', icon: Sparkles, color: 'text-violet-500' },
    { id: 'smart_date_detection', title: 'Smart Date Detection', desc: 'Erkennt Datum + Uhrzeit beim Tippen und schlägt Termine vor', version: 'v1.0.0', updated: 'Today', icon: Sparkles, color: 'text-blue-500' },
    { id: 'references', title: 'References', desc: 'Auto-link definitions across notes', version: 'v1.0.0', updated: 'Today', icon: Bookmark, color: 'text-emerald-500' },
    {
        id: 'mobile_connection',
        title: 'Mobile Connection',
        desc: 'Verbindet Tide mit Whisper Hub für Push-Benachrichtigungen und Glance-Widgets auf deinem Smartphone.',
        version: 'v1.0.0',
        updated: 'Today',
        icon: Smartphone,
        color: 'text-sky-500',
    },
];

export const IntegrationsTab: React.FC<IntegrationsTabProps> = ({
    enabledExtensions,
    onToggleExtension,
    groups = [],
}) => {
    const autoScanEnabled = useReferenceStore((state) => state.autoScanEnabled);
    const displayMode = useReferenceStore((state) => state.displayMode);
    const setDisplayMode = useReferenceStore((state) => state.setDisplayMode);
    const [showDictionary, setShowDictionary] = useState(false);

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl border border-[#e5e7eb] dark:border-zinc-800 mb-6">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">Store / Plugins</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Enable specialized modules to customize your workflow.</p>
            </div>

            {EXTENSIONS.map((ext) => {
                const isEnabled = enabledExtensions.includes(ext.id);
                return (
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
                                        {ext.disabled ? (
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
                                    onClick={() => {
                                        if (ext.disabled) return;
                                        const willBeEnabled = !isEnabled;
                                        if (ext.id === 'mobile_connection') {
                                            useMobileConnectionStore.getState().setEnabled(willBeEnabled);
                                        }
                                        onToggleExtension(ext.id, willBeEnabled);
                                    }}
                                    disabled={ext.disabled}
                                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${isEnabled ? 'bg-[#111827] dark:bg-white' : 'bg-gray-200 dark:bg-gray-700'} ${ext.disabled ? 'opacity-40 cursor-not-allowed grayscale' : 'cursor-pointer'}`}
                                >
                                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full ${isEnabled ? 'bg-white dark:bg-zinc-900' : 'bg-white'} shadow transition duration-200 ${isEnabled ? 'translate-x-5' : 'translate-x-0'}`}>
                                        {isEnabled && <Check className="absolute inset-0 m-auto h-3 w-3 text-[#111827] dark:text-white" />}
                                    </span>
                                </button>

                                {ext.id === 'references' && isEnabled && (
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

                        {ext.id === 'smart_island' && isEnabled && (
                            <SmartIslandExtensionConfig isSocialEnabled={enabledExtensions.includes('social')} />
                        )}

                        {ext.id === 'job_planner' && isEnabled && (
                            <JobPlannerExtensionConfig groups={groups} />
                        )}

                        {ext.id === 'mobile_connection' && isEnabled && (
                            <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/10">
                                <MobileConnectionSettings />
                            </div>
                        )}

                        {ext.id === 'references' && isEnabled && (
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

                        {ext.id === 'references' && showDictionary && isEnabled && (
                            <ReferencesDictionary />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default IntegrationsTab;
