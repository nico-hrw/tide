import { describe, expect, it } from 'vitest';
import { matchesTagFilter, isHiddenByDefault, type TagFilter } from '@/lib/tagFilter';

const known = new Set(['work', 'secret', 'other']);
const hidden = new Set(['secret']);
const def: TagFilter = { tagIds: [], untagged: false };

describe('hidden tags', () => {
    it('hides items whose only known tags are hidden, by default', () => {
        expect(isHiddenByDefault(['secret'], known, hidden)).toBe(true);
        expect(matchesTagFilter(['secret'], def, known, hidden)).toBe(false);
    });
    it('keeps items with at least one visible tag or without tags', () => {
        expect(matchesTagFilter(['secret', 'work'], def, known, hidden)).toBe(true);
        expect(matchesTagFilter([], def, known, hidden)).toBe(true);
    });
    it('include shows hidden items too', () => {
        expect(matchesTagFilter(['secret'], { ...def, hidden: 'include' }, known, hidden)).toBe(true);
    });
    it('only shows just the hidden items', () => {
        const only: TagFilter = { ...def, hidden: 'only' };
        expect(matchesTagFilter(['secret'], only, known, hidden)).toBe(true);
        expect(matchesTagFilter(['work'], only, known, hidden)).toBe(false);
        expect(matchesTagFilter([], only, known, hidden)).toBe(false);
    });
    it('combines with a selected tag', () => {
        const f: TagFilter = { tagIds: ['secret'], untagged: false, hidden: 'include' };
        expect(matchesTagFilter(['secret'], f, known, hidden)).toBe(true);
        expect(matchesTagFilter(['work'], f, known, hidden)).toBe(false);
    });
    it('without any hidden setting behaves as before', () => {
        expect(matchesTagFilter(['secret'], def, known)).toBe(true);
        expect(matchesTagFilter(['work'], { tagIds: ['work'], untagged: false }, known)).toBe(true);
    });
});
