import React from 'react';
import { Sparkles, BarChart3, ShieldCheck } from 'lucide-react';
import { useSurveyStore } from '@/store/useSurveyStore';

export interface SurveysExtensionConfigProps {
    onNavigateToSurveys?: () => void;
}

export function SurveysExtensionConfig({ onNavigateToSurveys }: SurveysExtensionConfigProps) {
    const {
        isMoodTrackerEnabled,
        setMoodTrackerEnabled,
        setIsPopupOpen,
        responses,
    } = useSurveyStore();

    return (
        <div className="w-full mt-4 pt-4 border-t border-gray-100 dark:border-white/5 space-y-4 animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200/60 dark:border-white/5">
                <div className="pr-4">
                    <h5 className="text-xs font-bold text-gray-900 dark:text-white">Mood-Tracker (4x täglich)</h5>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Zeigt 4-mal am Tag ein Stimmungs-Popup zur Reflexion und synchronisiert die Daten über alle Geräte.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setMoodTrackerEnabled(!isMoodTrackerEnabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 cursor-pointer ${
                        isMoodTrackerEnabled ? 'bg-[#111827] dark:bg-white' : 'bg-gray-200 dark:bg-zinc-700'
                    }`}
                >
                    <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full ${
                            isMoodTrackerEnabled ? 'bg-white dark:bg-zinc-900' : 'bg-white'
                        } shadow transition duration-200 ${
                            isMoodTrackerEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                    />
                </button>
            </div>

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => setIsPopupOpen(true)}
                    className="px-3 py-2 text-xs font-semibold rounded-[8px] border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-all text-center flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Test-Popup öffnen
                </button>
                <button
                    type="button"
                    onClick={() => onNavigateToSurveys?.()}
                    className="px-3 py-2 text-xs font-semibold rounded-[8px] border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-all text-center flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                    <BarChart3 className="w-3.5 h-3.5 text-blue-500" />
                    Analyse öffnen
                </button>
            </div>

            <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200/60 dark:border-white/5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">Erfasste Einträge</span>
                    <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
                        {responses.length} {responses.length === 1 ? 'Eintrag' : 'Einträge'}
                    </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-gray-200/50 dark:border-white/5">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">Synchronisation</span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        E2EE Cloud-Synchronisation aktiv
                    </span>
                </div>
            </div>
        </div>
    );
}

export default SurveysExtensionConfig;
