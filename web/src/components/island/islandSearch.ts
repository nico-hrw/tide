/**
 * Search part of the Smart Island: typing first looks through notes, events and todos.
 * Pure (no React, no stores). Uses the same Fuse settings as the global search overlay.
 */
import Fuse from 'fuse.js';

export type IslandSearchKind = 'note' | 'event' | 'todo';

export interface IslandSearchItem {
    id: string;
    title: string;
    kind: IslandSearchKind;
    /** Event start or todo due date, for the secondary line of a result */
    date?: string;
}

interface RawNote { id: string; title?: string; type?: string; isGroup?: boolean }
interface RawEvent { id: string; title?: string; start?: string; linkedTaskId?: string }
interface RawTask { id: string; title?: string; dueDate?: string }

/** Types that live in the notes list but are not notes a user can open as a result. */
const NON_NOTE_TYPES = new Set(['folder', 'event', 'task', 'todo', 'index', 'views', 'calendar_shares', 'canvas-asset']);

/** Recurrence instances carry ids like "baseId_timestamp"; the item itself is the base id. */
const baseId = (id: string): string => (id.includes('_') ? id.split('_')[0] : id);

/**
 * One result per thing, and only for what really exists in the data:
 * - a note appears only as a note, an event only as an event, a todo only as a todo
 *   (an id that is both an event and a note counts as the event, a todo with a calendar entry as the todo)
 * - events are matched by their base id, so a repeating event is one result, not one per occurrence
 */
export function buildIslandSearchItems(src: { notes: RawNote[]; events: RawEvent[]; tasks: RawTask[] }): IslandSearchItem[] {
    const tasks: IslandSearchItem[] = [];
    const taskIds = new Set<string>();
    for (const t of src.tasks || []) {
        if (!t?.id || taskIds.has(t.id)) continue;
        taskIds.add(t.id);
        tasks.push({ id: t.id, title: t.title || '', kind: 'todo', date: t.dueDate });
    }

    const events: IslandSearchItem[] = [];
    const eventIds = new Set<string>();
    for (const e of src.events || []) {
        if (!e?.id) continue;
        const id = baseId(e.id);
        if (eventIds.has(id)) continue;
        // The calendar entry of a todo is the todo itself, as long as that todo really exists
        if (e.linkedTaskId && taskIds.has(e.linkedTaskId)) continue;
        eventIds.add(id);
        events.push({ id, title: e.title || '', kind: 'event', date: e.start });
    }

    const notes: IslandSearchItem[] = [];
    const noteIds = new Set<string>();
    for (const n of src.notes || []) {
        // Folders and tags are navigation, not results
        if (!n?.id || n.isGroup || (n.type && NON_NOTE_TYPES.has(n.type))) continue;
        if (noteIds.has(n.id) || eventIds.has(n.id) || taskIds.has(n.id)) continue;
        noteIds.add(n.id);
        notes.push({ id: n.id, title: n.title || '', kind: 'note' });
    }

    return [...notes, ...events.filter((e) => !taskIds.has(e.id)), ...tasks];
}

/** Fuzzy matches for the query; titles that start with it come first (the fuzzy order is kept within each group). */
export function createIslandSearcher(items: IslandSearchItem[]): (query: string, limit?: number) => IslandSearchItem[] {
    const fuse = new Fuse(items, { keys: ['title'], threshold: 0.35, ignoreLocation: true });
    return (query, limit = 6) => rank(fuse, query, limit);
}

export function searchIslandItems(items: IslandSearchItem[], query: string, limit = 6): IslandSearchItem[] {
    if (!query.trim()) return [];
    return createIslandSearcher(items)(query, limit);
}

function rank(fuse: Fuse<IslandSearchItem>, query: string, limit: number): IslandSearchItem[] {
    const q = query.trim();
    if (!q) return [];
    const hits = fuse.search(q).map((r) => r.item);
    const lower = q.toLowerCase();
    const starts = hits.filter((i) => i.title.toLowerCase().startsWith(lower));
    const rest = hits.filter((i) => !i.title.toLowerCase().startsWith(lower));
    return [...starts, ...rest].slice(0, limit);
}

/** Moves the highlighted row; rows are the results plus one trailing "create" row. */
export function nextSelection(current: number, resultCount: number, dir: 1 | -1): number {
    const rows = resultCount + 1;
    return (current + dir + rows) % rows;
}
