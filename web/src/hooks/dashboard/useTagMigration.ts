import { useEffect, useLayoutEffect, useRef } from 'react';
import type { CalendarEvent } from '@/components/Calendar/types';
import type { TaskItem } from '@/store/slices/types';
import { buildTagPatches, isForeignOwned, missingTagNames, UUID_RE, type Tag } from '@/lib/tags';

export interface TagMigrationDeps {
    events: CalendarEvent[];
    tasks: TaskItem[];
    tags: Tag[];
    createTag: (title: string) => Promise<string | undefined>;
    saveEvent: (id: string, u: { groupIds: string[]; parent_id: string | null; tags: string[] }) => Promise<void> | void;
    saveTask: (id: string, u: { tags: string[] }) => Promise<void>;
    /** Current user; items owned by someone else are never rewritten. */
    myId?: string;
    /** Live state readers; patches are computed from these after tag creation so concurrent edits are not overwritten. */
    getEvents?: () => CalendarEvent[];
    getTasks?: () => TaskItem[];
}

/** Creates missing tags, then rewrites events/todos to reference tag ids. Idempotent; per-item failures are isolated. */
export async function runTagMigration(deps: TagMigrationDeps): Promise<void> {
    const { events, tasks, createTag, saveEvent, saveTask, myId } = deps;
    let tags = deps.tags;

    // Stale tag UUIDs look like names to missingTagNames; never turn them into tags.
    const mine = <T extends { owner_id?: string }>(list: T[]) => list.filter((i) => !isForeignOwned(i, myId));
    const names = missingTagNames(mine(events), mine(tasks), tags).filter((n) => !UUID_RE.test(n));
    const created: Tag[] = [];
    for (const title of names) {
        try {
            const id = await createTag(title);
            if (id) created.push({ id, title });
        } catch (err) {
            console.error('[tag-migration] createTag failed', title, err);
        }
    }
    if (created.length > 0) tags = [...tags, ...created];

    const liveEvents = deps.getEvents ? deps.getEvents() : events;
    const liveTasks = deps.getTasks ? deps.getTasks() : tasks;
    const { eventPatches, taskPatches } = buildTagPatches(liveEvents, liveTasks, tags, myId);

    for (const p of eventPatches) {
        try {
            await saveEvent(p.id, { groupIds: p.groupIds, parent_id: p.groupIds[0] ?? null, tags: p.tags });
        } catch (err) {
            console.error('[tag-migration] saveEvent failed', p.id, err);
        }
    }
    for (const p of taskPatches) {
        try {
            await saveTask(p.id, { tags: p.tags });
        } catch (err) {
            console.error('[tag-migration] saveTask failed', p.id, err);
        }
    }
}

export interface UseTagMigrationDeps extends TagMigrationDeps {
    ready: boolean;
}

/** Runs the tag migration once per session, after files, events and tasks are loaded. */
export function useTagMigration(deps: UseTagMigrationDeps): void {
    const ranRef = useRef(false);
    const depsRef = useRef(deps);
    useLayoutEffect(() => {
        depsRef.current = deps;
    });

    useEffect(() => {
        if (!deps.ready || ranRef.current) return;
        ranRef.current = true;
        const { ready: _ready, ...rest } = depsRef.current;
        void _ready;
        void runTagMigration(rest);
    }, [deps.ready]);
}
