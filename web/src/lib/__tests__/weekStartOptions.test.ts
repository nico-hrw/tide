import { afterEach, describe, expect, it } from 'vitest';
import { getWeekStartsOn, useDataStore } from '@/store/useDataStore';

describe('getWeekStartsOn', () => {
    afterEach(() => {
        useDataStore.getState().setWeekStartsOn(1);
        localStorage.clear();
    });

    it('defaults to Monday (1)', () => {
        expect(getWeekStartsOn()).toBe(1);
    });

    it('returns 0 after the store is set to Sunday', () => {
        useDataStore.getState().setWeekStartsOn(0);
        expect(getWeekStartsOn()).toBe(0);
    });
});
