import { describe, expect, it } from 'vitest';
import {
    MIN_STINT_MS,
    createTrackerState,
    formatDuration,
    reduceTracker,
    workspaceLabel,
    type TrackerState,
} from '@/lib/workspaceTime';

const T0 = new Date(2026, 10, 26, 10, 0, 0).getTime();
const MIN = 60_000;

function start(at = T0): TrackerState {
    let s = createTrackerState(at, true);
    s = reduceTracker(s, { type: 'workspace', label: 'Studium', at }).state;
    return s;
}

describe('workspaceLabel', () => {
    it('maps main to Standard and joins several workspaces', () => {
        expect(workspaceLabel(['main'])).toBe('Standard');
        expect(workspaceLabel(['Studium', 'Privat'])).toBe('Studium + Privat');
        expect(workspaceLabel([])).toBeNull();
    });
});

describe('reduceTracker', () => {
    it('prompts when a stint of at least 5 minutes ends by switching', () => {
        const s = start();
        const r = reduceTracker(s, { type: 'workspace', label: 'Privat', at: T0 + 47 * MIN });
        expect(r.prompt).toEqual({ label: 'Studium', start: T0, end: T0 + 47 * MIN });
        expect(r.state.label).toBe('Privat');
        expect(r.state.totals.Studium).toBe(47 * MIN);
    });

    it('does not prompt for a short stint, but still counts it', () => {
        const s = start();
        const r = reduceTracker(s, { type: 'workspace', label: 'Privat', at: T0 + (MIN_STINT_MS - 1) });
        expect(r.prompt).toBeNull();
        expect(r.state.totals.Studium).toBe(MIN_STINT_MS - 1);
    });

    it('never prompts on the first workspace (nothing was left)', () => {
        const r = reduceTracker(createTrackerState(T0, true), { type: 'workspace', label: 'Studium', at: T0 + 60 * MIN });
        expect(r.prompt).toBeNull();
        expect(r.state.label).toBe('Studium');
    });

    it('ignores an unchanged workspace', () => {
        const s = start();
        const r = reduceTracker(s, { type: 'workspace', label: 'Studium', at: T0 + 30 * MIN });
        expect(r.state).toBe(s);
        expect(r.prompt).toBeNull();
    });

    it('does not count or prompt for hidden time', () => {
        let s = start();
        s = reduceTracker(s, { type: 'visibility', visible: false, at: T0 + 2 * MIN }).state;
        // Two hours hidden in Studium, then back: only the two visible minutes count.
        s = reduceTracker(s, { type: 'visibility', visible: true, at: T0 + 122 * MIN }).state;
        expect(s.totals.Studium).toBe(2 * MIN);
        const r = reduceTracker(s, { type: 'workspace', label: 'Privat', at: T0 + 124 * MIN });
        expect(r.prompt).toBeNull();
        expect(r.state.totals.Studium).toBe(4 * MIN);
    });

    it('does not prompt for a stint that ends while hidden', () => {
        let s = start();
        s = reduceTracker(s, { type: 'visibility', visible: false, at: T0 + 30 * MIN }).state;
        const r = reduceTracker(s, { type: 'workspace', label: 'Privat', at: T0 + 90 * MIN });
        expect(r.prompt).toBeNull();
        expect(r.state.totals.Studium).toBe(30 * MIN);
    });

    it('does not start counting when switching while hidden', () => {
        let s = createTrackerState(T0, false);
        s = reduceTracker(s, { type: 'workspace', label: 'Studium', at: T0 }).state;
        s = reduceTracker(s, { type: 'workspace', label: 'Privat', at: T0 + 30 * MIN }).state;
        expect(s.totals.Studium).toBeUndefined();
        expect(s.stintStart).toBeNull();
    });

    it('accumulates totals per workspace over several switches', () => {
        let s = start();
        s = reduceTracker(s, { type: 'workspace', label: 'Privat', at: T0 + 10 * MIN }).state;
        s = reduceTracker(s, { type: 'workspace', label: 'Studium', at: T0 + 25 * MIN }).state;
        expect(s.totals.Studium).toBe(10 * MIN + 0);
        expect(s.totals.Privat).toBe(15 * MIN);
    });

    it('starts a fresh day with empty totals', () => {
        const late = new Date(2026, 10, 26, 23, 0, 0).getTime();
        let s = start(late);
        s = reduceTracker(s, { type: 'workspace', label: 'Privat', at: late + 20 * MIN }).state;
        expect(s.totals.Studium).toBe(20 * MIN);
        const nextDay = late + 2 * 60 * 60 * 1000; // 01:00 the next day
        const r = reduceTracker(s, { type: 'visibility', visible: true, at: nextDay });
        expect(r.state.totals).toEqual({});
        expect(r.state.day).not.toBe(s.day);
    });
});

describe('formatDuration', () => {
    it('formats minutes and hours', () => {
        expect(formatDuration(47 * MIN)).toBe('47 min');
        expect(formatDuration(65 * MIN)).toBe('1 h 05 min');
        expect(formatDuration(20_000)).toBe('< 1 min');
    });
});
