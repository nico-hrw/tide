/**
 * Workspace time tracking (pure logic, no storage or DOM access).
 *
 * A "stint" is a continuous period in one workspace while the app is visible. A stint of at
 * least MIN_STINT_MS that ends by switching to another workspace produces a prompt, so the user
 * can save it as a calendar entry. Hidden time never counts and never prompts. Totals per
 * workspace are kept per day.
 */

export const MIN_STINT_MS = 5 * 60 * 1000;

export interface TimeSession {
    label: string;
    start: number;
    end: number;
}

export interface TrackerState {
    /** Display label of the current workspace set, or null before the first event. */
    label: string | null;
    visible: boolean;
    /** Start of the running stint, or null when nothing is being counted. */
    stintStart: number | null;
    /** Local calendar day (YYYY-MM-DD) the totals belong to. */
    day: string;
    /** Milliseconds per workspace label for `day`. */
    totals: Record<string, number>;
}

export type TrackerEvent =
    | { type: 'workspace'; label: string | null; at: number }
    | { type: 'visibility'; visible: boolean; at: number };

export interface ReduceResult {
    state: TrackerState;
    prompt: TimeSession | null;
}

export function dayKey(at: number): string {
    const d = new Date(at);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

export function createTrackerState(at: number, visible: boolean, totals: Record<string, number> = {}): TrackerState {
    return { label: null, visible, stintStart: null, day: dayKey(at), totals };
}

/** Maps the active workspace ids to a label: "main" shows as "Standard", several are joined. */
export function workspaceLabel(activeSafes: readonly string[]): string | null {
    const names = activeSafes
        .map((s) => (s === 'main' ? 'Standard' : s))
        .filter((s) => s.trim().length > 0);
    return names.length > 0 ? names.join(' + ') : null;
}

/** Starts a new day with empty totals; a running stint continues from the new day's start. */
function rollDay(s: TrackerState, at: number): TrackerState {
    const day = dayKey(at);
    if (day === s.day) return s;
    return { ...s, day, totals: {}, stintStart: s.stintStart !== null ? at : null };
}

/** Adds the running stint (if any) to the totals up to `at`. Does not end the stint. */
function addStint(s: TrackerState, at: number): TrackerState {
    if (s.label === null || s.stintStart === null) return s;
    const ms = Math.max(0, at - s.stintStart);
    return { ...s, totals: { ...s.totals, [s.label]: (s.totals[s.label] ?? 0) + ms } };
}

export function reduceTracker(prev: TrackerState, ev: TrackerEvent): ReduceResult {
    const s = rollDay(prev, ev.at);

    if (ev.type === 'visibility') {
        if (ev.visible === s.visible) return { state: s, prompt: null };
        if (!ev.visible) {
            return { state: { ...addStint(s, ev.at), visible: false, stintStart: null }, prompt: null };
        }
        return { state: { ...s, visible: true, stintStart: s.label !== null ? ev.at : null }, prompt: null };
    }

    if (ev.label === s.label) return { state: s, prompt: null };

    let prompt: TimeSession | null = null;
    if (s.label !== null && s.visible && s.stintStart !== null && ev.at - s.stintStart >= MIN_STINT_MS) {
        prompt = { label: s.label, start: s.stintStart, end: ev.at };
    }
    const closed = addStint(s, ev.at);
    return {
        state: { ...closed, label: ev.label, stintStart: s.visible && ev.label !== null ? ev.at : null },
        prompt,
    };
}

/** "47 min", "1 h 05 min", or "< 1 min" for very short times. */
export function formatDuration(ms: number): string {
    const minutes = Math.round(ms / 60000);
    if (minutes < 1) return '< 1 min';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

const ENABLED_KEY = 'tide_time_tracking';

/** On by default; the user can switch it off ("off" in localStorage). */
export function isTrackingEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(ENABLED_KEY) !== 'off';
    } catch {
        return false;
    }
}

export function setTrackingEnabled(enabled: boolean): void {
    try {
        window.localStorage.setItem(ENABLED_KEY, enabled ? 'on' : 'off');
    } catch {
        /* storage unavailable: tracking simply stays at its default */
    }
}

const TOTALS_KEY = 'tide_time_totals';

/** Loads today's totals (other days are discarded). */
export function loadTotals(at: number): Record<string, number> {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(TOTALS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as { day?: unknown; totals?: unknown };
        if (parsed.day !== dayKey(at) || !parsed.totals || typeof parsed.totals !== 'object') return {};
        return parsed.totals as Record<string, number>;
    } catch {
        return {};
    }
}

export function saveTotals(s: TrackerState): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(TOTALS_KEY, JSON.stringify({ day: s.day, totals: s.totals }));
    } catch {
        /* storage full or disabled: totals stay in memory only */
    }
}
