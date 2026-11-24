import { create } from 'zustand';

/**
 * Shares that an @-contact mention created, counted per (file, person) so a share is
 * only revoked when its last mention is gone. Persisted in localStorage under
 * `tide_mention_shares`. Only a mention that really created a share (status `shared`)
 * creates an entry; an entry with count 0 is kept (origin stays 'mention') until `clear`.
 */
const STORAGE_KEY = 'tide_mention_shares';

export type MentionSharePermission = 'view' | 'edit';

export interface MentionShareHint {
    /** Bumped for every new hint so the toast restarts its timer */
    seq: number;
    fileId: string;
    fileTitle: string;
    contactId: string;
    name: string;
    status: 'shared' | 'blocked' | 'failed';
    reason?: string;
    permission: MentionSharePermission;
    /** Document position of the inserted chip (best effort, re-checked before use) */
    chipPos?: number;
}

interface MentionShareState {
    entries: Record<string, number>;
    /** Hint shown by `MentionShareToast` (not persisted) */
    hint: MentionShareHint | null;
    record: (fileId: string, userId: string) => void;
    /** Drops one mention reference and returns the remaining count. */
    release: (fileId: string, userId: string) => number;
    origin: (fileId: string, userId: string) => 'mention' | undefined;
    clear: (fileId: string, userId: string) => void;
    showHint: (hint: Omit<MentionShareHint, 'seq'>) => void;
    updateHint: (patch: Partial<Omit<MentionShareHint, 'seq'>>) => void;
    dismissHint: () => void;
}

const keyOf = (fileId: string, userId: string) => `${fileId}:${userId}`;

function load(): Record<string, number> {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        const parsed: unknown = raw ? JSON.parse(raw) : {};
        if (!parsed || typeof parsed !== 'object') return {};
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = Math.floor(v);
        }
        return out;
    } catch {
        return {};
    }
}

function save(entries: Record<string, number>): void {
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch { /* storage unavailable: counts live in memory only */ }
}

let hintSeq = 0;

export const useMentionShareStore = create<MentionShareState>((set, get) => ({
    entries: load(),
    hint: null,

    record: (fileId, userId) => {
        const k = keyOf(fileId, userId);
        const entries = { ...get().entries, [k]: (get().entries[k] ?? 0) + 1 };
        save(entries);
        set({ entries });
    },

    release: (fileId, userId) => {
        const k = keyOf(fileId, userId);
        const current = get().entries[k];
        if (current === undefined) return 0;
        const rest = Math.max(0, current - 1);
        const entries = { ...get().entries, [k]: rest };
        save(entries);
        set({ entries });
        return rest;
    },

    origin: (fileId, userId) => (get().entries[keyOf(fileId, userId)] !== undefined ? 'mention' : undefined),

    clear: (fileId, userId) => {
        const k = keyOf(fileId, userId);
        if (get().entries[k] === undefined) return;
        const entries = { ...get().entries };
        delete entries[k];
        save(entries);
        set({ entries });
    },

    showHint: (hint) => set({ hint: { ...hint, seq: ++hintSeq } }),
    updateHint: (patch) => set((s) => (s.hint ? { hint: { ...s.hint, ...patch } } : {})),
    dismissHint: () => set({ hint: null }),
}));
