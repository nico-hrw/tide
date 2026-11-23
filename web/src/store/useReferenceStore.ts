import { create } from 'zustand';
import {
    generateSecureId,
    loadEncryptedOfflineCache,
    saveEncryptedOfflineCache,
} from '@/lib/offlineCacheCrypto';

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

const createReferenceId = (): string => {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : generateSecureId('ref');
};

const parsePersistedReferences = (parsed: unknown): ReferenceItem[] => {
    const list: unknown[] = Array.isArray(parsed)
        ? parsed
        : isRecord(parsed) && Array.isArray(parsed.references)
            ? parsed.references
            : [];

    return list.filter(isRecord).map((item) => ({
        id: typeof item.id === 'string' && item.id.length > 0 ? item.id : createReferenceId(),
        term: typeof item.term === 'string' ? item.term : '',
        previewText: typeof item.previewText === 'string' ? item.previewText : '',
        sourceNoteId: typeof item.sourceNoteId === 'string' ? item.sourceNoteId : '',
        ...(typeof item.color === 'string' ? { color: item.color } : {}),
        ...(typeof item.emoji === 'string' ? { emoji: item.emoji } : {}),
    }));
};

const savePersistedReferences = (refs: ReferenceItem[]) => {
    if (typeof window !== 'undefined') {
        void saveEncryptedOfflineCache('references', refs).catch(() => {
            // ignore
        });
        try {
            localStorage.removeItem('tide_references');
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

let referencesModifiedBeforeHydration = false;

export const useReferenceStore = create<ReferenceState>((set) => ({
    references: [],
    autoScanEnabled: typeof window !== 'undefined' ? localStorage.getItem('tide_auto_scan') === 'true' : false,
    displayMode: loadPersistedDisplayMode(),

    addReference: (ref) => set((state) => {
        const item: ReferenceItem = {
            id: ref.id || createReferenceId(),
            term: ref.term,
            previewText: ref.previewText,
            sourceNoteId: ref.sourceNoteId,
            ...(ref.color ? { color: ref.color } : {}),
            ...(ref.emoji ? { emoji: ref.emoji } : {}),
        };
        const next = [...state.references, item];
        referencesModifiedBeforeHydration = true;
        savePersistedReferences(next);
        return { references: next };
    }),

    updateReference: (id, updates) => set((state) => {
        const next = state.references.map((r) => (r.id === id ? { ...r, ...updates } : r));
        referencesModifiedBeforeHydration = true;
        savePersistedReferences(next);
        return { references: next };
    }),

    removeReference: (id) => set((state) => {
        const next = state.references.filter((r) => r.id !== id);
        referencesModifiedBeforeHydration = true;
        savePersistedReferences(next);
        return { references: next };
    }),

    setReferences: (references) => set(() => {
        referencesModifiedBeforeHydration = true;
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

// O(1) lookup by id; the map is rebuilt only when the references array itself changes
let indexSource: ReferenceItem[] | null = null;
let indexById = new Map<string, ReferenceItem>();

export const getReferenceById = (id: string): ReferenceItem | undefined => {
    const refs = useReferenceStore.getState().references;
    if (refs !== indexSource) {
        indexSource = refs;
        indexById = new Map(refs.map((r) => [r.id, r]));
    }
    return indexById.get(id);
};

const hydratePersistedReferences = async (): Promise<void> => {
    if (typeof window === 'undefined') return;
    try {
        const cached = await loadEncryptedOfflineCache<unknown>('references');
        if (cached !== null) {
            const parsed = parsePersistedReferences(cached);
            try {
                localStorage.removeItem('tide_references');
            } catch {
                // ignore
            }
            if (!referencesModifiedBeforeHydration) {
                useReferenceStore.setState({ references: parsed });
            }
            return;
        }

        const legacyRaw = localStorage.getItem('tide_references');
        if (legacyRaw) {
            const parsedJson: unknown = JSON.parse(legacyRaw);
            const migrated = parsePersistedReferences(parsedJson);
            if (
                !localStorage.getItem('tide_reference_display_mode') &&
                isRecord(parsedJson) &&
                typeof parsedJson.displayMode === 'string' &&
                (VALID_DISPLAY_MODES as readonly string[]).includes(parsedJson.displayMode)
            ) {
                const migratedMode = parsedJson.displayMode as ReferenceDisplayMode;
                savePersistedDisplayMode(migratedMode);
                useReferenceStore.setState({ displayMode: migratedMode });
            }
            await saveEncryptedOfflineCache('references', migrated);
            localStorage.removeItem('tide_references');
            if (!referencesModifiedBeforeHydration) {
                useReferenceStore.setState({ references: migrated });
            }
        }
    } catch {
        // ignore
    }
};

if (typeof window !== 'undefined') {
    void hydratePersistedReferences();
}
