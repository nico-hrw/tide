import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getEventGroupIds } from '@/lib/calendarUtils';
import { useCalendarTagFilter } from '@/lib/useCalendarTagFilter';
import {
    clearInteractiveCreate,
    markInteractiveCreate,
    newEventMeta,
    shouldPromptNoTag,
} from '@/lib/tagPrompt';
import type { CalendarEvent, CalendarViewProps } from './types';

type Themes = NonNullable<CalendarViewProps['themes']>;

function useKnownTagIds(themes: Themes): string[] {
    const key = themes.map((t) => t.id).join('|');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => themes.map((t) => t.id), [key]);
}

/**
 * Wraps `onEventCreate` for the interactive desktop paths (drag, "+", month, agenda): a plain timed
 * create inherits the active calendar tag filter and is remembered for the no-tag prompt. Creates that
 * pass their own meta (all-day, todo drop, text drop) go through unchanged and are never prompted.
 */
export function useTaggedCreate(
    onCreate: CalendarViewProps['onEventCreate'],
    themes: Themes,
): CalendarViewProps['onEventCreate'] {
    const filter = useCalendarTagFilter(useKnownTagIds(themes));
    const filterRef = useRef(filter);
    const createRef = useRef(onCreate);
    useEffect(() => {
        filterRef.current = filter;
        createRef.current = onCreate;
    });
    return useCallback(async (start, end, isAllDay, extraMeta) => {
        const plain = !isAllDay && (!extraMeta || Object.keys(extraMeta).length === 0);
        if (!plain) return createRef.current(start, end, isAllDay, extraMeta);
        const id = await createRef.current(start, end, false, newEventMeta(filterRef.current));
        markInteractiveCreate(id);
        return id;
    }, []);
}

/**
 * Close guard for the event popover: an event created in this session without any tag asks
 * "Ohne Tag speichern?" once instead of closing. A second dismissal while the question is
 * visible counts as confirmed, so the user is never trapped.
 */
export function useNoTagPrompt(events: CalendarEvent[], themes: Themes) {
    const [promptId, setPromptId] = useState<string | null>(null);
    const promptRef = useRef<string | null>(null);
    const eventsRef = useRef(events);
    const knownIds = useKnownTagIds(themes);
    const knownRef = useRef(new Set(knownIds));
    useEffect(() => {
        eventsRef.current = events;
        knownRef.current = new Set(knownIds);
    });

    const setPrompt = useCallback((id: string | null) => {
        promptRef.current = id;
        setPromptId(id);
    }, []);

    const confirm = useCallback((id: string) => {
        clearInteractiveCreate(id);
        setPrompt(null);
    }, [setPrompt]);

    const guardClose = useCallback((id: string): boolean => {
        if (promptRef.current === id) {
            confirm(id);
            return false;
        }
        const event = eventsRef.current.find((e) => e.id === id);
        if (event && shouldPromptNoTag(id, getEventGroupIds(event), knownRef.current)) {
            setPrompt(id);
            return true;
        }
        confirm(id);
        return false;
    }, [confirm, setPrompt]);

    const dismiss = useCallback(() => setPrompt(null), [setPrompt]);

    return { promptId, guardClose, confirm, dismiss };
}
