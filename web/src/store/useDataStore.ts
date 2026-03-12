import { create } from 'zustand';

export interface DataItem {
    id: string;
    title: string;
    type: 'note' | 'event';
}

interface DataState {
    notes: DataItem[];
    events: DataItem[];
    setNotes: (notes: DataItem[]) => void;
    setEvents: (events: DataItem[]) => void;
    orderedNoteIds: string[];
    setOrderedNoteIds: (ids: string[]) => void;
    createNote: (title: string) => string; // Returns the new ID
    insertMentionIntoNote: (noteId: string, targetId: string, title: string) => void;
    activeNoteId: string | null;
    setActiveNoteId: (id: string | null) => void;
}

export const useDataStore = create<DataState>((set, get) => ({
    notes: [],
    events: [],
    setNotes: (notes) => set({ notes }),
    setEvents: (events) => set({ events }),
    orderedNoteIds: [],
    setOrderedNoteIds: (orderedNoteIds) => set({ orderedNoteIds }),
    createNote: (title) => {
        const id = crypto.randomUUID();
        const newNote: DataItem = { id, title, type: 'note' };
        set((state) => ({ notes: [...state.notes, newNote] }));
        
        // Custom event for page.tsx to pick up and perform actual backend creation
        window.dispatchEvent(new CustomEvent('dataStore:createNote', { detail: { id, title } }));
        
        return id;
    },
    insertMentionIntoNote: (noteId, targetId, title) => {
        window.dispatchEvent(new CustomEvent('dataStore:insertMention', { detail: { noteId, targetId, title } }));
    },
    activeNoteId: null,
    setActiveNoteId: (activeNoteId) => set({ activeNoteId }),
}));
