import { describe, it, expect } from 'vitest';
import { parseTagQuery, matchesAllTags } from '../tagQuery';
import type { Tag } from '@/lib/tags';

const tag = (id: string, title: string): Tag => ({ id, title });
const NZ = tag('nz', 'NZ');
const REISE = tag('reise', 'Reise');
const RECHT = tag('recht', 'Recht');

describe('parseTagQuery', () => {
    it('resolves a single exact token', () => {
        expect(parseTagQuery('#NZ', [NZ])).toEqual({ tagIds: ['nz'], text: '', ambiguous: null });
    });

    it('is case-insensitive and keeps the remaining text', () => {
        expect(parseTagQuery('#nz reise', [NZ])).toEqual({ tagIds: ['nz'], text: 'reise', ambiguous: null });
    });

    it('resolves several tokens in input order', () => {
        const r = parseTagQuery('#NZ #Reise foo', [REISE, NZ]);
        expect(r.tagIds).toEqual(['nz', 'reise']);
        expect(r.text).toBe('foo');
        expect(r.ambiguous).toBeNull();
    });

    it('applies a unique prefix match', () => {
        const r = parseTagQuery('#re', [NZ, REISE]);
        expect(r.tagIds).toEqual(['reise']);
        expect(r.text).toBe('');
    });

    it('reports several prefix matches as ambiguous and applies nothing', () => {
        const r = parseTagQuery('#re foo', [REISE, NZ, RECHT]);
        expect(r.tagIds).toEqual([]);
        expect(r.ambiguous?.token).toBe('#re');
        expect(r.ambiguous?.candidates).toEqual([REISE, RECHT]);
        expect(r.text).toBe('foo');
    });

    it('only reports the first ambiguous token', () => {
        const r = parseTagQuery('#NZ #re', [NZ, REISE, RECHT]);
        expect(r.tagIds).toEqual(['nz']);
        expect(r.ambiguous?.candidates).toEqual([REISE, RECHT]);
        expect(r.text).toBe('');
    });

    it('keeps unknown tokens in the text', () => {
        expect(parseTagQuery('Meeting #3', [NZ])).toEqual({ tagIds: [], text: 'Meeting #3', ambiguous: null });
    });

    it('does not treat C# or a#b as tokens', () => {
        expect(parseTagQuery('C#', [tag('c', 'C')]).text).toBe('C#');
        expect(parseTagQuery('C#', [tag('c', 'C')]).tagIds).toEqual([]);
        const r = parseTagQuery('a#b', [tag('b', 'b')]);
        expect(r.tagIds).toEqual([]);
        expect(r.text).toBe('a#b');
    });

    it('treats a lone # as text', () => {
        expect(parseTagQuery('#', [NZ])).toEqual({ tagIds: [], text: '#', ambiguous: null });
    });

    it('deduplicates tokens resolving to the same tag', () => {
        expect(parseTagQuery('#NZ #nz', [NZ]).tagIds).toEqual(['nz']);
    });

    it('lets an exact match beat prefix matches', () => {
        const long = tag('nzr', 'NZ Reise');
        const r = parseTagQuery('#nz', [long, NZ]);
        expect(r.tagIds).toEqual(['nz']);
        expect(r.ambiguous).toBeNull();
    });

    it('prefix-matches a multi-word tag uniquely by its first word', () => {
        const long = tag('nzr', 'NZ Reise');
        const r = parseTagQuery('#NZ Reise', [long]);
        expect(r.tagIds).toEqual(['nzr']);
        expect(r.text).toBe('Reise');
    });

    it('returns an empty result for whitespace-only queries', () => {
        expect(parseTagQuery('   ', [NZ])).toEqual({ tagIds: [], text: '', ambiguous: null });
    });

    it('collapses whitespace left by removed tokens', () => {
        expect(parseTagQuery('foo  #nz   bar', [NZ]).text).toBe('foo bar');
    });
});

describe('matchesAllTags', () => {
    const known = new Set(['a', 'b', 'c']);

    it('requires every wanted id', () => {
        expect(matchesAllTags(['a', 'b'], ['a'], known)).toBe(true);
        expect(matchesAllTags(['a', 'b'], ['a', 'b'], known)).toBe(true);
        expect(matchesAllTags(['a', 'b'], ['a', 'c'], known)).toBe(false);
    });

    it('handles missing or empty item tags', () => {
        expect(matchesAllTags(undefined, ['a'], known)).toBe(false);
        expect(matchesAllTags([], ['a'], known)).toBe(false);
        expect(matchesAllTags(undefined, [], known)).toBe(true);
        expect(matchesAllTags([], [], known)).toBe(true);
    });

    it('ignores ids that are not known', () => {
        expect(matchesAllTags(['gone'], ['gone'], new Set())).toBe(false);
    });
});
