import { useEffect, useMemo } from 'react';
import { useDataStore } from '@/store/useDataStore';
import { useNoteLinkStore } from '@/store/useNoteLinkStore';
import { isVisibleEvent, visibleGraphNotes } from '@/lib/graphVisibility';
import { buildNoteGraph, type GraphNoteInput, type LinkIndex, type NoteGraph } from '@/lib/noteLinks';
import type { DataItem, TaskItem } from '@/store/slices/types';

export function graphFrom(
    notes: readonly DataItem[],
    index: LinkIndex,
    events: readonly DataItem[] = [],
    tasks: readonly TaskItem[] = [],
): NoteGraph {
    const items: GraphNoteInput[] = visibleGraphNotes(notes);
    for (const e of events) {
        if (isVisibleEvent(e)) items.push({ id: e.id, title: e.title || 'Untitled', kind: 'event' });
    }
    const extra: Array<readonly [string, string]> = [];
    for (const t of tasks) {
        if (t.isArchived) continue;
        items.push({ id: t.id, title: t.title || 'Todo', kind: 'todo' });
        if (t.linkedNoteId) extra.push([t.id, t.linkedNoteId]);
    }
    return buildNoteGraph(items, index, extra);
}

/** The current graph, rebuilt when notes, events, todos or links change. */
export function useNoteGraph(): NoteGraph {
    const notes = useDataStore((s) => s.notes);
    const events = useDataStore((s) => s.events);
    const tasks = useDataStore((s) => s.tasks);
    const links = useNoteLinkStore((s) => s.links);
    useEffect(() => { void useNoteLinkStore.getState().hydrate(); }, []);
    return useMemo(() => graphFrom(notes, links, events, tasks), [notes, events, tasks, links]);
}
