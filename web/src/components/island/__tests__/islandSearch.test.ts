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

describe('buildIslandSearchItems: one result per thing', () => {
    const keys = (i: ReturnType<typeof buildIslandSearchItems>) => i.map((x) => `${x.kind}:${x.id}`).sort();

    it('a birthday event without a note yields only the event', () => {
        const res = buildIslandSearchItems({ notes: [], events: [{ id: 'b1', title: 'Geburtstag Anna', start: '2026-03-01' }], tasks: [] });
        expect(keys(res)).toEqual(['event:b1']);
        expect(searchIslandItems(res, 'Geburtstag').map((r) => r.kind)).toEqual(['event']);
    });

    it('an event and a separate note with the same title stay one event and one note', () => {
        const res = buildIslandSearchItems({
            notes: [{ id: 'n1', title: 'Planung', type: 'note' }],
            events: [{ id: 'e1', title: 'Planung', start: '2026-03-01' }],
            tasks: [],
        });
        expect(keys(res)).toEqual(['event:e1', 'note:n1']);
    });

    it('a plain note yields only the note', () => {
        expect(keys(buildIslandSearchItems({ notes: [{ id: 'n1', title: 'Idee', type: 'note' }], events: [], tasks: [] }))).toEqual(['note:n1']);
    });

    it('an id that is both an event and a note counts as the event only', () => {
        const res = buildIslandSearchItems({ notes: [{ id: 'x', title: 'Anna', type: 'note' }], events: [{ id: 'x', title: 'Anna' }], tasks: [] });
        expect(keys(res)).toEqual(['event:x']);
    });

    it('notes list entries of event or index type are no notes', () => {
        const res = buildIslandSearchItems({ notes: [{ id: 'a', type: 'event', title: 'A' }, { id: 'b', type: 'index', title: 'B' }, { id: 'c', type: 'canvas', title: 'C' }], events: [], tasks: [] });
        expect(keys(res)).toEqual(['note:c']);
    });

    it('a todo with a calendar entry shows once, as the todo', () => {
        const res = buildIslandSearchItems({
            notes: [],
            events: [{ id: 'ev1', title: 'Steuer', start: '2026-03-01', linkedTaskId: 't1' }],
            tasks: [{ id: 't1', title: 'Steuer', dueDate: '2026-03-01' }],
        });
        expect(keys(res)).toEqual(['todo:t1']);
    });

    it('a todo calendar entry whose todo no longer exists stays an event', () => {
        const res = buildIslandSearchItems({ notes: [], events: [{ id: 'ev1', title: 'Steuer', linkedTaskId: 'gone' }], tasks: [] });
        expect(keys(res)).toEqual(['event:ev1']);
    });

    it('recurrence instances and repeated ids collapse into one result', () => {
        const res = buildIslandSearchItems({
            notes: [{ id: 'n1', title: 'A', type: 'note' }, { id: 'n1', title: 'A', type: 'note' }],
            events: [{ id: 'w1', title: 'Sport' }, { id: 'w1_1700000000000', title: 'Sport' }, { id: 'w1_1700086400000', title: 'Sport' }],
            tasks: [{ id: 't1', title: 'T' }, { id: 't1', title: 'T' }],
        });
        expect(keys(res)).toEqual(['event:w1', 'note:n1', 'todo:t1']);
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
