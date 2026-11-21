import { resolveCategory } from '@/lib/calendarColors';
import type { SavedView } from '@/lib/viewsStorage';

/** Row shown in the `@` menu for a saved calendar view. */
export interface ViewSuggestionItem {
    id: string;
    label: string;
    type: 'view';
    /** Resolved dot colors of the view's tags (max 3). */
    colors: string[];
}

const MAX_MATCHES = 5;
const MAX_ROWS = 3;
const MAX_DOTS = 3;

/** Case-insensitive substring match on the view name; empty query keeps all; order preserved, max 5. */
export function matchViews(query: string, views: SavedView[]): SavedView[] {
    const q = query.trim().toLowerCase();
    const hits = q ? views.filter((v) => v.name.toLowerCase().includes(q)) : views;
    return hits.slice(0, MAX_MATCHES);
}

/** Dot colors for the tags of a view; tags without a color or no longer existing are skipped. */
export function viewDotColors(view: SavedView, tags: { id: string; color?: string }[]): string[] {
    const colors: string[] = [];
    for (const id of view.tagIds) {
        const tag = tags.find((t) => t.id === id);
        if (tag?.color) colors.push(resolveCategory(tag.color).bg);
        if (colors.length >= MAX_DOTS) break;
    }
    return colors;
}

/** Suggestion rows for the `@` menu: at most 3 matching views. */
export function buildViewItems(
    query: string,
    views: SavedView[],
    tags: { id: string; color?: string }[],
): ViewSuggestionItem[] {
    return matchViews(query, views)
        .slice(0, MAX_ROWS)
        .map((v) => ({ id: v.id, label: v.name, type: 'view' as const, colors: viewDotColors(v, tags) }));
}

/**
 * Caps the `@` menu list: the limit applies to the content rows only after reserving room for the
 * view rows and the trailing action rows, so views and actions are never cut off.
 * Order: content, views, actions.
 */
export function capSuggestionItems<T>(content: T[], views: T[], actions: T[], limit = 10): T[] {
    const room = Math.max(0, limit - views.length - actions.length);
    return [...content.slice(0, room), ...views, ...actions];
}
