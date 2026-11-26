import type { IslandSearchItem } from './islandSearch';

export type EnterAction = { kind: 'open'; item: IslandSearchItem } | { kind: 'create' };

/**
 * What plain Enter does in search-first capture: open a result only when the user picked one
 * (arrow keys or click) or the top result's title equals the typed text; otherwise create as before.
 * `explicitSel` indexes `results`; the trailing "create" row (or a stale index) means create.
 */
export function resolveEnter(input: { query: string; results: IslandSearchItem[]; explicitSel: number | null }): EnterAction {
    const { query, results, explicitSel } = input;
    if (explicitSel !== null) {
        const item = results[explicitSel];
        return item ? { kind: 'open', item } : { kind: 'create' };
    }
    const top = results[0];
    if (top && top.title.trim().toLowerCase() === query.trim().toLowerCase()) return { kind: 'open', item: top };
    return { kind: 'create' };
}
