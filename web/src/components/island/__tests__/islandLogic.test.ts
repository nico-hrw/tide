import { describe, expect, it } from 'vitest';
import {
    buildWeekRow,
    detectCapture,
    findNext,
    findRunning,
    formatCountdown,
    nextIslandState,
    noteTitleOf,
    pickIslandState,
    progressOf,
    resolveCaptureTimes,
    toIslandEvents,
    type PickInput,
} from '../islandLogic';

// Mittwoch, 18.11.2026, 10:00 lokal
const NOW = new Date(2026, 10, 18, 10, 0, 0);
const at = (h: number, m = 0, day = 18) => new Date(2026, 10, day, h, m).toISOString();

const events = toIslandEvents([
    { id: 'a', title: 'Seminar', start: at(9), end: at(11) },
    { id: 'b', title: 'Sport', start: at(18, 30), end: at(19, 30) },
    { id: 'c', title: 'Frei', start: at(0), end: at(23, 59), allDay: true },
    { id: 'd', title: 'Todo', start: at(12), end: at(13), is_task: true },
    { id: 'e', title: 'Abgesagt', start: at(10, 30), end: at(11), is_cancelled: true },
    { id: 'f', title: 'Morgen', start: at(8, 0, 19), end: at(9, 0, 19) },
]);

const base: PickInput = { layout: 'desktop', captureOpen: false, hasNotice: false, view: null, hasRunning: false, hasNext: false };

describe('toIslandEvents / findRunning / findNext', () => {
    it('filters tasks and cancelled entries and sorts by start', () => {
        expect(events.map((e) => e.id)).toEqual(['c', 'a', 'b', 'f']);
    });
    it('finds the running event and ignores all-day events', () => {
        expect(findRunning(events, NOW)?.id).toBe('a');
    });
    it('finds the next event of today only', () => {
        expect(findNext(events, NOW)?.id).toBe('b');
        expect(findNext(events, new Date(2026, 10, 18, 20, 0))).toBeNull();
    });
    it('returns nothing running outside events', () => {
        expect(findRunning(events, new Date(2026, 10, 18, 12, 0))).toBeNull();
    });
});

describe('pickIslandState', () => {
    it('is rest by default on desktop even with a running event', () => {
        expect(pickIslandState({ ...base, hasRunning: true })).toBe('rest');
    });
    it('prefers running, then next on mobile', () => {
        expect(pickIslandState({ ...base, layout: 'mobile', hasRunning: true, hasNext: true })).toBe('running');
        expect(pickIslandState({ ...base, layout: 'mobile', hasNext: true })).toBe('next');
        expect(pickIslandState({ ...base, layout: 'mobile' })).toBe('rest');
    });
    it('orders capture > notice > user view', () => {
        expect(pickIslandState({ ...base, captureOpen: true, hasNotice: true, view: 'day' })).toBe('capture');
        expect(pickIslandState({ ...base, hasNotice: true, view: 'day' })).toBe('notice');
        expect(pickIslandState({ ...base, view: 'day' })).toBe('day');
    });
});

describe('nextIslandState', () => {
    const d = { layout: 'desktop' as const, hasRunning: false, hasNext: false };
    it('cycles on desktop rest -> focus -> day -> rest', () => {
        expect(nextIslandState('rest', { ...d, hasRunning: true })).toBe('running');
        expect(nextIslandState('rest', { ...d, hasNext: true })).toBe('next');
        expect(nextIslandState('rest', d)).toBe('day');
        expect(nextIslandState('running', d)).toBe('day');
        expect(nextIslandState('day', d)).toBeNull();
    });
    it('cycles on mobile focus -> day -> month -> close', () => {
        const m = { ...d, layout: 'mobile' as const };
        expect(nextIslandState('running', m)).toBe('day');
        expect(nextIslandState('day', m)).toBe('rest');
        expect(nextIslandState('rest', m)).toBeNull();
    });
});

describe('buildWeekRow', () => {
    it('returns seven days starting Monday with today marked', () => {
        const row = buildWeekRow(NOW, 1, new Set(['2026-11-16', '2026-11-20']));
        expect(row).toHaveLength(7);
        expect(row.map((d) => d.date.getDate())).toEqual([16, 17, 18, 19, 20, 21, 22]);
        expect(row.filter((d) => d.isToday).map((d) => d.date.getDate())).toEqual([18]);
        expect(row.filter((d) => d.hasEvents).map((d) => d.date.getDate())).toEqual([16, 20]);
    });
    it('starts on Sunday when configured', () => {
        const row = buildWeekRow(NOW, 0, new Set());
        expect(row[0].date.getDate()).toBe(15);
        expect(row[0].date.getDay()).toBe(0);
    });
});

describe('detectCapture', () => {
    it('detects an event from a weekday plus time', () => {
        const r = detectCapture('Do 14 Uhr Lernen mit Jette', NOW);
        expect(r.kind).toBe('event');
        expect(r.reason).toBe('time');
        expect(r.startMins).toBe(14 * 60);
        expect(r.date?.getDate()).toBe(19);
    });
    it('detects an event from a bare explicit time', () => {
        const r = detectCapture('Treffen 18.30 Uhr', NOW);
        expect(r.kind).toBe('event');
        expect(r.startMins).toBe(18 * 60 + 30);
    });
    it('detects an event from a date only', () => {
        const r = detectCapture('am 24.11. Geburtstag', NOW);
        expect(r.kind).toBe('event');
        expect(r.reason).toBe('date');
        expect(r.date?.getDate()).toBe(24);
    });
    it('does not treat loose numbers as a time', () => {
        expect(detectCapture('Idee: 2 Poster skizzieren', NOW).kind).toBe('note');
    });
    it('detects a todo from an action word', () => {
        const r = detectCapture('Milch und Brot kaufen', NOW);
        expect(r.kind).toBe('todo');
        expect(r.reason).toBe('todo');
    });
    it('falls back to a note', () => {
        const r = detectCapture('Idee: Poster für Seminar skizzieren', NOW);
        expect(r.kind).toBe('note');
        expect(r.reason).toBe('none');
    });
});

describe('resolveCaptureTimes', () => {
    it('uses detected times with a one hour default', () => {
        const r = resolveCaptureTimes(detectCapture('Treffen 18.30 Uhr', NOW), NOW);
        expect(r.start.getHours()).toBe(18);
        expect(r.start.getMinutes()).toBe(30);
        expect(r.end.getTime() - r.start.getTime()).toBe(3600000);
    });
    it('falls back to the next full hour today', () => {
        const r = resolveCaptureTimes({ kind: 'event', reason: 'none', title: 'x', date: null, startMins: null, endMins: null }, NOW);
        expect(r.start.getHours()).toBe(11);
    });
});

describe('formatCountdown / progressOf / noteTitleOf', () => {
    it('formats minutes and seconds under one hour', () => {
        expect(formatCountdown(9 * 60000)).toMatchObject({ text: '9:00', unit: 'min', minutes: 9 });
        expect(formatCountdown(61 * 1000)).toMatchObject({ text: '1:01', minutes: 2 });
    });
    it('formats hours and minutes from one hour', () => {
        expect(formatCountdown((60 + 39) * 60000)).toMatchObject({ text: '1:39', unit: 'hrs' });
    });
    it('computes progress between 0 and 1', () => {
        expect(progressOf({ start: new Date(2026, 10, 18, 9), end: new Date(2026, 10, 18, 11) }, NOW)).toBe(0.5);
    });
    it('shortens long note titles', () => {
        expect(noteTitleOf('a'.repeat(100)).length).toBe(80);
        expect(noteTitleOf('Zeile 1\nZeile 2')).toBe('Zeile 1');
    });
});
