import { describe, expect, it } from 'vitest';
import { changesOccurrenceTime, isRecurringEvent, occurrenceKey, occurrenceTimestamp, shiftSeriesForMove } from '../recurrence';
import { parseIcsString } from '../icsParser';

describe('isRecurringEvent', () => {
    it('detects real frequencies only', () => {
        expect(isRecurringEvent({ recurrence_rule: 'FREQ=WEEKLY;INTERVAL=1;' })).toBe(true);
        expect(isRecurringEvent({ recurrence_rule: 'NONE' })).toBe(false);
        expect(isRecurringEvent({ recurrence_rule: 'none' })).toBe(false);
        expect(isRecurringEvent({})).toBe(false);
        expect(isRecurringEvent({ recurrence: 'daily' })).toBe(true);
    });
});

describe('occurrence ids', () => {
    it('reads the timestamp of an occurrence id and null for the first occurrence', () => {
        expect(occurrenceTimestamp('abc_1700000000000')).toBe(1700000000000);
        expect(occurrenceTimestamp('abc')).toBeNull();
        expect(occurrenceTimestamp('abc_x')).toBeNull();
    });
    it('formats the exdate key in local time', () => {
        expect(occurrenceKey(new Date(2026, 11, 21, 9, 45))).toBe('2026-12-21');
    });
});

describe('shiftSeriesForMove', () => {
    const master = { start: new Date(2026, 9, 5, 9, 45).toISOString() };
    it('keeps earlier occurrences: moving the 3rd one by +1h shifts the master by +1h', () => {
        const occ = new Date(2026, 9, 19, 9, 45);
        const r = shiftSeriesForMove(master, occ, new Date(2026, 9, 19, 10, 45), new Date(2026, 9, 19, 12, 15));
        expect(new Date(r.start)).toEqual(new Date(2026, 9, 5, 10, 45));
        expect(new Date(r.end)).toEqual(new Date(2026, 9, 5, 12, 15));
    });
    it('moves the weekday for a day change', () => {
        const occ = new Date(2026, 9, 12, 9, 45);
        const r = shiftSeriesForMove(master, occ, new Date(2026, 9, 13, 9, 45), new Date(2026, 9, 13, 11, 15));
        expect(new Date(r.start)).toEqual(new Date(2026, 9, 6, 9, 45));
    });
});

describe('changesOccurrenceTime', () => {
    const occ = { start: '2026-10-05T07:45:00.000Z', end: '2026-10-05T09:15:00.000Z' };
    it('ignores sub-minute noise and unchanged times', () => {
        expect(changesOccurrenceTime(occ, { start: '2026-10-05T07:45:20.000Z' })).toBe(false);
        expect(changesOccurrenceTime(occ, {})).toBe(false);
    });
    it('detects moved start or end', () => {
        expect(changesOccurrenceTime(occ, { start: '2026-10-05T08:45:00.000Z' })).toBe(true);
        expect(changesOccurrenceTime(occ, { end: '2026-10-05T10:15:00.000Z' })).toBe(true);
    });
});

describe('ICS UNTIL', () => {
    it('imports the series end', () => {
        const ics = [
            'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART;TZID=Europe/Berlin:20261005T094500', 'DTEND;TZID=Europe/Berlin:20261005T111500',
            'RRULE:FREQ=WEEKLY;UNTIL=20270125T094500;INTERVAL=1;', 'SUMMARY:x', 'END:VEVENT', 'END:VCALENDAR',
        ].join('\r\n');
        const [ev] = parseIcsString(ics);
        expect(ev.recurrenceEnd).toBe('2027-01-25T08:45:00.000Z');
    });
});
