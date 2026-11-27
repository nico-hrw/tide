import type { CalendarEvent } from '@/components/Calendar/types';
import type { DataItem, TaskItem } from '@/store/slices/types';
import { getEventGroupIds } from '@/lib/calendarUtils';
import { normalizeSafe } from '@/lib/todoSafes';

export interface Tag {
    id: string;
    title: string;
    color?: string;
    effect?: string;
    safe?: string;
}

export function tagSafe(t: { safe?: string | null }): string {
    return normalizeSafe(t.safe || 'main');
}

export function splitTagsByWorkspace<T extends { safe?: string | null }>(
    tags: T[],
    activeSafes: readonly string[],
): { local: T[]; external: T[] } {
    if (activeSafes.length === 0) return { local: tags, external: [] };
    const active = new Set(activeSafes.map(normalizeSafe));
    const local: T[] = [];
    const external: T[] = [];
    for (const t of tags) {
        if (active.has(tagSafe(t))) local.push(t);
        else external.push(t);
    }
    return { local, external };
}

export interface TagPatches {
    /** `tags` holds the names that could not be resolved yet; they stay on the event so a rerun can retry. */
    eventPatches: { id: string; groupIds: string[]; tags: string[] }[];
    taskPatches: { id: string; tags: string[] }[];
}

export function selectTags(items: DataItem[]): Tag[] {
    return items
        .filter((i) => i.type === 'folder' && i.isGroup)
        .map((i) => {
            const rawSafe = i.safe || (i.metadata as { safe?: string } | undefined)?.safe || 'main';
            const tag: Tag = { id: i.id, title: i.title, safe: normalizeSafe(rawSafe) };
            if (typeof i.color === 'string') tag.color = i.color;
            if (typeof i.effect === 'string') tag.effect = i.effect;
            return tag;
        });
}

export function normalizeTagName(name: string): string {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Tags whose normalized title contains the normalized query. Empty query keeps every tag. */
export function filterTagsByQuery(tags: Tag[], query: string): Tag[] {
    const q = normalizeTagName(query);
    if (!q) return tags;
    return tags.filter((t) => normalizeTagName(t.title).includes(q));
}

/** True when the query is not blank and no existing tag carries the same normalized name. */
export function canCreateTag(tags: Tag[], query: string): boolean {
    const q = normalizeTagName(query);
    return q !== '' && !tags.some((t) => normalizeTagName(t.title) === q);
}

function buildResolver(tags: Tag[]): (ref: string) => string | null {
    const ids = new Set(tags.map((t) => t.id));
    const byName = new Map<string, string>();
    for (const t of tags) {
        const key = normalizeTagName(t.title);
        if (!byName.has(key)) byName.set(key, t.id);
    }
    return (ref) => (ids.has(ref) ? ref : byName.get(normalizeTagName(ref)) ?? null);
}

export function missingTagNames(events: CalendarEvent[], tasks: TaskItem[], tags: Tag[]): string[] {
    const resolve = buildResolver(tags);
    const seen = new Set<string>();
    const result: string[] = [];
    const refs = [...events.flatMap((e) => e.tags ?? []), ...tasks.flatMap((t) => t.tags ?? [])];
    for (const ref of refs) {
        const key = normalizeTagName(ref);
        if (!key || resolve(ref) !== null || seen.has(key)) continue;
        seen.add(key);
        result.push(ref.trim());
    }
    return result;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for items owned by another user (shared into my store). Those are never rewritten. */
export function isForeignOwned(item: { owner_id?: string }, myId?: string): boolean {
    return Boolean(item.owner_id) && item.owner_id !== myId;
}

function sameList(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}

function dedupe(list: string[]): string[] {
    return [...new Set(list)];
}

export function buildTagPatches(events: CalendarEvent[], tasks: TaskItem[], tags: Tag[], myId?: string): TagPatches {
    const resolve = buildResolver(tags);
    const eventPatches: TagPatches['eventPatches'] = [];
    const taskPatches: TagPatches['taskPatches'] = [];

    for (const e of events) {
        if (isForeignOwned(e, myId)) continue;
        const current = getEventGroupIds(e);
        const resolved = (e.tags ?? []).map(resolve).filter((id): id is string => id !== null);
        const next = dedupe([...current, ...resolved]);
        const unresolved = (e.tags ?? []).filter((ref) => resolve(ref) === null && !UUID_RE.test(ref.trim()));
        if (!sameList(current, next)) eventPatches.push({ id: e.id, groupIds: next, tags: unresolved });
    }

    for (const t of tasks) {
        if (isForeignOwned(t, myId)) continue;
        if (!t.tags) continue;
        const next = dedupe(t.tags.map((ref) => resolve(ref) ?? ref));
        if (!sameList(t.tags, next)) taskPatches.push({ id: t.id, tags: next });
    }

    return { eventPatches, taskPatches };
}

export interface TagRemovalPatches {
    eventPatches: { id: string; groupIds: string[]; parent_id: string | null }[];
    taskPatches: { id: string; tags: string[] }[];
    notePatches: { id: string; tagIds: string[] }[];
}

/** Patches, die ein geloeschtes Tag aus allen Terminen und Todos entfernen. Unbeteiligte Eintraege bleiben aussen vor. */
export function removeTagFromItems(
    tagId: string,
    events: CalendarEvent[],
    tasks: TaskItem[],
    myId?: string,
    notes?: readonly { id: string; tagIds?: readonly string[]; owner_id?: string }[],
): TagRemovalPatches {
    const eventPatches: TagRemovalPatches['eventPatches'] = [];
    const taskPatches: TagRemovalPatches['taskPatches'] = [];
    const notePatches: TagRemovalPatches['notePatches'] = [];

    for (const e of events) {
        if (isForeignOwned(e, myId)) continue;
        const ids = getEventGroupIds(e);
        if (!ids.includes(tagId)) continue;
        const groupIds = ids.filter((id) => id !== tagId);
        eventPatches.push({ id: e.id, groupIds, parent_id: groupIds[0] ?? null });
    }

    for (const t of tasks) {
        if (isForeignOwned(t, myId)) continue;
        if (!t.tags?.includes(tagId)) continue;
        taskPatches.push({ id: t.id, tags: t.tags.filter((id) => id !== tagId) });
    }

    for (const n of notes ?? []) {
        if (isForeignOwned(n, myId)) continue;
        if (!n.tagIds?.includes(tagId)) continue;
        notePatches.push({ id: n.id, tagIds: n.tagIds.filter((id) => id !== tagId) });
    }

    return { eventPatches, taskPatches, notePatches };
}
