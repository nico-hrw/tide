import { create } from 'zustand';
import { apiFetch } from '@/lib/api';

export interface DataItem {
    id: string;
    title: string;
    type: string;
    [key: string]: any; // Allow extra properties like visibility, secured_meta for file UI
}

interface DataState {
    notes: DataItem[];
    events: DataItem[];
    setNotes: (notes: DataItem[]) => void;
    setEvents: (events: DataItem[]) => void;
    appendFiles: (files: DataItem[], events: DataItem[]) => void;
    orderedNoteIds: string[];
    setOrderedNoteIds: (ids: string[]) => void;
    createNote: (title: string) => Promise<string>; // Returns the new ID
    insertMentionIntoNote: (noteId: string, targetId: string, title: string) => void;
    activeNoteId: string | null;
    setActiveNoteId: (id: string | null) => void;
    activeParentId: string | null;
    setActiveParentId: (id: string | null) => void;
    groupOverlappingEvents: (parentId: string) => void;
    
    isUpdatingMetadata: Set<string>;
    setUpdatingMetadata: (id: string, updating: boolean) => void;
    updateSpecificMetadataCache: (id: string, updates: any) => void;

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
}

export const useDataStore = create<DataState>((set, get) => ({
    notes: [],
    events: [],
    metadataCache: {},
    isUpdatingMetadata: new Set(),
    setUpdatingMetadata: (id, updating) => set(s => {
        const next = new Set(s.isUpdatingMetadata);
        if (updating) next.add(id);
        else next.delete(id);
        return { isUpdatingMetadata: next };
    }),
    updateSpecificMetadataCache: (id, updates) => set(s => ({
        metadataCache: { ...s.metadataCache, [id]: { ...(s.metadataCache[id] || {}), ...updates } }
    })),
    setNotes: (notes) => set({ notes }),
    setEvents: (events) => set({ events }),
    appendFiles: (newNotes, newEvents) => set((state) => {
        // Prevent duplicates by ID
        const existingNoteIds = new Set(state.notes.map(n => n.id));
        const filteredNotes = newNotes.filter(n => !existingNoteIds.has(n.id));
        
        const existingEventIds = new Set(state.events.map(e => e.id));
        const filteredEvents = newEvents.filter(e => !existingEventIds.has(e.id));
        
        return {
            notes: [...state.notes, ...filteredNotes],
            events: [...state.events, ...filteredEvents]
        };
    }),
    orderedNoteIds: [],
    setOrderedNoteIds: (orderedNoteIds) => set({ orderedNoteIds }),
    createNote: async (title) => {
        const state = get();
        if (!state.privateKey || !state.publicKey) {
            const fallbackId = crypto.randomUUID();
            set(s => ({ notes: [...s.notes, { id: fallbackId, title, type: 'note' }] }));
            return fallbackId;
        }

        try {
            const cryptoLib = await import('@/lib/crypto');
            
            // Generate full cryptographic identity for the new file to prevent JWK crash on load
            const fileKey = await cryptoLib.generateFileKey();
            const fileKeyJwk = await window.crypto.subtle.exportKey("jwk", fileKey);
            const emptyDoc = { type: 'doc', content: [] };
            const blob = new Blob([JSON.stringify(emptyDoc)], { type: 'application/json' });
            
            // Encrypt empty file to secure IV
            const { iv, ciphertext } = await cryptoLib.encryptFile(blob, fileKey);
            
            // Build secured meta payload WITH the key and IV
            const metaPayload = { title, fileKey: fileKeyJwk, iv };
            const securedMeta = await cryptoLib.encryptMetadata(metaPayload, state.publicKey);

            const res = await apiFetch("/api/v1/files", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "note",
                    parent_id: state.activeParentId || null,
                    size: blob.size,
                    public_meta: {},
                    secured_meta: Array.from(new Uint8Array(cryptoLib.base64ToArrayBuffer(securedMeta))),
                    visibility: 'private'
                })
            });

            if (!res.ok) throw new Error("Backend failed to create note");
            const newFile = await res.json();
            
            // Upload the empty initialized ciphertext so decryptFile doesn't fail on an empty response
            await apiFetch(`/api/v1/files/${newFile.id}/upload`, { method: "POST", body: ciphertext });
            
            const newNote: DataItem = { id: newFile.id, title, type: 'note', parent_id: state.activeParentId || null };
            set((s) => ({ notes: [...s.notes, newNote], metadataCache: { ...s.metadataCache, [newFile.id]: metaPayload } }));
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
    setKeys: (privateKey, publicKey, myId) => set({ privateKey, publicKey, myId }),
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
                    apiFetch(`/api/v1/files?type=event`)
                ]);

                const rootFiles: any[] = [];
                const eventsFiles: any[] = [];

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

                const seen = new Set();
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
                } else if (f.secured_meta) {
                    try {
                        const meta = await cryptoLib.decryptMetadata(f.secured_meta, state.privateKey, `lazy-${f.id}`);
                        metaData = {
                            title: meta.title || "Untitled",
                            color: meta.color,
                            description: meta.description,
                            start: meta.start,
                            end: meta.end,
                            allDay: meta.allDay,
                            isGroup: meta.isGroup,
                            effect: meta.effect,
                            recurrence_rule: meta.recurrence_rule,
                            recurrence_end: meta.recurrence_end,
                            exdates: meta.exdates,
                            completed_dates: meta.completed_dates,
                            is_task: meta.is_task,
                            is_completed: meta.is_completed,
                            is_cancelled: meta.is_cancelled
                        };
                        newMetaCache[f.id] = metaData;
                    } catch (e) {
                        console.warn(`[CRYPTO-AUDIT] Failed to decrypt metadata for ${f.id} | Using placeholder.`);
                        metaData = { title: "Unknown (Decryption Error)" };
                    }
                }

                const normalizedItem = {
                    ...f,
                    ...metaData,
                    parent_id: f.parent_id || null // Normalize to null for sidebar root filtering
                };

                if (f.type === 'event') {
                    decryptedEvents.push({
                        ...normalizedItem,
                        start: metaData.start || new Date().toISOString(),
                        end: metaData.end || new Date().toISOString(),
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

            if (results[0].status === 'fulfilled' && results[0].value.ok) {
                allFiles.push(...(await parseSafeJson(results[0].value)));
            }
            if (results[1].status === 'fulfilled' && results[1].value.ok) {
                allEvents.push(...(await parseSafeJson(results[1].value)));
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
                    } else if (f.secured_meta) {
                        try {
                            const meta = await cryptoLib.decryptMetadata(f.secured_meta, state.privateKey!, `lazy-${f.id}`);
                            metaData = {
                                title: meta.title || "Untitled",
                                color: meta.color,
                                description: meta.description,
                                start: meta.start,
                                end: meta.end,
                                allDay: meta.allDay,
                                isGroup: meta.isGroup,
                                effect: meta.effect,
                                recurrence_rule: meta.recurrence_rule,
                                recurrence_end: meta.recurrence_end,
                                exdates: meta.exdates,
                                completed_dates: meta.completed_dates,
                                is_task: meta.is_task,
                                is_completed: meta.is_completed,
                                is_cancelled: meta.is_cancelled
                            };
                            newMetaCache[f.id] = metaData;
                        } catch (e) {
                            metaData = { title: "Unknown (Decryption Error)" };
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

            const visibleNotes = decryptedNotes.filter(f => (f.share_status || 'owner') !== 'pending' && f.type !== 'folder');
            const visibleEvents = decryptedEvents.filter(e => (e.share_status || 'owner') !== 'pending');

            set(s => ({
                notes: visibleNotes,
                events: visibleEvents,
                metadataCache: newMetaCache,
                // We don't mark directories as loaded here because we only grabbed files, 
                // but this makes them available for suggestions.
            }));
        } catch (e) {
            console.error("[STATE-AUDIT ERROR] loadAllMetadata |", e);
        }
    }
}));
