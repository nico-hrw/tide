/**
 * How tags the user hides by default are treated: "default" hides them, "include" shows them too,
 * "only" shows just the hidden ones.
 */
export type HiddenTagMode = 'default' | 'include' | 'only';

export interface TagFilter {
    tagIds: string[];
    untagged: boolean;
    /** Missing means "default". */
    hidden?: HiddenTagMode;
}

export const EMPTY_TAG_FILTER: TagFilter = { tagIds: [], untagged: false };

export function isTagFilterActive(filter: TagFilter): boolean {
    return filter.tagIds.length > 0 || filter.untagged || (filter.hidden ?? 'default') !== 'default';
}

/**
 * An item is hidden by default when it has known tags and every one of them is hidden in settings.
 * An item with at least one visible tag, or without tags, stays visible.
 */
export function isHiddenByDefault(tagIdsOfItem: string[], knownTagIds: Set<string>, hiddenTagIds: ReadonlySet<string>): boolean {
    const known = tagIdsOfItem.filter((id) => knownTagIds.has(id));
    return known.length > 0 && known.every((id) => hiddenTagIds.has(id));
}

const NO_HIDDEN: ReadonlySet<string> = new Set();

export function matchesTagFilter(
    tagIdsOfItem: string[],
    filter: TagFilter,
    knownTagIds: Set<string>,
    hiddenTagIds: ReadonlySet<string> = NO_HIDDEN,
): boolean {
    const mode = filter.hidden ?? 'default';
    const hidden = isHiddenByDefault(tagIdsOfItem, knownTagIds, hiddenTagIds);
    if (mode === 'default' && hidden) return false;
    if (mode === 'only' && !hidden) return false;
    if (!isTagFilterActive(filter)) return true;
    if (filter.tagIds.length === 0 && !filter.untagged) return true;
    const known = tagIdsOfItem.filter((id) => knownTagIds.has(id));
    if (filter.untagged && known.length === 0) return true;
    return filter.tagIds.some((id) => known.includes(id));
}

export function toggleTagInFilter(filter: TagFilter, tagId: string): TagFilter {
    const tagIds = filter.tagIds.includes(tagId)
        ? filter.tagIds.filter((id) => id !== tagId)
        : [...filter.tagIds, tagId];
    return { ...filter, tagIds };
}

export function toggleUntaggedInFilter(filter: TagFilter): TagFilter {
    return { ...filter, untagged: !filter.untagged };
}

/** Drops tag ids that are not in the registry (e.g. deleted tags). */
export function pruneTagFilter(filter: TagFilter, knownTagIds: Set<string>): TagFilter {
    const tagIds = filter.tagIds.filter((id) => knownTagIds.has(id));
    return tagIds.length === filter.tagIds.length ? filter : { ...filter, tagIds };
}

/** Texts for an active todo tag filter; a filter that only selects "untagged" must not read like a tag named "Ohne Tag". */
export function tagFilterTexts(label: string, tagIds: string[]): {
    sectionTitle: string; emptyTitle: string; emptyHint: string; createLabel: string;
} {
    if (tagIds.length === 0) {
        return {
            sectionTitle: label,
            emptyTitle: 'Keine Aufgaben ohne Tag',
            emptyHint: 'Es gibt aktuell keine passenden Aufgaben ohne Tag.',
            createLabel: 'Aufgabe ohne Tag erstellen',
        };
    }
    return {
        sectionTitle: `#${label}`,
        emptyTitle: `Keine Aufgaben mit #${label}`,
        emptyHint: `Es gibt aktuell keine passenden Aufgaben mit dem Tag #${label}.`,
        createLabel: `Aufgabe mit #${label} erstellen`,
    };
}
