import type { CalendarEvent } from '@/components/Calendar/types';
import type { DataItem, TaskItem } from '@/store/slices/types';

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
