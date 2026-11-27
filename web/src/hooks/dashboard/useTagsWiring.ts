import { useCallback, useMemo } from 'react';
import type { CalendarEvent } from '@/components/Calendar/types';
import type { DecryptedFile } from '@/components/Dashboard/types';
import type { DataItem, TaskItem } from '@/store/slices/types';
import { useDataStore } from '@/store/useDataStore';
import { useCalendarTagFilter } from '@/lib/useCalendarTagFilter';
import { selectTags } from '@/lib/tags';
import { normalizeSafe } from '@/lib/todoSafes';
import { filterEventsByTags, getEventGroupIds } from '@/lib/calendarUtils';
import { applyTagColorOverride } from '@/lib/tagColorOverride';
import { useTagMigration } from '@/hooks/dashboard/useTagMigration';

export interface TagTheme {
    id: string;
    title: string;
    effect?: string;
    color?: string;
    safe?: string;
}

/** Tags as calendar themes plus the calendar events narrowed by the tag filter and the hidden themes. */
export function useTagCalendarView(files: DecryptedFile[], events: CalendarEvent[], hiddenThemeIds: string[]) {
    const mobileThemes: TagTheme[] = useMemo(
        () => files.filter((f) => f.type === 'folder' && f.isGroup).map((g) => ({
            id: g.id,
            title: g.title,
            effect: typeof g.effect === 'string' ? g.effect : undefined,
            color: g.color,
            safe: normalizeSafe(g.safe || (g.metadata as { safe?: string } | undefined)?.safe || 'main'),
        })),
        [files]
    );
    const calendarTagFilter = useCalendarTagFilter(mobileThemes.map((t) => t.id));
    const colorOverrideIds = useDataStore((s) => s.calendarTagColorOverrideIds);
    const hiddenList = useDataStore((s) => s.hiddenTagIds);
    const hiddenTagIds = useMemo(() => new Set(hiddenList), [hiddenList]);
    const filteredCalendarEvents = useMemo(
        () => filterEventsByTags(events, calendarTagFilter, mobileThemes, hiddenTagIds)
            .map((e) => ({ ...e, effect: files?.find((f) => f.id === getEventGroupIds(e)[0])?.effect || 'none' }))
            .map((e) => applyTagColorOverride(e, mobileThemes, colorOverrideIds))
            .filter((e) => {
                const gIds = getEventGroupIds(e);
                return gIds.length === 0
                    ? !hiddenThemeIds.includes('general-theme')
                    : gIds.some((gid) => !hiddenThemeIds.includes(gid));
            }),
        [events, files, hiddenThemeIds, calendarTagFilter, mobileThemes, colorOverrideIds]
    );
    return { mobileThemes, filteredCalendarEvents };
}

interface TagsWiringOptions {
    privateKey: unknown;
    publicKey: unknown;
    myId?: string;
    storeFiles: DataItem[];
    events: CalendarEvent[];
    tasks: TaskItem[];
    loadedDirectories: Set<string>;
    handleCreateEventGroup: (title: string) => Promise<string | undefined>;
    handleEventSave: (id: string, u: { groupIds: string[]; parent_id: string | null; tags: string[] }, options?: { skipAutoShare?: boolean }) => Promise<void> | void;
    updateTask: (id: string, u: { tags: string[] }) => Promise<void>;
}

/** Creates the tag-create callback for the context provider and runs the one-time tag migration. */
export function useTagsWiring(o: TagsWiringOptions): { createTagForContext: (title: string) => Promise<string | undefined> } {
    const eventsLoaded = useDataStore((s) => s.eventsLoaded);
    const { handleCreateEventGroup } = o;
    const createTagForContext = useCallback(
        (title: string) => handleCreateEventGroup(title), [handleCreateEventGroup]);
    const migrationTags = useMemo(() => selectTags(o.storeFiles), [o.storeFiles]);
    useTagMigration({
        ready: !!o.privateKey && !!o.publicKey && eventsLoaded && o.loadedDirectories.has('root'),
        events: o.events, tasks: o.tasks, tags: migrationTags, myId: o.myId,
        getEvents: () => useDataStore.getState().events as unknown as CalendarEvent[],
        getTasks: () => useDataStore.getState().tasks,
        createTag: (title) => o.handleCreateEventGroup(title),
        // A migration resolves old name tags; it is not the user adding the event to a shared calendar.
        saveEvent: (id, u) => o.handleEventSave(id, u, { skipAutoShare: true }),
        saveTask: (id, u) => o.updateTask(id, u),
    });
    return { createTagForContext };
}
