import type { CalendarEvent } from '@/components/Calendar/types';
import type { DataItem, TaskItem } from '@/store/slices/types';
import { getEventGroupIds } from '@/lib/calendarUtils';

export interface Tag {
    id: string;
    title: string;
    color?: string;
    effect?: string;
}

export interface TagPatches {
    eventPatches: { id: string; groupIds: string[] }[];
    taskPatches: { id: string; tags: string[] }[];
}

export function selectTags(items: DataItem[]): Tag[] {
    return items
        .filter((i) => i.type === 'folder' && i.isGroup)
        .map((i) => {
            const tag: Tag = { id: i.id, title: i.title };
            if (typeof i.color === 'string') tag.color = i.color;
            if (typeof i.effect === 'string') tag.effect = i.effect;
            return tag;
        });
}

export function normalizeTagName(name: string): string {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
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

function sameList(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}

function dedupe(list: string[]): string[] {
    return [...new Set(list)];
}

export function buildTagPatches(events: CalendarEvent[], tasks: TaskItem[], tags: Tag[]): TagPatches {
    const resolve = buildResolver(tags);
    const eventPatches: TagPatches['eventPatches'] = [];
    const taskPatches: TagPatches['taskPatches'] = [];

    for (const e of events) {
        const current = e.groupIds ?? [];
        const resolved = (e.tags ?? []).map(resolve).filter((id): id is string => id !== null);
        const next = dedupe([...current, ...resolved]);
        if (!sameList(current, next)) eventPatches.push({ id: e.id, groupIds: next });
    }

    for (const t of tasks) {
        if (!t.tags) continue;
        const next = dedupe(t.tags.map((ref) => resolve(ref) ?? ref));
        if (!sameList(t.tags, next)) taskPatches.push({ id: t.id, tags: next });
    }

    return { eventPatches, taskPatches };
}

export interface TagRemovalPatches {
    eventPatches: { id: string; groupIds: string[]; parent_id: string | null }[];
    taskPatches: { id: string; tags: string[] }[];
}

/** Patches, die ein geloeschtes Tag aus allen Terminen und Todos entfernen. Unbeteiligte Eintraege bleiben aussen vor. */
export function removeTagFromItems(tagId: string, events: CalendarEvent[], tasks: TaskItem[]): TagRemovalPatches {
    const eventPatches: TagRemovalPatches['eventPatches'] = [];
    const taskPatches: TagRemovalPatches['taskPatches'] = [];

    for (const e of events) {
        const ids = getEventGroupIds(e);
        if (!ids.includes(tagId)) continue;
        const groupIds = ids.filter((id) => id !== tagId);
        eventPatches.push({ id: e.id, groupIds, parent_id: groupIds[0] ?? null });
    }

    for (const t of tasks) {
        if (!t.tags?.includes(tagId)) continue;
        taskPatches.push({ id: t.id, tags: t.tags.filter((id) => id !== tagId) });
    }

    return { eventPatches, taskPatches };
}
