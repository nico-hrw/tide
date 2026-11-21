import React from 'react';
import { resolveCategory } from '@/lib/calendarColors';
import { useDataStore } from '@/store/useDataStore';
import { useCalendarTagFilter } from '@/lib/useCalendarTagFilter';
import {
    EMPTY_TAG_FILTER, isTagFilterActive, toggleTagInFilter, toggleUntaggedInFilter,
} from '@/lib/tagFilter';

interface CalendarTagPillsProps {
    tags: { id: string; title: string; color?: string }[];
    /** Mobile: larger touch targets and no shrink-wrapped toolbar padding. */
    className?: string;
}

const pill = (active: boolean) =>
    `px-3 py-1 text-xs rounded-full cursor-pointer transition-all shrink-0 flex items-center gap-1.5 ${active ? 'bg-t2-ink text-t2-bg font-bold shadow-sm' : 'bg-t2-hover hover:bg-t2-stage text-t2-ink-2 font-semibold'}`;

/** Multi-select tag pills (OR) with "Ohne Tag" and a reset chip, bound to the store's calendar filter. */
export function CalendarTagPills({ tags, className = '' }: CalendarTagPillsProps) {
    const filter = useCalendarTagFilter(tags.map((t) => t.id));
    const setFilter = useDataStore((s) => s.setCalendarTagFilter);
    return (
        <div className={`flex items-center gap-1.5 overflow-x-auto scrollbar-none ${className}`} data-testid="calendar-tag-pills">
            {tags.map((tag) => (
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
            <button
                type="button"
                aria-pressed={filter.untagged}
                onClick={() => setFilter(toggleUntaggedInFilter(filter))}
                className={pill(filter.untagged)}
            >
                Ohne Tag
            </button>
            {isTagFilterActive(filter) && (
                <button
                    type="button"
                    onClick={() => setFilter(EMPTY_TAG_FILTER)}
                    className="px-3 py-1 text-xs font-semibold rounded-full cursor-pointer shrink-0 text-t2-ink-3 hover:text-t2-ink border border-t2-line"
                >
                    ✕ Filter zurücksetzen
                </button>
            )}
        </div>
    );
}

export default CalendarTagPills;
