import type { TaskItem } from '@/store/slices/types';

/** Workspace id normalisation: the legacy name "Standard" is "main". */
export function normalizeSafe(s: string): string {
    return s === 'Standard' ? 'main' : s;
}

/** The workspace a todo belongs to. */
export function todoSafe(t: Pick<TaskItem, 'safe'>): string {
    return normalizeSafe(t.safe || 'main');
}

/**
 * Whether a todo is shown for the active workspaces: its own workspace is active, or one of its
 * linked workspaces is. With no active workspace list, everything is shown.
 */
export function todoVisibleInSafes(t: Pick<TaskItem, 'safe' | 'linkedSafes'>, activeSafes: readonly string[]): boolean {
    if (activeSafes.length === 0) return true;
    const active = new Set(activeSafes.map(normalizeSafe));
    return active.has(todoSafe(t)) || (t.linkedSafes ?? []).some((s) => active.has(normalizeSafe(s)));
}

/** Shown in an active workspace, but its home workspace is not one of the active ones (shown as external). */
export function todoIsExternal(t: Pick<TaskItem, 'safe' | 'linkedSafes'>, activeSafes: readonly string[]): boolean {
    if (activeSafes.length === 0) return false;
    const active = new Set(activeSafes.map(normalizeSafe));
    return !active.has(todoSafe(t)) && todoVisibleInSafes(t, activeSafes);
}
