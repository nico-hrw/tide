import { useState } from "react";
import {
    Plus,
    Archive,
    ChevronDown,
    Check,
    CheckSquare,
    Trash2,
    X,
} from "lucide-react";
import { useSafes } from "@/store/useDataStore";
import type { SidebarProps } from "./types";

export type QuickNotesProps = Partial<
    Pick<
        SidebarProps,
        | 'activeTabId'
        | 'enabledExtensions'
        | 'onOpenSocial'
        | 'onOpenExams'
        | 'onCreateFolder'
        | 'onNewNote'
    >
> & {
    onImport?: () => void;
};

const SidebarQuickNotes: React.FC<QuickNotesProps> = () => {
    const {
        availableSafes,
        activeSafes,
        setActiveSafes,
        toggleSafe,
        createSafe,
        deleteSafe,
    } = useSafes();

    const [isOpen, setIsOpen] = useState(false);
    const [isCreatingSafe, setIsCreatingSafe] = useState(false);
    const [newSafeName, setNewSafeName] = useState('');

    const safeLabel =
        activeSafes.length === 1
            ? activeSafes[0]
            : activeSafes.length > 1
            ? `${activeSafes.length} Safes aktiv`
            : 'Kein Safe';

    return (
        <div className="flex-shrink-0 pt-[max(0.75rem,calc(env(safe-area-inset-top)+8px))] pb-0">
            {/* Minimalist Archive / Safe full-width button */}
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="w-[calc(100%-1rem)] mx-2 mb-2 px-3 py-2 rounded-lg bg-[var(--hover-bg)] dark:bg-white/[0.05] border border-black/5 dark:border-white/5 flex items-center justify-between cursor-pointer select-none transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                title="Safe / Archiv wechseln"
            >
                <div className="flex items-center gap-2 min-w-0">
                    <Archive size={15} className="shrink-0 text-[var(--text-muted)]" />
                    <span className="text-xs font-semibold text-[var(--text-body)] truncate">
                        {safeLabel}
                    </span>
                </div>
                <ChevronDown
                    size={14}
                    className={`shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                    }`}
                />
            </button>

            {/* Inline collapsible safe list */}
            {isOpen && (
                <div className="mx-2 mb-2 p-1.5 rounded-lg bg-[var(--sidebar-bg)] border border-black/5 dark:border-white/5 space-y-1">
                    {/* List of safes */}
                    <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto no-scrollbar">
                        {availableSafes.map((safe) => {
                            const isActive = activeSafes.includes(safe);
                            return (
                                <div
                                    key={safe}
                                    className={`flex items-center justify-between px-2 py-1.5 rounded-lg group transition-colors ${
                                        isActive
                                            ? 'bg-blue-50/80 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium'
                                            : 'text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setActiveSafes([safe]);
                                            setIsOpen(false);
                                        }}
                                        className="flex items-center gap-2 flex-1 text-left truncate cursor-pointer min-w-0"
                                        title={`Zu "${safe}" wechseln`}
                                    >
                                        <Archive
                                            size={13}
                                            className={
                                                isActive
                                                    ? 'text-blue-500'
                                                    : 'text-[var(--text-muted)] group-hover:text-[var(--text-body)]'
                                            }
                                        />
                                        <span className="truncate text-xs">{safe}</span>
                                        {isActive && (
                                            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-normal shrink-0">
                                                aktiv
                                            </span>
                                        )}
                                    </button>

                                    <div className="flex items-center gap-1 shrink-0">
                                        {/* Toggle multi-select */}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleSafe(safe);
                                            }}
                                            className={`p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer ${
                                                isActive
                                                    ? 'text-blue-600 dark:text-blue-400'
                                                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                                            }`}
                                            title={
                                                isActive
                                                    ? 'Aus Ansicht entfernen'
                                                    : 'Zusammen laden'
                                            }
                                        >
                                            <CheckSquare
                                                size={13}
                                                className={
                                                    isActive
                                                        ? 'opacity-100'
                                                        : 'opacity-40 hover:opacity-80'
                                                }
                                            />
                                        </button>

                                        {/* Delete button for custom safe */}
                                        {safe !== 'main' &&
                                            safe !== 'Standard' &&
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

                    {/* Inline input to create a new safe */}
                    <div className="pt-1 border-t border-black/5 dark:border-white/5">
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
                                    className="w-full text-xs px-2 py-1 rounded-md bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 outline-none text-[var(--text-body)] placeholder:text-[var(--text-muted)]"
                                />
                                <button
                                    type="submit"
                                    className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded transition-colors cursor-pointer"
                                    title="Safe erstellen"
                                >
                                    <Check size={13} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsCreatingSafe(false);
                                        setNewSafeName('');
                                    }}
                                    className="p-1 text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors cursor-pointer"
                                    title="Abbrechen"
                                >
                                    <X size={13} />
                                </button>
                            </form>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setIsCreatingSafe(true)}
                                className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-body)] hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors cursor-pointer"
                            >
                                <Plus size={13} className="text-blue-500" />
                                <span>Neuer Safe</span>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SidebarQuickNotes;
