import { useEffect } from "react";
import { Plus, FolderPlus, Users, Upload, GraduationCap } from "lucide-react";
import { useSocialStore } from "@/store/useSocialStore";
import type { SidebarProps } from "./types";

type QuickNotesProps = Pick<SidebarProps, 'activeTabId' | 'enabledExtensions' | 'onOpenSocial' | 'onOpenExams' | 'onCreateFolder' | 'onNewNote'> & {
    onImport: () => void;
};

export default function SidebarQuickNotes({ activeTabId, enabledExtensions, onOpenSocial, onOpenExams, onCreateFolder, onNewNote, onImport }: QuickNotesProps) {
    const pendingRequests = useSocialStore(s => s.pendingRequests);
    const fetchPendingRequests = useSocialStore(s => s.fetchPendingRequests);

    useEffect(() => {
        fetchPendingRequests();
        const interval = setInterval(() => {
            fetchPendingRequests();
        }, 30000);
        return () => clearInterval(interval);
    }, [fetchPendingRequests]);

    return (
        <>
            {/* Sticky top section: Navigation & Recent */}
            <div className="flex-shrink-0 p-2 pt-[max(1rem,calc(env(safe-area-inset-top)+8px))] pb-0">
                {/* Navigation Section */}
                <div className="mb-2 px-1 flex gap-1">
                    <button
                        onClick={() => onOpenSocial?.()}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius)] cursor-pointer interactive-hover transition-colors group relative ${activeTabId === 'social' ? 'bg-[#EBEBEB] dark:bg-white/10' : 'hover:bg-[var(--hover-bg)]'}`}
                    >
                        <div className={`relative shrink-0 ${activeTabId === 'social' ? 'text-blue-500' : 'text-[var(--text-muted)] group-hover:text-blue-500 transition-colors'}`}>
                            <Users size={16} />
                            {pendingRequests.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[var(--bg-panel)]" />
                            )}
                        </div>
                        <span className={`text-[13px] font-medium flex-1 text-left ${activeTabId === 'social' ? 'text-[var(--text-body)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-body)] transition-colors'}`}>
                            Social
                        </span>
                        {pendingRequests.length > 0 && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500 text-white shrink-0 leading-none">
                                {pendingRequests.length}
                            </span>
                        )}
                    </button>

                    {(!enabledExtensions || enabledExtensions.includes('job_planner')) && (
                        <button
                            onClick={() => onOpenExams?.()}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius)] cursor-pointer interactive-hover transition-colors group ${activeTabId === 'job_planner' || activeTabId === 'exams' ? 'bg-[#EBEBEB] dark:bg-white/10' : 'hover:bg-[var(--hover-bg)]'}`}
                        >
                            <div className={`shrink-0 ${activeTabId === 'job_planner' || activeTabId === 'exams' ? 'text-blue-500' : 'text-[var(--text-muted)] group-hover:text-blue-500 transition-colors'}`}>
                                <GraduationCap size={16} />
                            </div>
                            <span className={`text-[13px] font-medium flex-1 text-left ${activeTabId === 'job_planner' || activeTabId === 'exams' ? 'text-[var(--text-body)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-body)] transition-colors'}`}>
                                Job & Uni
                            </span>
                        </button>
                    )}

                </div>
            </div>{/* end sticky top section */}

            {/* Notes label with quick actions */}
            <div className="flex-shrink-0 px-2 pt-1 pb-1 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[1.2px] text-gray-700 dark:text-slate-300">
                    Notes
                </p>
                <div className="flex items-center gap-0.5">
                    <button
                        onClick={() => onImport()}
                        className="p-1 rounded-md text-gray-400 hover:text-gray-900 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Notiz oder Bundle importieren (.tide.json, .md)"
                    >
                        <Upload size={13} />
                    </button>
                    <button
                        onClick={() => onCreateFolder?.(null)}
                        className="p-1 rounded-md text-gray-400 hover:text-gray-900 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Neuer Ordner"
                    >
                        <FolderPlus size={13} />
                    </button>
                    <button
                        onClick={() => onNewNote(null)}
                        className="p-1 rounded-md text-gray-400 hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Neue Notiz"
                    >
                        <Plus size={14} />
                    </button>
                </div>
            </div>
        </>
    );
}
