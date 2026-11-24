import { create } from 'zustand';
import { useDataStore } from '@/store/useDataStore';

/**
 * Shares that an @-contact mention created, counted per (file, person). Persisted per user in
 * localStorage under `tide_mention_shares:<userId>`; nothing is read or written while the user is
 * unknown, and the entries reload whenever `useDataStore.myId` changes. Logout removes every
 * `tide_mention_shares*` key (see `clearAllSessionData` in api.ts and `clearMentionShares`).
 * Only a share call that itself succeeded creates an entry; an entry with count 0 is kept
 * (origin stays 'mention') until `clear`.
 */
export const MENTION_SHARES_KEY = 'tide_mention_shares';

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
    /** User the entries belong to (null = unknown, entries empty) */
    userId: string | null;
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

/** Per-user storage key; null while the user is unknown. */
export function mentionSharesKey(userId: string | null | undefined): string | null {
    return userId ? `${MENTION_SHARES_KEY}:${userId}` : null;
}

const keyOf = (fileId: string, userId: string) => `${fileId}:${userId}`;

function load(storageKey: string | null): Record<string, number> {
    if (!storageKey) return {};
    try {
        const raw = localStorage.getItem(storageKey);
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

function save(userId: string | null, entries: Record<string, number>): void {
    const storageKey = mentionSharesKey(userId);
    if (!storageKey) return;
    try {
        localStorage.setItem(storageKey, JSON.stringify(entries));
    } catch { /* storage unavailable: counts live in memory only */ }
}

let hintSeq = 0;

export const useMentionShareStore = create<MentionShareState>((set, get) => {
    /** Entries of the current user, reloaded when the signed-in user changed. */
    const current = (): { userId: string | null; entries: Record<string, number> } => {
        const myId = useDataStore.getState().myId || null;
        const s = get();
        if (s.userId === myId) return { userId: myId, entries: s.entries };
        const entries = load(mentionSharesKey(myId));
        set({ userId: myId, entries });
        return { userId: myId, entries };
    };
    const write = (userId: string | null, entries: Record<string, number>) => {
        if (!userId) return;
        save(userId, entries);
        set({ entries });
    };

    return {
        userId: null,
        entries: {},
        hint: null,

        record: (fileId, userId) => {
            const c = current();
            const k = keyOf(fileId, userId);
            write(c.userId, { ...c.entries, [k]: (c.entries[k] ?? 0) + 1 });
        },

        release: (fileId, userId) => {
            const c = current();
            const k = keyOf(fileId, userId);
            const value = c.entries[k];
            if (value === undefined) return 0;
            const rest = Math.max(0, value - 1);
            write(c.userId, { ...c.entries, [k]: rest });
            return rest;
        },

        origin: (fileId, userId) => (current().entries[keyOf(fileId, userId)] !== undefined ? 'mention' : undefined),

        clear: (fileId, userId) => {
            const c = current();
            const k = keyOf(fileId, userId);
            if (c.entries[k] === undefined) return;
            const entries = { ...c.entries };
            delete entries[k];
            write(c.userId, entries);
        },

        showHint: (hint) => set({ hint: { ...hint, seq: ++hintSeq } }),
        updateHint: (patch) => set((s) => (s.hint ? { hint: { ...s.hint, ...patch } } : {})),
        dismissHint: () => set({ hint: null }),
    };
});

/** Removes the mention-share records of every user (logout) and the in-memory copy. */
export function clearMentionShares(): void {
    try {
        const doomed: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(MENTION_SHARES_KEY)) doomed.push(k);
        }
        doomed.forEach((k) => localStorage.removeItem(k));
    } catch { /* restricted storage */ }
    useMentionShareStore.setState({ userId: null, entries: {}, hint: null });
}
