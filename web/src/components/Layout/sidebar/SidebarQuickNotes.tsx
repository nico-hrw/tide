import { useMemo, useState } from "react";
import {
    Plus,
    Archive,
    ChevronDown,
    Check,
    CheckSquare,
    Trash2,
    X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSafes, useDataStore } from "@/store/useDataStore";
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
    className?: string;
    /** Mobile: nur eine kleine Pille, die Liste öffnet sich als Popover nach rechts unten. */
    compact?: boolean;
};

const SidebarQuickNotes: React.FC<QuickNotesProps> = ({ className, compact = false }) => {
    const {
        availableSafes,
        activeSafes,
        setActiveSafes,
        toggleSafe,
        createSafe,
        deleteSafe,
    } = useSafes();
    const notes = useDataStore((s) => s.notes);

    // Alle Workspaces: die gespeicherte Liste plus alle, die an Notizen hängen (z. B. von anderen Geräten).
    const allSafes = useMemo(() => {
        const set = new Set<string>(['main', ...availableSafes]);
        notes.forEach((n) => {
            const s = n.safe || (n.metadata as { safe?: string } | undefined)?.safe;
            if (s) set.add(s === 'Standard' ? 'main' : s);
        });
        return Array.from(set);
    }, [availableSafes, notes]);

    const [isOpen, setIsOpen] = useState(false);
    const [isCreatingSafe, setIsCreatingSafe] = useState(false);
    const [newSafeName, setNewSafeName] = useState('');

    const safeLabel =
        activeSafes.length === 1
            ? activeSafes[0]
            : activeSafes.length > 1
            ? `${activeSafes.length} Workspaces aktiv`
            : 'Kein Workspace';

    const toggleButton = compact ? (
        <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="flex items-center gap-1 px-1 py-1.5 bg-transparent text-t2-ink-2 text-[13px] font-semibold cursor-pointer select-none max-w-[12rem]"
            title="Workspace wechseln"
            aria-expanded={isOpen}
        >
            <Archive size={14} className="shrink-0 text-t2-ink-3" />
            <span className="truncate">{safeLabel}</span>
            <ChevronDown size={14} className={`shrink-0 text-t2-ink-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
    ) : (
        <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="w-[calc(100%-1rem)] mx-2 mb-2 px-3 py-2 rounded-lg bg-t2-hover border border-t2-line  flex items-center justify-between cursor-pointer select-none transition-colors hover:bg-t2-hover "
            title="Workspace wechseln"
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
    );

    return (
        <div className={compact ? 'relative shrink-0' : (className || "flex-shrink-0 pt-[max(0.75rem,calc(env(safe-area-inset-top)+8px))] pb-0")}>
            {toggleButton}

            {/* Safe list: inline in der Seitenleiste, als Popover in der kompakten Variante */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                        className={compact
                            ? 'absolute right-0 top-full z-50 mt-2 w-60 p-1.5 rounded-2xl bg-[var(--sidebar-bg)] border border-t2-line  shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)] space-y-0.5 overflow-hidden'
                            : 'mx-2 mb-2 p-1.5 rounded-lg bg-[var(--sidebar-bg)] border border-t2-line  space-y-1 overflow-hidden'}
                    >
                        {/* List of safes */}
                        <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto no-scrollbar">
                            {allSafes.map((safe, idx) => {
                                const isActive = activeSafes.includes(safe);
                                return (
                                    <motion.div
                                        key={safe}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{
                                            type: 'spring',
                                            stiffness: 350,
                                            damping: 40,
                                            mass: 0.8,
                                            delay: idx * 0.03,
                                        }}
                                        className={`flex items-center justify-between px-2 py-1.5 rounded-lg group transition-colors ${
                                            isActive
                                                ? 'bg-t2-sub  text-t2-accent  font-medium'
                                                : 'text-t2-ink  hover:bg-t2-hover '
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
                                                        ? 'text-t2-accent'
                                                        : 'text-[var(--text-muted)] group-hover:text-[var(--text-body)]'
                                                }
                                            />
                                            <span className="truncate text-xs">{safe}</span>
                                            {isActive && (
                                                <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded bg-t2-sub  text-t2-accent  font-normal shrink-0">
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
                                                className={`p-1 rounded hover:bg-t2-hover  transition-colors cursor-pointer ${
                                                    isActive
                                                        ? 'text-t2-accent '
                                                        : 'text-t2-ink-3  hover:text-t2-ink-2 '
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
                                                        className="p-1 rounded text-t2-ink-3 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                                                        title={`Workspace "${safe}" löschen`}
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>

                        {/* Inline input to create a new safe */}
                        <div className="pt-1 border-t border-t2-line ">
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
                                        placeholder="Workspace Name..."
                                        autoFocus
                                        className="w-full text-xs px-2 py-1 rounded-md bg-t2-hover  border border-t2-line  outline-none text-[var(--text-body)] placeholder:text-[var(--text-muted)]"
                                    />
                                    <button
                                        type="submit"
                                        className="p-1 text-t2-accent hover:bg-t2-sub  rounded transition-colors cursor-pointer"
                                        title="Workspace erstellen"
                                    >
                                        <Check size={13} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsCreatingSafe(false);
                                            setNewSafeName('');
                                        }}
                                        className="p-1 text-t2-ink-3 hover:bg-t2-hover  rounded transition-colors cursor-pointer"
                                        title="Abbrechen"
                                    >
                                        <X size={13} />
                                    </button>
                                </form>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setIsCreatingSafe(true)}
                                    className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-body)] hover:bg-t2-hover  rounded-md transition-colors cursor-pointer"
                                >
                                    <Plus size={13} className="text-t2-accent" />
                                    <span>Neuer Workspace</span>
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SidebarQuickNotes;
