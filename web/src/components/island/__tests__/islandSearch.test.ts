import { describe, expect, it } from 'vitest';
import { buildIslandSearchItems, nextSelection, searchIslandItems } from '../islandSearch';

const items = buildIslandSearchItems({
    notes: [
        { id: 'n1', title: 'Einkaufsliste', type: 'file' },
        { id: 'f1', title: 'Einkauf Ordner', type: 'folder' },
        { id: 'g1', title: 'Einkauf Tag', type: 'file', isGroup: true },
    ],
    events: [
        { id: 'e1', title: 'Zahnarzt', start: '2026-12-02T09:00:00.000Z' },
        { id: 'e2', title: 'Einkaufen gehen', start: '2026-12-03T09:00:00.000Z' },
    ],
    tasks: [{ id: 't1', title: 'Einkauf Milch' }],
});

describe('buildIslandSearchItems', () => {
    it('maps notes, events and todos and drops folders and tags', () => {
        expect(items.map((i) => `${i.kind}:${i.id}`).sort()).toEqual(['event:e1', 'event:e2', 'note:n1', 'todo:t1']);
    });
});

describe('searchIslandItems', () => {
    it('returns nothing for an empty query', () => {
        expect(searchIslandItems(items, '   ')).toEqual([]);
    });

    it('finds across notes, events and todos', () => {
        const kinds = new Set(searchIslandItems(items, 'einkauf').map((i) => i.kind));
        expect(kinds).toEqual(new Set(['note', 'event', 'todo']));
    });

    it('ranks titles starting with the query first', () => {
        const res = searchIslandItems(items, 'einkaufen');
        expect(res[0].id).toBe('e2');
    });

    it('respects the limit', () => {
        expect(searchIslandItems(items, 'einkauf', 2)).toHaveLength(2);
    });
});

describe('nextSelection', () => {
    it('cycles through results and the trailing create row', () => {
        // 3 results -> rows 0..3 (3 = create row)
        expect(nextSelection(0, 3, 1)).toBe(1);
        expect(nextSelection(3, 3, 1)).toBe(0);
        expect(nextSelection(0, 3, -1)).toBe(3);
    });

    it('stays on the create row when there are no results', () => {
        expect(nextSelection(0, 0, 1)).toBe(0);
        expect(nextSelection(0, 0, -1)).toBe(0);
    });
});
