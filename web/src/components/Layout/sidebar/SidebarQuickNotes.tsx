import { useEffect, useState, useRef } from "react";
import {
    Plus,
    FolderPlus,
    Users,
    Upload,
    GraduationCap,
    Archive,
    ChevronDown,
    Check,
    CheckSquare,
    Trash2,
    X,
} from "lucide-react";
import { useSocialStore } from "@/store/useSocialStore";
import { useSafes } from "@/store/useDataStore";
import type { SidebarProps } from "./types";

type QuickNotesProps = Pick<
    SidebarProps,
    | 'activeTabId'
    | 'enabledExtensions'
    | 'onOpenSocial'
    | 'onOpenExams'
    | 'onCreateFolder'
    | 'onNewNote'
> & {
    onImport: () => void;
};

export default function SidebarQuickNotes({
    activeTabId,
    enabledExtensions,
    onOpenSocial,
    onOpenExams,
    onCreateFolder,
    onNewNote,
    onImport,
}: QuickNotesProps) {
    const pendingRequests = useSocialStore((s) => s.pendingRequests);
    const fetchPendingRequests = useSocialStore((s) => s.fetchPendingRequests);
    const {
        availableSafes,
        activeSafes,
        setActiveSafes,
        toggleSafe,
        createSafe,
        deleteSafe,
    } = useSafes();

    const [isSafeDropdownOpen, setIsSafeDropdownOpen] = useState(false);
    const [isCreatingSafe, setIsCreatingSafe] = useState(false);
    const [newSafeName, setNewSafeName] = useState('');
    const safeDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchPendingRequests();
        const interval = setInterval(() => {
            fetchPendingRequests();
        }, 30000);
        return () => clearInterval(interval);
    }, [fetchPendingRequests]);

    useEffect(() => {
        if (!isSafeDropdownOpen) return;
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            if (
                safeDropdownRef.current &&
                !safeDropdownRef.current.contains(e.target as Node)
            ) {
                setIsSafeDropdownOpen(false);
                setIsCreatingSafe(false);
                setNewSafeName('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [isSafeDropdownOpen]);

    return (
        <>
            {/* Sticky top section: Navigation & Recent */}
            <div className="flex-shrink-0 p-2 pt-[max(1rem,calc(env(safe-area-inset-top)+8px))] pb-0">
                {/* Navigation Section */}
                <div className="mb-2 px-1 flex gap-1">
                    <button
                        onClick={() => onOpenSocial?.()}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius)] cursor-pointer interactive-hover transition-colors group relative ${
                            activeTabId === 'social'
                                ? 'bg-[#EBEBEB] dark:bg-white/10'
                                : 'hover:bg-[var(--hover-bg)]'
                        }`}
                    >
                        <div
                            className={`relative shrink-0 ${
                                activeTabId === 'social'
                                    ? 'text-blue-500'
                                    : 'text-[var(--text-muted)] group-hover:text-blue-500 transition-colors'
                            }`}
                        >
                            <Users size={16} />
                            {pendingRequests.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[var(--bg-panel)]" />
                            )}
                        </div>
                        <span
                            className={`text-[13px] font-medium flex-1 text-left ${
                                activeTabId === 'social'
                                    ? 'text-[var(--text-body)]'
                                    : 'text-[var(--text-muted)] group-hover:text-[var(--text-body)] transition-colors'
                            }`}
                        >
                            Social
                        </span>
                        {pendingRequests.length > 0 && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500 text-white shrink-0 leading-none">
                                {pendingRequests.length}
                            </span>
                        )}
                    </button>

                    {(!enabledExtensions ||
                        enabledExtensions.includes('job_planner')) && (
                        <button
                            onClick={() => onOpenExams?.()}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius)] cursor-pointer interactive-hover transition-colors group ${
                                activeTabId === 'job_planner' ||
                                activeTabId === 'exams'
                                    ? 'bg-[#EBEBEB] dark:bg-white/10'
                                    : 'hover:bg-[var(--hover-bg)]'
                            }`}
                        >
                            <div
                                className={`shrink-0 ${
                                    activeTabId === 'job_planner' ||
                                    activeTabId === 'exams'
                                        ? 'text-blue-500'
                                        : 'text-[var(--text-muted)] group-hover:text-blue-500 transition-colors'
                                }`}
                            >
                                <GraduationCap size={16} />
                            </div>
                            <span
                                className={`text-[13px] font-medium flex-1 text-left ${
                                    activeTabId === 'job_planner' ||
                                    activeTabId === 'exams'
                                        ? 'text-[var(--text-body)]'
                                        : 'text-[var(--text-muted)] group-hover:text-[var(--text-body)] transition-colors'
                                }`}
                            >
                                Job & Uni
                            </span>
                        </button>
                    )}
                </div>
            </div>
            {/* end sticky top section */}

            {/* Notes label with quick actions & Safe selector pill */}
            <div className="flex-shrink-0 px-2 pt-1 pb-1 flex items-center justify-between relative">
                <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[1.2px] text-gray-700 dark:text-slate-300 shrink-0">
                        Notes
                    </p>

                    {/* Safe Selector Pill */}
                    <div className="relative" ref={safeDropdownRef}>
                        <button
                            type="button"
                            onClick={() => setIsSafeDropdownOpen((o) => !o)}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer border ${
                                activeSafes.includes('Archiv') && activeSafes.length === 1
                                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                                    : activeSafes.length > 1
                                    ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 hover:bg-blue-500/20'
                                    : 'bg-black/5 dark:bg-white/5 text-gray-700 dark:text-gray-300 border-black/5 dark:border-white/5 hover:bg-black/10 dark:hover:bg-white/10'
                            }`}
                            title="Safe / Archiv wechseln"
                        >
                            <Archive size={11} className="shrink-0" />
                            <span className="truncate max-w-[85px]">
                                {activeSafes.length === 1
                                    ? activeSafes[0]
                                    : `${activeSafes.length} Safes`}
                            </span>
                            <ChevronDown
                                size={10}
                                className={`shrink-0 transition-transform duration-150 ${
                                    isSafeDropdownOpen ? 'rotate-180' : ''
                                }`}
                            />
                        </button>

                        {/* Minimal Dropdown */}
                        {isSafeDropdownOpen && (
                            <div className="absolute left-0 top-full mt-1.5 z-[9999] w-60 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-2xl p-2 text-xs animate-in fade-in zoom-in-95 duration-100">
                                <div className="flex items-center justify-between px-1.5 py-1 text-[10px] font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider border-b border-gray-100 dark:border-slate-800 pb-1.5 mb-1.5">
                                    <span>Safes / Archiv</span>
                                    {activeSafes.length > 1 && (
                                        <span className="text-[10px] lowercase font-normal px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded-md">
                                            kombiniert
                                        </span>
                                    )}
                                </div>

                                {/* List of Safes */}
                                <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto no-scrollbar">
                                    {availableSafes.map((safe) => {
                                        const isActive = activeSafes.includes(safe);
                                        return (
                                            <div
                                                key={safe}
                                                className={`flex items-center justify-between px-2 py-1.5 rounded-lg group transition-colors ${
                                                    isActive
                                                        ? 'bg-blue-50/80 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium'
                                                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800/80'
                                                }`}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setActiveSafes([safe]);
                                                        setIsSafeDropdownOpen(false);
                                                    }}
                                                    className="flex items-center gap-2 flex-1 text-left truncate cursor-pointer"
                                                    title={`Zu "${safe}" wechseln`}
                                                >
                                                    <Archive
                                                        size={13}
                                                        className={
                                                            isActive
                                                                ? 'text-blue-500'
                                                                : 'text-gray-400 group-hover:text-gray-600 dark:text-slate-500'
                                                        }
                                                    />
                                                    <span className="truncate">{safe}</span>
                                                </button>

                                                <div className="flex items-center gap-1 shrink-0">
                                                    {/* Toggle checkbox for "Zusammen laden" / multi-select */}
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleSafe(safe);
                                                        }}
                                                        className={`p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer ${
                                                            isActive
                                                                ? 'text-blue-600 dark:text-blue-400'
                                                                : 'text-gray-300 dark:text-slate-600 hover:text-gray-500'
                                                        }`}
                                                        title={
                                                            isActive
                                                                ? 'Aus Ansicht entfernen'
                                                                : 'Zusammen laden'
                                                        }
                                                    >
                                                        <CheckSquare
                                                            size={14}
                                                            className={
                                                                isActive
                                                                    ? 'opacity-100'
                                                                    : 'opacity-40 hover:opacity-80'
                                                            }
                                                        />
                                                    </button>

                                                    {/* Delete button for custom safe */}
                                                    {safe !== 'Standard' &&
                                                        safe !== 'Archiv' && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    deleteSafe(safe);
                                                                }}
                                                                className="p-1 rounded text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                                                                title={`Safe "${safe}" löschen`}
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Footer: + Neuer Safe */}
                                <div className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-slate-800">
                                    {isCreatingSafe ? (
                                        <form
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                if (newSafeName.trim()) {
                                                    createSafe(newSafeName.trim());
                                                    setNewSafeName('');
                                                    setIsCreatingSafe(false);
                                                }
                                            }}
                                            className="flex items-center gap-1"
                                        >
                                            <input
                                                type="text"
                                                value={newSafeName}
                                                onChange={(e) =>
                                                    setNewSafeName(e.target.value)
                                                }
                                                placeholder="Safe Name..."
                                                autoFocus
                                                className="w-full text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 outline-none text-gray-800 dark:text-gray-100 placeholder:text-gray-400"
                                            />
                                            <button
                                                type="submit"
                                                className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded transition-colors"
                                                title="Safe erstellen"
                                            >
                                                <Check size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsCreatingSafe(false);
                                                    setNewSafeName('');
                                                }}
                                                className="p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-colors"
                                                title="Abbrechen"
                                            >
                                                <X size={14} />
                                            </button>
                                        </form>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setIsCreatingSafe(true)}
                                            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
                                        >
                                            <Plus size={13} className="text-blue-500" />
                                            <span>Neuer Safe</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
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
