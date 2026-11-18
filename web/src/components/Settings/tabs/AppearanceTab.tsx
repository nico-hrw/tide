import React from 'react';
import { Sun, Settings, Moon, Check } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import type { NoteLayout } from '@/store/slices/types';
import { useAnimatedEmojiEnabled, setAnimatedEmojiEnabled } from '@/lib/animatedEmoji';
import { PALETTES } from '@/lib/palette';
import { PALETTE_PREVIEW } from '@/lib/designTokens';

export interface AppearanceTabProps {
    noteLayout?: NoteLayout;
    onSetNoteLayout?: (layout: NoteLayout) => void;
}

export const AppearanceTab: React.FC<AppearanceTabProps> = ({
    noteLayout,
    onSetNoteLayout,
}) => {
    const { themePreference, setThemePreference, appPalette, setAppPalette, theme, language, setLanguage, navigationMode, setNavigationMode } = useDataStore();
    const animatedEmoji = useAnimatedEmojiEnabled();

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Interface Options</h3>

            <div className="p-6 bg-white dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl mb-6 flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">Animierte Emojis</h4>
                    <p className="text-xs text-gray-500 mt-1">Spielt die Animation bei Hover und alle 20 Sekunden ab.</p>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={animatedEmoji}
                    aria-label="Animierte Emojis"
                    onClick={() => setAnimatedEmojiEnabled(!animatedEmoji)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${animatedEmoji ? 'bg-gray-900 dark:bg-white' : 'bg-gray-300 dark:bg-zinc-700'}`}
                >
                    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white dark:bg-zinc-900 shadow transition-transform ${animatedEmoji ? 'translate-x-5' : ''}`} />
                </button>
            </div>

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

            <div className="p-6 bg-t2-surface border border-t2-line rounded-2xl mb-6">
                <div className="mb-4">
                    <h4 className="text-sm font-bold text-t2-ink">Farbpalette</h4>
                    <p className="text-xs text-t2-ink-2 mt-1">Bestimmt Hintergründe, Linien und die Akzentfarbe der ganzen App. Termin-Farben stellst du im Kalender ein.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Farbpalette">
                    {PALETTES.map((p) => {
                        const active = appPalette === p.id;
                        const chips = PALETTE_PREVIEW[p.id][theme === 'dark' ? 'dark' : 'light'];
                        return (
                            <button
                                key={p.id}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                onClick={() => setAppPalette(p.id)}
                                className={`flex flex-col gap-3 rounded-[12px] border p-3 text-left transition-colors ${active ? 'border-t2-ink bg-t2-sub' : 'border-t2-line hover:bg-t2-hover'}`}
                            >
                                <span className="flex overflow-hidden rounded-[8px] ring-1 ring-t2-line" aria-hidden>
                                    {chips.map((c, i) => (
                                        <span key={i} className="h-8 flex-1" style={{ backgroundColor: c }} />
                                    ))}
                                </span>
                                <span>
                                    <span className="flex items-center justify-between text-[13px] font-semibold text-t2-ink">
                                        {p.label}
                                        {active && <Check className="h-3.5 w-3.5" />}
                                    </span>
                                    <span className="block text-[11px] text-t2-ink-2">{p.desc}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="p-6 bg-white dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl mb-6 flex items-center justify-between gap-4">
                <div className="flex-1 pr-4">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">Tablet-Mode nutzen</h4>
                    <p className="text-xs text-gray-500 mt-1">Zeigt Ordner und Notizen übersichtlich auf der Startseite im Tablet-Modus an (Standard auf dem iPad).</p>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={navigationMode === 'folders'}
                    onClick={() => {
                        const nextMode = navigationMode === 'folders' ? 'sidebar' : 'folders';
                        if (typeof window !== 'undefined') {
                            try {
                                localStorage.setItem('tide_navigation_mode', nextMode);
                            } catch (e) {
                                console.warn('Failed to save navigation mode to localStorage', e);
                            }
                        }
                        setNavigationMode(nextMode);
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none cursor-pointer ${
                        navigationMode === 'folders' ? 'bg-[#111827] dark:bg-white' : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                >
                    <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full ${
                            navigationMode === 'folders' ? 'bg-white dark:bg-zinc-900' : 'bg-white'
                        } shadow transition duration-200 ${
                            navigationMode === 'folders' ? 'translate-x-5' : 'translate-x-0'
                        }`}
                    >
                        {navigationMode === 'folders' && (
                            <Check className="absolute inset-0 m-auto h-3 w-3 text-[#111827] dark:text-white" />
                        )}
                    </span>
                </button>
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
};

export default AppearanceTab;
