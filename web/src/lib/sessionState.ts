// Persistent "what was open" record (localStorage, survives an app restart).
//
// Only ids, types, order, the active tab and the calendar view mode are stored. Titles of note tabs
// are NOT stored (they may be decrypted user data); they are resolved from the data store after load.
// Anything unreadable, of an unknown version or with unknown tab types is ignored, never thrown.

export const SESSION_STATE_KEY = 'tide_session_v1';
export const SESSION_STATE_VERSION = 1;

const TAB_TYPES = [
    'file', 'calendar', 'todos', 'messages', 'ext_finance', 'profile',
    'social', 'exams', 'job_planner', 'trash', 'folders',
] as const;
const CALENDAR_VIEW_MODES = ['day', 'week', 'month', 'continuous'] as const;

export type PersistedTabType = (typeof TAB_TYPES)[number];
export type PersistedCalendarViewMode = (typeof CALENDAR_VIEW_MODES)[number];

export interface PersistedTab {
    id: string;
    type: PersistedTabType;
    /** Present for non-file tabs only. */
    title?: string;
}

export interface PersistedSession {
    tabs: PersistedTab[];
    activeTabId: string | null;
    calendarViewMode?: PersistedCalendarViewMode;
}

interface TabInput {
    id: string;
    type: string;
    title?: string;
}

const isTabType = (v: unknown): v is PersistedTabType => (TAB_TYPES as readonly unknown[]).includes(v);
const isViewMode = (v: unknown): v is PersistedCalendarViewMode =>
    (CALENDAR_VIEW_MODES as readonly unknown[]).includes(v);

export function serializePersistedSession(input: {
    tabs: readonly TabInput[];
    activeTabId: string | null;
    calendarViewMode?: string;
}): string {
    const tabs: PersistedTab[] = [];
    for (const t of input.tabs) {
        if (!isTabType(t.type)) continue; // chat etc.: needs in-memory content, not restorable
        tabs.push(t.type === 'file' || !t.title ? { id: t.id, type: t.type } : { id: t.id, type: t.type, title: t.title });
    }
    return JSON.stringify({
        v: SESSION_STATE_VERSION,
        tabs,
        activeTabId: input.activeTabId,
        ...(isViewMode(input.calendarViewMode) ? { calendarViewMode: input.calendarViewMode } : {}),
    });
}

export function parsePersistedSession(raw: string | null): PersistedSession | null {
    if (!raw) return null;
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const rec = data as Record<string, unknown>;
    if (rec.v !== SESSION_STATE_VERSION || !Array.isArray(rec.tabs)) return null;

    const seen = new Set<string>();
    const tabs: PersistedTab[] = [];
    for (const entry of rec.tabs as unknown[]) {
        if (!entry || typeof entry !== 'object') continue;
        const e = entry as Record<string, unknown>;
        if (typeof e.id !== 'string' || !e.id || !isTabType(e.type) || seen.has(e.id)) continue;
        seen.add(e.id);
        tabs.push(typeof e.title === 'string' && e.type !== 'file' ? { id: e.id, type: e.type, title: e.title } : { id: e.id, type: e.type });
    }
    return {
        tabs,
        activeTabId: typeof rec.activeTabId === 'string' ? rec.activeTabId : null,
        ...(isViewMode(rec.calendarViewMode) ? { calendarViewMode: rec.calendarViewMode } : {}),
    };
}

/**
 * A file tab whose file is no longer known (deleted or unshared) is stale.
 * `knownFileIds === null` means the files are not loaded yet: nothing is stale then.
 */
export function isTabStale(tab: { id: string; type: string }, knownFileIds: ReadonlySet<string> | null): boolean {
    if (tab.type !== 'file' || !knownFileIds) return false;
    return !knownFileIds.has(tab.id);
}

/**
 * Picks the active tab for a restored list. Invalid/missing active id falls back to the first tab.
 * With `startOnCalendar` the calendar becomes active (added in front if missing); other tabs stay.
 */
export function resolveRestoredActive<T extends { id: string; title?: string; type: string }>(
    tabs: readonly T[],
    activeTabId: string | null,
    opts: { startOnCalendar?: boolean } = {}
): { tabs: T[]; activeTabId: string } {
    if (tabs.length === 0) return { tabs: [], activeTabId: '' };
    let next = [...tabs];
    if (opts.startOnCalendar) {
        if (!next.some((t) => t.id === 'calendar')) {
            next = [{ id: 'calendar', title: 'Calendar', type: 'calendar' } as T, ...next];
        }
        return { tabs: next, activeTabId: 'calendar' };
    }
    const active = next.find((t) => t.id === activeTabId);
    return { tabs: next, activeTabId: active ? active.id : next[0].id };
}
