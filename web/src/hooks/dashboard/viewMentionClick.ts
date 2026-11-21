import { viewFilters } from '@/lib/applyView';
import type { TagFilter } from '@/lib/tagFilter';
import type { SavedView, SavedViewMode } from '@/lib/viewsStorage';

export type ViewMentionTarget = 'calendar' | 'todos';

export interface ViewMentionClickDetail {
    viewId?: string;
    /** Missing on events of the old shape; treated as 'calendar'. */
    target?: ViewMentionTarget;
}

export interface ViewMentionClickDeps {
    getView: (viewId: string) => SavedView | undefined;
    knownTagIds: Set<string>;
    setCalendarTagFilter: (filter: TagFilter) => void;
    setTodoTagFilter: (filter: TagFilter) => void;
    switchTab: (id: string, type: string) => void;
    /** Desktop: open the todo list tab. */
    navigateTodos: () => void;
    setCalendarViewMode: (mode: SavedViewMode) => void;
    /** Fires a window event that only the mobile layout listens to. */
    dispatchMobile: (name: string, detail?: { mode: SavedViewMode }) => void;
}

/**
 * A click on a view mention: both tag filters get the same pruned filter, only the
 * target decides which tab opens. A deleted view does nothing.
 */
export function handleViewMentionClick(detail: ViewMentionClickDetail, deps: ViewMentionClickDeps): void {
    const view = detail.viewId ? deps.getView(detail.viewId) : undefined;
    if (!view) return;
    const filter = viewFilters(view, deps.knownTagIds);
    deps.setCalendarTagFilter(filter);
    deps.setTodoTagFilter(filter);
    if (detail.target === 'todos') {
        deps.navigateTodos();
        deps.dispatchMobile('mobile_open_todos');
        return;
    }
    deps.switchTab('calendar', 'calendar');
    deps.setCalendarViewMode(view.viewMode);
    deps.dispatchMobile('mobile_apply_view_mode', { mode: view.viewMode });
}
