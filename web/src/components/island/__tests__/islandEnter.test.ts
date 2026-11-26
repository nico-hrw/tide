import { describe, expect, it } from 'vitest';
import { resolveEnter } from '../islandEnter';
import { buildIslandSearchItems, nextSelection, searchIslandItems, type IslandSearchItem } from '../islandSearch';

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

    it('Enter opens exactly the row the arrows selected, never a second target of the same thing', () => {
        const items = buildIslandSearchItems({
            notes: [],
            events: [{ id: 'b1', title: 'Geburtstag Anna', start: '2026-03-01' }],
            tasks: [],
        });
        const results = searchIslandItems(items, 'Geburtstag');
        expect(results).toHaveLength(1);
        // Arrow down from nothing lands on row 0 = the event; row 1 is the create row
        const row = nextSelection(-1, results.length, 1);
        expect(resolveEnter({ query: 'Geburtstag', results, explicitSel: row })).toEqual({ kind: 'open', item: results[0] });
        expect(results[0].kind).toBe('event');
        expect(resolveEnter({ query: 'Geburtstag', results, explicitSel: nextSelection(row, results.length, 1) })).toEqual({ kind: 'create' });
    });
});
