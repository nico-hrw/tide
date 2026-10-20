import { create } from 'zustand';

export type ReferenceDisplayMode = 'magic' | 'underline-black' | 'underline-color' | 'icon' | 'emoji';

export interface ReferenceItem {
    id: string;
    term: string;
    previewText: string;
    sourceNoteId: string;
    color?: string; // hex color code e.g. '#3b82f6'
    emoji?: string; // emoji character e.g. '🔖'
}

export interface ReferenceState {
    references: ReferenceItem[];
    autoScanEnabled: boolean;
    displayMode: ReferenceDisplayMode;
    addReference: (ref: Omit<ReferenceItem, 'id'> & { id?: string; color?: string; emoji?: string }) => void;
    updateReference: (id: string, updates: Partial<ReferenceItem>) => void;
    removeReference: (id: string) => void;
    setReferences: (refs: ReferenceItem[]) => void;
    setAutoScanEnabled: (enabled: boolean) => void;
    setDisplayMode: (mode: ReferenceDisplayMode) => void;
}

const VALID_DISPLAY_MODES: readonly ReferenceDisplayMode[] = [
    'magic',
    'underline-black',
    'underline-color',
    'icon',
    'emoji',
];

const isRecord = (val: unknown): val is Record<string, unknown> => {
    return typeof val === 'object' && val !== null;
};

const loadPersistedReferences = (): ReferenceItem[] => {
    if (typeof window === 'undefined') return [];
    try {
        const data = localStorage.getItem('tide_references');
        if (!data) return [];
        const parsed: unknown = JSON.parse(data);
        const list: unknown[] = Array.isArray(parsed)
            ? parsed
            : isRecord(parsed) && Array.isArray(parsed.references)
                ? parsed.references
                : [];

        return list.filter(isRecord).map((item) => ({
            id: typeof item.id === 'string' && item.id.length > 0
                ? item.id
                : typeof crypto !== 'undefined' && crypto.randomUUID
                    ? crypto.randomUUID()
                    : `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            term: typeof item.term === 'string' ? item.term : '',
            previewText: typeof item.previewText === 'string' ? item.previewText : '',
            sourceNoteId: typeof item.sourceNoteId === 'string' ? item.sourceNoteId : '',
            ...(typeof item.color === 'string' ? { color: item.color } : {}),
            ...(typeof item.emoji === 'string' ? { emoji: item.emoji } : {}),
        }));
    } catch {
        return [];
    }
};

const savePersistedReferences = (refs: ReferenceItem[]) => {
    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem('tide_references', JSON.stringify(refs));
        } catch {
            // ignore
        }
    }
};

const loadPersistedDisplayMode = (): ReferenceDisplayMode => {
    if (typeof window === 'undefined') return 'magic';
    try {
        const saved = localStorage.getItem('tide_reference_display_mode');
        if (saved && (VALID_DISPLAY_MODES as readonly string[]).includes(saved)) {
            return saved as ReferenceDisplayMode;
        }
        // Graceful migration: check if legacy tide_references had displayMode
        const raw = localStorage.getItem('tide_references');
        if (raw) {
            const parsed: unknown = JSON.parse(raw);
            if (isRecord(parsed) && typeof parsed.displayMode === 'string' && (VALID_DISPLAY_MODES as readonly string[]).includes(parsed.displayMode)) {
                return parsed.displayMode as ReferenceDisplayMode;
            }
        }
        return 'magic';
    } catch {
        return 'magic';
    }
};

const savePersistedDisplayMode = (mode: ReferenceDisplayMode) => {
    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem('tide_reference_display_mode', mode);
        } catch {
            // ignore
        }
    }
};

export const useReferenceStore = create<ReferenceState>((set) => ({
    references: loadPersistedReferences(),
    autoScanEnabled: typeof window !== 'undefined' ? localStorage.getItem('tide_auto_scan') === 'true' : false,
    displayMode: loadPersistedDisplayMode(),

    addReference: (ref) => set((state) => {
        const item: ReferenceItem = {
            id: ref.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
            term: ref.term,
            previewText: ref.previewText,
            sourceNoteId: ref.sourceNoteId,
            ...(ref.color ? { color: ref.color } : {}),
            ...(ref.emoji ? { emoji: ref.emoji } : {}),
        };
        const next = [...state.references, item];
        savePersistedReferences(next);
        return { references: next };
    }),

    updateReference: (id, updates) => set((state) => {
        const next = state.references.map((r) => (r.id === id ? { ...r, ...updates } : r));
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
            try {
                localStorage.setItem('tide_auto_scan', enabled ? 'true' : 'false');
            } catch {
                // ignore
            }
        }
        return { autoScanEnabled: enabled };
    }),

    setDisplayMode: (mode) => set(() => {
        savePersistedDisplayMode(mode);
        return { displayMode: mode };
    }),
}));
