import type { DataStoreSlice, FsSlice, DataItem, TaskItem } from './types';
import { apiFetch, clearAllSessionData } from '@/lib/api';
import {
    deletedTaskIds,
    loadOpenFoldersFromCache,
    saveOpenFoldersToCache,
    saveNotesToOfflineCache,
    saveEventsToOfflineCache,
    saveTasksToOfflineCache,
    parseSafeJson,
    decryptTasks,
    reconcileTasksWithLocal,
    mergeMetadataCache,
    decryptAndNormalizeFileItem,
    type RawFileItem,
} from './fsHelpers';

/** A refresh was requested while one was running. */
let rootRefetchQueued = false;
/** Local events younger than this are not removed just because the server list does not show them yet. */
const RECENT_EVENT_GRACE_MS = 20_000;

interface ServerTodoItem {
    id: string;
    user_id?: string;
    title: string;
    description?: string;
    status?: string;
    priority?: string;
    due_date?: string;
    scheduled_date?: string;
    tags?: string[];
    color?: string;
    is_completed?: boolean;
    folder?: string;
    linked_note_id?: string;
    recurrence?: string;
    recurrence_rule?: string;
    recurrence_end?: string;
    completed_dates?: string[];
    show_in_calendar?: boolean;
    is_archived?: boolean;
    parent_id?: string;
    order?: number;
    created_at?: string;
    completed_at?: string;
    updated_at?: string;
}

const syncedLegacyTodoIds = new Set<string>();

function mapServerTodoToTaskItem(raw: ServerTodoItem): TaskItem {
    return {
        id: raw.id,
        title: raw.title,
        description: raw.description || undefined,
        color: raw.color || undefined,
        isCompleted: Boolean(raw.is_completed),
        status: (raw.status as TaskItem['status']) || (raw.is_completed ? 'completed' : 'todo'),
        linkedNoteId: raw.linked_note_id || undefined,
        scheduledDate: raw.scheduled_date || undefined,
        priority: (raw.priority as TaskItem['priority']) || 'medium',
        dueDate: raw.due_date || undefined,
        recurrence: (raw.recurrence as TaskItem['recurrence']) || 'none',
        recurrence_rule: raw.recurrence_rule || undefined,
        recurrence_end: raw.recurrence_end || undefined,
        completed_dates: Array.isArray(raw.completed_dates) ? raw.completed_dates : [],
        folder: raw.folder || undefined,
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        showInCalendar: Boolean(raw.show_in_calendar),
        createdAt: raw.created_at || undefined,
        completedAt: raw.completed_at || undefined,
        updatedAt: raw.updated_at || undefined,
        isArchived: Boolean(raw.is_archived),
        parentId: raw.parent_id ? raw.parent_id : null,
        order: typeof raw.order === 'number' ? raw.order : undefined,
        owner_id: raw.user_id || undefined,
    };
}

async function parseTodosResponse(res: Response | null): Promise<{ ok: boolean; items: TaskItem[] }> {
    if (!res || !res.ok) return { ok: false, items: [] };
    const todosList = await parseSafeJson<ServerTodoItem[]>(res);
    if (!Array.isArray(todosList)) return { ok: true, items: [] };
    const items = todosList
        .filter((t): t is ServerTodoItem => Boolean(t && typeof t.id === 'string'))
        .map(mapServerTodoToTaskItem);
    return { ok: true, items };
}

function mergeTodosAndLegacyTasks(
    apiTodos: TaskItem[],
    legacyTasks: TaskItem[],
    deletedIds: Set<string>,
    syncLegacy = true
): TaskItem[] {
    const mergedMap = new Map<string, TaskItem>();

    for (const todo of apiTodos) {
        if (!todo.id || deletedIds.has(todo.id)) continue;
        mergedMap.set(todo.id, todo);
    }

    const legacyOnly: TaskItem[] = [];
    for (const legacy of legacyTasks) {
        if (!legacy.id || deletedIds.has(legacy.id)) continue;
        if (!mergedMap.has(legacy.id)) {
            mergedMap.set(legacy.id, legacy);
            legacyOnly.push(legacy);
        }
    }

    if (syncLegacy) {
        for (const item of legacyOnly) {
            if (syncedLegacyTodoIds.has(item.id)) continue;
            const isLocked = (item as TaskItem & { isLocked?: boolean }).isLocked;
            if (isLocked || !item.title || !item.title.trim()) continue;
            syncedLegacyTodoIds.add(item.id);
            void apiFetch('/api/v1/todos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: item.id,
                    title: item.title,
                    description: item.description,
                    status: item.status || (item.isCompleted ? 'completed' : 'todo'),
                    priority: item.priority || 'medium',
                    due_date: item.dueDate,
                    scheduled_date: item.scheduledDate,
                    tags: item.tags || [],
                    color: item.color,
                    is_completed: Boolean(item.isCompleted),
                    folder: item.folder,
                    linked_note_id: item.linkedNoteId,
                    recurrence: item.recurrence || 'none',
                    recurrence_rule: item.recurrence_rule,
                    recurrence_end: item.recurrence_end,
                    completed_dates: item.completed_dates || [],
                    show_in_calendar: Boolean(item.showInCalendar),
                    is_archived: Boolean(item.isArchived),
                    parent_id: item.parentId ?? undefined,
                    order: item.order ?? 0,
                }),
            }).catch((err) => {
                console.warn('[STATE-AUDIT] Failed to sync legacy task to /api/v1/todos', item.id, err);
            });
        }
    }

    return Array.from(mergedMap.values());
}

export const createFsSlice: DataStoreSlice<FsSlice> = (set, get) => ({
    privateKey: null,
    publicKey: null,
    myId: null,
    loadedDirectories: new Set<string>(),
    fetchingDirectories: new Set<string>(),
    metadataCache: {},
    openFolderIds: loadOpenFoldersFromCache(),
    isUpdatingMetadata: new Set<string>(),

    setKeys: (privateKey, publicKey, myId) => {
        set({ privateKey, publicKey, myId });
        const state = get();
        if (state.openFolderIds.size > 0) {
            Array.from(state.openFolderIds).forEach(id => {
                state.fetchDirectory(id === 'root' ? null : id);
            });
        }
    },

    toggleFolder: (id, open) => set(s => {
        const next = new Set(s.openFolderIds);
        const shouldOpen = open !== undefined ? open : !next.has(id);
        if (shouldOpen) {
            next.add(id);
            get().fetchDirectory(id);
        } else {
            next.delete(id);
        }
        saveOpenFoldersToCache(next);
        return { openFolderIds: next };
    }),

    setUpdatingMetadata: (id, updating) => set(s => {
        const next = new Set(s.isUpdatingMetadata);
        if (updating) next.add(id);
        else next.delete(id);
        return { isUpdatingMetadata: next };
    }),

    updateSpecificMetadataCache: (id, updates) => set(s => ({
        metadataCache: {
            ...s.metadataCache,
            [id]: {
                ...((s.metadataCache[id] as Record<string, unknown>) || {}),
                ...((updates as Record<string, unknown>) || {}),
            },
        },
    })),

    updateFileRaw: (id, updates) => set(s => {
        const isNote = s.notes.some(n => n.id === id);
        const nextCache = { ...s.metadataCache };
        if (nextCache[id]) {
            nextCache[id] = {
                ...(nextCache[id] as Record<string, unknown>),
                ...updates,
            };
        }

        if (isNote) {
            const nextNotes = s.notes.map(n => (n.id === id ? { ...n, ...updates } : n));
            saveNotesToOfflineCache(nextNotes);
            return {
                notes: nextNotes,
                metadataCache: nextCache,
            };
        }
        const nextEvents = s.events.map(e => (e.id === id ? { ...e, ...updates } : e));
        saveEventsToOfflineCache(nextEvents);
        return {
            events: nextEvents,
            metadataCache: nextCache,
        };
    }),

    updateFile: (id, updates) => get().updateFileRaw(id, updates),

    appendFiles: (newNotes, newEvents) => set(state => {
        const noteMap = new Map(state.notes.map(n => [n.id, n]));
        newNotes.forEach(n => noteMap.set(n.id, { ...noteMap.get(n.id), ...n }));

        const eventMap = new Map(state.events.map(e => [e.id, e]));
        newEvents.forEach(e => eventMap.set(e.id, { ...eventMap.get(e.id), ...e }));

        const mergedNotes = Array.from(noteMap.values());
        const mergedEvents = Array.from(eventMap.values());
        saveNotesToOfflineCache(mergedNotes);
        saveEventsToOfflineCache(mergedEvents);

        return {
            notes: mergedNotes,
            events: mergedEvents,
        };
    }),

    fetchDirectory: async (parentId, forceRefresh = false) => {
        const state = get();
        if (!state.privateKey || !state.myId) return;

        const dirKey = parentId === null ? 'root' : parentId;

        if (state.fetchingDirectories.has(dirKey)) {
            // A change arrived while a refresh is running; that refresh may predate it, so run once more afterwards.
            if (dirKey === 'root') rootRefetchQueued = true;
            return;
        }
        if (!forceRefresh && state.loadedDirectories.has(dirKey)) return;

        set(s => {
            const next = new Set(s.fetchingDirectories);
            next.add(dirKey);
            return { fetchingDirectories: next };
        });

        let finalMergedTasks: TaskItem[] | undefined;
        // Ids of all events the server returned (null when the events request failed: then nothing is removed)
        let serverEventIds: Set<string> | null = null;

        try {
            console.log(`[STATE-AUDIT] fetchDirectory START | ParentID: ${dirKey}`);
            let allFiles: RawFileItem[] = [];

            if (parentId === null) {
                const results = await Promise.allSettled([
                    apiFetch(`/api/v1/files`),
                    apiFetch(`/api/v1/files?type=event`),
                    apiFetch(`/api/v1/tasks`),
                    apiFetch('/api/v1/todos?limit=500&include_archived=true').catch(() => null),
                ]);

                const rootFiles: RawFileItem[] = [];
                const eventsFiles: RawFileItem[] = [];
                const tasksList: Array<{ id: string; encrypted_vault?: string; [key: string]: unknown }> = [];

                if (results[0].status === 'fulfilled' && results[0].value.ok) {
                    rootFiles.push(...(await parseSafeJson<RawFileItem[]>(results[0].value)));
                } else if (results[0].status === 'fulfilled' && results[0].value.status === 401) {
                    console.warn('[STATE-AUDIT] fetchDirectory | Root Files Unauthorized.');
                    await clearAllSessionData({ callServerLogout: false });
                    if (typeof window !== 'undefined') window.location.href = '/auth';
                    return;
                } else {
                    console.error('[STATE-AUDIT ERROR] fetchDirectory | Failed to fetch root files');
                }

                if (results[1].status === 'fulfilled' && results[1].value.ok) {
                    eventsFiles.push(...(await parseSafeJson<RawFileItem[]>(results[1].value)));
                    serverEventIds = new Set(eventsFiles.map((f) => f.id));
                } else if (results[1].status === 'fulfilled' && results[1].value.status === 401) {
                    console.warn('[STATE-AUDIT] fetchDirectory | Events Unauthorized.');
                    await clearAllSessionData({ callServerLogout: false });
                    if (typeof window !== 'undefined') window.location.href = '/auth';
                    return;
                } else {
                    console.error('[STATE-AUDIT ERROR] fetchDirectory | Failed to fetch root events');
                }

                const tasksRes = results[2].status === 'fulfilled' ? results[2].value : null;
                const tasksOk = Boolean(tasksRes && tasksRes.ok);
                const todosRes = results[3].status === 'fulfilled' ? results[3].value : null;

                if (tasksRes && tasksRes.ok) {
                    const parsedTasks = await parseSafeJson<Array<{ id: string; encrypted_vault?: string }>>(tasksRes);
                    if (Array.isArray(parsedTasks)) {
                        tasksList.push(...parsedTasks);
                    }
                }

                const { ok: todosOk, items: apiTodos } = await parseTodosResponse(todosRes);

                if (tasksOk || todosOk) {
                    const decryptedTasks = tasksOk
                        ? await decryptTasks(tasksList, state.privateKey)
                        : [];
                    const mergedRemoteTasks = mergeTodosAndLegacyTasks(apiTodos, decryptedTasks, deletedTaskIds, todosOk);
                    finalMergedTasks = reconcileTasksWithLocal(mergedRemoteTasks, get().tasks, deletedTaskIds);
                }

                const seen = new Set<string>();
                for (const f of [...rootFiles, ...eventsFiles]) {
                    if (!seen.has(f.id)) {
                        seen.add(f.id);
                        allFiles.push(f);
                    }
                }
            } else {
                const res = await apiFetch(`/api/v1/files?parent_id=${encodeURIComponent(parentId)}`);
                if (!res.ok) {
                    if (res.status === 401) {
                        console.warn('[STATE-AUDIT] fetchDirectory | Unauthorized. Redirecting.');
                        await clearAllSessionData({ callServerLogout: false });
                        if (typeof window !== 'undefined') window.location.href = '/auth';
                        return;
                    }
                    const errorText = await res.text();
                    console.error(`[STATE-AUDIT ERROR] fetchDirectory | ${res.status} ${errorText}`);
                    return;
                }
                allFiles = await parseSafeJson<RawFileItem[]>(res);
            }

            if (!Array.isArray(allFiles)) throw new Error('Expected array of files');

            const decryptedNotes: DataItem[] = [];
            const decryptedEvents: DataItem[] = [];
            const newMetaCache: Record<string, unknown> = { ...get().metadataCache };
            const existingAll = [...get().notes, ...get().events];

            const decryptedResults = await Promise.all(
                allFiles.map(async (f) => ({
                    id: f.id,
                    res: await decryptAndNormalizeFileItem(f, state.privateKey, {
                        existingItems: existingAll,
                        cachedMetadata: newMetaCache,
                        forceRefresh,
                        cachePrefix: f.version && f.version >= 2 ? 'v2' : 'lazy',
                    }),
                }))
            );

            for (const { id, res } of decryptedResults) {
                if (res.skipped) continue;

                if (res.metadata) {
                    newMetaCache[id] = res.metadata;
                }

                if (res.item) {
                    if (res.type === 'event') decryptedEvents.push(res.item);
                    else decryptedNotes.push(res.item);
                }
            }

            const visibleNotes = decryptedNotes.filter(f => (f.share_status || 'owner') !== 'pending');
            const visibleEvents = decryptedEvents.filter(e => (e.share_status || 'owner') !== 'pending');

            set(s => {
                const newNoteIds = new Set(visibleNotes.map(vn => vn.id));
                const newEventIds = new Set(visibleEvents.map(ve => ve.id));

                const mergedNotes = [
                    ...s.notes.filter(n => {
                        if (newNoteIds.has(n.id)) return false;
                        const noteParent = n.parent_id === null ? 'root' : n.parent_id;
                        if (noteParent === dirKey) return false;
                        return true;
                    }),
                    ...visibleNotes.map(vn => {
                        const existing = s.notes.find(n => n.id === vn.id);
                        if (existing) {
                            if (existing.isGroup || vn.isGroup) {
                                return {
                                    ...vn,
                                    isGroup: true,
                                    effect: vn.effect || existing.effect,
                                    color: vn.color || existing.color,
                                    title: vn.title && vn.title !== 'Untitled' && !vn.title.includes('Locked Note') ? vn.title : existing.title,
                                };
                            }
                            return {
                                ...vn,
                                title: vn.title && vn.title !== 'Untitled' && !vn.title.includes('Locked Note') ? vn.title : existing.title,
                            };
                        }
                        return vn;
                    }),
                ];

                const eventMap = new Map(s.events.map(e => [e.id, e]));
                visibleEvents.forEach(ve => {
                    const existing = eventMap.get(ve.id);
                    if (existing) {
                        const mergedTitle =
                            ve.title && ve.title !== 'Untitled' && !ve.title.includes('Locked Note')
                                ? ve.title
                                : existing.title;
                        eventMap.set(ve.id, {
                            ...existing,
                            ...ve,
                            title: mergedTitle,
                        });
                    } else {
                        eventMap.set(ve.id, ve);
                    }
                });
                // Events deleted on another device are gone from the server list; drop them here too.
                // Very recent local ones stay (their creation may not have reached the list yet).
                if (serverEventIds && dirKey === 'root') {
                    const now = Date.now();
                    for (const [id, ev] of eventMap) {
                        if (serverEventIds.has(id)) continue;
                        const born = new Date(((ev as { createdAt?: string; created_at?: string }).createdAt ?? (ev as { created_at?: string }).created_at ?? 0) as string).getTime();
                        if (now - born < RECENT_EVENT_GRACE_MS) continue;
                        eventMap.delete(id);
                    }
                }
                const mergedEvents = Array.from(eventMap.values());

                const mergedCache = mergeMetadataCache(s.metadataCache, newMetaCache);

                if (finalMergedTasks !== undefined) {
                    saveTasksToOfflineCache(finalMergedTasks);
                }
                saveNotesToOfflineCache(mergedNotes);
                saveEventsToOfflineCache(mergedEvents);

                return {
                    notes: mergedNotes,
                    events: mergedEvents,
                    ...(finalMergedTasks !== undefined ? { tasks: finalMergedTasks } : {}),
                    metadataCache: mergedCache,
                    ...(dirKey === 'root' ? { eventsLoaded: true } : {}),
                    loadedDirectories: new Set([...s.loadedDirectories, dirKey]),
                    fetchingDirectories: new Set([...s.fetchingDirectories].filter(d => d !== dirKey)),
                };
            });

            console.log(`[STATE-AUDIT] fetchDirectory SUCCESS | ParentID: ${dirKey}`);
            if (dirKey === 'root' && rootRefetchQueued) {
                rootRefetchQueued = false;
                void get().fetchDirectory(null);
            }
        } catch (e) {
            console.error('[STATE-AUDIT ERROR] fetchDirectory |', e);
            if (finalMergedTasks !== undefined) {
                saveTasksToOfflineCache(finalMergedTasks);
            }
            set(s => {
                const next = new Set(s.fetchingDirectories);
                next.delete(dirKey);
                return {
                    fetchingDirectories: next,
                    ...(dirKey === 'root' ? { eventsLoaded: true } : {}),
                    ...(finalMergedTasks !== undefined ? { tasks: finalMergedTasks } : {}),
                };
            });
        }
    },

    loadAllMetadata: async () => {
        const state = get();
        if (!state.privateKey || !state.myId) return;

        try {
            const results = await Promise.allSettled([
                apiFetch(`/api/v1/files?recursive=true`),
                apiFetch(`/api/v1/files?type=event&recursive=true`),
            ]);

            const allFiles: RawFileItem[] = [];
            const allEvents: RawFileItem[] = [];
            let allTasks: Array<{ id: string; encrypted_vault?: string }> = [];
            let apiTodos: TaskItem[] = [];
            let todosOk = false;

            if (results[0].status === 'fulfilled' && results[0].value.ok) {
                allFiles.push(...(await parseSafeJson<RawFileItem[]>(results[0].value)));
            }
            if (results[1].status === 'fulfilled' && results[1].value.ok) {
                allEvents.push(...(await parseSafeJson<RawFileItem[]>(results[1].value)));
            }
            try {
                const [tasksResult, todosResult] = await Promise.allSettled([
                    apiFetch(`/api/v1/tasks`),
                    apiFetch('/api/v1/todos?limit=500&include_archived=true').catch(() => null),
                ]);
                if (tasksResult.status === 'fulfilled' && tasksResult.value.ok) {
                    const parsedTasks = await parseSafeJson<Array<{ id: string; encrypted_vault?: string }>>(tasksResult.value);
                    if (Array.isArray(parsedTasks)) {
                        allTasks = parsedTasks;
                    }
                }
                const parsedTodos = await parseTodosResponse(
                    todosResult.status === 'fulfilled' ? todosResult.value : null
                );
                todosOk = parsedTodos.ok;
                apiTodos = parsedTodos.items;
            } catch (e) {
                console.error('Failed to fetch tasks', e);
            }

            const decryptedNotes: DataItem[] = [];
            const decryptedEvents: DataItem[] = [];
            const newMetaCache: Record<string, unknown> = { ...get().metadataCache };
            const existingAll = [...get().notes, ...get().events];

            const [fileResults, eventResults] = await Promise.all([
                Promise.all(
                    allFiles.map(async (f) => ({
                        id: f.id,
                        res: await decryptAndNormalizeFileItem(f, state.privateKey, {
                            existingItems: existingAll,
                            cachedMetadata: newMetaCache,
                            cachePrefix: f.version && f.version >= 2 ? 'v2-lam' : 'lam',
                        }),
                    }))
                ),
                Promise.all(
                    allEvents.map(async (f) => ({
                        id: f.id,
                        res: await decryptAndNormalizeFileItem(f, state.privateKey, {
                            existingItems: existingAll,
                            cachedMetadata: newMetaCache,
                            cachePrefix: f.version && f.version >= 2 ? 'v2-lam' : 'lam',
                        }),
                    }))
                ),
            ]);

            for (const { id, res } of fileResults) {
                if (res.skipped) continue;
                if (res.metadata) newMetaCache[id] = res.metadata;
                if (res.item) decryptedNotes.push(res.item);
            }

            for (const { id, res } of eventResults) {
                if (res.skipped) continue;
                if (res.metadata) newMetaCache[id] = res.metadata;
                if (res.item) decryptedEvents.push(res.item);
            }

            const visibleNotes = decryptedNotes.filter(f => (f.share_status || 'owner') !== 'pending');
            const visibleEvents = decryptedEvents.filter(e => (e.share_status || 'owner') !== 'pending');

            set(s => {
                const noteMap = new Map(s.notes.map(n => [n.id, n]));
                visibleNotes.forEach(vn => {
                    const existing = noteMap.get(vn.id);
                    if (existing) {
                        const mergedTitle =
                            vn.title && vn.title !== 'Untitled' && !vn.title.includes('Locked Note')
                                ? vn.title
                                : existing.title;
                        noteMap.set(vn.id, {
                            ...existing,
                            ...vn,
                            title: mergedTitle,
                        });
                    } else {
                        noteMap.set(vn.id, vn);
                    }
                });

                const eventMap = new Map(s.events.map(e => [e.id, e]));
                visibleEvents.forEach(ve => {
                    const existing = eventMap.get(ve.id);
                    if (existing) {
                        const mergedTitle =
                            ve.title && ve.title !== 'Untitled' && !ve.title.includes('Locked Note')
                                ? ve.title
                                : existing.title;
                        eventMap.set(ve.id, {
                            ...existing,
                            ...ve,
                            title: mergedTitle,
                        });
                    } else {
                        eventMap.set(ve.id, ve);
                    }
                });

                const finalNotes = Array.from(noteMap.values());
                const finalEvents = Array.from(eventMap.values());
                saveNotesToOfflineCache(finalNotes);
                saveEventsToOfflineCache(finalEvents);

                return {
                    notes: finalNotes,
                    events: finalEvents,
                    metadataCache: { ...s.metadataCache, ...newMetaCache },
                    eventsLoaded: true,
                };
            });

            const decryptedTasks = await decryptTasks(allTasks, state.privateKey);
            const loadedTasks = mergeTodosAndLegacyTasks(apiTodos, decryptedTasks, deletedTaskIds, todosOk);
            set(s => {
                if (loadedTasks.length === 0 && s.tasks.length > 0) return {};
                const finalTasks = reconcileTasksWithLocal(loadedTasks, s.tasks, deletedTaskIds);
                saveTasksToOfflineCache(finalTasks);
                return { tasks: finalTasks };
            });
        } catch (e) {
            console.error('[STATE-AUDIT ERROR] loadAllMetadata |', e);
            set({ eventsLoaded: true });
        }
    },
});
