import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { announceSidebarDropdown, onOtherSidebarDropdown } from "@/lib/sidebarDropdown";
import { WorkspaceContextMenu, type WorkspaceMenuState } from "./WorkspaceContextMenu";
import { normalizeSafe } from "@/lib/todoSafes";
import { workspaceTone } from "@/lib/workspaceColor";
import { workspaceBadgeText } from "@/lib/workspaceBadge";
import { usePopupTimer } from "@/hooks/usePopupTimer";
import { PopupTimerBar } from "@/components/Popup/PopupTimerBar";
import {
    Plus,
    Archive,
    Layers,
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
    const safeIcons = useDataStore((s) => s.safeIcons);

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
    useEffect(() => (compact ? onOtherSidebarDropdown('workspaces', () => setIsOpen(false)) : undefined), [compact]);
    const rootRef = useRef<HTMLDivElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const [ctxMenu, setCtxMenu] = useState<WorkspaceMenuState | null>(null);
    // Compact (sidebar row): the list closes when the mouse stays away from it and the row (the bar on top shows the time);
    // it holds while a context menu of a workspace is open.
    const { fillRef, restRef } = usePopupTimer({
        refs: [rootRef, popRef],
        enabled: compact && isOpen && !ctxMenu,
        onExpire: () => setIsOpen(false),
    });
    const [listPos, setListPos] = useState<{ top: number; left: number } | null>(null);
    const defaultSafe = useDataStore((s) => s.defaultSafe);
    const setDefaultSafe = useDataStore((s) => s.setDefaultSafe);
    const closeCtxMenu = useCallback(() => setCtxMenu(null), []);
    const tasks = useDataStore((s) => s.tasks);
    const events = useDataStore((s) => s.events);
    const tasksInSafe = (safe: string) => tasks.filter((t) => normalizeSafe(t.safe || 'main') === safe).length;
    const eventsInSafe = (safe: string) => events.filter((e) => normalizeSafe(e.safe || 'main') === safe).length;
    const [isCreatingSafe, setIsCreatingSafe] = useState(false);
    const [newSafeName, setNewSafeName] = useState('');

    const displayName = (s: string) => (s === 'main' ? 'Standard' : s);
    const safeLabel =
        activeSafes.length === 1
            ? displayName(activeSafes[0])
            : activeSafes.length > 1
            ? `${activeSafes.length} Workspaces aktiv`
            : 'Kein Workspace';

    const toggleButton = compact ? (
        <button
            type="button"
            onClick={(e) => {
                if (!isOpen) {
                    const r = e.currentTarget.getBoundingClientRect();
                    const left = typeof window !== 'undefined' ? Math.max(8, Math.min(r.right + 8, window.innerWidth - 268)) : r.right + 8;
                    const top = typeof window !== 'undefined' ? Math.max(8, Math.min(r.bottom + 6, window.innerHeight - 320)) : r.top;
                    setListPos({ top, left });
                    announceSidebarDropdown('workspaces');
                }
                setIsOpen((prev) => !prev);
            }}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left text-[14px] text-t2-ink-2 transition-colors hover:bg-t2-hover cursor-pointer select-none"
            title="Workspace wechseln"
            aria-expanded={isOpen}
        >
            <Layers size={16} className="shrink-0 text-t2-ink-3" aria-hidden="true" />
            <span className="flex-1 truncate">{safeLabel}</span>
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
        <div
            ref={rootRef}
            className={compact ? 'relative w-full px-2' :(className ||"flex-shrink-0 pt-[max(0.75rem,calc(env(safe-area-inset-top)+8px))] pb-0")}>
            {toggleButton}
            {ctxMenu && (
                <WorkspaceContextMenu
                    menu={ctxMenu}
                    isActive={activeSafes.includes(ctxMenu.safe)}
                    isDefault={defaultSafe === ctxMenu.safe}
                    onClose={closeCtxMenu}
                    onShowOnly={() => setActiveSafes([ctxMenu.safe])}
                    onToggle={() => toggleSafe(ctxMenu.safe)}
                    onSetDefault={() => setDefaultSafe(defaultSafe === ctxMenu.safe ? null : ctxMenu.safe)}
                    onDelete={() => {
                        // Todos and events have no move-to-standard yet: keep them visible by refusing the delete.
                        const inUse = tasksInSafe(ctxMenu.safe) + eventsInSafe(ctxMenu.safe);
                        if (inUse > 0) {
                        // Native dialog until the app has its own confirm for workspaces.
                        // eslint-disable-next-line no-alert
                            window.alert(`„${displayName(ctxMenu.safe)}“ enthält noch ${inUse} Todos oder Termine. Verschiebe sie zuerst in einen anderen Workspace.`);
                            return;
                        }
                        // Native dialog until the app has its own confirm for workspaces.
                        // eslint-disable-next-line no-alert
                        if (window.confirm(`Workspace „${displayName(ctxMenu.safe)}“ löschen? Seine Notizen wandern nach Standard.`)) deleteSafe(ctxMenu.safe);
                    }}
                />
            )}

            {/* Safe list: inline in der Seitenleiste, als Popover in der kompakten Variante */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        ref={popRef}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                        style={compact && listPos ? { top: listPos.top, left: listPos.left } : undefined}
                        className={compact
                            ? 'fixed z-[700] w-[260px] p-1.5 pt-3 rounded-2xl bg-[var(--sidebar-bg)] border border-t2-line  shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)] space-y-0.5 overflow-hidden'
                            : 'mx-2 mb-2 p-1.5 rounded-lg bg-[var(--sidebar-bg)] border border-t2-line  space-y-1 overflow-hidden'}
                    >
                        {compact && <PopupTimerBar fillRef={fillRef} restRef={restRef} />}
                        {/* List of safes */}
                        <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto no-scrollbar">
                            {allSafes.map((safe, idx) => {
                                const isActive = activeSafes.includes(safe);
                                return (
                                    <motion.div
                                        key={safe}
                                        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ safe, x: e.clientX, y: e.clientY }); }}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{
                                            type: 'spring',
                                            stiffness: 350,
                                            damping: 40,
                                            mass: 0.8,
                                            delay: idx * 0.03,
                                        }}
                                        className={`flex h-9 items-center justify-between px-2 rounded-lg group transition-colors ${
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
                                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold" style={{ background: workspaceTone(safe).bg, color: workspaceTone(safe).ink }} aria-hidden="true">{workspaceBadgeText(safe, safeIcons)}</span>
                                            <span className="truncate text-xs">{displayName(safe)}</span>
                                        </button>

                                        <div className="flex h-6 items-center gap-1 shrink-0">
                                            {/* Toggle multi-select */}
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleSafe(safe);
                                                }}
                                                className={`flex h-6 w-6 items-center justify-center rounded hover:bg-t2-hover transition-colors cursor-pointer ${
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
                                                        className="flex h-6 w-6 items-center justify-center rounded text-t2-ink-3 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
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
