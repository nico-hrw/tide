import { describe, it, expect, vi } from 'vitest';
import { applyView, viewFilters } from '../applyView';
import type { SavedView } from '../viewsStorage';

const view: SavedView = { id: 'v', name: 'V', tagIds: ['a', 'gone', 'b'], untagged: true, viewMode: 'month' };

describe('applyView', () => {
    it('sets the filter and the view mode', () => {
        const setFilter = vi.fn();
        const setViewMode = vi.fn();
        applyView(view, { setFilter, setViewMode, knownTagIds: new Set(['a', 'gone', 'b']) });
        expect(setFilter).toHaveBeenCalledWith({ tagIds: ['a', 'gone', 'b'], untagged: true });
        expect(setViewMode).toHaveBeenCalledWith('month');
    });

    it('prunes unknown tag ids', () => {
        const setFilter = vi.fn();
        applyView(view, { setFilter, setViewMode: vi.fn(), knownTagIds: new Set(['a', 'b']) });
        expect(setFilter).toHaveBeenCalledWith({ tagIds: ['a', 'b'], untagged: true });
    });

    it('sets the filter before the mode', () => {
        const calls: string[] = [];
        applyView(view, {
            setFilter: () => calls.push('filter'),
            setViewMode: () => calls.push('mode'),
            knownTagIds: new Set(),
        });
        expect(calls).toEqual(['filter', 'mode']);
    });
});

describe('viewFilters', () => {
    it('drops unknown tag ids and keeps known ones in order', () => {
        expect(viewFilters(view, new Set(['a', 'b']))).toEqual({ tagIds: ['a', 'b'], untagged: true });
    });

    it('keeps only untagged when no tag ids are set', () => {
        const v: SavedView = { ...view, tagIds: [], untagged: true };
        expect(viewFilters(v, new Set(['a']))).toEqual({ tagIds: [], untagged: true });
    });

    it('returns an empty filter for no tags and untagged false', () => {
        const v: SavedView = { ...view, tagIds: [], untagged: false };
        expect(viewFilters(v, new Set(['a']))).toEqual({ tagIds: [], untagged: false });
    });
});
