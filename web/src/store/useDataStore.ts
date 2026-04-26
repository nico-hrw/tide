import { create } from 'zustand';
import { apiFetch } from '@/lib/api';

export interface DataItem {
    id: string;
    title: string;
    type: string;
    [key: string]: any; // Allow extra properties like visibility, secured_meta for file UI
}

export interface TaskItem {
    id: string;
    title: string;
    description?: string;
    color?: string;
    isCompleted: boolean;
    linkedNoteId?: string;
    scheduledDate?: string;
}

interface DataState {
    notes: DataItem[];
    events: DataItem[];
    tasks: TaskItem[];
    setNotes: (notes: DataItem[]) => void;
    setEvents: (events: DataItem[]) => void;
    appendFiles: (files: DataItem[], events: DataItem[]) => void;
    orderedNoteIds: string[];
    setOrderedNoteIds: (ids: string[]) => void;
    createNote: (title: string, initialContent?: any) => Promise<string>; // Returns the new ID
    insertMentionIntoNote: (noteId: string, targetId: string, title: string) => void;
    activeNoteId: string | null;
    setActiveNoteId: (id: string | null) => void;
    activeParentId: string | null;
    setActiveParentId: (id: string | null) => void;
    
    smartIslandState: { show: boolean, parsedData?: any, text?: string, sourceNodePos?: number, anchorElement?: HTMLElement | null } | null;
    setSmartIsland: (state: { show: boolean, parsedData?: any, text?: string, sourceNodePos?: number, anchorElement?: HTMLElement | null } | null) => void;
    groupOverlappingEvents: (parentId: string) => void;
    
    isUpdatingMetadata: Set<string>;
    setUpdatingMetadata: (id: string, updating: boolean) => void;
    updateSpecificMetadataCache: (id: string, updates: any) => void;
    updateFileRaw: (id: string, updates: Partial<DataItem>) => void;

    // Tasks Actions
    setTasks: (tasks: TaskItem[]) => void;
    addTask: (task: Omit<TaskItem, 'id'>) => Promise<string>;
    updateTask: (id: string, updates: Partial<TaskItem>) => void;
    toggleTask: (id: string) => void;
    deleteTask: (id: string) => Promise<void>;

    // Lazy Loading File System State
    privateKey: CryptoKey | null;
    publicKey: CryptoKey | null;
    myId: string | null;
    loadedDirectories: Set<string>;
    fetchingDirectories: Set<string>;
    metadataCache: Record<string, any>;
    setKeys: (privateKey: CryptoKey, publicKey: CryptoKey, myId: string) => void;
    fetchDirectory: (parentId: string | null, forceRefresh?: boolean) => Promise<void>;
    loadAllMetadata: () => Promise<void>;
    openFolderIds: Set<string>;
    toggleFolder: (id: string, open?: boolean) => void;

    isSettingsModalOpen: boolean;
    setSettingsModalOpen: (open: boolean) => void;

    enabledExtensions: string[];
    setEnabledExtensions: (extensions: string[] | ((prev: string[]) => string[])) => void;
    noteLayout: 'thin' | 'normal' | 'wide' | 'extra-wide';
    setNoteLayout: (layout: 'thin' | 'normal' | 'wide' | 'extra-wide' | ((prev: 'thin' | 'normal' | 'wide' | 'extra-wide') => 'thin' | 'normal' | 'wide' | 'extra-wide')) => void;
    theme: 'light' | 'dark';
    setTheme: (theme: 'light' | 'dark') => void;
}

export const useDataStore = create<DataState>((set, get) => ({
    notes: [],
    events: [],
    tasks: [],
    metadataCache: {},
    isSettingsModalOpen: false,
    setSettingsModalOpen: (open: boolean) => set({ isSettingsModalOpen: open }),
    enabledExtensions: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('tide_enabled_extensions') || '["smart_island", "summary"]') : ['smart_island', 'summary'],
    setEnabledExtensions: (extensions) => set(s => {
        const next = typeof extensions === 'function' ? extensions(s.enabledExtensions) : extensions;
        localStorage.setItem('tide_enabled_extensions', JSON.stringify(next));
        return { enabledExtensions: next };
    }),
    noteLayout: (typeof window !== 'undefined' ? (localStorage.getItem('tide_note_layout') as any) : null) || 'wide',
    setNoteLayout: (layout) => set(s => {
        const next = typeof layout === 'function' ? layout(s.noteLayout) : layout;
        localStorage.setItem('tide_note_layout', next);
        return { noteLayout: next };
    }),
    theme: typeof window !== 'undefined' ? (localStorage.getItem('tide_theme') as 'light' | 'dark' || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) : 'light',
    setTheme: (theme) => set(s => {
        localStorage.setItem('tide_theme', theme);
        if (typeof document !== 'undefined') {
            if (theme === 'dark') document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
        }
        return { theme };
    }),
    isUpdatingMetadata: new Set(),
    openFolderIds: new Set(
        typeof window !== 'undefined' 
        ? JSON.parse(localStorage.getItem('tide_open_folders') || '[]') 
        : []
    ),
    toggleFolder: (id, open) => set(s => {
        const next = new Set(s.openFolderIds);
        const shouldOpen = open !== undefined ? open : !next.has(id);
        if (shouldOpen) {
            next.add(id);
            // Fire and forget fetch
            get().fetchDirectory(id);
        } else {
            next.delete(id);
        }
        
        // Persist to local storage
        localStorage.setItem('tide_open_folders', JSON.stringify(Array.from(next)));
        
        return { openFolderIds: next };
    }),
    setUpdatingMetadata: (id, updating) => set(s => {
        const next = new Set(s.isUpdatingMetadata);
        if (updating) next.add(id);
        else next.delete(id);
        return { isUpdatingMetadata: next };
    }),
    updateSpecificMetadataCache: (id, updates) => set(s => ({
        metadataCache: { ...s.metadataCache, [id]: { ...(s.metadataCache[id] || {}), ...updates } }
    })),
    updateFileRaw: (id, updates) => set(s => {
        const isNote = s.notes.some(n => n.id === id);
        // Important: Update metadataCache too, as fetchDirectory uses it.
        // If we don't update this, the next directory refresh will overwrite the file with stale metadata.
        const nextCache = { ...s.metadataCache };
        if (nextCache[id]) {
            nextCache[id] = { ...nextCache[id], ...updates };
        }
        
        if (isNote) {
            return { 
                notes: s.notes.map(n => n.id === id ? { ...n, ...updates } : n),
                metadataCache: nextCache
            };
        }
        return { 
            events: s.events.map(e => e.id === id ? { ...e, ...updates } : e),
            metadataCache: nextCache
        };
    }),
    setNotes: (notes) => set({ notes }),
    setEvents: (events) => set({ events }),
    setTasks: (tasks) => set({ tasks }),
    addTask: async (taskDraft) => {
        const state = get();
        const fallbackId = crypto.randomUUID();
        const newTask: TaskItem = { id: fallbackId, ...taskDraft, isCompleted: false };
        set(s => ({ tasks: [...s.tasks, newTask] }));
        
        if (!state.publicKey) return fallbackId;
        
        try {
            const cryptoLib = await import('@/lib/crypto');
            // Include all fields (including scheduledDate) in the vault
            const vaultPayload: Record<string, any> = {
                title: newTask.title,
                isCompleted: newTask.isCompleted,
                description: newTask.description,
                color: newTask.color,
                linkedNoteId: newTask.linkedNoteId,
                scheduledDate: newTask.scheduledDate,
            };
            const securedMeta = await cryptoLib.encryptMetadata(vaultPayload, state.publicKey);
            
            const res = await apiFetch("/api/v1/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    encrypted_vault: securedMeta
                })
            });

            if (res.ok) {
                const createdTask = await res.json();
                if (createdTask.id !== fallbackId) {
                    set(s => ({ tasks: s.tasks.map(t => t.id === fallbackId ? { ...t, id: createdTask.id } : t) }));
                    return createdTask.id;
                }
            }
        } catch (e) {
            console.error("Failed to sync task", e);
        }
        return fallbackId;
    },
    updateTask: async (id, updates) => {
        // 1. Optimistic local update immediately
        set(s => ({ 
            tasks: s.tasks.map(t => t.id === id ? { ...t, ...updates } : t) 
        }));

        // 2. Get the fully merged task for encryption
        const state = get();
        const task = state.tasks.find(t => t.id === id);
        if (!task) return;
        const mergedTask = { ...task, ...updates };

        // 3. Resolve publicKey — prefer store, fall back to sessionStorage
        let publicKey = state.publicKey;
        if (!publicKey) {
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
            const vaultPayload: Record<string, any> = {
                title: mergedTask.title,
                isCompleted: mergedTask.isCompleted,
                description: mergedTask.description,
                color: mergedTask.color,
                linkedNoteId: mergedTask.linkedNoteId,
                scheduledDate: mergedTask.scheduledDate,
            };
            const securedMeta = await cryptoLib.encryptMetadata(vaultPayload, publicKey);

            const res = await apiFetch(`/api/v1/tasks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    encrypted_vault: securedMeta
                })
            });
            if (!res.ok) {
                if (res.status === 404) {
                    // Task doesn't exist in backend yet (optimistic ID was never persisted).
                    // Create it via POST and reconcile the ID.
                    console.warn('[updateTask] Task not found in backend (404) — creating via POST');
                    const createRes = await apiFetch('/api/v1/tasks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            encrypted_vault: securedMeta
                        })
                    });
                    if (createRes.ok) {
                        const created = await createRes.json();
                        if (created.id && created.id !== id) {
                            // Reconcile local ID with the new backend ID
                            set(s => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, id: created.id } : t) }));
                            console.log('[updateTask] ID reconciled:', id, '->', created.id);
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
        const task = state.tasks.find(t => t.id === id);
        if (!task) return;
        get().updateTask(id, { isCompleted: !task.isCompleted });
    },
    deleteTask: async (id) => {
        // Optimistic removal
        set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }));
        try {
            await apiFetch(`/api/v1/tasks/${id}`, { method: 'DELETE' });
        } catch (e) {
            console.error('[deleteTask] Failed to delete task from backend', e);
        }
    },
    appendFiles: (newNotes, newEvents) => set((state) => {
        // Merge strategy: Replace existing items, append new ones
        const noteMap = new Map(state.notes.map(n => [n.id, n]));
        newNotes.forEach(n => noteMap.set(n.id, { ...noteMap.get(n.id), ...n }));
        
        const eventMap = new Map(state.events.map(e => [e.id, e]));
        newEvents.forEach(e => eventMap.set(e.id, { ...eventMap.get(e.id), ...e }));
        
        return {
            notes: Array.from(noteMap.values()),
            events: Array.from(eventMap.values())
        };
    }),
    orderedNoteIds: [],
    setOrderedNoteIds: (orderedNoteIds) => set({ orderedNoteIds }),
    createNote: async (title, initialContent?: any) => {
        const state = get();
        if (!state.privateKey || !state.publicKey) {
            const fallbackId = crypto.randomUUID();
            set(s => ({ notes: [...s.notes, { id: fallbackId, title, type: 'note' }] }));
            return fallbackId;
        }

        try {
            // [V2-PIPELINE] Use envelope encryption so the note is immediately shareable.
            // V1 stored fileKey inside secured_meta, making access_keys empty and sharing impossible.
            const cryptoV2 = await import('@/lib/cryptoV2');
            const cryptoLib = await import('@/lib/crypto');

            // Use initialContent if provided (must be valid Tiptap JSON),
            // otherwise default to a block-based empty doc.
            const docContent = (initialContent && typeof initialContent === 'object')
                ? initialContent
                : { type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: crypto.randomUUID() } }] };

            // 1. Encrypt content with a fresh DEK; wrap DEK with owner's RSA public key
            const v2Result = await cryptoV2.encryptFileV2(JSON.stringify(docContent), state.publicKey);
            const accessKeysMap = { [state.myId!]: v2Result.encrypted_dek };

            // 2. Secure metadata: title only (fileKey is now managed via access_keys)
            const securedMeta = await cryptoLib.encryptMetadata({ title }, state.publicKey);

            const res = await apiFetch("/api/v1/files", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "note",
                    parent_id: state.activeParentId || null,
                    size: new Blob([v2Result.content_ciphertext]).size,
                    public_meta: {},
                    secured_meta: securedMeta,
                    visibility: 'private',
                    version: 2,
                    metadata: v2Result.metadata,
                    access_keys: accessKeysMap
                })
            });

            if (!res.ok) throw new Error("Backend failed to create note");
            const newFile = await res.json();

            // 3. Upload the V2-formatted ciphertext blob
            await apiFetch(`/api/v1/files/${newFile.id}/upload`, {
                method: "POST",
                body: v2Result.content_ciphertext
            });

            const newNote: DataItem = { id: newFile.id, title, type: 'note', parent_id: state.activeParentId || null };
            set((s) => ({ notes: [...s.notes, newNote], metadataCache: { ...s.metadataCache, [newFile.id]: { title } } }));
            return newFile.id;
        } catch (e) {
            console.error("Failed to create note on server", e);
            const fallbackId = crypto.randomUUID();
            set((s) => ({ notes: [...s.notes, { id: fallbackId, title, type: 'note' }] }));
            return fallbackId;
        }
    },
    insertMentionIntoNote: (noteId, targetId, title) => {
        window.dispatchEvent(new CustomEvent('dataStore:insertMention', { detail: { noteId, targetId, title } }));
    },
    
    smartIslandState: null,
    setSmartIsland: (state) => set({ smartIslandState: state }),

    activeNoteId: null,
    setActiveNoteId: (activeNoteId) => set({ activeNoteId }),
    activeParentId: null,
    setActiveParentId: (activeParentId) => set({ activeParentId }),
    groupOverlappingEvents: async (parentId) => {
        const state = get();
        const parent = state.events.find(e => e.id === parentId) as any;
        if (!parent || !parent.start || !parent.end || !state.myId) return;
        
        const parentStart = new Date(parent.start).getTime();
        const parentEnd = new Date(parent.end).getTime();

        const eventsToUpdate: string[] = [];

        const updatedEvents = state.events.map(e => {
            if (e.id === parentId) return e;
            const ev = e as any;
            if (!ev.start || !ev.end) return e;
            
            const eStart = new Date(ev.start).getTime();
            const eEnd = new Date(ev.end).getTime();
            
            if (eStart >= parentStart && eEnd <= parentEnd) {
                eventsToUpdate.push(e.id);
                return { ...e, parent_id: parentId };
            }
            return e;
        });

        if (eventsToUpdate.length > 0) {
            set({ events: updatedEvents });

            // Persist to backend
            try {
                await Promise.all(eventsToUpdate.map(id =>
                    apiFetch(`/api/v1/files/${id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ parent_id: parentId })
                    })
                ));
            } catch (err) {
                console.error("Failed to group events in backend", err);
            }
        }
    },

    privateKey: null,
    publicKey: null,
    myId: null,
    loadedDirectories: new Set(),
    fetchingDirectories: new Set(),
    setKeys: (privateKey, publicKey, myId) => {
        set({ privateKey, publicKey, myId });
        // Proactively load all currently open folders from persisted state
        const state = get();
        if (state.openFolderIds.size > 0) {
            Array.from(state.openFolderIds).forEach(id => {
                state.fetchDirectory(id === 'root' ? null : id);
            });
        }
    },
    fetchDirectory: async (parentId, forceRefresh = false) => {
        const state = get();
        if (!state.privateKey || !state.myId) return;

        const dirKey = parentId === null ? 'root' : parentId;
        
        // GUARD: If already loading or already loaded (and not forced), abort.
        if (state.fetchingDirectories.has(dirKey)) return;
        if (!forceRefresh && state.loadedDirectories.has(dirKey)) return;

        // Set Loading Flag
        set(s => {
            const next = new Set(s.fetchingDirectories);
            next.add(dirKey);
            return { fetchingDirectories: next };
        });

        try {
            console.log(`[STATE-AUDIT] fetchDirectory START | ParentID: ${dirKey}`);
            let allFiles: any[] = [];

            const parseSafeJson = async (res: Response) => {
                try {
                    const text = await res.text();
                    return text ? JSON.parse(text) : [];
                } catch (e) {
                    console.warn("[STATE-AUDIT] Failed to parse JSON, returning empty array", e);
                    return [];
                }
            };

            if (parentId === null) {
                const results = await Promise.allSettled([
                    apiFetch(`/api/v1/files`),
                    apiFetch(`/api/v1/files?type=event`),
                    apiFetch(`/api/v1/tasks`)
                ]);

                const rootFiles: any[] = [];
                const eventsFiles: any[] = [];
                const tasksList: any[] = [];

                if (results[0].status === 'fulfilled' && results[0].value.ok) {
                    rootFiles.push(...(await parseSafeJson(results[0].value)));
                } else if (results[0].status === 'fulfilled' && results[0].value.status === 401) {
                    console.warn("[STATE-AUDIT] fetchDirectory | Root Files Unauthorized.");
                    if (typeof window !== 'undefined') window.location.href = '/auth';
                    return;
                } else {
                    console.error(`[STATE-AUDIT ERROR] fetchDirectory | Failed to fetch root files`);
                }

                if (results[1].status === 'fulfilled' && results[1].value.ok) {
                    eventsFiles.push(...(await parseSafeJson(results[1].value)));
                } else if (results[1].status === 'fulfilled' && results[1].value.status === 401) {
                    console.warn("[STATE-AUDIT] fetchDirectory | Events Unauthorized.");
                    if (typeof window !== 'undefined') window.location.href = '/auth';
                    return;
                } else {
                    console.error(`[STATE-AUDIT ERROR] fetchDirectory | Failed to fetch root events`);
                }

                if (results[2].status === 'fulfilled' && results[2].value.ok) {
                    tasksList.push(...(await parseSafeJson(results[2].value)));
                }

                const seen = new Set();
                for (const f of [...rootFiles, ...eventsFiles]) {
                    if (!seen.has(f.id)) {
                        seen.add(f.id);
                        allFiles.push(f);
                    }
                }
                
                // Decrypt initial tasks
                const cryptoLib = await import('@/lib/crypto');
                const loadedTasks: TaskItem[] = [];
                for (const t of tasksList) {
                    if (t.encrypted_vault) {
                        try {
                            const meta = await cryptoLib.decryptMetadata(t.encrypted_vault, state.privateKey!, `task-${t.id}`);
                            loadedTasks.push({ id: t.id, ...meta } as TaskItem);
                        } catch (e) {
                            loadedTasks.push({ id: t.id, title: "Locked Task (Decrypting...)", isCompleted: false, isLocked: true } as any);
                        }
                    }
                }
                // MERGE: keep any locally-updated tasks (optimistic) that are newer than the backend state
                set(s => {
                    const localMap = new Map(s.tasks.map(t => [t.id, t]));
                    const merged = loadedTasks.map(bt => {
                        const local = localMap.get(bt.id);
                        // If the local task has a scheduledDate that the backend doesn't know yet, keep it
                        if (local && local.scheduledDate && !bt.scheduledDate) return { ...bt, scheduledDate: local.scheduledDate };
                        if (local && local.isCompleted !== bt.isCompleted) return local; // prefer local toggle
                        return bt;
                    });
                    return { tasks: merged };
                });
            } else {
                const res = await apiFetch(`/api/v1/files?parent_id=${parentId}`);
                if (!res.ok) {
                    if (res.status === 401) {
                        console.warn("[STATE-AUDIT] fetchDirectory | Unauthorized. Redirecting.");
                        if (typeof window !== 'undefined') window.location.href = '/auth';
                        return;
                    }
                    const errorText = await res.text();
                    console.error(`[STATE-AUDIT ERROR] fetchDirectory | ${res.status} ${errorText}`);
                    return;
                }
                allFiles = await parseSafeJson(res);
            }

            if (!Array.isArray(allFiles)) throw new Error("Expected array of files");

            const decryptedNotes: DataItem[] = [];
            const decryptedEvents: DataItem[] = [];
            const newMetaCache: Record<string, any> = { ...get().metadataCache };

            const cryptoLib = await import('@/lib/crypto');

            for (const f of allFiles) {
                // Check Cache First
                if (!forceRefresh && newMetaCache[f.id]) {
                    if (get().isUpdatingMetadata.has(f.id)) {
                        // Skip updating state to avoid overwriting optimistic UI during in-flight rename
                    }
                    const cached = newMetaCache[f.id];
                    const normalizedCached = { ...f, ...cached, parent_id: f.parent_id || null };
                    if (f.type === 'event') decryptedEvents.push(normalizedCached);
                    else decryptedNotes.push(normalizedCached);
                    continue;
                }

                let metaData: any = { title: "Untitled" };

                if (f.visibility === 'public') {
                    if (f.public_meta?.title) metaData.title = f.public_meta.title;
                } else if (f.version >= 2 && f.metadata) {
                    // V2 files store crypto flags (has_custom_password) in f.metadata.
                    // The title is stored in secured_meta (RSA-encrypted) — we must
                    // still decrypt it. Start with the crypto flags as a base.
                    metaData = {
                        ...f.metadata,
                        title: f.metadata.title || "Untitled"
                    };
                    // [FIX] Decrypt secured_meta to get the real title for V2 notes.
                    // IMPORTANT: decryptMetadata never throws — it returns {isLocked: true} on failure.
                    // We must check isLocked before accepting the result to prevent error
                    // titles from being written into the cache and replacing valid data.
                    if (f.secured_meta) {
                        const meta = await cryptoLib.decryptMetadata(f.secured_meta, state.privateKey, `v2-${f.id}`);
                        if (!meta.isLocked && meta.title) {
                            metaData.title = meta.title as string;
                            // Only cache on success so a transient failure doesn't poison the cache
                            newMetaCache[f.id] = metaData;
                        } else if (meta.isLocked) {
                            console.warn(`[CRYPTO-AUDIT] Failed to decrypt metadata for ${f.id} | Using f.metadata title as fallback.`);
                            // Do NOT cache a locked/error state — let next load retry decryption
                        } else {
                            newMetaCache[f.id] = metaData;
                        }
                    } else {
                        newMetaCache[f.id] = metaData;
                    }
                } else if (f.secured_meta) {
                    const meta = await cryptoLib.decryptMetadata(f.secured_meta, state.privateKey, `lazy-${f.id}`);
                    if (!meta.isLocked) {
                        metaData = {
                            ...meta,
                            title: meta.title || "Untitled",
                            isLocked: false
                        };
                        newMetaCache[f.id] = metaData;
                    } else {
                        // Decryption failed — do not cache, keep placeholder title
                        metaData = { title: "Untitled", isLocked: true };
                        console.warn(`[CRYPTO-AUDIT] Failed to decrypt legacy metadata for ${f.id}`);
                    }
                }

                const normalizedItem = {
                    ...f,
                    ...metaData,
                    parent_id: f.parent_id || null // Normalize to null for sidebar root filtering
                };

                if (f.type === 'event') {
                    // DEFENSIVE: Ensure start and end are valid date strings
                    const isValidDate = (d: any) => d && !isNaN(new Date(d).getTime());
                    
                    decryptedEvents.push({
                        ...normalizedItem,
                        start: isValidDate(metaData.start) ? metaData.start : new Date().toISOString(),
                        end: isValidDate(metaData.end) ? metaData.end : new Date().toISOString(),
                    });
                } else {
                    decryptedNotes.push(normalizedItem);
                }
            }

            const visibleNotes = decryptedNotes.filter(f => (f.share_status || 'owner') !== 'pending');
            const visibleEvents = decryptedEvents.filter(e => (e.share_status || 'owner') !== 'pending');

            set(s => ({
                notes: [...s.notes.filter(n => !new Set(visibleNotes.map(vn => vn.id)).has(n.id)), ...visibleNotes],
                events: [...s.events.filter(e => !new Set(visibleEvents.map(ve => ve.id)).has(e.id)), ...visibleEvents],
                metadataCache: newMetaCache,
                loadedDirectories: new Set([...s.loadedDirectories, dirKey]),
                fetchingDirectories: new Set([...s.fetchingDirectories].filter(d => d !== dirKey))
            }));
            
            console.log(`[STATE-AUDIT] fetchDirectory SUCCESS | ParentID: ${dirKey}`);
        } catch (e) {
            console.error("[STATE-AUDIT ERROR] fetchDirectory |", e);
            set(s => {
                const next = new Set(s.fetchingDirectories);
                next.delete(dirKey);
                return { fetchingDirectories: next };
            });
        }
    },
    loadAllMetadata: async () => {
        const state = get();
        if (!state.privateKey || !state.myId) return;

        try {
            const results = await Promise.allSettled([
                apiFetch(`/api/v1/files?recursive=true`),
                apiFetch(`/api/v1/files?type=event&recursive=true`)
            ]);

            const parseSafeJson = async (res: Response) => {
                try {
                    const text = await res.text();
                    return text ? JSON.parse(text) : [];
                } catch (e) {
                    return [];
                }
            };

            const allFiles: any[] = [];
            const allEvents: any[] = [];
            let allTasks: any[] = [];

            if (results[0].status === 'fulfilled' && results[0].value.ok) {
                allFiles.push(...(await parseSafeJson(results[0].value)));
            }
            if (results[1].status === 'fulfilled' && results[1].value.ok) {
                allEvents.push(...(await parseSafeJson(results[1].value)));
            }
            try {
                const tasksRes = await apiFetch(`/api/v1/tasks`);
                if (tasksRes.ok) allTasks = await parseSafeJson(tasksRes);
            } catch (e) {
                console.error("Failed to fetch tasks", e);
            }
            
            const decryptedNotes: DataItem[] = [];
            const decryptedEvents: DataItem[] = [];
            const newMetaCache: Record<string, any> = { ...get().metadataCache };

            const cryptoLib = await import('@/lib/crypto');

            const processItems = async (items: any[], targetArr: DataItem[], type: string) => {
                for (const f of items) {
                    if (newMetaCache[f.id]) {
                        const cached = newMetaCache[f.id];
                        targetArr.push({ ...f, ...cached, parent_id: f.parent_id || null });
                        continue;
                    }

                    let metaData: any = { title: "Untitled" };
                    if (f.visibility === 'public') {
                        if (f.public_meta?.title) metaData.title = f.public_meta.title;
                    } else if (f.version >= 2 && f.metadata) {
                        // V2 files: start with crypto flags, then get title from secured_meta.
                        // IMPORTANT: decryptMetadata never throws — check isLocked before caching.
                        metaData = { ...f.metadata, title: f.metadata.title || "Untitled" };
                        if (f.secured_meta) {
                            const meta = await cryptoLib.decryptMetadata(f.secured_meta, state.privateKey!, `v2-lam-${f.id}`);
                            if (!meta.isLocked) {
                                metaData = { ...metaData, ...meta };
                                newMetaCache[f.id] = metaData;
                            } else {
                                // Decryption failed — keep f.metadata values, do not cache error state
                                console.warn(`[CRYPTO-AUDIT] loadAllMetadata: Failed to decrypt metadata for ${f.id}`);
                            }
                        } else {
                            newMetaCache[f.id] = metaData;
                        }
                    } else if (f.secured_meta) {
                        const meta = await cryptoLib.decryptMetadata(f.secured_meta, state.privateKey!, `lam-${f.id}`);
                        if (!meta.isLocked) {
                            metaData = {
                                ...meta,
                                title: meta.title || "Untitled",
                                isLocked: false
                            };
                            newMetaCache[f.id] = metaData;
                        } else {
                            metaData = { title: "Untitled", isLocked: true };
                            console.warn(`[CRYPTO-AUDIT] loadAllMetadata: Failed to decrypt legacy metadata for ${f.id}`);
                        }
                    }

                    if (f.type === 'event') {
                        targetArr.push({
                            ...f,
                            ...metaData,
                            start: metaData.start || new Date().toISOString(),
                            end: metaData.end || new Date().toISOString(),
                            parent_id: f.parent_id || null
                        });
                    } else {
                        targetArr.push({
                            ...f,
                            ...metaData,
                            parent_id: f.parent_id || null
                        });
                    }
                }
            };

            await processItems(allFiles, decryptedNotes, 'note');
            await processItems(allEvents, decryptedEvents, 'event');

            const visibleNotes = decryptedNotes.filter(f => (f.share_status || 'owner') !== 'pending');
            const visibleEvents = decryptedEvents.filter(e => (e.share_status || 'owner') !== 'pending');

            set(s => ({
                notes: visibleNotes,
                events: visibleEvents,
                metadataCache: newMetaCache,
                // We don't mark directories as loaded here because we only grabbed files, 
                // but this makes them available for suggestions.
            }));

            // Decrypt Tasks
            const loadedTasks: TaskItem[] = [];
            for (const t of allTasks) {
                if (t.encrypted_vault) {
                    try {
                        const meta = await cryptoLib.decryptMetadata(t.encrypted_vault, state.privateKey!, `task-${t.id}`);
                        loadedTasks.push({ id: t.id, ...meta } as TaskItem);
                    } catch (e) {
                        loadedTasks.push({ id: t.id, title: "Locked Task (Decrypting...)", isCompleted: false, isLocked: true } as any);
                    }
                }
            }
            // MERGE: keep locally-updated task fields (optimistic updates from drag-drop, toggles)
            set(s => {
                const localMap = new Map(s.tasks.map(t => [t.id, t]));
                const merged = loadedTasks.map(bt => {
                    const local = localMap.get(bt.id);
                    if (local && local.scheduledDate && !bt.scheduledDate) return { ...bt, scheduledDate: local.scheduledDate };
                    if (local && local.isCompleted !== bt.isCompleted) return local;
                    return bt;
                });
                return { tasks: merged };
            });
        } catch (e) {
            console.error("[STATE-AUDIT ERROR] loadAllMetadata |", e);
        }
    }
}));
