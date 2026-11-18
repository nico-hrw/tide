import { afterEach, describe, expect, it } from 'vitest';
import { getWeekStartsOn, useDataStore } from '@/store/useDataStore';
import { rotateWeekdayLabels } from '@/lib/calendarWeeks';

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

describe('rotateWeekdayLabels', () => {
    const labels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

    it('keeps Monday-first order for weekStartsOn 1', () => {
        expect(rotateWeekdayLabels(labels, 1)).toEqual(labels);
    });

    it('starts with Sunday for weekStartsOn 0', () => {
        expect(rotateWeekdayLabels(labels, 0)).toEqual(['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']);
    });
});
