import { format } from 'date-fns';

export type RecurrenceScope = 'this' | 'all';

/** True for events that repeat (a real FREQ, not `NONE`). */
export function isRecurringEvent(e: { recurrence_rule?: string; recurrence?: string }): boolean {
    const rule = e.recurrence_rule?.trim();
    if (rule) return /FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i.test(rule);
    return !!e.recurrence && e.recurrence !== 'none';
}

/** `yyyy-MM-dd` key of an occurrence, the format used by `exdates`. */
export function occurrenceKey(start: Date | string | number): string {
    return format(new Date(start), 'yyyy-MM-dd');
}

/** Start timestamp encoded in an occurrence id (`<eventId>_<timestamp>`), or null for the first occurrence. */
export function occurrenceTimestamp(id: string): number | null {
    const idx = id.indexOf('_');
    if (idx < 0) return null;
    const ts = parseInt(id.slice(idx + 1), 10);
    return Number.isNaN(ts) ? null : ts;
}

/**
 * Moves the whole series so that the dragged occurrence lands on `newStart`: the master is shifted by the
 * same offset, so earlier and later occurrences keep their distance. The new duration is kept as well.
 */
export function shiftSeriesForMove(
    master: { start: string },
    occurrenceStart: Date,
    newStart: Date,
    newEnd: Date,
): { start: string; end: string } {
    const delta = newStart.getTime() - occurrenceStart.getTime();
    const start = new Date(new Date(master.start).getTime() + delta);
    const end = new Date(start.getTime() + (newEnd.getTime() - newStart.getTime()));
    return { start: start.toISOString(), end: end.toISOString() };
}

/** True when the update really changes the occurrence's time (ignores sub-minute noise from drags). */
export function changesOccurrenceTime(
    occurrence: { start: string; end: string },
    updates: { start?: string; end?: string },
): boolean {
    const moved = (a: string | undefined, b: string) =>
        a !== undefined && Math.abs(new Date(a).getTime() - new Date(b).getTime()) >= 60_000;
    return moved(updates.start, occurrence.start) || moved(updates.end, occurrence.end);
}
