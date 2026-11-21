import { useMemo } from 'react';
import { useDataStore } from '@/store/useDataStore';
import { pruneTagFilter, type TagFilter } from '@/lib/tagFilter';

/** Stored calendar tag filter pruned against the known tag ids, so deleted tags never hide everything. */
export function useCalendarTagFilter(knownTagIds: string[]): TagFilter {
    const raw = useDataStore((s) => s.calendarTagFilter);
    const key = knownTagIds.join('|');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => pruneTagFilter(raw, new Set(knownTagIds)), [raw, key]);
}
