import { apiFetch } from '@/lib/api';
import type {
    CalendarColorPalette,
    CalendarHolidayPackage,
    CalendarOverlapMode,
    DataItem,
    DataStoreSlice,
    EventMentionPreview,
    EventMentionStyle,
    EventsSlice,
} from './types';

export function loadCachedEvents(): DataItem[] {
    if (typeof window === 'undefined') return [];
    try {
        const cached = localStorage.getItem('tide_offline_events');
        return cached ? JSON.parse(cached) : [];
    } catch (e) {
        console.warn('Failed to load cached events from localStorage', e);
        return [];
    }
}

export function saveEventsToOfflineCache(events: DataItem[]): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem('tide_offline_events', JSON.stringify(events));
    } catch (e) {
        console.warn('Failed to save events to offline cache', e);
    }
}

export const createEventsSlice: DataStoreSlice<EventsSlice> = (set, get) => ({
    events: loadCachedEvents(),
    eventMentionStyle:
        (typeof window !== 'undefined' &&
            (localStorage.getItem('tide_event_mention_style') as EventMentionStyle)) ||
        'blue',
    eventMentionPreview:
        (typeof window !== 'undefined' &&
            (localStorage.getItem('tide_event_mention_preview') as EventMentionPreview)) ||
        'hover',
    calendarColorPalette:
        typeof window !== 'undefined'
            ? ((localStorage.getItem(
                  'tide_calendar_color_palette'
              ) as CalendarColorPalette) || 'modern-dark')
            : 'modern-dark',
    calendarOverlapMode:
        typeof window !== 'undefined'
            ? ((localStorage.getItem(
                  'tide_calendar_overlap_mode'
              ) as CalendarOverlapMode) || 'stack')
            : 'stack',
    visibleCalendarRange: null,
    calendarHolidaysEnabled:
        typeof window !== 'undefined'
            ? localStorage.getItem('tide_calendar_holidays_enabled') !== 'false'
            : true,
    calendarHolidayPackage:
        typeof window !== 'undefined'
            ? ((localStorage.getItem(
                  'tide_calendar_holiday_package'
              ) as CalendarHolidayPackage) || 'DE')
            : 'DE',

    setEvents: (events: DataItem[]) => {
        saveEventsToOfflineCache(events);
        set({ events });
    },

    setEventMentionStyle: (style: EventMentionStyle) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('tide_event_mention_style', style);
        }
        set({ eventMentionStyle: style });
    },

    setEventMentionPreview: (preview: EventMentionPreview) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('tide_event_mention_preview', preview);
        }
        set({ eventMentionPreview: preview });
    },

    setCalendarColorPalette: (palette: CalendarColorPalette) =>
        set(() => {
            if (typeof window !== 'undefined') {
                localStorage.setItem('tide_calendar_color_palette', palette);
            }
            return { calendarColorPalette: palette };
        }),

    setCalendarOverlapMode: (mode: CalendarOverlapMode) =>
        set(() => {
            if (typeof window !== 'undefined') {
                localStorage.setItem('tide_calendar_overlap_mode', mode);
            }
            return { calendarOverlapMode: mode };
        }),

    setVisibleCalendarRange: (
        range: { start: string; end: string } | null
    ) => set({ visibleCalendarRange: range }),

    setCalendarHolidaysEnabled: (enabled: boolean) =>
        set(() => {
            if (typeof window !== 'undefined') {
                localStorage.setItem(
                    'tide_calendar_holidays_enabled',
                    String(enabled)
                );
            }
            return { calendarHolidaysEnabled: enabled };
        }),

    setCalendarHolidayPackage: (pkg: CalendarHolidayPackage) =>
        set(() => {
            if (typeof window !== 'undefined') {
                localStorage.setItem('tide_calendar_holiday_package', pkg);
            }
            return { calendarHolidayPackage: pkg };
        }),

    groupOverlappingEvents: async (parentId: string) => {
        const state = get();
        const parent = state.events.find((e) => e.id === parentId);
        if (!parent || !state.myId) return;

        const parentStartVal = parent.start;
        const parentEndVal = parent.end;
        if (!parentStartVal || !parentEndVal) return;

        const parentStart = new Date(
            parentStartVal as string | number | Date
        ).getTime();
        const parentEnd = new Date(
            parentEndVal as string | number | Date
        ).getTime();
        if (Number.isNaN(parentStart) || Number.isNaN(parentEnd)) return;

        const eventsToUpdate: string[] = [];

        const updatedEvents = state.events.map((e) => {
            if (e.id === parentId) return e;
            const eStartVal = e.start;
            const eEndVal = e.end;
            if (!eStartVal || !eEndVal) return e;

            const eStart = new Date(
                eStartVal as string | number | Date
            ).getTime();
            const eEnd = new Date(
                eEndVal as string | number | Date
            ).getTime();
            if (Number.isNaN(eStart) || Number.isNaN(eEnd)) return e;

            if (eStart >= parentStart && eEnd <= parentEnd) {
                eventsToUpdate.push(e.id);
                return { ...e, parent_id: parentId };
            }
            return e;
        });

        if (eventsToUpdate.length > 0) {
            set({ events: updatedEvents });
            saveEventsToOfflineCache(updatedEvents);

            // Persist to backend
            try {
                await Promise.all(
                    eventsToUpdate.map((id) =>
                        apiFetch(`/api/v1/files/${id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ parent_id: parentId }),
                        })
                    )
                );
            } catch (err) {
                console.error('Failed to group events in backend', err);
            }
        }
    },
});
