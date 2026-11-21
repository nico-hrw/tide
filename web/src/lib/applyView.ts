import { pruneTagFilter, type TagFilter } from './tagFilter';
import type { SavedView, SavedViewMode } from './viewsStorage';

export interface ApplyViewDeps {
    setFilter: (filter: TagFilter) => void;
    setViewMode: (mode: SavedViewMode) => void;
    /** Ids of tags that still exist; stale ids in the view are dropped. */
    knownTagIds: Set<string>;
}

/** Applies a saved view: its (pruned) tag filter first, then its calendar mode. */
export function applyView(view: SavedView, deps: ApplyViewDeps): void {
    deps.setFilter(pruneTagFilter({ tagIds: view.tagIds, untagged: view.untagged }, deps.knownTagIds));
    deps.setViewMode(view.viewMode);
}
