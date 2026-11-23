import { getEventGroupIds } from '@/lib/calendarUtils';

interface ColoredTag {
    id: string;
    color?: string;
}

/**
 * Secondary tags (every tag after the first) may be marked as "overrides the main tag colour".
 * The first such tag that has a colour wins; otherwise the event keeps its own colour.
 * Returns the same object when nothing changes.
 */
export function applyTagColorOverride<E extends { groupIds?: string[]; parent_id?: string | null; color?: string }>(
    event: E,
    tags: readonly ColoredTag[],
    overrideIds: readonly string[],
): E {
    if (overrideIds.length === 0) return event;
    const secondary = getEventGroupIds(event).slice(1);
    for (const id of secondary) {
        if (!overrideIds.includes(id)) continue;
        const color = tags.find((t) => t.id === id)?.color;
        if (color) return color === event.color ? event : { ...event, color };
    }
    return event;
}
