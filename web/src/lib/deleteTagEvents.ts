import { getEventGroupIds } from '@/lib/calendarUtils';
import { isForeignOwned } from '@/lib/tags';

interface TaggedEvent {
    id: string;
    groupIds?: string[];
    parent_id?: string | null;
    owner_id?: string;
}

/** Ids of the events I own that carry the tag (as main or secondary tag). Foreign events are never touched. */
export function eventIdsWithTag(tagId: string, events: readonly TaggedEvent[], myId?: string): string[] {
    return events
        .filter((e) => !isForeignOwned(e, myId) && getEventGroupIds(e).includes(tagId))
        .map((e) => e.id);
}

/**
 * Deletes every event carrying the tag. The tag itself stays.
 * Returns the ids that were deleted and the ones that failed so the caller can report both.
 */
export async function deleteEventsWithTag(
    tagId: string,
    events: readonly TaggedEvent[],
    deleteEvent: (id: string) => Promise<boolean>,
    myId?: string,
): Promise<{ deleted: string[]; failed: string[] }> {
    const deleted: string[] = [];
    const failed: string[] = [];
    for (const id of eventIdsWithTag(tagId, events, myId)) {
        try {
            (await deleteEvent(id)) ? deleted.push(id) : failed.push(id);
        } catch {
            failed.push(id);
        }
    }
    return { deleted, failed };
}
