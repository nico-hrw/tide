import React from 'react';
import { Sun, Settings, Moon, Check } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import type { NoteLayout } from '@/store/slices/types';

export interface AppearanceTabProps {
    noteLayout?: NoteLayout;
    onSetNoteLayout?: (layout: NoteLayout) => void;
}

export const AppearanceTab: React.FC<AppearanceTabProps> = ({
    noteLayout,
    onSetNoteLayout,
}) => {
    const { themePreference, setThemePreference, language, setLanguage, navigationMode, setNavigationMode } = useDataStore();

    return (
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

            <div className="p-6 bg-white dark:bg-black/20 border border-gray-100 dark:border-white/5 rounded-2xl mb-6 flex items-center justify-between gap-4">
                <div className="flex-1 pr-4">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">GoodNotes-Ordneransicht nutzen</h4>
                    <p className="text-xs text-gray-500 mt-1">Zeigt Ordner und Notizen übersichtlich auf der Startseite im GoodNotes-Stil an (Standard auf dem iPad).</p>
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
