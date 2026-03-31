import { create } from 'zustand';

export interface ReferenceItem {
    id: string;
    term: string;
    previewText: string;
    sourceNoteId: string;
}

interface ReferenceState {
    references: ReferenceItem[];
    autoScanEnabled: boolean;
    addReference: (ref: ReferenceItem) => void;
    removeReference: (id: string) => void;
    setReferences: (refs: ReferenceItem[]) => void;
    setAutoScanEnabled: (enabled: boolean) => void;
}

const loadPersistedReferences = (): ReferenceItem[] => {
    if (typeof window === 'undefined') return [];
    try {
        const data = localStorage.getItem('tide_references');
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
};

const savePersistedReferences = (refs: ReferenceItem[]) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem('tide_references', JSON.stringify(refs));
    }
};

export const useReferenceStore = create<ReferenceState>((set) => ({
    references: loadPersistedReferences(),
    autoScanEnabled: typeof window !== 'undefined' ? localStorage.getItem('tide_auto_scan') === 'true' : false,
    addReference: (ref) => set((state) => {
        const next = [...state.references, ref];
        savePersistedReferences(next);
        return { references: next };
    }),
    removeReference: (id) => set((state) => {
        const next = state.references.filter((r) => r.id !== id);
        savePersistedReferences(next);
        return { references: next };
    }),
    setReferences: (references) => set(() => {
        savePersistedReferences(references);
        return { references };
    }),
    setAutoScanEnabled: (enabled) => set(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('tide_auto_scan', enabled ? 'true' : 'false');
        }
        return { autoScanEnabled: enabled };
    }),
}));
