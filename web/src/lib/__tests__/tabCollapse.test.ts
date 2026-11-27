import { describe, expect, it } from 'vitest';
import { TAB_GAP, TAB_READABLE_WIDTH, TAB_RESERVED, tabCapacity, tabsToFold } from '../tabCollapse';

const width = (n: number) => n * (TAB_READABLE_WIDTH + TAB_GAP) + TAB_RESERVED;

describe('tabCapacity', () => {
    it('counts how many readable tabs fit', () => {
        expect(tabCapacity(width(5))).toBe(5);
        expect(tabCapacity(width(4) + TAB_READABLE_WIDTH)).toBe(5);
        expect(tabCapacity(width(5) - TAB_READABLE_WIDTH)).toBe(4);
        expect(tabCapacity(0)).toBe(1);
    });
});

describe('tabsToFold', () => {
    const ids = ['todos', 'cal', 'n1', 'n2', 'n3', 'n4'];
    const foldable = new Set(['n1', 'n2', 'n3', 'n4']);

    it('folds nothing while everything fits at a readable width', () => {
        expect(tabsToFold({ ids, foldable, usage: {}, activeId: 'cal', available: width(6) })).toEqual([]);
    });

    it('folds the least used note tabs first, and never plugin tabs', () => {
        const usage = { n1: 10, n2: 1, n3: 5, n4: 0 };
        const folded = tabsToFold({ ids, foldable, usage, activeId: 'cal', available: width(4) });
        expect(folded[0]).toBe('n4');
        expect(folded).not.toContain('todos');
        expect(folded).not.toContain('cal');
    });

    it('keeps the active tab visible even when it is rarely used', () => {
        const folded = tabsToFold({ ids, foldable, usage: { n1: 9, n2: 9, n3: 9, n4: 0 }, activeId: 'n4', available: width(3) });
        expect(folded).not.toContain('n4');
    });

    it('leaves the rest visible with the group slot taken into account', () => {
        const folded = tabsToFold({ ids, foldable, usage: {}, activeId: 'cal', available: width(4) });
        const visible = ids.length - folded.length + 1;
        expect(visible).toBeLessThanOrEqual(tabCapacity(width(4)));
    });
});
