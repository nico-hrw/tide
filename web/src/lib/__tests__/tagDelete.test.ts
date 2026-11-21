import { describe, it, expect, vi } from 'vitest';
import { removeTagFromItems } from '../tags';
import { deleteTagEverywhere, type DeleteTagDeps } from '../deleteTag';
import type { CalendarEvent } from '@/components/Calendar/types';
import type { TaskItem } from '@/store/slices/types';

const ev = (id: string, p: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id, title: id, start: '2026-01-01T10:00:00Z', end: '2026-01-01T11:00:00Z', ...p,
});
const task = (id: string, p: Partial<TaskItem> = {}): TaskItem => ({ id, title: id, isCompleted: false, ...p });

describe('removeTagFromItems', () => {
    it('removes the tag and promotes the next one to parent_id', () => {
        const r = removeTagFromItems('a', [ev('e1', { groupIds: ['a', 'b'], parent_id: 'a' })], []);
        expect(r.eventPatches).toEqual([{ id: 'e1', groupIds: ['b'], parent_id: 'b' }]);
    });

    it('clears parent_id when the last tag goes', () => {
        const r = removeTagFromItems('a', [ev('e1', { groupIds: ['a'], parent_id: 'a' })], []);
        expect(r.eventPatches).toEqual([{ id: 'e1', groupIds: [], parent_id: null }]);
    });

    it('handles legacy events with only parent_id', () => {
        const r = removeTagFromItems('a', [ev('e1', { parent_id: 'a' })], []);
        expect(r.eventPatches).toEqual([{ id: 'e1', groupIds: [], parent_id: null }]);
    });

    it('removes the id from todo tags', () => {
        const r = removeTagFromItems('a', [], [task('t1', { tags: ['a', 'x'] })]);
        expect(r.taskPatches).toEqual([{ id: 't1', tags: ['x'] }]);
    });

    it('produces no patches for unaffected items', () => {
        const r = removeTagFromItems('a', [ev('e1', { groupIds: ['b'] }), ev('e2')], [task('t1', { tags: ['x'] }), task('t2')]);
        expect(r).toEqual({ eventPatches: [], taskPatches: [] });
    });

    it('removes duplicates of the id', () => {
        const r = removeTagFromItems('a', [ev('e1', { groupIds: ['a', 'b', 'a'] })], [task('t1', { tags: ['a', 'a'] })]);
        expect(r.eventPatches[0]).toEqual({ id: 'e1', groupIds: ['b'], parent_id: 'b' });
        expect(r.taskPatches[0]).toEqual({ id: 't1', tags: [] });
    });
});

function makeDeps(over: Partial<DeleteTagDeps> = {}) {
    const calls: string[] = [];
    const deps: DeleteTagDeps = {
        events: [ev('e1', { groupIds: ['a', 'b'] })],
        tasks: [task('t1', { tags: ['a'] })],
        saveEvent: vi.fn(async () => { calls.push('event'); }),
        saveTask: vi.fn(async () => { calls.push('task'); }),
        pruneViews: vi.fn(async () => { calls.push('prune'); }),
        clearFilters: vi.fn(() => { calls.push('filters'); }),
        deleteFile: vi.fn(async () => { calls.push('delete'); }),
        ...over,
    };
    return { deps, calls };
}

describe('deleteTagEverywhere', () => {
    it('runs patches, prune, filters, delete in order', async () => {
        const { deps, calls } = makeDeps();
        const r = await deleteTagEverywhere('a', deps);
        expect(r).toEqual({ ok: true });
        expect(calls).toEqual(['event', 'task', 'prune', 'filters', 'delete']);
        expect(deps.saveEvent).toHaveBeenCalledWith('e1', { groupIds: ['b'], parent_id: 'b' });
        expect(deps.saveTask).toHaveBeenCalledWith('t1', { tags: [] });
    });

    it('does not delete the file when a patch fails', async () => {
        const { deps } = makeDeps({ saveEvent: vi.fn(async () => { throw new Error('x'); }) });
        const r = await deleteTagEverywhere('a', deps);
        expect(r.ok).toBe(false);
        expect(deps.deleteFile).not.toHaveBeenCalled();
        expect(deps.pruneViews).not.toHaveBeenCalled();
    });

    it('does not delete the file when a todo patch fails', async () => {
        const { deps } = makeDeps({ saveTask: vi.fn(async () => { throw new Error('x'); }) });
        const r = await deleteTagEverywhere('a', deps);
        expect(r.ok).toBe(false);
        expect(deps.deleteFile).not.toHaveBeenCalled();
    });

    it('does not report ok when deleting the file fails', async () => {
        const { deps } = makeDeps({ deleteFile: vi.fn(async () => { throw new Error('x'); }) });
        expect((await deleteTagEverywhere('a', deps)).ok).toBe(false);
    });

    it('still deletes when nothing is affected', async () => {
        const { deps, calls } = makeDeps({ events: [], tasks: [] });
        expect(await deleteTagEverywhere('a', deps)).toEqual({ ok: true });
        expect(calls).toEqual(['prune', 'filters', 'delete']);
    });
});
