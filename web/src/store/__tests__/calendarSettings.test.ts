import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadStore() {
    vi.resetModules();
    return import('@/store/useDataStore');
}

describe('calendar settings', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('defaults to infinite scrolling and Monday week start', async () => {
        const { useDataStore } = await loadStore();
        const state = useDataStore.getState();
        expect(state.calendarScrollMode).toBe('infinite');
        expect(state.weekStartsOn).toBe(1);
    });

    it('persists weekStartsOn and exposes it via getWeekStartsOn', async () => {
        const { useDataStore, getWeekStartsOn } = await loadStore();
        useDataStore.getState().setWeekStartsOn(0);
        expect(localStorage.getItem('tide_calendar_week_start')).toBe('0');
        expect(useDataStore.getState().weekStartsOn).toBe(0);
        expect(getWeekStartsOn()).toBe(0);
    });

    it('persists calendarScrollMode', async () => {
        const { useDataStore } = await loadStore();
        useDataStore.getState().setCalendarScrollMode('fixed');
        expect(localStorage.getItem('tide_calendar_scroll_mode')).toBe('fixed');
        expect(useDataStore.getState().calendarScrollMode).toBe('fixed');
    });

    it('reads valid stored values', async () => {
        localStorage.setItem('tide_calendar_week_start', '0');
        localStorage.setItem('tide_calendar_scroll_mode', 'fixed');
        const { useDataStore } = await loadStore();
        expect(useDataStore.getState().weekStartsOn).toBe(0);
        expect(useDataStore.getState().calendarScrollMode).toBe('fixed');
    });

    it('falls back to defaults for invalid stored values', async () => {
        localStorage.setItem('tide_calendar_week_start', '7');
        localStorage.setItem('tide_calendar_scroll_mode', 'bogus');
        const { useDataStore } = await loadStore();
        expect(useDataStore.getState().weekStartsOn).toBe(1);
        expect(useDataStore.getState().calendarScrollMode).toBe('infinite');
    });
});
