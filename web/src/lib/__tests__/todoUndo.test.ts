import { describe, expect, it } from 'vitest';
import { collectSubtree } from '../todoUndo';

describe('collectSubtree', () => {
    const tasks = [
        { id: 'a', parentId: null },
        { id: 'b', parentId: 'a' },
        { id: 'c', parentId: 'b' },
        { id: 'd', parentId: null },
    ];
    it('returns the task and descendants, parents first', () => {
        expect(collectSubtree(tasks, 'a').map((t) => t.id)).toEqual(['a', 'b', 'c']);
    });
    it('returns only the task when it has no children', () => {
        expect(collectSubtree(tasks, 'd').map((t) => t.id)).toEqual(['d']);
    });
    it('returns an empty list for an unknown id', () => {
        expect(collectSubtree(tasks, 'x')).toEqual([]);
    });
    it('survives cycles', () => {
        const cyc = [{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }];
        expect(collectSubtree(cyc, 'a').map((t) => t.id)).toEqual(['a', 'b']);
    });
});
