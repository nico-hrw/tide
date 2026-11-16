import type { CalendarEvent } from "./types";

/**
 * Day an event id points to. Plain ids resolve to the event's start; recurring
 * occurrence ids (`<masterId>_<timestamp>`) to the occurrence timestamp, like
 * CalendarEventPopoverHost. Returns null when the event is unknown.
 */
export function eventTargetDate(id: string, events: Pick<CalendarEvent, 'id' | 'start'>[]): Date | null {
    const direct = events.find(e => e.id === id);
    if (direct) {
        const d = new Date(direct.start);
        return isNaN(d.getTime()) ? null : d;
    }
    const underscore = id.lastIndexOf('_');
    if (underscore < 0) return null;
    const timestamp = parseInt(id.substring(underscore + 1), 10);
    const master = events.find(e => e.id === id.substring(0, underscore)) || events.find(e => e.id === id.split('_')[0]);
    if (!master) return null;
    const d = new Date(Number.isFinite(timestamp) ? timestamp : master.start);
    return isNaN(d.getTime()) ? null : d;
}
