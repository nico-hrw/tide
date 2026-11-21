import type { TagFilter } from '@/lib/tagFilter';

/** True when saving without any tag and the user has not yet confirmed that. */
export function needsNoTagConfirm(tagIds: string[], confirmed: boolean): boolean {
  return tagIds.length === 0 && !confirmed;
}

/** Tags to preselect in a create form for the active filter. */
export function defaultTagIds(filter: TagFilter): string[] {
  return [...filter.tagIds];
}
