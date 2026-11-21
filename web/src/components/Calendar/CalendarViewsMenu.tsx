import React, { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, Pencil, Trash2 } from 'lucide-react';
import { resolveCategory } from '@/lib/calendarColors';
import { applyView } from '@/lib/applyView';
import { isTagFilterActive } from '@/lib/tagFilter';
import { useCalendarTagFilter } from '@/lib/useCalendarTagFilter';
import { useDataStore } from '@/store/useDataStore';
import type { CalendarViewMode } from './types';

interface CalendarViewsMenuProps {
    viewMode: CalendarViewMode;
    onViewModeChange: (mode: CalendarViewMode) => void;
    /** Known tags (for color dots and pruning stale ids). */
    tags: { id: string; title: string; color?: string }[];
    /** Switches to the todo list. The "Todos zu diesen Tags" jump is hidden without it. */
    onOpenTodos?: () => void;
}

const item = 'flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[13px] text-t2-ink-2 hover:bg-t2-hover';
const iconBtn = 'rounded-[6px] p-1 text-t2-ink-3 hover:text-t2-ink hover:bg-t2-stage shrink-0';

/** "Ansichten" dropdown: saved tag filter + mode combinations, save current filter, jump to todos with the same tags. */
export function CalendarViewsMenu({ viewMode, onViewModeChange, tags, onOpenTodos }: CalendarViewsMenuProps) {
    const views = useDataStore((s) => s.views);
    const addView = useDataStore((s) => s.addView);
    const renameView = useDataStore((s) => s.renameView);
    const removeView = useDataStore((s) => s.removeView);
    const setCalendarFilter = useDataStore((s) => s.setCalendarTagFilter);
    const setTodoFilter = useDataStore((s) => s.setTodoTagFilter);
    const filter = useCalendarTagFilter(tags.map((t) => t.id));
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const known = new Set(tags.map((t) => t.id));

    useEffect(() => {
        if (!open) return;
        const close = (e: Event) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    const save = async () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        await addView({ name: trimmed, tagIds: filter.tagIds, untagged: filter.untagged, viewMode });
        setName('');
    };
    const commitRename = async (id: string) => {
        await renameView(id, editName);
        setEditingId(null);
    };
    const dots = (tagIds: string[]) =>
        tagIds
            .map((id) => tags.find((t) => t.id === id))
            .filter((t): t is NonNullable<typeof t> => !!t && !!t.color)
            .map((t) => (
                <span key={t.id} className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: resolveCategory(t.color).bg }} />
            ));

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-t2-hover hover:bg-t2-stage text-t2-ink-2 cursor-pointer"
            >
                <Bookmark size={12} />
                Ansichten
            </button>
            {open && (
                <div role="menu" className="absolute left-0 top-full z-[600] mt-1 flex w-64 flex-col gap-1 rounded-[12px] bg-t2-surface p-1.5 shadow-[0_0_0_1px_var(--t2-line)]">
                    {views.length === 0 && <div className="px-2 py-1.5 text-xs text-t2-ink-3">Noch keine Ansichten gespeichert</div>}
                    {views.map((view) => (
                        <div key={view.id} className={item}>
                            {editingId === view.id ? (
                                <>
                                    <input
                                        autoFocus
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') void commitRename(view.id);
                                            if (e.key === 'Escape') setEditingId(null);
                                        }}
                                        aria-label="Ansicht umbenennen"
                                        className="min-w-0 flex-1 rounded-[6px] bg-t2-hover px-2 py-0.5 text-[13px] text-t2-ink outline-none"
                                    />
                                    <button type="button" aria-label="Umbenennen bestätigen" className={iconBtn} onClick={() => void commitRename(view.id)}>
                                        <Check size={13} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                                        onClick={() => {
                                            applyView(view, { setFilter: setCalendarFilter, setViewMode: onViewModeChange, knownTagIds: known });
                                            setOpen(false);
                                        }}
                                    >
                                        <span className="truncate">{view.name}</span>
                                        <span className="flex items-center gap-0.5">{dots(view.tagIds)}</span>
                                    </button>
                                    <button
                                        type="button"
                                        aria-label="Ansicht umbenennen"
                                        className={iconBtn}
                                        onClick={() => { setEditingId(view.id); setEditName(view.name); setConfirmId(null); }}
                                    >
                                        <Pencil size={13} />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={confirmId === view.id ? 'Löschen bestätigen' : 'Ansicht löschen'}
                                        className={`${iconBtn} ${confirmId === view.id ? 'text-red-500' : ''}`}
                                        onClick={() => {
                                            if (confirmId === view.id) { void removeView(view.id); setConfirmId(null); } else setConfirmId(view.id);
                                        }}
                                    >
                                        {confirmId === view.id ? <span className="text-[11px] font-semibold">Sicher?</span> : <Trash2 size={13} />}
                                    </button>
                                </>
                            )}
                        </div>
                    ))}
                    <div className="mt-1 flex flex-col gap-1 border-t border-t2-line pt-2">
                        <span className="px-1 text-[11px] font-semibold text-t2-ink-3">Aktuellen Filter speichern</span>
                        <div className="flex items-center gap-1.5">
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
                                placeholder="Name der Ansicht"
                                className="min-w-0 flex-1 rounded-[6px] bg-t2-hover px-2 py-1 text-[13px] text-t2-ink outline-none"
                            />
                            <button
                                type="button"
                                disabled={!name.trim()}
                                onClick={() => void save()}
                                className="rounded-[8px] bg-t2-ink px-2.5 py-1 text-xs font-semibold text-t2-bg disabled:opacity-40"
                            >
                                Speichern
                            </button>
                        </div>
                    </div>
                    {onOpenTodos && isTagFilterActive(filter) && (
                        <button
                            type="button"
                            className={`${item} mt-1 border-t border-t2-line pt-2 text-left font-semibold`}
                            onClick={() => {
                                setTodoFilter(filter);
                                setOpen(false);
                                onOpenTodos();
                            }}
                        >
                            Todos zu diesen Tags
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default CalendarViewsMenu;
