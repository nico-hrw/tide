import { useCallback, useMemo } from 'react';
import { useDataStore } from '@/store/useDataStore';
import { useJobPlannerStore } from '@/store/useJobPlannerStore';
import type { DataItem } from '@/store/slices/types';
import { selectTags } from '@/lib/tags';
import { effectivePluginTagIds, isJobEvent, type JobEventLike } from '@/lib/jobTags';

type MatcherInput = JobEventLike | DataItem;

export interface JobEventMatcher {
    /** Assigned plugin tag ids that still exist (empty = legacy rules). */
    pluginTagIds: string[];
    isJob: (event: MatcherInput) => boolean;
    /** Planner category test: assigned tags (or the planner's own category), else the legacy category/name rules. */
    matchesPlanner: (event: MatcherInput, categoryGroupIds: string[]) => boolean;
}

/** Decides whether an event belongs to the work/study plugin (assigned tags, else legacy rules). */
export function useJobEventMatcher(): JobEventMatcher {
    const notes = useDataStore((s) => s.notes);
    const assigned = useJobPlannerStore((s) => s.pluginTagIds);
    const legacyGroupId = useJobPlannerStore((s) => s.pluginGroupId);
    const tags = useMemo(() => selectTags(notes), [notes]);
    const titles = useMemo(() => new Map(tags.map((t) => [t.id, t.title])), [tags]);
    const pluginTagIds = useMemo(
        () => effectivePluginTagIds(assigned ?? [], new Set(tags.map((t) => t.id))),
        [assigned, tags],
    );
    const isJob = useCallback(
        (input: MatcherInput) => isJobEvent(input as JobEventLike, pluginTagIds, legacyGroupId, (id) => titles.get(id)),
        [pluginTagIds, legacyGroupId, titles],
    );
    const matchesPlanner = useCallback(
        (input: MatcherInput, categoryGroupIds: string[]) => {
            const event = input as JobEventLike;
            const inCategory = !!(event.parent_id && categoryGroupIds.includes(event.parent_id));
            if (pluginTagIds.length > 0) return inCategory || isJobEvent(event, pluginTagIds, null);
            return (
                categoryGroupIds.length === 0 ||
                inCategory ||
                isJobEvent(event, [], null, (id) => titles.get(id))
            );
        },
        [pluginTagIds, titles],
    );
    return { pluginTagIds, isJob, matchesPlanner };
}
