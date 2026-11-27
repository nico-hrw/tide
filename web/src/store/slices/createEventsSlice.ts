import { apiFetch } from '@/lib/api';
import type { WeekStart } from '@/lib/calendarWeeks';
import { pushSettingsPatch } from '../../lib/settingsSync';
import { loadCachedEvents, saveEventsToOfflineCache } from './fsHelpers';
import type {
    CalendarColorPalette,
    CalendarHolidayPackage,
    CalendarOverlapMode,
    CalendarScrollMode,
    DataItem,
    DataStoreSlice,
    EventMentionPreview,
    EventMentionStyle,
    EventsSlice,
} from './types';

export { loadCachedEvents, saveEventsToOfflineCache };

const VALID_CALENDAR_PALETTES: readonly CalendarColorPalette[] = [
    'balsam',
    'modern-dark',
    'soft-pastels',
    'classic-tide',
    'sunset',
];

function loadCalendarColorPalette(key: string): CalendarColorPalette {
    if (typeof window === 'undefined') return 'balsam';
    try {
        const stored = localStorage.getItem(key);
        if (stored && (VALID_CALENDAR_PALETTES as readonly string[]).includes(stored)) {
            return stored as CalendarColorPalette;
        }
        return 'balsam';
    } catch {
        return 'balsam';
    }
}

function loadCalendarScrollMode(): CalendarScrollMode {
    if (typeof window === 'undefined') return 'infinite';
    try {
        return localStorage.getItem('tide_calendar_scroll_mode') === 'fixed'
            ? 'fixed'
            : 'infinite';
    } catch {
        return 'infinite';
    }
}

function loadWeekStartsOn(): WeekStart {
    if (typeof window === 'undefined') return 1;
    try {
        return localStorage.getItem('tide_calendar_week_start') === '0' ? 0 : 1;
    } catch {
        return 1;
    }
}

const TAG_COLOR_OVERRIDE_KEY = 'tide_calendar_tag_color_override';

function loadTagColorOverrideIds(): string[] {
    try {
        const raw = typeof window === 'undefined' ? null : localStorage.getItem(TAG_COLOR_OVERRIDE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
        return [];
    }
}

export const createEventsSlice: DataStoreSlice<EventsSlice> = (set, get) => ({
    events: loadCachedEvents(),
    eventsLoaded: false,
    eventMentionStyle:
        (typeof window !== 'undefined' &&
            (localStorage.getItem('tide_event_mention_style') as EventMentionStyle)) ||
        'calendar',
    eventMentionPreview:
        (typeof window !== 'undefined' &&
            (localStorage.getItem('tide_event_mention_preview') as EventMentionPreview)) ||
        'hover',
    calendarColorPalette: loadCalendarColorPalette('tide_calendar_color_palette'),
    tagInheritCalendarPalette:
        typeof window !== 'undefined'
            ? localStorage.getItem('tide_tag_inherit_calendar_palette') !== 'false'
            : true,
    tagColorPalette: loadCalendarColorPalette('tide_tag_color_palette'),
    calendarOverlapMode:
        typeof window !== 'undefined'
            ? ((localStorage.getItem(
                  'tide_calendar_overlap_mode'
              ) as CalendarOverlapMode) || 'stack')
            : 'stack',
    calendarScrollMode: loadCalendarScrollMode(),
    weekStartsOn: loadWeekStartsOn(),
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

    calendarTagColorOverrideIds: loadTagColorOverrideIds(),

    toggleCalendarTagColorOverride: (tagId: string) => {
        const current = get().calendarTagColorOverrideIds;
        const next = current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId];
        try {
            localStorage.setItem(TAG_COLOR_OVERRIDE_KEY, JSON.stringify(next));
        } catch (e) {
            console.warn('Failed to persist tag colour overrides', e);
        }
        set({ calendarTagColorOverrideIds: next });
    },

    setEvents: (events: DataItem[]) => {
        saveEventsToOfflineCache(events);
        set({ events });
    },

    setEventsLoaded: (loaded: boolean) => set({ eventsLoaded: loaded }),

    setEventMentionStyle: (style: EventMentionStyle) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('tide_event_mention_style', style);
        }
        set({ eventMentionStyle: style });
        pushSettingsPatch({ notes: { event_mention_style: style } });
    },

    setEventMentionPreview: (preview: EventMentionPreview) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('tide_event_mention_preview', preview);
        }
        set({ eventMentionPreview: preview });
        pushSettingsPatch({ notes: { event_mention_preview: preview } });
    },

    setCalendarColorPalette: (palette: CalendarColorPalette) => {
        set(() => {
            if (typeof window !== 'undefined') {
                localStorage.setItem('tide_calendar_color_palette', palette);
            }
            return { calendarColorPalette: palette };
        });
        pushSettingsPatch({ calendar: { color_palette: palette } });
    },

    setTagInheritCalendarPalette: (inherit: boolean) => {
        try {
            if (typeof window !== 'undefined') {
                localStorage.setItem(
                    'tide_tag_inherit_calendar_palette',
                    String(inherit)
                );
            }
        } catch (e) {
            console.warn('Failed to persist tag inherit calendar palette', e);
        }
        set({ tagInheritCalendarPalette: inherit });
    },

    setTagColorPalette: (palette: CalendarColorPalette) => {
        try {
            if (typeof window !== 'undefined') {
                localStorage.setItem('tide_tag_color_palette', palette);
            }
        } catch (e) {
            console.warn('Failed to persist tag colour palette', e);
        }
        set({ tagColorPalette: palette });
    },

    setCalendarOverlapMode: (mode: CalendarOverlapMode) => {
        set(() => {
            if (typeof window !== 'undefined') {
                localStorage.setItem('tide_calendar_overlap_mode', mode);
            }
            return { calendarOverlapMode: mode };
        });
        pushSettingsPatch({ calendar: { overlap_mode: mode } });
    },

    setCalendarScrollMode: (mode: CalendarScrollMode) => {
        try {
            localStorage.setItem('tide_calendar_scroll_mode', mode);
        } catch (e) {
            console.warn('Failed to persist calendar scroll mode', e);
        }
        set({ calendarScrollMode: mode });
        pushSettingsPatch({ calendar: { scroll_mode: mode } });
    },

    setWeekStartsOn: (w: WeekStart) => {
        try {
            localStorage.setItem('tide_calendar_week_start', String(w));
        } catch (e) {
            console.warn('Failed to persist week start', e);
        }
        set({ weekStartsOn: w });
        pushSettingsPatch({ calendar: { week_starts_on: w } });
    },

    setVisibleCalendarRange: (
        range: { start: string; end: string } | null
    ) => set({ visibleCalendarRange: range }),

    setCalendarHolidaysEnabled: (enabled: boolean) => {
        set(() => {
            if (typeof window !== 'undefined') {
                localStorage.setItem(
                    'tide_calendar_holidays_enabled',
                    String(enabled)
                );
            }
            return { calendarHolidaysEnabled: enabled };
        });
        pushSettingsPatch({ calendar: { holidays_enabled: enabled } });
    },

    setCalendarHolidayPackage: (pkg: CalendarHolidayPackage) => {
        set(() => {
            if (typeof window !== 'undefined') {
                localStorage.setItem('tide_calendar_holiday_package', pkg);
            }
            return { calendarHolidayPackage: pkg };
        });
        pushSettingsPatch({ calendar: { holiday_package: pkg } });
    },

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
