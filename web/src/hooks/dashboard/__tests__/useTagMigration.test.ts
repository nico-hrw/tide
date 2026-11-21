import { describe, it, expect, vi } from 'vitest';
import { runTagMigration, type TagMigrationDeps } from '../useTagMigration';
import type { Tag } from '@/lib/tags';
import type { CalendarEvent } from '@/components/Calendar/types';
import type { TaskItem } from '@/store/slices/types';

const ev = (id: string, extra: Record<string, unknown> = {}) =>
    ({ id, title: id, ...extra }) as unknown as CalendarEvent;
const task = (id: string, extra: Record<string, unknown> = {}) =>
    ({ id, title: id, ...extra }) as unknown as TaskItem;

function makeDeps(over: Partial<TagMigrationDeps> = {}) {
    let n = 0;
    const createTag = vi.fn(async (title: string) => `new-${++n}-${title}`);
    const saveEvent = vi.fn(async () => {});
    const saveTask = vi.fn(async () => {});
    const deps: TagMigrationDeps = {
        events: [], tasks: [], tags: [], createTag, saveEvent, saveTask, ...over,
    };
    return { deps, createTag, saveEvent, saveTask };
}

describe('runTagMigration', () => {
    it('creates each missing name once and writes patches', async () => {
        const tags: Tag[] = [{ id: 'g1', title: 'Work' }];
        const { deps, createTag, saveEvent, saveTask } = makeDeps({
            tags,
            events: [
                ev('e1', { groupIds: ['g1'], tags: ['Gym', 'work'] }),
                ev('e2', { tags: ['gym'] }),
            ],
            tasks: [task('t1', { tags: ['Gym', 'Home'] })],
        });
        await runTagMigration(deps);
        expect(createTag.mock.calls.map((c) => c[0])).toEqual(['Gym', 'Home']);
        expect(saveEvent).toHaveBeenCalledWith('e1', { groupIds: ['g1', 'new-1-Gym'], parent_id: 'g1', tags: [] });
        expect(saveEvent).toHaveBeenCalledWith('e2', { groupIds: ['new-1-Gym'], parent_id: 'new-1-Gym', tags: [] });
        expect(saveTask).toHaveBeenCalledWith('t1', { tags: ['new-1-Gym', 'new-2-Home'] });
    });

    it('is a no-op on the migrated result', async () => {
        const first = makeDeps({
            events: [ev('e1', { tags: ['Gym'] })],
            tasks: [task('t1', { tags: ['Gym'] })],
        });
        await runTagMigration(first.deps);
        const second = makeDeps({
            tags: [{ id: 'new-1-Gym', title: 'Gym' }],
            events: [ev('e1', { groupIds: ['new-1-Gym'], parent_id: 'new-1-Gym', tags: [] })],
            tasks: [task('t1', { tags: ['new-1-Gym'] })],
        });
        await runTagMigration(second.deps);
        expect(second.createTag).not.toHaveBeenCalled();
        expect(second.saveEvent).not.toHaveBeenCalled();
        expect(second.saveTask).not.toHaveBeenCalled();
    });

    it('continues after a failing saveEvent and a rerun picks it up', async () => {
        const events = [ev('e1', { tags: ['Gym'] }), ev('e2', { tags: ['Gym'] })];
        const saveEvent = vi.fn(async (id: string) => {
            if (id === 'e1') throw new Error('boom');
        });
        const a = makeDeps({ events, saveEvent });
        await runTagMigration(a.deps);
        expect(saveEvent).toHaveBeenCalledTimes(2);

        // rerun: tag now exists, e1 still unmigrated, e2 migrated
        const retry = vi.fn(async () => {});
        const b = makeDeps({
            tags: [{ id: 'g-gym', title: 'Gym' }],
            events: [events[0], ev('e2', { groupIds: ['g-gym'], tags: [] })],
            saveEvent: retry,
        });
        await runTagMigration(b.deps);
        expect(b.createTag).not.toHaveBeenCalled();
        expect(retry).toHaveBeenCalledTimes(1);
        expect(retry).toHaveBeenCalledWith('e1', { groupIds: ['g-gym'], parent_id: 'g-gym', tags: [] });
    });

    it('never creates tags from stale UUID references', async () => {
        const stale = '123e4567-e89b-12d3-a456-426614174000';
        const { deps, createTag } = makeDeps({ tasks: [task('t1', { tags: [stale, 'Home'] })] });
        await runTagMigration(deps);
        expect(createTag.mock.calls.map((c) => c[0])).toEqual(['Home']);
    });

    it('skips a name when createTag returns no id', async () => {
        const createTag = vi.fn(async () => undefined);
        const { deps, saveTask } = makeDeps({ createTag, tasks: [task('t1', { tags: ['Home'] })] });
        await runTagMigration(deps);
        expect(saveTask).not.toHaveBeenCalled();
    });
});
