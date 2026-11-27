import { useDataStore } from '@/store/useDataStore';
import type { TaskItem } from '@/store/slices/types';
import { deletedTaskIds } from '@/store/slices/fsHelpers';
import { notify } from '@/lib/feedback';

/** Undo toasts for todos stay visible this long. */
export const TODO_UNDO_MS = 3000;

/** The task and all of its descendants, parents before children (so they can be re-created in order). */
export function collectSubtree<T extends { id: string; parentId?: string | null }>(tasks: T[], rootId: string): T[] {
    const root = tasks.find((t) => t.id === rootId);
    if (!root) return [];
    const out: T[] = [root];
    const seen = new Set<string>([rootId]);
    for (let i = 0; i < out.length; i++) {
        for (const t of tasks) {
            if (t.parentId === out[i].id && !seen.has(t.id)) {
                seen.add(t.id);
                out.push(t);
            }
        }
    }
    return out;
}

function undoToast(message: string, undo: () => void | Promise<void>): void {
    notify(message, { tone: 'success', duration: TODO_UNDO_MS, action: { label: 'Rückgängig', onClick: undo } });
}

/** Check a todo off and offer to take it back for a few seconds. Un-checking needs no toast. */
export async function toggleTaskWithUndo(id: string): Promise<void> {
    const store = useDataStore.getState();
    const task = store.tasks.find((t) => t.id === id);
    if (!task) return;
    const completing = !task.isCompleted;
    await store.toggleTask(id);
    if (!completing) return;
    undoToast('Erledigt', async () => {
        const current = useDataStore.getState().tasks.find((t) => t.id === id);
        if (current?.isCompleted) await useDataStore.getState().toggleTask(id);
    });
}

/** Complete or reopen several subtasks in one batch, showing a single 3s undo toast if any were completed. */
export async function toggleManyTasksWithUndo(ids: readonly string[], completing: boolean): Promise<void> {
    const store = useDataStore.getState();
    for (const id of ids) {
        await store.toggleTask(id);
    }
    if (!completing || ids.length === 0) return;
    undoToast('Erledigt', async () => {
        for (const id of ids) {
            const current = useDataStore.getState().tasks.find((t) => t.id === id);
            if (current?.isCompleted) await useDataStore.getState().toggleTask(id);
        }
    });
}

/** Delete a todo and offer to bring it back (with its subtasks) for a few seconds. */
export async function deleteTaskWithUndo(id: string): Promise<void> {
    const store = useDataStore.getState();
    const snapshot = collectSubtree(store.tasks as TaskItem[], id).map((t) => ({ ...t }));
    if (!snapshot.length) { await store.deleteTask(id); return; }
    await store.deleteTask(id);
    undoToast('Gelöscht', async () => {
        const s = useDataStore.getState();
        const idMap = new Map<string, string>();
        for (const t of snapshot) {
            deletedTaskIds.delete(t.id);
            if (typeof window !== 'undefined') {
                try { localStorage.setItem('tide_deleted_task_ids', JSON.stringify([...deletedTaskIds])); } catch { /* ignore */ }
            }
            // Subtasks the store still holds only need their parent link fixed below.
            if (useDataStore.getState().tasks.some((x) => x.id === t.id)) { idMap.set(t.id, t.id); continue; }
            const parentId = t.parentId ? (idMap.get(t.parentId) ?? t.parentId) : t.parentId;
            const newId = await s.addTask({ ...t, parentId });
            idMap.set(t.id, newId);
        }
        for (const t of snapshot) {
            const wanted = t.parentId ? idMap.get(t.parentId) : undefined;
            const now = useDataStore.getState().tasks.find((x) => x.id === idMap.get(t.id));
            if (wanted && now && now.parentId !== wanted) await s.updateTask(now.id, { parentId: wanted });
        }
    });
}
