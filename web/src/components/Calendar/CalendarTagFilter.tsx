import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Layers, Search, Tag as TagIcon, X } from 'lucide-react';
import { resolveCategory } from '@/lib/calendarColors';
import { useDataStore } from '@/store/useDataStore';
import { useCalendarTagFilter } from '@/lib/useCalendarTagFilter';
import { EMPTY_TAG_FILTER, isTagFilterActive, toggleTagInFilter, toggleUntaggedInFilter } from '@/lib/tagFilter';
import { filterTagsByQuery, splitTagsByWorkspace, tagSafe } from '@/lib/tags';
import { normalizeSafe } from '@/lib/todoSafes';
import { HiddenTagModeControl } from '@/components/Tags/HiddenTagModeControl';
import { WorkspacePrefixBox } from '@/components/Workspaces/WorkspacePrefixBox';

interface CalendarTagFilterProps {
    tags: { id: string; title: string; color?: string; safe?: string }[];
    className?: string;
}

const MAX_CHIPS = 3;

/**
 * Compact tag filter for the calendar toolbar: shows tags of the active workspace(s) by default,
 * plus a collapsible "Workspaces" section to search and include tags from other workspaces.
 */
export function CalendarTagFilter({ tags, className = '' }: CalendarTagFilterProps) {
    const filter = useCalendarTagFilter(tags.map((t) => t.id));
    const setFilter = useDataStore((s) => s.setCalendarTagFilter);
    const activeSafes = useDataStore((s) => s.activeSafes);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [wsOpen, setWsOpen] = useState(false);
    const [wsQuery, setWsQuery] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    const activeSet = useMemo(() => new Set((activeSafes ?? []).map(normalizeSafe)), [activeSafes]);
    const { local: localTags, external: externalTags } = useMemo(
        () => splitTagsByWorkspace(tags, activeSafes ?? []),
        [tags, activeSafes],
    );

    const active = isTagFilterActive(filter);
    const activeCount = filter.tagIds.length + (filter.untagged ? 1 : 0);
    const activeTags = tags.filter((t) => filter.tagIds.includes(t.id));
    const visibleLocal = filterTagsByQuery(localTags, query);
    const visibleExternal = filterTagsByQuery(externalTags, wsQuery || query);
    const selectedExternalCount = externalTags.filter((t) => filter.tagIds.includes(t.id)).length;
    const showWsSection = wsOpen || (query.trim().length > 0 && visibleExternal.length > 0);

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
                    <div className="absolute left-0 top-[calc(100%+8px)] z-[600] w-68 overflow-hidden rounded-2xl border border-t2-line bg-t2-surface shadow-[0_18px_44px_rgba(0,0,0,0.16)] animate-in fade-in zoom-in-95 duration-100">
                        {(localTags.length > 6 || externalTags.length > 0) && (
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
                        <div className="px-2 pt-2">
                            <HiddenTagModeControl filter={filter} onChange={setFilter} />
                        </div>
                        <div role="listbox" aria-multiselectable="true" className="max-h-72 overflow-y-auto p-1.5">
                            {visibleLocal.map((tag) => {
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
                            {visibleLocal.length === 0 && (
                                <div className="px-2.5 py-2 text-[12px] text-t2-ink-3">Kein Tag gefunden</div>
                            )}
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

                            {externalTags.length > 0 && (
                                <>
                                    <div className="my-1 h-px bg-t2-line-soft" />
                                    <button
                                        type="button"
                                        aria-expanded={showWsSection}
                                        onClick={() => setWsOpen((v) => !v)}
                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-t2-ink-2 transition-colors hover:bg-t2-hover cursor-pointer"
                                    >
                                        <Layers size={13} className="shrink-0 text-t2-ink-3" />
                                        <span className="flex-1">Workspaces</span>
                                        {selectedExternalCount > 0 && (
                                            <span className="rounded-full bg-t2-sub px-1.5 text-[11px] text-t2-accent">{selectedExternalCount}</span>
                                        )}
                                        <ChevronDown size={12} className={`shrink-0 text-t2-ink-3 transition-transform ${showWsSection ? 'rotate-180' : ''}`} />
                                    </button>
                                    {showWsSection && (
                                        <div className="mt-1 space-y-1 pl-1">
                                            <div className="flex items-center gap-1.5 rounded-lg border border-t2-line-soft bg-t2-sub/60 px-2 py-1">
                                                <Search size={12} className="shrink-0 text-t2-ink-3" />
                                                <input
                                                    value={wsQuery}
                                                    onChange={(e) => setWsQuery(e.target.value)}
                                                    placeholder="Tags anderer Workspaces suchen…"
                                                    aria-label="Tags anderer Workspaces suchen"
                                                    className="w-full bg-transparent text-[12px] text-t2-ink outline-none placeholder:text-t2-ink-3"
                                                />
                                            </div>
                                            {visibleExternal.map((tag) => {
                                                const on = filter.tagIds.includes(tag.id);
                                                return (
                                                    <button
                                                        key={tag.id}
                                                        type="button"
                                                        role="option"
                                                        aria-selected={on}
                                                        onClick={() => setFilter(toggleTagInFilter(filter, tag.id))}
                                                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-t2-ink transition-colors hover:bg-t2-hover cursor-pointer"
                                                    >
                                                        <WorkspacePrefixBox safe={tagSafe(tag)} />
                                                        {dot(tag.color)}
                                                        <span className="min-w-0 flex-1 truncate">{tag.title}</span>
                                                        {on && <Check size={14} className="shrink-0 text-t2-ink" />}
                                                    </button>
                                                );
                                            })}
                                            {visibleExternal.length === 0 && (
                                                <div className="px-2 py-1 text-[11.5px] text-t2-ink-3">Kein passender Tag</div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
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

            {activeTags.slice(0, MAX_CHIPS).map((tag) => {
                const isExternal = activeSet.size > 0 && !activeSet.has(tagSafe(tag));
                return (
                    <button
                        key={tag.id}
                        type="button"
                        onClick={() => setFilter(toggleTagInFilter(filter, tag.id))}
                        title={`${tag.title} entfernen`}
                        className="group flex max-w-[10.5rem] shrink-0 items-center gap-1.5 rounded-full border border-t2-line px-2.5 py-0.5 text-xs font-medium text-t2-ink transition-colors hover:bg-t2-hover cursor-pointer"
                    >
                        {isExternal && <WorkspacePrefixBox safe={tagSafe(tag)} />}
                        {dot(tag.color)}
                        <span className="truncate">{tag.title}</span>
                        <X size={11} className="shrink-0 text-t2-ink-3 group-hover:text-t2-ink" />
                    </button>
                );
            })}
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
