import { describe, it, expect } from 'vitest';
import { resolveTagTitles } from './calendarUtils';

describe('resolveTagTitles', () => {
    const themes = [{ id: 'a', title: 'Arbeit' }, { id: 'b', title: 'Privat' }];
    it('resolves ids in order and drops unknown ids', () => {
        expect(resolveTagTitles(['b', 'x', 'a'], themes)).toEqual([
            { id: 'b', title: 'Privat' },
            { id: 'a', title: 'Arbeit' },
        ]);
    });
    it('returns empty for no ids', () => {
        expect(resolveTagTitles([], themes)).toEqual([]);
    });
});
