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
interface RawEvent { id: string; title?: string; start?: string }
interface RawTask { id: string; title?: string; dueDate?: string }

export function buildIslandSearchItems(src: { notes: RawNote[]; events: RawEvent[]; tasks: RawTask[] }): IslandSearchItem[] {
    const out: IslandSearchItem[] = [];
    for (const n of src.notes || []) {
        // Folders and tags are navigation, not results
        if (!n?.id || n.type === 'folder' || n.isGroup) continue;
        out.push({ id: n.id, title: n.title || '', kind: 'note' });
    }
    for (const e of src.events || []) {
        if (e?.id) out.push({ id: e.id, title: e.title || '', kind: 'event', date: e.start });
    }
    for (const t of src.tasks || []) {
        if (t?.id) out.push({ id: t.id, title: t.title || '', kind: 'todo', date: t.dueDate });
    }
    return out;
}

/** Fuzzy matches for the query; titles that start with it come first (the fuzzy order is kept within each group). */
export function searchIslandItems(items: IslandSearchItem[], query: string, limit = 6): IslandSearchItem[] {
    const q = query.trim();
    if (!q) return [];
    const fuse = new Fuse(items, { keys: ['title'], threshold: 0.35, ignoreLocation: true });
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
