import { apiFetch } from '@/lib/api';
import type { DataStoreSlice, TaskItem, TodosSlice } from './types';
import { deletedTaskIds } from './fsHelpers';

export { deletedTaskIds };

export function loadCachedTasks(): TaskItem[] {
    if (typeof window === 'undefined') return [];
    try {
        const cached = localStorage.getItem('tide_offline_tasks');
        return cached ? (JSON.parse(cached) as TaskItem[]) : [];
    } catch (e) {
        console.warn('Failed to load cached tasks from localStorage', e);
        return [];
    }
}

export function saveTasksToOfflineCache(tasks: TaskItem[]): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem('tide_offline_tasks', JSON.stringify(tasks));
    } catch (e) {
        console.warn('Failed to save tasks to offline cache', e);
    }
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
                : Math.random().toString(36).substring(2);
        const initialStatus: 'todo' | 'in_progress' | 'completed' =
            taskDraft.status || (taskDraft.isCompleted ? 'completed' : 'todo');
        const showInCalendar = taskDraft.showInCalendar ?? true;
        const isCompleted =
            taskDraft.isCompleted !== undefined
                ? taskDraft.isCompleted
                : initialStatus === 'completed';
        const createdAt = taskDraft.createdAt || new Date().toISOString();
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
        };
        const nextTasks = [...state.tasks, newTask];
        set({ tasks: nextTasks });
        saveTasksToOfflineCache(nextTasks);

        if (!state.publicKey) return fallbackId;

        try {
            const cryptoLib = await import('@/lib/crypto');
            // Include all fields (including scheduledDate) in the vault
            const vaultPayload: Record<string, unknown> = {
                title: newTask.title,
                isCompleted: newTask.isCompleted,
                status: newTask.status || (newTask.isCompleted ? 'completed' : 'todo'),
                description: newTask.description,
                color: newTask.color,
                linkedNoteId: newTask.linkedNoteId,
                scheduledDate: newTask.scheduledDate,
                priority: newTask.priority,
                dueDate: newTask.dueDate,
                recurrence: newTask.recurrence,
                recurrence_rule: newTask.recurrence_rule,
                recurrence_end: newTask.recurrence_end,
                completed_dates: newTask.completed_dates,
                folder: newTask.folder,
                tags: newTask.tags || [],
                showInCalendar: newTask.showInCalendar !== undefined ? newTask.showInCalendar : true,
                createdAt: newTask.createdAt,
                completedAt: newTask.completedAt,
                isArchived: newTask.isArchived,
                parentId: newTask.parentId ?? null,
                order: newTask.order ?? 0,
            };
            const securedMeta = await cryptoLib.encryptMetadata(vaultPayload, state.publicKey);

            const res = await apiFetch('/api/v1/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    encrypted_vault: securedMeta,
                }),
            });

            if (res.ok) {
                const createdTask = (await res.json()) as { id?: string };
                const newId = createdTask.id;
                if (newId && newId !== fallbackId) {
                    const reconciled: TaskItem[] = get().tasks.map((t) =>
                        t.id === fallbackId ? { ...t, id: newId } : t
                    );
                    set({ tasks: reconciled });
                    saveTasksToOfflineCache(reconciled);
                    return newId;
                }
            }
        } catch (e) {
            console.error('Failed to sync task', e);
        }
        return fallbackId;
    },

    updateTask: async (id, updates) => {
        if (deletedTaskIds.has(id)) {
            return;
        }

        const state = get();
        const task = state.tasks.find((t) => t.id === id);
        if (!task) return;

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

        const mergedUpdates: Partial<TaskItem> = {
            ...updates,
            parentId: updates.parentId !== undefined ? updates.parentId : (task.parentId ?? null),
            order: updates.order !== undefined ? updates.order : (task.order ?? 0),
            showInCalendar: resolvedShowInCalendar,
            isCompleted: resolvedCompleted,
            ...(resolvedStatus !== undefined ? { status: resolvedStatus } : {}),
            completedAt: resolvedCompletedAt,
        };

        // 1. Optimistic local update immediately
        const nextTasks = state.tasks.map((t) => (t.id === id ? { ...t, ...mergedUpdates } : t));
        set({ tasks: nextTasks });
        saveTasksToOfflineCache(nextTasks);

        // 2. Get the fully merged task for encryption
        const mergedTask: TaskItem = {
            ...task,
            ...mergedUpdates,
            showInCalendar: resolvedShowInCalendar,
            status: resolvedStatus,
            completedAt: resolvedCompletedAt,
        };

        // 3. Resolve publicKey — prefer store, fall back to sessionStorage
        let publicKey = state.publicKey;
        if (!publicKey && typeof window !== 'undefined') {
            try {
                const cryptoLib = await import('@/lib/crypto');
                const pubKeyStr = sessionStorage.getItem('tide_user_public_key');
                if (pubKeyStr) {
                    publicKey = await window.crypto.subtle.importKey(
                        'spki',
                        cryptoLib.base64ToArrayBuffer(pubKeyStr),
                        { name: 'RSA-OAEP', hash: 'SHA-256' },
                        true,
                        ['encrypt']
                    );
                }
            } catch (e) {
                console.error('[updateTask] Failed to recover public key from sessionStorage', e);
            }
        }
        if (!publicKey) {
            console.warn('[updateTask] publicKey unavailable — task update NOT persisted to backend:', id);
            return;
        }

        try {
            const cryptoLib = await import('@/lib/crypto');
            // Explicitly include all persistent fields so scheduledDate survives reloads
            const vaultPayload: Record<string, unknown> = {
                title: mergedTask.title,
                isCompleted: mergedTask.isCompleted,
                status:
                    updates.status !== undefined
                        ? updates.status
                        : updates.isCompleted !== undefined
                        ? updates.isCompleted
                            ? 'completed'
                            : 'todo'
                        : task.status,
                description: mergedTask.description,
                color: mergedTask.color,
                linkedNoteId: mergedTask.linkedNoteId,
                scheduledDate: mergedTask.scheduledDate,
                priority: mergedTask.priority,
                dueDate: mergedTask.dueDate,
                recurrence: mergedTask.recurrence,
                recurrence_rule: mergedTask.recurrence_rule,
                recurrence_end: mergedTask.recurrence_end,
                completed_dates: mergedTask.completed_dates,
                folder: mergedTask.folder,
                tags: mergedTask.tags !== undefined ? mergedTask.tags : [],
                showInCalendar:
                    mergedTask.showInCalendar !== undefined ? mergedTask.showInCalendar : true,
                createdAt: mergedTask.createdAt,
                completedAt: mergedTask.completedAt,
                isArchived: mergedTask.isArchived,
                parentId: (updates.parentId !== undefined ? updates.parentId : task?.parentId) ?? null,
                order: (updates.order !== undefined ? updates.order : task?.order) ?? 0,
            };
            const securedMeta = await cryptoLib.encryptMetadata(vaultPayload, publicKey);

            const res = await apiFetch(`/api/v1/tasks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    encrypted_vault: securedMeta,
                }),
            });
            if (!res.ok) {
                if (res.status === 404) {
                    if (deletedTaskIds.has(id)) {
                        return;
                    }
                    // Task doesn't exist in backend yet (optimistic ID was never persisted).
                    // Create it via POST and reconcile the ID.
                    console.warn('[updateTask] Task not found in backend (404) — creating via POST');
                    const createRes = await apiFetch('/api/v1/tasks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            encrypted_vault: securedMeta,
                        }),
                    });
                    if (createRes.ok) {
                        const created = (await createRes.json()) as { id?: string };
                        const newId = created.id;
                        if (newId && newId !== id) {
                            // Reconcile local ID with the new backend ID
                            const reconciled: TaskItem[] = get().tasks.map((t) =>
                                t.id === id ? { ...t, id: newId } : t
                            );
                            set({ tasks: reconciled });
                            saveTasksToOfflineCache(reconciled);
                            console.log('[updateTask] ID reconciled:', id, '->', newId);
                        }
                    } else {
                        console.error('[updateTask] POST fallback also failed:', createRes.status);
                    }
                } else {
                    console.error('[updateTask] API returned non-OK status:', res.status);
                }
            }
        } catch (e) {
            console.error('Failed to sync task update', e);
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
        deletedTaskIds.add(id);
        // Optimistic removal
        const nextTasks = get().tasks.filter((t) => t.id !== id);
        set({ tasks: nextTasks });
        saveTasksToOfflineCache(nextTasks);
        try {
            await apiFetch(`/api/v1/tasks/${id}`, { method: 'DELETE' });
        } catch (e) {
            console.error('[deleteTask] Failed to delete task from backend', e);
        }
    },
});
