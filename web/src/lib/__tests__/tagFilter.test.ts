import { describe, it, expect } from 'vitest';
import { matchesTagFilter, pruneTagFilter, tagFilterTexts } from '../tagFilter';

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

describe('pruneTagFilter', () => {
    it('all stale ids -> empty filter', () => {
        expect(pruneTagFilter({ tagIds: ['x', 'y'], untagged: false }, known)).toEqual({ tagIds: [], untagged: false });
    });
    it('mixed keeps only known ids', () => {
        expect(pruneTagFilter({ tagIds: ['a', 'x', 'b'], untagged: false }, known).tagIds).toEqual(['a', 'b']);
    });
    it('preserves untagged', () => {
        expect(pruneTagFilter({ tagIds: ['x'], untagged: true }, known)).toEqual({ tagIds: [], untagged: true });
    });
});

describe('tagFilterTexts', () => {
    it('names a tag in the labels', () => {
        const t = tagFilterTexts('Uni', ['a']);
        expect(t.createLabel).toBe('Aufgabe mit #Uni erstellen');
        expect(t.sectionTitle).toBe('#Uni');
    });
    it('does not treat an untagged-only filter as a tag', () => {
        const t = tagFilterTexts('Ohne Tag', []);
        expect(t.createLabel).toBe('Aufgabe ohne Tag erstellen');
        expect(t.emptyTitle).not.toContain('#');
        expect(t.sectionTitle).toBe('Ohne Tag');
    });
});
