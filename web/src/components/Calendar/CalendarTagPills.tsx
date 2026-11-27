import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Layers, Search } from 'lucide-react';
import { resolveCategory } from '@/lib/calendarColors';
import { useDataStore } from '@/store/useDataStore';
import { useCalendarTagFilter } from '@/lib/useCalendarTagFilter';
import { filterTagsByQuery, splitTagsByWorkspace, tagSafe } from '@/lib/tags';
import {
    EMPTY_TAG_FILTER, isTagFilterActive, toggleTagInFilter, toggleUntaggedInFilter,
} from '@/lib/tagFilter';
import { WorkspacePrefixBox } from '@/components/Workspaces/WorkspacePrefixBox';

interface CalendarTagPillsProps {
    tags: { id: string; title: string; color?: string; safe?: string }[];
    /** Mobile: larger touch targets and no shrink-wrapped toolbar padding. */
    className?: string;
}

const pill = (active: boolean) =>
    `px-3 py-1 text-xs rounded-full cursor-pointer transition-all shrink-0 flex items-center gap-1.5 ${active ? 'bg-t2-ink text-t2-bg font-bold shadow-sm' : 'bg-t2-hover hover:bg-t2-stage text-t2-ink-2 font-semibold'}`;

/** Multi-select tag pills (OR) for active workspaces, plus a "Workspaces" button to include external tags. */
export function CalendarTagPills({ tags, className = '' }: CalendarTagPillsProps) {
    const filter = useCalendarTagFilter(tags.map((t) => t.id));
    const setFilter = useDataStore((s) => s.setCalendarTagFilter);
    const activeSafes = useDataStore((s) => s.activeSafes);
    const [wsOpen, setWsOpen] = useState(false);
    const [wsQuery, setWsQuery] = useState('');
    const [pos, setPos] = useState<{ top: number; left: number }>({ top: 80, left: 12 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const { local: localTags, external: externalTags } = useMemo(
        () => splitTagsByWorkspace(tags, activeSafes ?? []),
        [tags, activeSafes],
    );
    const activeExternalTags = useMemo(
        () => externalTags.filter((t) => filter.tagIds.includes(t.id)),
        [externalTags, filter.tagIds],
    );
    const visibleExternal = useMemo(
        () => filterTagsByQuery(externalTags, wsQuery),
        [externalTags, wsQuery],
    );

    useEffect(() => {
        if (!wsOpen) return;
        const onDown = (e: MouseEvent | TouchEvent) => {
            const target = e.target as Node;
            if (btnRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setWsOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('touchstart', onDown);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('touchstart', onDown);
        };
    }, [wsOpen]);

    const openWorkspaces = () => {
        if (!wsOpen && btnRef.current && typeof window !== 'undefined') {
            const r = btnRef.current.getBoundingClientRect();
            setPos({
                top: Math.min(r.bottom + 6, window.innerHeight - 260),
                left: Math.max(8, Math.min(r.left, window.innerWidth - 264)),
            });
        }
        setWsOpen((v) => !v);
    };

    return (
        <div className={`flex items-center gap-1.5 overflow-x-auto scrollbar-none ${className}`} data-testid="calendar-tag-pills">
            {localTags.map((tag) => (
                <button
                    type="button"
                    key={tag.id}
                    aria-pressed={filter.tagIds.includes(tag.id)}
                    onClick={() => setFilter(toggleTagInFilter(filter, tag.id))}
                    className={pill(filter.tagIds.includes(tag.id))}
                >
                    {tag.color && (
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: resolveCategory(tag.color).bg }} />
                    )}
                    {tag.title}
                </button>
            ))}
            {activeExternalTags.map((tag) => (
                <button
                    type="button"
                    key={tag.id}
                    aria-pressed
                    onClick={() => setFilter(toggleTagInFilter(filter, tag.id))}
                    className={pill(true)}
                >
                    <WorkspacePrefixBox safe={tagSafe(tag)} />
                    {tag.color && (
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: resolveCategory(tag.color).bg }} />
                    )}
                    {tag.title}
                </button>
            ))}
            <button
                type="button"
                aria-pressed={filter.untagged}
                onClick={() => setFilter(toggleUntaggedInFilter(filter))}
                className={pill(filter.untagged)}
            >
                Ohne Tag
            </button>
            {externalTags.length > 0 && (
                <button
                    ref={btnRef}
                    type="button"
                    aria-expanded={wsOpen}
                    onClick={openWorkspaces}
                    className={pill(activeExternalTags.length > 0)}
                >
                    <Layers size={12} />
                    Workspaces
                </button>
            )}
            {isTagFilterActive(filter) && (
                <button
                    type="button"
                    onClick={() => setFilter(EMPTY_TAG_FILTER)}
                    className="px-3 py-1 text-xs font-semibold rounded-full cursor-pointer shrink-0 text-t2-ink-3 hover:text-t2-ink border border-t2-line"
                >
                    ✕ Filter zurücksetzen
                </button>
            )}
            {wsOpen && typeof document !== 'undefined' && createPortal(
                <div
                    ref={panelRef}
                    style={{ top: pos.top, left: pos.left }}
                    className="fixed z-[900] w-64 rounded-2xl border border-t2-line bg-t2-surface p-2 shadow-xl"
                >
                    <div className="mb-1.5 flex items-center gap-1.5 rounded-lg border border-t2-line-soft bg-t2-sub/60 px-2.5 py-1.5">
                        <Search size={12} className="shrink-0 text-t2-ink-3" />
                        <input
                            autoFocus
                            value={wsQuery}
                            onChange={(e) => setWsQuery(e.target.value)}
                            placeholder="Tags anderer Workspaces…"
                            aria-label="Tags anderer Workspaces suchen"
                            className="w-full bg-transparent text-xs text-t2-ink outline-none placeholder:text-t2-ink-3"
                        />
                    </div>
                    <div className="max-h-52 overflow-y-auto space-y-0.5">
                        {visibleExternal.map((tag) => {
                            const on = filter.tagIds.includes(tag.id);
                            return (
                                <button
                                    key={tag.id}
                                    type="button"
                                    onClick={() => setFilter(toggleTagInFilter(filter, tag.id))}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-t2-ink hover:bg-t2-hover"
                                >
                                    <WorkspacePrefixBox safe={tagSafe(tag)} />
                                    {tag.color && (
                                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: resolveCategory(tag.color).bg }} />
                                    )}
                                    <span className="flex-1 truncate">{tag.title}</span>
                                    {on && <Check size={13} className="shrink-0 text-t2-accent" />}
                                </button>
                            );
                        })}
                        {visibleExternal.length === 0 && (
                            <p className="px-2 py-1.5 text-xs text-t2-ink-3">Kein Tag gefunden</p>
                        )}
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}

export default CalendarTagPills;
