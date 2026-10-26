import React from 'react';
import { useJobPlannerStore } from '@/store/useJobPlannerStore';

export interface JobPlannerExtensionConfigProps {
    groups?: { id: string; title: string; color?: string; effect?: string }[];
}

export function JobPlannerExtensionConfig({ groups }: JobPlannerExtensionConfigProps) {
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

export default JobPlannerExtensionConfig;
