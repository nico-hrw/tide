import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search, Tag as TagIcon, X } from 'lucide-react';
import { resolveCategory } from '@/lib/calendarColors';
import { useDataStore } from '@/store/useDataStore';
import { useCalendarTagFilter } from '@/lib/useCalendarTagFilter';
import { EMPTY_TAG_FILTER, isTagFilterActive, toggleTagInFilter, toggleUntaggedInFilter } from '@/lib/tagFilter';
import { filterTagsByQuery } from '@/lib/tags';

interface CalendarTagFilterProps {
    tags: { id: string; title: string; color?: string }[];
    className?: string;
}

const MAX_CHIPS = 3;

/**
 * Compact tag filter for the calendar toolbar: one button ("Tags", with the number of active filters) that opens a
 * searchable list, plus small chips for the active tags. Replaces the long row of tag pills.
 */
export function CalendarTagFilter({ tags, className = '' }: CalendarTagFilterProps) {
    const filter = useCalendarTagFilter(tags.map((t) => t.id));
    const setFilter = useDataStore((s) => s.setCalendarTagFilter);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    const active = isTagFilterActive(filter);
    const activeCount = filter.tagIds.length + (filter.untagged ? 1 : 0);
    const activeTags = tags.filter((t) => filter.tagIds.includes(t.id));
    const visible = filterTagsByQuery(tags, query);

    const dot = (color?: string) => (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color ? resolveCategory(color).bg : 'var(--t2-ink-3)' }} />
    );

    return (
        <div className={`flex items-center gap-1.5 ${className}`} data-testid="calendar-tag-filter">
            <div ref={ref} className="relative shrink-0">
                <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    onClick={() => setOpen((v) => !v)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                        active ? 'bg-t2-ink text-t2-bg' : 'bg-t2-hover text-t2-ink-2 hover:bg-t2-stage'
                    }`}
                >
                    <TagIcon size={12} />
                    Tags
                    {active && <span className="rounded-full bg-t2-bg/25 px-1.5 text-[11px] leading-[16px]">{activeCount}</span>}
                    <ChevronDown size={11} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                    <div className="absolute left-0 top-[calc(100%+8px)] z-[600] w-64 overflow-hidden rounded-2xl border border-t2-line bg-t2-surface shadow-[0_18px_44px_rgba(0,0,0,0.16)] animate-in fade-in zoom-in-95 duration-100">
                        {tags.length > 6 && (
                            <div className="flex items-center gap-2 border-b border-t2-line-soft px-3 py-2">
                                <Search size={13} className="shrink-0 text-t2-ink-3" />
                                <input
                                    autoFocus
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Tag suchen"
                                    aria-label="Tag suchen"
                                    className="w-full bg-transparent text-[13px] text-t2-ink outline-none placeholder:text-t2-ink-3"
                                />
                            </div>
                        )}
                        <div role="listbox" aria-multiselectable="true" className="max-h-72 overflow-y-auto p-1.5">
                            {visible.map((tag) => {
                                const on = filter.tagIds.includes(tag.id);
                                return (
                                    <button
                                        key={tag.id}
                                        type="button"
                                        role="option"
                                        aria-selected={on}
                                        onClick={() => setFilter(toggleTagInFilter(filter, tag.id))}
                                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-t2-ink transition-colors hover:bg-t2-hover cursor-pointer"
                                    >
                                        {dot(tag.color)}
                                        <span className="min-w-0 flex-1 truncate">{tag.title}</span>
                                        {on && <Check size={14} className="shrink-0 text-t2-ink" />}
                                    </button>
                                );
                            })}
                            {visible.length === 0 && <div className="px-2.5 py-2 text-[12px] text-t2-ink-3">Kein Tag gefunden</div>}
                            <div className="my-1 h-px bg-t2-line-soft" />
                            <button
                                type="button"
                                role="option"
                                aria-selected={filter.untagged}
                                onClick={() => setFilter(toggleUntaggedInFilter(filter))}
                                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-t2-ink-2 transition-colors hover:bg-t2-hover cursor-pointer"
                            >
                                {dot()}
                                <span className="min-w-0 flex-1">Ohne Tag</span>
                                {filter.untagged && <Check size={14} className="shrink-0 text-t2-ink" />}
                            </button>
                        </div>
                        {active && (
                            <button
                                type="button"
                                onClick={() => { setFilter(EMPTY_TAG_FILTER); setOpen(false); }}
                                className="w-full border-t border-t2-line-soft bg-t2-sub px-3 py-2 text-left text-[12px] font-medium text-t2-ink-2 transition-colors hover:text-t2-ink cursor-pointer"
                            >
                                Filter zurücksetzen
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* The active filters stay visible as small chips (each one removable) */}
            {activeTags.slice(0, MAX_CHIPS).map((tag) => (
                <button
                    key={tag.id}
                    type="button"
                    onClick={() => setFilter(toggleTagInFilter(filter, tag.id))}
                    title={`${tag.title} entfernen`}
                    className="group flex max-w-[9rem] shrink-0 items-center gap-1.5 rounded-full border border-t2-line px-2.5 py-0.5 text-xs font-medium text-t2-ink transition-colors hover:bg-t2-hover cursor-pointer"
                >
                    {dot(tag.color)}
                    <span className="truncate">{tag.title}</span>
                    <X size={11} className="shrink-0 text-t2-ink-3 group-hover:text-t2-ink" />
                </button>
            ))}
            {activeTags.length > MAX_CHIPS && <span className="shrink-0 text-xs text-t2-ink-3">+{activeTags.length - MAX_CHIPS}</span>}
            {filter.untagged && (
                <button
                    type="button"
                    onClick={() => setFilter(toggleUntaggedInFilter(filter))}
                    title="Ohne Tag entfernen"
                    className="group flex shrink-0 items-center gap-1.5 rounded-full border border-t2-line px-2.5 py-0.5 text-xs font-medium text-t2-ink transition-colors hover:bg-t2-hover cursor-pointer"
                >
                    Ohne Tag
                    <X size={11} className="text-t2-ink-3 group-hover:text-t2-ink" />
                </button>
            )}
        </div>
    );
}

export default CalendarTagFilter;
