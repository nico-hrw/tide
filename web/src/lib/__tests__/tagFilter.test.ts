import { describe, it, expect } from 'vitest';
import { matchesTagFilter } from '../tagFilter';

const known = new Set(['a', 'b', 'c']);

describe('matchesTagFilter', () => {
    it('empty filter matches everything', () => {
        expect(matchesTagFilter([], { tagIds: [], untagged: false }, known)).toBe(true);
        expect(matchesTagFilter(['a'], { tagIds: [], untagged: false }, known)).toBe(true);
    });
    it('matches a single tag', () => {
        expect(matchesTagFilter(['a', 'b'], { tagIds: ['a'], untagged: false }, known)).toBe(true);
        expect(matchesTagFilter(['b'], { tagIds: ['a'], untagged: false }, known)).toBe(false);
    });
    it('ORs across tags', () => {
        const f = { tagIds: ['a', 'c'], untagged: false };
        expect(matchesTagFilter(['c'], f, known)).toBe(true);
        expect(matchesTagFilter(['b'], f, known)).toBe(false);
    });
    it('untagged matches items without tags or only unknown ids', () => {
        const f = { tagIds: [], untagged: true };
        expect(matchesTagFilter([], f, known)).toBe(true);
        expect(matchesTagFilter(['zzz'], f, known)).toBe(true);
        expect(matchesTagFilter(['a'], f, known)).toBe(false);
    });
    it('untagged OR tag', () => {
        const f = { tagIds: ['a'], untagged: true };
        expect(matchesTagFilter([], f, known)).toBe(true);
        expect(matchesTagFilter(['a'], f, known)).toBe(true);
        expect(matchesTagFilter(['b'], f, known)).toBe(false);
    });
});
