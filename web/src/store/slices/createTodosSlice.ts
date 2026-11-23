import { apiFetch } from '@/lib/api';
import { generateSecureId, saveEncryptedOfflineCache } from '@/lib/offlineCacheCrypto';
import type { DataStoreSlice, TaskItem, TodosSlice } from './types';
import { deletedTaskIds, recordDeletedTaskId } from './fsHelpers';

export { deletedTaskIds, recordDeletedTaskId };

export function loadCachedTasks(): TaskItem[] {
    if (typeof window !== 'undefined') {
        try {
            localStorage.removeItem('tide_offline_tasks');
        } catch {
            // Ignore storage errors
        }
    }
    return [];
}

export function saveTasksToOfflineCache(tasks: TaskItem[]): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem('tide_offline_tasks');
    } catch {
        // Ignore storage errors
    }
    void saveEncryptedOfflineCache('tasks', tasks).catch((e) => {
        console.warn('Failed to save tasks to offline cache', e);
    });
}

function taskToServerTodoPayload(task: TaskItem, includeId: boolean): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        title: task.title,
        description: task.description ?? '',
        status: task.status ?? (task.isCompleted ? 'completed' : 'todo'),
        priority: task.priority ?? '',
        due_date: task.dueDate ?? '',
        scheduled_date: task.scheduledDate ?? '',
        tags: task.tags ?? [],
        color: task.color ?? '',
        is_completed: Boolean(task.isCompleted),
        folder: task.folder ?? '',
        linked_note_id: task.linkedNoteId ?? '',
        recurrence: task.recurrence ?? '',
        recurrence_rule: task.recurrence_rule ?? '',
        recurrence_end: task.recurrence_end ?? '',
        completed_dates: task.completed_dates ?? [],
        show_in_calendar: task.showInCalendar ?? true,
        is_archived: Boolean(task.isArchived),
        parent_id: task.parentId ?? '',
        order: task.order ?? 0,
    };
    if (includeId) {
        payload.id = task.id;
    }
    return payload;
}

export const createTodosSlice: DataStoreSlice<TodosSlice> = (set, get) => ({
    tasks: loadCachedTasks(),

    setTasks: (tasks) => {
        saveTasksToOfflineCache(tasks);
        set({ tasks });
    },

    addTask: async (taskDraft) => {
        const state = get();
        const fallbackId =
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : generateSecureId('task');
        const initialStatus: 'todo' | 'in_progress' | 'completed' =
            taskDraft.status || (taskDraft.isCompleted ? 'completed' : 'todo');
        const showInCalendar = taskDraft.showInCalendar ?? true;
        const isCompleted =
            taskDraft.isCompleted !== undefined
                ? taskDraft.isCompleted
                : initialStatus === 'completed';
        const createdAt = taskDraft.createdAt || new Date().toISOString();
        const updatedAt = new Date().toISOString();
        const completedAt =
            taskDraft.completedAt !== undefined
                ? taskDraft.completedAt
                : isCompleted
                ? new Date().toISOString()
                : undefined;
        const newTask: TaskItem = {
            id: fallbackId,
            ...taskDraft,
            parentId: taskDraft.parentId !== undefined ? taskDraft.parentId : null,
            order: taskDraft.order !== undefined ? taskDraft.order : 0,
            showInCalendar,
            isCompleted,
            status: initialStatus,
            createdAt,
            completedAt,
            updatedAt,
        };
        const nextTasks = [...state.tasks, newTask];
        set({ tasks: nextTasks });
        saveTasksToOfflineCache(nextTasks);

        try {
            const res = await apiFetch('/api/v1/todos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskToServerTodoPayload(newTask, true)),
            });

            if (res.ok) {
                const createdTodo = (await res.json()) as { id?: string };
                const newId = createdTodo.id;
                if (newId && newId !== fallbackId) {
                    const reconciled: TaskItem[] = get().tasks.map((t) =>
                        t.id === fallbackId ? { ...t, id: newId } : t
                    );
                    set({ tasks: reconciled });
                    saveTasksToOfflineCache(reconciled);
                    return newId;
                }
            } else {
                console.error('[addTask] API returned non-OK status:', res.status);
            }
        } catch (e) {
            console.error('[addTask] Failed to sync todo', e);
        }
        return fallbackId;
    },

    updateTask: async (id, updates, options) => {
        const strict = options?.strict === true;
        if (deletedTaskIds.has(id)) {
            return;
        }

        const state = get();
        const task = state.tasks.find((t) => t.id === id);
        if (!task) {
            if (strict) throw new Error(`Task update failed: task ${id} not found`);
            return;
        }

        const resolvedStatus =
            updates.status !== undefined
                ? updates.status
                : updates.isCompleted !== undefined
                ? updates.isCompleted
                    ? 'completed'
                    : 'todo'
                : task.status;

        const resolvedCompleted =
            updates.isCompleted !== undefined
                ? updates.isCompleted
                : updates.status !== undefined
                ? updates.status === 'completed'
                : task.isCompleted;

        const resolvedShowInCalendar =
            updates.showInCalendar !== undefined
                ? updates.showInCalendar
                : (task.showInCalendar ?? true);

        let resolvedCompletedAt = updates.completedAt;
        if (resolvedCompletedAt === undefined && !('completedAt' in updates)) {
            if (resolvedCompleted && !task.isCompleted) {
                resolvedCompletedAt = new Date().toISOString();
            } else if (!resolvedCompleted && task.isCompleted) {
                resolvedCompletedAt = undefined;
            } else {
                resolvedCompletedAt = task.completedAt;
            }
        }

        const now = new Date().toISOString();
        const mergedUpdates: Partial<TaskItem> = {
            ...updates,
            parentId: updates.parentId !== undefined ? updates.parentId : (task.parentId ?? null),
            order: updates.order !== undefined ? updates.order : (task.order ?? 0),
            showInCalendar: resolvedShowInCalendar,
            isCompleted: resolvedCompleted,
            ...(resolvedStatus !== undefined ? { status: resolvedStatus } : {}),
            completedAt: resolvedCompletedAt,
            updatedAt: now,
        };

        // 1. Optimistic local update immediately
        const nextTasks = state.tasks.map((t) => (t.id === id ? { ...t, ...mergedUpdates } : t));
        set({ tasks: nextTasks });
        saveTasksToOfflineCache(nextTasks);

        // 2. Get the fully merged task for server sync
        const mergedTask: TaskItem = {
            ...task,
            ...mergedUpdates,
            showInCalendar: resolvedShowInCalendar,
            status: resolvedStatus,
            completedAt: resolvedCompletedAt,
            updatedAt: now,
        };

        // 3. Persist directly to unified /api/v1/todos endpoint
        try {
            const res = await apiFetch(`/api/v1/todos/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskToServerTodoPayload(mergedTask, false)),
            });
            if (!res.ok) {
                if (res.status === 404) {
                    // Legacy task not yet migrated to /api/v1/todos — upsert instead of deleting
                    const upsertRes = await apiFetch('/api/v1/todos', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(taskToServerTodoPayload(mergedTask, true)),
                    });
                    if (!upsertRes.ok) {
                        console.error('[updateTask] Upsert after 404 returned non-OK status:', upsertRes.status);
                        if (strict) throw new Error(`Task upsert failed (${upsertRes.status})`);
                    }
                } else {
                    console.error('[updateTask] API returned non-OK status:', res.status);
                    if (strict) throw new Error(`Task update failed (${res.status})`);
                }
            }
        } catch (e) {
            console.error('[updateTask] Failed to sync todo update', e);
            if (strict) throw e;
        }
    },

    toggleTask: async (id) => {
        const state = get();
        const task = state.tasks.find((t) => t.id === id);
        if (!task) return;

        const nextCompleted = !task.isCompleted;
        const nextStatus: 'todo' | 'completed' = nextCompleted ? 'completed' : 'todo';
        const completedAt = nextCompleted ? new Date().toISOString() : undefined;
        await get().updateTask(id, { isCompleted: nextCompleted, status: nextStatus, completedAt });

        if (typeof window !== 'undefined') {
            try {
                const currentCount = parseInt(
                    localStorage.getItem('tide_stats_completed_tasks') || '0',
                    10
                );
                if (nextCompleted) {
                    localStorage.setItem('tide_stats_completed_tasks', (currentCount + 1).toString());
                } else {
                    localStorage.setItem(
                        'tide_stats_completed_tasks',
                        Math.max(0, currentCount - 1).toString()
                    );
                }
            } catch (e) {
                console.error('Failed to update completed tasks stats', e);
            }
        }
    },

    toggleTaskInProgress: async (id: string) => {
        const state = get();
        const task = state.tasks.find((t) => t.id === id);
        if (!task) return;

        const nextStatus: 'todo' | 'in_progress' =
            task.status === 'in_progress' ? 'todo' : 'in_progress';
        await get().updateTask(id, { status: nextStatus, isCompleted: false, completedAt: undefined });
    },

    setTaskStatus: async (id: string, status: 'todo' | 'in_progress' | 'completed') => {
        const isCompleted = status === 'completed';
        const completedAt = isCompleted ? new Date().toISOString() : undefined;
        await get().updateTask(id, { status, isCompleted, completedAt });

        if (typeof window !== 'undefined') {
            try {
                const currentCount = parseInt(
                    localStorage.getItem('tide_stats_completed_tasks') || '0',
                    10
                );
                if (isCompleted) {
                    localStorage.setItem('tide_stats_completed_tasks', (currentCount + 1).toString());
                }
            } catch (e) {
                console.error('Failed to update completed tasks stats', e);
            }
        }
    },

    deleteTask: async (id) => {
        recordDeletedTaskId(id);
        // Optimistic removal
        const nextTasks = get().tasks.filter((t) => t.id !== id);
        set({ tasks: nextTasks });
        saveTasksToOfflineCache(nextTasks);

        const linkedEvents = (get().events || []).filter(
            (e) => (e as { linkedTaskId?: string }).linkedTaskId === id
        );
        if (linkedEvents.length > 0) {
            set({
                events: (get().events || []).filter(
                    (e) => (e as { linkedTaskId?: string }).linkedTaskId !== id
                ),
            });
            for (const event of linkedEvents) {
                apiFetch(`/api/v1/files/${event.id}`, { method: 'DELETE' }).catch((err) => {
                    console.warn('[deleteTask] Failed to delete linked calendar event:', event.id, err);
                });
            }
        }

        try {
            const res = await apiFetch(`/api/v1/todos/${id}`, { method: 'DELETE' });
            if (!res.ok && res.status !== 404) {
                console.error('[deleteTask] Failed to delete todo from backend:', res.status);
            }
        } catch (e) {
            console.error('[deleteTask] Failed to delete todo from backend', e);
        }

        // Fire-and-forget cleanup of any legacy encrypted copy so it never resurrects
        void apiFetch(`/api/v1/tasks/${id}`, { method: 'DELETE' })
            .then((res) => {
                if (!res.ok && res.status !== 404) {
                    console.warn('[deleteTask] Legacy task cleanup returned status:', res.status);
                }
            })
            .catch((err) => {
                console.warn('[deleteTask] Failed to delete legacy task copy:', err);
            });
    },
});
