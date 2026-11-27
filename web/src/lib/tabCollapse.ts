/**
 * Tab bar space: when the open tabs do not fit at a readable width, the least used note tabs are folded into one
 * icon-only group (their titles show on hover). Plugin / view tabs (Todos, Kalender, Social, ...) never fold.
 * Pure functions, no DOM or store access.
 */

/** Narrowest width at which a tab title still reads well (px). */
export const TAB_READABLE_WIDTH = 140;
/** Gap between two tabs (px). */
export const TAB_GAP = 4;
/** Room kept for the "+" button and the folded group (px). */
export const TAB_RESERVED = 84;

export interface CollapseInput {
    /** Tab ids in display order */
    ids: string[];
    /** Tab ids that may fold (note tabs). Anything else always stays visible. */
    foldable: ReadonlySet<string>;
    /** How often each tab was opened on this device (higher = more used) */
    usage: Readonly<Record<string, number>>;
    /** Id of the tab that is shown right now: never folded */
    activeId: string;
    /** Width available for the tab row (px) */
    available: number;
}

/** How many tabs fit in `available` px at the readable width. */
export function tabCapacity(available: number): number {
    const usable = Math.max(0, available - TAB_RESERVED);
    return Math.max(1, Math.floor((usable + TAB_GAP) / (TAB_READABLE_WIDTH + TAB_GAP)));
}

/**
 * Returns the ids that should be folded, least used first. Nothing is folded while everything fits; a folded group
 * costs one slot, so the rest must fit beside it.
 */
export function tabsToFold({ ids, foldable, usage, activeId, available }: CollapseInput): string[] {
    const capacity = tabCapacity(available);
    if (ids.length <= capacity) return [];

    // Least used first; among equals the one further left goes first (its place is the least prominent).
    const candidates = ids
        .map((id, index) => ({ id, index }))
        .filter(({ id }) => foldable.has(id) && id !== activeId)
        .sort((a, b) => (usage[a.id] ?? 0) - (usage[b.id] ?? 0) || a.index - b.index)
        .map(({ id }) => id);

    // Visible slots = the tabs that stay + one slot for the folded group (if any tab is folded).
    const slots = (count: number) => (count > 0 ? ids.length - count + 1 : ids.length);
    const folded: string[] = [];
    for (const id of candidates) {
        if (slots(folded.length) <= capacity) break;
        folded.push(id);
    }
    // Folding stops as soon as the rest fits; if the candidates run out, the bar stays as full as it can be.
    return folded;
}
