import type { DataStoreSlice, FsSlice, DataItem, TaskItem } from './types';
import { apiFetch } from '@/lib/api';
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

        if (state.fetchingDirectories.has(dirKey)) return;
        if (!forceRefresh && state.loadedDirectories.has(dirKey)) return;

        set(s => {
            const next = new Set(s.fetchingDirectories);
            next.add(dirKey);
            return { fetchingDirectories: next };
        });

        let finalMergedTasks: TaskItem[] | undefined;

        try {
            console.log(`[STATE-AUDIT] fetchDirectory START | ParentID: ${dirKey}`);
            let allFiles: RawFileItem[] = [];

            if (parentId === null) {
                const results = await Promise.allSettled([
                    apiFetch(`/api/v1/files`),
                    apiFetch(`/api/v1/files?type=event`),
                    apiFetch(`/api/v1/tasks`),
                ]);

                const rootFiles: RawFileItem[] = [];
                const eventsFiles: RawFileItem[] = [];
                const tasksList: Array<{ id: string; encrypted_vault?: string; [key: string]: unknown }> = [];

                if (results[0].status === 'fulfilled' && results[0].value.ok) {
                    rootFiles.push(...(await parseSafeJson<RawFileItem[]>(results[0].value)));
                } else if (results[0].status === 'fulfilled' && results[0].value.status === 401) {
                    console.warn('[STATE-AUDIT] fetchDirectory | Root Files Unauthorized.');
                    if (typeof window !== 'undefined') window.location.href = '/auth';
                    return;
                } else {
                    console.error('[STATE-AUDIT ERROR] fetchDirectory | Failed to fetch root files');
                }

                if (results[1].status === 'fulfilled' && results[1].value.ok) {
                    eventsFiles.push(...(await parseSafeJson<RawFileItem[]>(results[1].value)));
                } else if (results[1].status === 'fulfilled' && results[1].value.status === 401) {
                    console.warn('[STATE-AUDIT] fetchDirectory | Events Unauthorized.');
                    if (typeof window !== 'undefined') window.location.href = '/auth';
                    return;
                } else {
                    console.error('[STATE-AUDIT ERROR] fetchDirectory | Failed to fetch root events');
                }

                if (results[2].status === 'fulfilled' && results[2].value.ok) {
                    tasksList.push(...(await parseSafeJson<Array<{ id: string; encrypted_vault?: string }>>(results[2].value)));
                    const loadedTasks = await decryptTasks(tasksList, state.privateKey);
                    finalMergedTasks = reconcileTasksWithLocal(loadedTasks, get().tasks, deletedTaskIds);
                }

                const seen = new Set<string>();
                for (const f of [...rootFiles, ...eventsFiles]) {
                    if (!seen.has(f.id)) {
                        seen.add(f.id);
                        allFiles.push(f);
                    }
                }
            } else {
                const res = await apiFetch(`/api/v1/files?parent_id=${parentId}`);
                if (!res.ok) {
                    if (res.status === 401) {
                        console.warn('[STATE-AUDIT] fetchDirectory | Unauthorized. Redirecting.');
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

            for (const f of allFiles) {
                const res = await decryptAndNormalizeFileItem(f, state.privateKey, {
                    existingItems: existingAll,
                    cachedMetadata: newMetaCache,
                    forceRefresh,
                    cachePrefix: f.version && f.version >= 2 ? 'v2' : 'lazy',
                });

                if (res.skipped) continue;

                if (res.metadata) {
                    newMetaCache[f.id] = res.metadata;
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

                const mergedEvents = [
                    ...s.events.filter(e => {
                        if (newEventIds.has(e.id)) return false;
                        const eventParent = e.parent_id === null ? 'root' : e.parent_id;
                        if (eventParent === dirKey) return false;
                        return true;
                    }),
                    ...visibleEvents.map(ve => {
                        const existing = s.events.find(e => e.id === ve.id);
                        if (existing) {
                            return {
                                ...ve,
                                title: ve.title && ve.title !== 'Untitled' && !ve.title.includes('Locked Note') ? ve.title : existing.title,
                            };
                        }
                        return ve;
                    }),
                ];

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
                    loadedDirectories: new Set([...s.loadedDirectories, dirKey]),
                    fetchingDirectories: new Set([...s.fetchingDirectories].filter(d => d !== dirKey)),
                };
            });

            console.log(`[STATE-AUDIT] fetchDirectory SUCCESS | ParentID: ${dirKey}`);
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

            if (results[0].status === 'fulfilled' && results[0].value.ok) {
                allFiles.push(...(await parseSafeJson<RawFileItem[]>(results[0].value)));
            }
            if (results[1].status === 'fulfilled' && results[1].value.ok) {
                allEvents.push(...(await parseSafeJson<RawFileItem[]>(results[1].value)));
            }
            try {
                const tasksRes = await apiFetch(`/api/v1/tasks`);
                if (tasksRes.ok) allTasks = await parseSafeJson<Array<{ id: string; encrypted_vault?: string }>>(tasksRes);
            } catch (e) {
                console.error('Failed to fetch tasks', e);
            }

            const decryptedNotes: DataItem[] = [];
            const decryptedEvents: DataItem[] = [];
            const newMetaCache: Record<string, unknown> = { ...get().metadataCache };
            const existingAll = [...get().notes, ...get().events];

            for (const f of allFiles) {
                const res = await decryptAndNormalizeFileItem(f, state.privateKey, {
                    existingItems: existingAll,
                    cachedMetadata: newMetaCache,
                    cachePrefix: f.version && f.version >= 2 ? 'v2-lam' : 'lam',
                });
                if (res.skipped) continue;
                if (res.metadata) newMetaCache[f.id] = res.metadata;
                if (res.item) decryptedNotes.push(res.item);
            }

            for (const f of allEvents) {
                const res = await decryptAndNormalizeFileItem(f, state.privateKey, {
                    existingItems: existingAll,
                    cachedMetadata: newMetaCache,
                    cachePrefix: f.version && f.version >= 2 ? 'v2-lam' : 'lam',
                });
                if (res.skipped) continue;
                if (res.metadata) newMetaCache[f.id] = res.metadata;
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
                };
            });

            const loadedTasks = await decryptTasks(allTasks, state.privateKey);
            set(s => {
                if (loadedTasks.length === 0 && s.tasks.length > 0) return {};
                const finalTasks = reconcileTasksWithLocal(loadedTasks, s.tasks, deletedTaskIds);
                saveTasksToOfflineCache(finalTasks);
                return { tasks: finalTasks };
            });
        } catch (e) {
            console.error('[STATE-AUDIT ERROR] loadAllMetadata |', e);
        }
    },
});
