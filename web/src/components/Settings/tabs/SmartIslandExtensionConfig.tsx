import React from 'react';
import { Users, Info } from 'lucide-react';
import { useIslandSettingsStore } from '@/store/useIslandSettingsStore';

export interface SmartIslandExtensionConfigProps {
    isSocialEnabled: boolean;
}

export function SmartIslandExtensionConfig({ isSocialEnabled }: SmartIslandExtensionConfigProps) {
    const {
        expandOnNotification,
        setExpandOnNotification,
        notificationDurationSeconds,
        setNotificationDurationSeconds,
        messagePreviewMode,
        setMessagePreviewMode,
        fileShareDisplay,
        setFileShareDisplay,
        showNoteSharedText,
        setShowNoteSharedText,
    } = useIslandSettingsStore();

    return (
        <div className="w-full mt-4 pt-4 border-t border-gray-100 dark:border-white/5 space-y-4 animate-in slide-in-from-top-2">
            {/* Section 1: Island Allgemein */}
            <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Island Allgemein
                </label>
                <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200/60 dark:border-white/5">
                        <div className="pr-4">
                            <h5 className="text-xs font-bold text-gray-900 dark:text-white">Breitenausdehnung</h5>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                Island dehnt sich bei Benachrichtigungen nach rechts ins Fenster aus
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setExpandOnNotification(!expandOnNotification)}
                            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer ${
                                expandOnNotification ? 'bg-[#111827] dark:bg-white' : 'bg-gray-200 dark:bg-zinc-700'
                            }`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full ${
                                    expandOnNotification ? 'bg-white dark:bg-zinc-900' : 'bg-white'
                                } shadow transition duration-200 ${
                                    expandOnNotification ? 'translate-x-4' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200/60 dark:border-white/5">
                        <div className="pr-4">
                            <h5 className="text-xs font-bold text-gray-900 dark:text-white">Anzeigedauer</h5>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                Dauer der Benachrichtigungen in der Smart Island
                            </p>
                        </div>
                        <select
                            value={notificationDurationSeconds}
                            onChange={(e) => setNotificationDurationSeconds(Number(e.target.value))}
                            className="bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#111827] dark:focus:ring-zinc-400 cursor-pointer"
                        >
                            <option value={4}>4s</option>
                            <option value={6}>6s (Standard)</option>
                            <option value={8}>8s</option>
                            <option value={12}>12s</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Section 2: Social- & Chat-Integration */}
            <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Social- & Chat-Integration
                </label>
                {isSocialEnabled ? (
                    <div className="p-3.5 rounded-xl bg-gray-50/80 dark:bg-white/[0.03] border border-gray-200/70 dark:border-white/10 space-y-3.5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Users className="w-4 h-4 text-violet-500" />
                                <h5 className="text-xs font-bold text-gray-900 dark:text-white">
                                    Social Vorschau-Optionen
                                </h5>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-[10px] font-semibold flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                                Social Plugin aktiv
                            </span>
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                Nachrichtenvorschau
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {([
                                    { id: 'full' as const, label: 'Vollständige Nachricht' },
                                    { id: 'preview' as const, label: 'Kurze Vorschau' },
                                    { id: 'sender_only' as const, label: 'Nur Absender (Diskret)' },
                                ]).map(item => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setMessagePreviewMode(item.id)}
                                        className={`px-3 py-2 text-xs font-semibold rounded-[8px] border transition-all text-center ${
                                            messagePreviewMode === item.id
                                                ? 'bg-[#111827] border-[#111827] text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                                                : 'border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10'
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                Geteilte Notizen & Dateien
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {([
                                    { id: 'card' as const, label: 'Interaktive Aktionskarte' },
                                    { id: 'compact' as const, label: 'Kompakte Benachrichtigung' },
                                ]).map(item => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setFileShareDisplay(item.id)}
                                        className={`px-3 py-2 text-xs font-semibold rounded-[8px] border transition-all text-center ${
                                            fileShareDisplay === item.id
                                                ? 'bg-[#111827] border-[#111827] text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                                                : 'border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10'
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-white/5 border border-gray-200/60 dark:border-white/5">
                            <div className="pr-4">
                                <h5 className="text-xs font-bold text-gray-900 dark:text-white">Hinweistext bei Notizen</h5>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                    »[Absender] hat eine Notiz geteilt« als Text anzeigen
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowNoteSharedText(!showNoteSharedText)}
                                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer ${
                                    showNoteSharedText ? 'bg-[#111827] dark:bg-white' : 'bg-gray-200 dark:bg-zinc-700'
                                }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full ${
                                        showNoteSharedText ? 'bg-white dark:bg-zinc-900' : 'bg-white'
                                    } shadow transition duration-200 ${
                                        showNoteSharedText ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-start gap-3 p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 text-blue-900 dark:text-blue-200">
                        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                        <div className="text-xs">
                            <span className="font-semibold block mb-0.5">Social- & Chat-Integration</span>
                            <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                                Aktiviere das Social-Plugin, um erweiterte Chat- und Notizvorschau-Optionen für die Smart Island freizuschalten.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default SmartIslandExtensionConfig;
