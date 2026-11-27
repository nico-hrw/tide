/** Workspace id normalisation: the legacy name "Standard" is "main". */
export function normalizeSafe(s: string): string {
    return s === 'Standard' ? 'main' : s;
}

/** The workspace a todo belongs to. */
export function todoSafe(t: { safe?: string | null }): string {
    return normalizeSafe(t.safe || 'main');
}

/**
 * Whether a todo is shown for the active workspaces: its own workspace is active, or one of its
 * linked workspaces is. With no active workspace list, everything is shown.
 */
export function todoVisibleInSafes(t: { safe?: string | null; linkedSafes?: string[] | null }, activeSafes: readonly string[]): boolean {
    if (activeSafes.length === 0) return true;
    const active = new Set(activeSafes.map(normalizeSafe));
    return active.has(todoSafe(t)) || (t.linkedSafes ?? []).some((s) => active.has(normalizeSafe(s)));
}

/** Shown in an active workspace, but its home workspace is not one of the active ones (shown as external). */
export function todoIsExternal(t: { safe?: string | null; linkedSafes?: string[] | null }, activeSafes: readonly string[]): boolean {
    if (activeSafes.length === 0) return false;
    const active = new Set(activeSafes.map(normalizeSafe));
    return !active.has(todoSafe(t)) && todoVisibleInSafes(t, activeSafes);
}

/** True when the item's home workspace is not in the active workspaces list. */
export function isFromOtherWorkspace(item: { safe?: string | null }, activeSafes: readonly string[]): boolean {
    if (activeSafes.length === 0) return false;
    const active = new Set(activeSafes.map(normalizeSafe));
    return !active.has(todoSafe(item));
}

/**
 * Visible if the item belongs to (or is linked into) an active workspace, OR if any of the
 * currently selected tag filters matches one of its tags (allowing cross-workspace tag lookup).
 */
export function itemVisibleInSafesOrFilter(
    item: { safe?: string | null; linkedSafes?: string[] | null },
    itemTagIds: readonly string[],
    activeSafes: readonly string[],
    selectedTagIds: readonly string[],
): boolean {
    if (todoVisibleInSafes(item, activeSafes)) return true;
    return selectedTagIds.length > 0 && itemTagIds.some((id) => selectedTagIds.includes(id));
}
