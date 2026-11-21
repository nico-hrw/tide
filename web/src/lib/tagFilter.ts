export interface TagFilter {
    tagIds: string[];
    untagged: boolean;
}

export const EMPTY_TAG_FILTER: TagFilter = { tagIds: [], untagged: false };

export function isTagFilterActive(filter: TagFilter): boolean {
    return filter.tagIds.length > 0 || filter.untagged;
}

export function matchesTagFilter(
    tagIdsOfItem: string[],
    filter: TagFilter,
    knownTagIds: Set<string>,
): boolean {
    if (!isTagFilterActive(filter)) return true;
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
