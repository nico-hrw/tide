import { describe, expect, it } from 'vitest';
import { resolveEnter } from '../islandEnter';
import type { IslandSearchItem } from '../islandSearch';

const a: IslandSearchItem = { id: 'a', title: 'Einkaufsliste', kind: 'note' };
const b: IslandSearchItem = { id: 'b', title: 'Einkauf Milch', kind: 'todo' };

describe('resolveEnter', () => {
    it('creates when there are no results', () => {
        expect(resolveEnter({ query: 'xyz', results: [], explicitSel: null })).toEqual({ kind: 'create' });
    });

    it('creates for a fuzzy top hit without an explicit pick', () => {
        expect(resolveEnter({ query: 'einkauf', results: [a, b], explicitSel: null })).toEqual({ kind: 'create' });
    });

    it('opens the top hit when its title equals the query (case-insensitive, trimmed)', () => {
        expect(resolveEnter({ query: '  EINKAUFSLISTE ', results: [a, b], explicitSel: null })).toEqual({ kind: 'open', item: a });
    });

    it('opens the explicitly picked item', () => {
        expect(resolveEnter({ query: 'einkauf', results: [a, b], explicitSel: 1 })).toEqual({ kind: 'open', item: b });
    });

    it('creates when the pick is out of range (create row or results changed)', () => {
        expect(resolveEnter({ query: 'einkauf', results: [a], explicitSel: 1 })).toEqual({ kind: 'create' });
        expect(resolveEnter({ query: 'einkaufsliste', results: [a], explicitSel: 5 })).toEqual({ kind: 'create' });
    });
});
