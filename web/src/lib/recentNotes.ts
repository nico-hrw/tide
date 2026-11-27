/** The "what was added lately" start animation: which notes are new, and when it may play. */

const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_DAYS = 7;
export const MONTH_DAYS = 30;
/** The animation comes back after this many days without it ("now and then", not on every start). */
export const STARTUP_MIN_GAP_DAYS = 3;
/** Fewer new notes than this in the last month: nothing worth showing. */
export const STARTUP_MIN_RECENT = 3;

export const STARTUP_LAST_SHOWN_KEY = 'tide_startup_graph_last';
export const STARTUP_SESSION_KEY = 'tide_startup_graph_session';

/** When a note was created (ms since epoch), from the server's `created_at`; null when unknown. */
export function noteCreatedMs(note: Record<string, unknown>): number | null {
    const raw = note.created_at ?? note.createdAt;
    if (typeof raw !== 'string' && typeof raw !== 'number') return null;
    const ms = new Date(raw).getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export function ageInDays(createdMs: number, nowMs: number): number {
    return Math.max(0, (nowMs - createdMs) / DAY_MS);
}

/** Notes created in the last 7 and the last 30 days (the month includes the week). */
export function recentCounts(created: ReadonlyArray<number | null>, nowMs: number): { week: number; month: number } {
    let week = 0;
    let month = 0;
    for (const ms of created) {
        if (ms === null) continue;
        const age = ageInDays(ms, nowMs);
        if (age < WEEK_DAYS) week++;
        if (age < MONTH_DAYS) month++;
    }
    return { week, month };
}

export interface StartupDecision {
    enabled: boolean;
    reducedMotion: boolean;
    alreadyThisSession: boolean;
    /** ms timestamp of the last time it played, null if never */
    lastShown: number | null;
    nowMs: number;
    monthCount: number;
}

export function shouldPlayStartup(d: StartupDecision): boolean {
    if (!d.enabled || d.reducedMotion || d.alreadyThisSession) return false;
    if (d.monthCount < STARTUP_MIN_RECENT) return false;
    if (d.lastShown !== null && d.nowMs - d.lastShown < STARTUP_MIN_GAP_DAYS * DAY_MS) return false;
    return true;
}
