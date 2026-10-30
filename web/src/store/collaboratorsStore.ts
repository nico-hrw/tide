import { create } from 'zustand';

export interface CollaboratorsState {
    activeUsersByNoteId: Record<string, string[]>;
    setActiveUsersForNote: (noteId: string, users: string[]) => void;
}

export const useCollaboratorsStore = create<CollaboratorsState>((set) => ({
    activeUsersByNoteId: {},

    setActiveUsersForNote: (noteId: string, users: string[]) =>
        set((state) => ({
            activeUsersByNoteId: {
                ...state.activeUsersByNoteId,
                [noteId]: users,
            },
        })),
}));

export const collaboratorsStore = useCollaboratorsStore;
