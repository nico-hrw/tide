import { apiFetch } from '@/lib/api';
import type { DataItem, DataStoreSlice, NoteLayout, NotesSlice } from './types';

export function loadCachedNotes(): DataItem[] {
    if (typeof window === 'undefined') return [];
    try {
        const cached = localStorage.getItem('tide_offline_notes');
        return cached ? JSON.parse(cached) : [];
    } catch (e) {
        console.warn('Failed to load cached notes from localStorage', e);
        return [];
    }
}

export function saveNotesToOfflineCache(notes: DataItem[]): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem('tide_offline_notes', JSON.stringify(notes));
    } catch (e) {
        console.warn('Failed to save notes to offline cache', e);
    }
}

function getInitialNoteLayout(): NoteLayout {
    if (typeof window === 'undefined') return 'a4';
    const saved = localStorage.getItem('tide_note_layout');
    if (saved === 'thin' || saved === 'normal' || saved === 'wide' || saved === 'extra-wide' || saved === 'a4') {
        return saved;
    }
    return 'a4';
}

export const createNotesSlice: DataStoreSlice<NotesSlice> = (set, get) => ({
    notes: loadCachedNotes(),
    orderedNoteIds: [],
    activeNoteId: null,
    activeParentId: null,
    noteLayout: getInitialNoteLayout(),
    noteCaretPositions: {},

    setNotes: (notes: DataItem[]) => {
        saveNotesToOfflineCache(notes);
        set({ notes });
    },

    setOrderedNoteIds: (orderedNoteIds: string[]) => set({ orderedNoteIds }),

    setActiveNoteId: (activeNoteId: string | null) => set({ activeNoteId }),

    setActiveParentId: (activeParentId: string | null) => set({ activeParentId }),

    setNoteLayout: (layout: NoteLayout | ((prev: NoteLayout) => NoteLayout)) =>
        set((s) => {
            const next = typeof layout === 'function' ? layout(s.noteLayout) : layout;
            if (typeof window !== 'undefined') {
                localStorage.setItem('tide_note_layout', next);
            }
            return { noteLayout: next };
        }),

    setNoteCaretPosition: (noteId: string, pos: { from: number; to: number }) =>
        set((s) => ({
            noteCaretPositions: { ...s.noteCaretPositions, [noteId]: pos },
        })),

    createNote: async (
        title: string,
        initialContent?: unknown,
        parentIdOverride?: string | null
    ): Promise<string> => {
        const state = get();
        if (!state.privateKey || !state.publicKey) {
            const fallbackId = crypto.randomUUID();
            set((s) => {
                const nextNotes: DataItem[] = [...s.notes, { id: fallbackId, title, type: 'note' }];
                saveNotesToOfflineCache(nextNotes);
                return { notes: nextNotes };
            });
            return fallbackId;
        }

        try {
            // [V2-PIPELINE] Use envelope encryption so the note is immediately shareable.
            // V1 stored fileKey inside secured_meta, making access_keys empty and sharing impossible.
            const cryptoV2 = await import('@/lib/cryptoV2');
            const cryptoLib = await import('@/lib/crypto');

            // Use initialContent if provided (must be valid Tiptap JSON),
            // otherwise default to a block-based empty doc.
            const docContent =
                initialContent && typeof initialContent === 'object'
                    ? initialContent
                    : {
                          type: 'doc',
                          content: [
                              {
                                  type: 'paragraph',
                                  attrs: { blockId: crypto.randomUUID() },
                              },
                          ],
                      };

            // 1. Encrypt content with a fresh DEK; wrap DEK with owner's RSA public key
            const v2Result = await cryptoV2.encryptFileV2(
                JSON.stringify(docContent),
                state.publicKey
            );
            const accessKeysMap = { [state.myId!]: v2Result.encrypted_dek };

            // 2. Secure metadata: title only (fileKey is now managed via access_keys)
            const securedMeta = await cryptoLib.encryptMetadata(
                { title },
                state.publicKey
            );

            const res = await apiFetch('/api/v1/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'note',
                    parent_id:
                        parentIdOverride !== undefined
                            ? parentIdOverride
                            : state.activeParentId || null,
                    size: new Blob([v2Result.content_ciphertext]).size,
                    public_meta: {},
                    secured_meta: securedMeta,
                    visibility: 'private',
                    version: 2,
                    metadata: { ...v2Result.metadata, title },
                    access_keys: accessKeysMap,
                }),
            });

            if (!res.ok) throw new Error('Backend failed to create note');
            const newFile = (await res.json()) as { id: string; [key: string]: unknown };

            // 3. Upload the V2-formatted ciphertext blob
            await apiFetch(`/api/v1/files/${newFile.id}/upload`, {
                method: 'POST',
                body: v2Result.content_ciphertext,
            });

            const targetParentId =
                parentIdOverride !== undefined
                    ? parentIdOverride
                    : state.activeParentId || null;
            const newNote: DataItem = {
                ...newFile,
                title,
                type: 'note',
                parent_id: targetParentId,
                isLocked: false,
            };

            set((s) => {
                const nextNotes = [...s.notes, newNote];
                saveNotesToOfflineCache(nextNotes);
                return {
                    notes: nextNotes,
                    metadataCache: {
                        ...s.metadataCache,
                        [newFile.id]: {
                            title,
                            isLocked: false,
                            parent_id: targetParentId,
                        },
                    },
                };
            });
            return newFile.id;
        } catch (e) {
            console.error('Failed to create note on server', e);
            const fallbackId = crypto.randomUUID();
            set((s) => {
                const nextNotes: DataItem[] = [...s.notes, { id: fallbackId, title, type: 'note' }];
                saveNotesToOfflineCache(nextNotes);
                return { notes: nextNotes };
            });
            return fallbackId;
        }
    },

    createCanvasNote: async (title: string): Promise<string> => {
        const state = get();
        if (!state.privateKey || !state.publicKey) {
            const fallbackId = crypto.randomUUID();
            set((s) => {
                const nextNotes: DataItem[] = [...s.notes, { id: fallbackId, title, type: 'canvas' }];
                saveNotesToOfflineCache(nextNotes);
                return { notes: nextNotes };
            });
            return fallbackId;
        }

        try {
            const cryptoV2 = await import('@/lib/cryptoV2');
            const cryptoLib = await import('@/lib/crypto');

            const emptyCanvas = JSON.stringify({
                version: 1,
                noteId: 'placeholder',
                canvasWidth: 4000,
                canvasHeight: 3000,
                items: [],
            });

            const v2Result = await cryptoV2.encryptFileV2(
                emptyCanvas,
                state.publicKey
            );
            const accessKeysMap = { [state.myId!]: v2Result.encrypted_dek };
            const securedMeta = await cryptoLib.encryptMetadata(
                { title },
                state.publicKey
            );

            const res = await apiFetch('/api/v1/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'canvas',
                    parent_id: state.activeParentId || null,
                    size: new Blob([v2Result.content_ciphertext]).size,
                    public_meta: {},
                    secured_meta: securedMeta,
                    visibility: 'private',
                    version: 2,
                    metadata: { ...v2Result.metadata, title },
                    access_keys: accessKeysMap,
                }),
            });

            if (!res.ok) throw new Error('Backend failed to create canvas note');
            const newFile = (await res.json()) as { id: string; [key: string]: unknown };

            await apiFetch(`/api/v1/files/${newFile.id}/upload`, {
                method: 'POST',
                body: v2Result.content_ciphertext,
            });

            const newNote: DataItem = {
                id: newFile.id,
                title,
                type: 'canvas',
                parent_id: state.activeParentId || null,
            };

            set((s) => {
                const nextNotes = [...s.notes, newNote];
                saveNotesToOfflineCache(nextNotes);
                return {
                    notes: nextNotes,
                    metadataCache: {
                        ...s.metadataCache,
                        [newFile.id]: { title },
                    },
                };
            });
            return newFile.id;
        } catch (e) {
            console.error('Failed to create canvas note on server', e);
            const fallbackId = crypto.randomUUID();
            set((s) => {
                const nextNotes: DataItem[] = [...s.notes, { id: fallbackId, title, type: 'canvas' }];
                saveNotesToOfflineCache(nextNotes);
                return { notes: nextNotes };
            });
            return fallbackId;
        }
    },

    insertMentionIntoNote: (
        noteId: string,
        targetId: string,
        title: string
    ): void => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(
                new CustomEvent('dataStore:insertMention', {
                    detail: { noteId, targetId, title },
                })
            );
        }
    },
});
