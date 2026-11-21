import { getEventGroupIds } from '@/lib/calendarUtils';

/** Legacy names that mark an event as work/study when no tags are assigned to the plugin. */
export const JOB_TAG_NAMES = ['job', 'arbeit', 'uni', 'studium'];

export interface JobEventLike {
    groupIds?: string[];
    parent_id?: string | null;
    tags?: string[];
}

function isJobName(name: string): boolean {
    return JOB_TAG_NAMES.includes(name.trim().toLowerCase());
}

/** Drops assigned ids whose tag no longer exists; all stale -> [] (legacy behavior). */
export function effectivePluginTagIds(assigned: string[], knownTagIds: Set<string>): string[] {
    return assigned.filter((id) => knownTagIds.has(id));
}

export function isJobEvent(
    event: JobEventLike,
    pluginTagIds: string[],
    legacyGroupId: string | null,
    resolveTagTitle?: (id: string) => string | undefined,
): boolean {
    const ids = getEventGroupIds(event);
    if (pluginTagIds.length > 0) return ids.some((id) => pluginTagIds.includes(id));
    if (legacyGroupId && (ids.includes(legacyGroupId) || event.parent_id === legacyGroupId)) return true;
    if (event.tags && event.tags.some(isJobName)) return true;
    if (resolveTagTitle) {
        return ids.some((id) => {
            const title = resolveTagTitle(id);
            return title !== undefined && isJobName(title);
        });
    }
    return false;
}
