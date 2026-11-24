import { create } from 'zustand';
import { createEncryptedSingletonStorage } from '@/lib/encryptedSingletonStorage';
import { parseShareRules, upsertShareRule, type CalendarShareRule, type CalendarShareRules } from '@/lib/calendarShare';
import { useDataStore } from './useDataStore';

/**
 * Calendar share rules (one per group) live in ONE encrypted file per user, the same pattern as the
 * saved views: the server only sees ciphertext and nothing touches localStorage. The group file's
 * own secured_meta is RSA-only (~190 bytes) and its plain `metadata` is readable by the server and by
 * people the group is shared with, so the rule is kept out of it.
 */
export const CALENDAR_SHARES_FILE_TYPE = 'calendar_shares';

export interface CalendarShareStorage {
    load(): Promise<CalendarShareRules>;
    save(rules: CalendarShareRules): Promise<void>;
}

type StorageFactory = (userId: string) => CalendarShareStorage;

function apiStorage(userId: string): CalendarShareStorage {
    return createEncryptedSingletonStorage<CalendarShareRules>(() => {
        const s = useDataStore.getState();
        // Keys of another user must never encrypt or decrypt this user's file.
        return s.privateKey && s.publicKey && s.myId === userId ? { privateKey: s.privateKey, publicKey: s.publicKey, userId } : null;
    }, {
        type: CALENDAR_SHARES_FILE_TYPE,
        label: 'calendar-shares',
        blobName: 'calendar shares',
        empty: () => ({}),
        // A corrupt payload fails the load, so a later save cannot overwrite it with less.
        parse: (text) => {
            if (!text.trim()) return {};
            const raw: unknown = JSON.parse(text);
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('[calendar-shares] stored payload is not an object');
            return parseShareRules(raw);
        },
    });
}

let factory: StorageFactory = apiStorage;
let cached: { userId: string; storage: CalendarShareStorage } | null = null;
let inflight: { userId: string; promise: Promise<boolean>; token: object } | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** Tests inject an in-memory storage here. */
export function setCalendarShareStorageFactory(next: StorageFactory): void {
    factory = next;
    cached = null;
    inflight = null;
}

function storageFor(userId: string): CalendarShareStorage {
    if (!cached || cached.userId !== userId) cached = { userId, storage: factory(userId) };
    return cached.storage;
}

export type CalendarShareStatus = 'idle' | 'loading' | 'ready' | 'error';

interface CalendarShareState {
    /** Owner of `rules`; rules of another user are never shown or used. */
    userId: string | null;
    rules: CalendarShareRules;
    status: CalendarShareStatus;
    /** Resolves true once the signed-in user's rules are loaded. */
    load: () => Promise<boolean>;
    /** Loads first (never overwrites an unread file), then stores the rule. Throws on failure. */
    saveRule: (rule: CalendarShareRule) => Promise<void>;
    ruleFor: (groupId: string) => CalendarShareRule | undefined;
}

const currentUser = (): string | null => useDataStore.getState().myId ?? null;

export const useCalendarShareStore = create<CalendarShareState>((set, get) => {
    const syncUser = (): string | null => {
        const me = currentUser();
        if (get().userId !== me) {
            inflight = null;
            set({ userId: me, rules: {}, status: 'idle' });
        }
        return me;
    };

    const load = (): Promise<boolean> => {
        const me = syncUser();
        if (!me) return Promise.resolve(false);
        if (get().status === 'ready') return Promise.resolve(true);
        if (inflight && inflight.userId === me) return inflight.promise;
        set({ status: 'loading' });
        const token = {};
        const promise: Promise<boolean> = (async () => {
            try {
                const rules = await storageFor(me).load();
                if (currentUser() !== me) return false; // account switched meanwhile
                set({ userId: me, rules, status: 'ready' });
                return true;
            } catch (e) {
                console.warn('[calendar-shares] could not load share rules', e);
                if (currentUser() === me) set({ status: 'error' });
                return false;
            } finally {
                if (inflight?.token === token) inflight = null;
            }
        })();
        inflight = { userId: me, promise, token };
        return promise;
    };

    return {
        userId: null,
        rules: {},
        status: 'idle',
        load,
        saveRule: (rule) => {
            const run = queue.then(async () => {
                const me = syncUser();
                if (!me) throw new Error('[calendar-shares] not signed in');
                if (!(await load())) throw new Error('[calendar-shares] stored rules could not be read');
                const next = upsertShareRule(get().rules, rule);
                await storageFor(me).save(next);
                if (currentUser() === me) set({ rules: next });
            });
            queue = run.catch(() => undefined);
            return run;
        },
        ruleFor: (groupId) => {
            syncUser();
            return get().rules[groupId];
        },
    };
});

/** Rules for rendering: empty while they belong to another user (switch detected on the next load). */
export function useCalendarShareRules(): CalendarShareRules {
    const myId = useDataStore((s) => s.myId);
    const { userId, rules } = useCalendarShareStore();
    return userId && userId === myId ? rules : {};
}
