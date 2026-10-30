import { create } from 'zustand';
import type { Doc } from 'yjs';

export type NotePermission = 'owner' | 'share' | 'edit' | 'view';

export interface ActiveNoteState {
    activeNoteId: string | null;
    /** Alias for activeNoteId */
    currentNoteId: string | null;
    keyEpoch: number;
    permission: NotePermission;
    activeYDoc: Doc | null;
    activeDEK: CryptoKey | null;
    lastCompactedSeqId: number;
    setActiveNote: (noteId: string | null, permission?: NotePermission, keyEpoch?: number, activeDEK?: CryptoKey | null) => void;
    setLivePermission: (perm: NotePermission) => void;
    setKeyEpoch: (epoch: number) => void;
    setActiveDEK: (dek: CryptoKey | null) => void;
    setActiveYDoc: (ydoc: Doc | null) => void;
    setLastCompactedSeqId: (seqId: number) => void;
}

export const useActiveNoteStore = create<ActiveNoteState>((set) => ({
    activeNoteId: null,
    currentNoteId: null,
    keyEpoch: 1,
    permission: 'owner',
    activeYDoc: null,
    activeDEK: null,
    lastCompactedSeqId: 0,

    setActiveNote: (noteId: string | null, permission?: NotePermission, keyEpoch?: number, activeDEK?: CryptoKey | null) =>
        set((state) => {
            const validDEK = (typeof CryptoKey !== 'undefined' && activeDEK instanceof CryptoKey) ? activeDEK : null;
            return {
                activeNoteId: noteId,
                currentNoteId: noteId,
                permission: permission !== undefined ? permission : (noteId === null ? 'owner' : state.permission),
                keyEpoch: keyEpoch !== undefined ? keyEpoch : (noteId === null ? 1 : state.keyEpoch),
                activeDEK: activeDEK !== undefined ? validDEK : (noteId === null ? null : state.activeDEK),
            };
        }),

    setLivePermission: (permission: NotePermission) => set({ permission }),

    setKeyEpoch: (keyEpoch: number) => set({ keyEpoch }),

    setActiveDEK: (activeDEK: CryptoKey | null) =>
        set({
            activeDEK: (typeof CryptoKey !== 'undefined' && activeDEK instanceof CryptoKey) ? activeDEK : null,
        }),

    setActiveYDoc: (activeYDoc: Doc | null) => set({ activeYDoc }),

    setLastCompactedSeqId: (lastCompactedSeqId: number) => set({ lastCompactedSeqId }),
}));

export const activeNoteStore = useActiveNoteStore;
