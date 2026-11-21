import type { TagFilter } from '@/lib/tagFilter';

/** True when saving without any tag and the user has not yet confirmed that. */
export function needsNoTagConfirm(tagIds: string[], confirmed: boolean): boolean {
  return tagIds.length === 0 && !confirmed;
}

/** Tags to preselect in a create form for the active filter. */
export function defaultTagIds(filter: TagFilter): string[] {
  return [...filter.tagIds];
}

/** Tags a freshly created calendar event gets from the active filter (first tag is the style/parent). */
export function newEventMeta(filter: TagFilter): { groupIds: string[]; parent_id: string | null } {
  return { groupIds: [...filter.tagIds], parent_id: filter.tagIds[0] ?? null };
}

// Master ids of events created in this session through an interactive path (drag, "+", month/agenda).
// Imports, plugins, schedule apply and recurring occurrences are never registered, so they are never prompted.
const interactiveCreates = new Set<string>();

export function markInteractiveCreate(id: string | null | undefined): void {
  if (id) interactiveCreates.add(id);
}

export function isInteractiveCreate(id: string | null | undefined): boolean {
  return !!id && interactiveCreates.has(id);
}

export function clearInteractiveCreate(id: string | null | undefined): void {
  if (id) interactiveCreates.delete(id);
}

/** True when closing the event editor should ask "Ohne Tag speichern?" (interactive create, no known tag). */
export function shouldPromptNoTag(eventId: string, tagIds: string[], knownTagIds: Set<string>): boolean {
  return isInteractiveCreate(eventId) && !tagIds.some((id) => knownTagIds.has(id));
}
