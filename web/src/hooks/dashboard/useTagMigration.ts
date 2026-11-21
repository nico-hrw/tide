import { useEffect, useRef } from 'react';
import type { CalendarEvent } from '@/components/Calendar/types';
import type { TaskItem } from '@/store/slices/types';
import { buildTagPatches, missingTagNames, type Tag } from '@/lib/tags';

export interface TagMigrationDeps {
    events: CalendarEvent[];
    tasks: TaskItem[];
    tags: Tag[];
    createTag: (title: string) => Promise<string | undefined>;
    saveEvent: (id: string, u: { groupIds: string[]; parent_id: string | null; tags: string[] }) => Promise<void> | void;
    saveTask: (id: string, u: { tags: string[] }) => Promise<void>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Creates missing tags, then rewrites events/todos to reference tag ids. Idempotent; per-item failures are isolated. */
export async function runTagMigration(deps: TagMigrationDeps): Promise<void> {
    const { events, tasks, createTag, saveEvent, saveTask } = deps;
    let tags = deps.tags;

    // Stale tag UUIDs look like names to missingTagNames; never turn them into tags.
    const names = missingTagNames(events, tasks, tags).filter((n) => !UUID_RE.test(n));
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

    const { eventPatches, taskPatches } = buildTagPatches(events, tasks, tags);

    for (const p of eventPatches) {
        try {
            await saveEvent(p.id, { groupIds: p.groupIds, parent_id: p.groupIds[0] ?? null, tags: [] });
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
    depsRef.current = deps;

    useEffect(() => {
        if (!deps.ready || ranRef.current) return;
        ranRef.current = true;
        const { ready: _ready, ...rest } = depsRef.current;
        void _ready;
        void runTagMigration(rest);
    }, [deps.ready]);
}
