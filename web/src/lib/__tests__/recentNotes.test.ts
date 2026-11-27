import { describe, expect, it } from 'vitest';
import { noteCreatedMs, recentCounts, shouldPlayStartup, STARTUP_MIN_GAP_DAYS, type StartupDecision } from '../recentNotes';
import { StartupGraph } from '../startupGraph';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 27, 12, 0, 0);
const daysAgo = (d: number) => NOW - d * DAY;

describe('noteCreatedMs', () => {
    it('reads the server timestamp, falls back to createdAt, and is null for anything unusable', () => {
        expect(noteCreatedMs({ created_at: '2026-11-20T10:00:00Z' })).toBe(Date.UTC(2026, 10, 20, 10));
        expect(noteCreatedMs({ createdAt: '2026-11-20T10:00:00Z' })).toBe(Date.UTC(2026, 10, 20, 10));
        expect(noteCreatedMs({})).toBeNull();
        expect(noteCreatedMs({ created_at: 'not a date' })).toBeNull();
        expect(noteCreatedMs({ created_at: '0001-01-01T00:00:00Z' })).toBeNull();
    });
});

describe('recentCounts', () => {
    it('counts the last 7 and the last 30 days, the month including the week, and skips unknown dates', () => {
        const created = [daysAgo(1), daysAgo(6), daysAgo(8), daysAgo(29), daysAgo(31), daysAgo(200), null];
        expect(recentCounts(created, NOW)).toEqual({ week: 2, month: 4 });
    });
});

describe('shouldPlayStartup', () => {
    const base: StartupDecision = { enabled: true, reducedMotion: false, alreadyThisSession: false, lastShown: null, nowMs: NOW, monthCount: 5 };

    it('plays the first time there is something to show', () => {
        expect(shouldPlayStartup(base)).toBe(true);
    });

    it('stays off with the setting off, reduced motion, or once already this session', () => {
        expect(shouldPlayStartup({ ...base, enabled: false })).toBe(false);
        expect(shouldPlayStartup({ ...base, reducedMotion: true })).toBe(false);
        expect(shouldPlayStartup({ ...base, alreadyThisSession: true })).toBe(false);
    });

    it('needs a few new notes in the last month', () => {
        expect(shouldPlayStartup({ ...base, monthCount: 2 })).toBe(false);
        expect(shouldPlayStartup({ ...base, monthCount: 3 })).toBe(true);
    });

    it('comes back only after a few days without it', () => {
        expect(shouldPlayStartup({ ...base, lastShown: NOW - (STARTUP_MIN_GAP_DAYS - 0.5) * DAY })).toBe(false);
        expect(shouldPlayStartup({ ...base, lastShown: NOW - (STARTUP_MIN_GAP_DAYS + 0.5) * DAY })).toBe(true);
    });
});

describe('StartupGraph timeline', () => {
    const canvas = document.createElement('canvas');
    const nodes = [
        { id: 'o1', degree: 2, ageDays: 90 }, { id: 'o2', degree: 0, ageDays: 120 },
        { id: 'm1', degree: 1, ageDays: 20 }, { id: 'm2', degree: 1, ageDays: 12 },
        { id: 'w1', degree: 0, ageDays: 3 }, { id: 'w2', degree: 1, ageDays: 1 },
    ];
    const make = (list = nodes) => new StartupGraph(canvas, { width: 600, height: 400, nodes: list, edges: [{ a: 'o1', b: 'm1' }, { a: 'm1', b: 'w2' }], monthColor: '#A6B7A8', weekColor: '#D2A96A' });

    it('counts the month (including the week) and the week as the animation advances, then ends', () => {
        const g = make();
        expect(g.stateAt(0)).toMatchObject({ month: 0, week: 0, phase: 'all' });
        const end = g.stateAt(g.durationMs);
        expect(end).toMatchObject({ month: 4, week: 2, phase: 'week' });
        expect(g.durationMs).toBeGreaterThan(4000);
    });

    it('starts with the month straight away when there are no older notes', () => {
        const g = make(nodes.filter((n) => n.ageDays < 30));
        expect(g.stateAt(900).phase).toBe('month');
    });
});
