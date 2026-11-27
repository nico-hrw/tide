import { create } from 'zustand';
import { loadEncryptedOfflineCache, saveEncryptedOfflineCache } from '@/lib/offlineCacheCrypto';
import { emitGraphEvent } from '@/lib/graphEvents';
import { extractNoteLinkTargets, pruneIndex, sameIds, type LinkIndex } from '@/lib/noteLinks';
import { useDataStore } from '@/store/useDataStore';
import { linkableIds } from '@/lib/graphVisibility';

/**
 * Link index: which note links to which, as ids only.
 *
 * There is no server-side list of links (notes are end-to-end encrypted), so the index is built on this device from
 * the notes the user opens and edits. It lives in memory and in the encrypted offline cache (IndexedDB, key tied to
 * the signed-in user, wiped on sign-out). It is never sent to the server, never part of a share, a backup or an export.
 */

const CACHE_KEY_PREFIX = 'note_links:';
const PERSIST_DELAY_MS = 1500;

interface PersistedIndex { v: 1; links: LinkIndex }

interface NoteLinkState {
    links: LinkIndex;
    /** Notes whose content has been read at least once on this device (opened or edited). */
    indexed: Record<string, true>;
    ready: boolean;
    /** Reads a note's editor document; announces a new link (once the note was indexed before). */
    record: (noteId: string, doc: unknown) => void;
    forget: (noteId: string) => void;
    /** Deletes everything on this device (button in the settings, sign-out). */
    clear: () => void;
    hydrate: () => Promise<void>;
}

function currentUserId(): string {
    if (typeof window === 'undefined') return '';
    try {
        return sessionStorage.getItem('tide_user_id') || localStorage.getItem('tide_user_id') || '';
    } catch {
        return '';
    }
}

let ownerId = '';
let hydration: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** What the signed-in user can see right now (both empty while the lists have not loaded yet). */
function knownIds(): { noteIds: Set<string>; allIds: Set<string> } {
    const { notes, events } = useDataStore.getState();
    return linkableIds(notes, events);
}

function schedulePersist(): void {
    if (typeof window === 'undefined' || !ownerId) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persistTimer = null;
        const { links } = useNoteLinkStore.getState();
        const { allIds } = knownIds();
        const data: PersistedIndex = { v: 1, links: allIds.size > 0 ? pruneIndex(links, allIds) : links };
        void saveEncryptedOfflineCache(CACHE_KEY_PREFIX + ownerId, data);
    }, PERSIST_DELAY_MS);
}

/** A different account signed in on this tab: nothing of the previous one may stay in memory. */
function ensureOwner(): void {
    const id = currentUserId();
    if (id === ownerId) return;
    ownerId = id;
    hydration = null;
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
    useNoteLinkStore.setState({ links: {}, indexed: {}, ready: false });
}

export const useNoteLinkStore = create<NoteLinkState>((set, get) => ({
    links: {},
    indexed: {},
    ready: false,

    hydrate: () => {
        ensureOwner();
        if (!ownerId) return Promise.resolve();
        if (!hydration) {
            const owner = ownerId;
            hydration = loadEncryptedOfflineCache<PersistedIndex>(CACHE_KEY_PREFIX + owner)
                .then((saved) => {
                    if (owner !== ownerId) return; // account changed meanwhile
                    const stored = saved && saved.v === 1 && saved.links && typeof saved.links === 'object' ? saved.links : {};
                    const merged: LinkIndex = {};
                    for (const [src, targets] of Object.entries(stored)) {
                        if (Array.isArray(targets)) merged[src] = targets.filter((t): t is string => typeof t === 'string');
                    }
                    // Anything recorded in this session wins over the older saved copy.
                    for (const [src, targets] of Object.entries(get().links)) merged[src] = targets;
                    const indexed: Record<string, true> = {};
                    for (const src of Object.keys(merged)) indexed[src] = true;
                    set({ links: merged, indexed: { ...indexed, ...get().indexed }, ready: true });
                })
                .catch(() => { set({ ready: true }); });
        }
        return hydration;
    },

    record: (noteId, doc) => {
        ensureOwner();
        if (!ownerId || !noteId) return;
        void get().hydrate().then(() => {
            const { noteIds, allIds } = knownIds();
            // Only links from a visible note to something the user can see are kept (see lib/noteLinks.ts).
            // Without a loaded list nothing is kept.
            if (noteIds.size === 0 || !noteIds.has(noteId)) return;
            const targets = extractNoteLinkTargets(doc, noteId).filter((t) => allIds.has(t));
            const previous = get().links[noteId];
            const wasIndexed = get().indexed[noteId] === true;
            if (wasIndexed && sameIds(previous, targets)) return;
            const added = previous ? targets.filter((t) => !previous.includes(t)) : wasIndexed ? targets : [];
            set((s) => ({
                links: { ...s.links, [noteId]: targets },
                indexed: { ...s.indexed, [noteId]: true },
            }));
            schedulePersist();
            // First read of a note only fills the index; animations are for links the user adds afterwards.
            if (wasIndexed && added.length > 0) emitGraphEvent({ kind: 'link', a: noteId, b: added[0] });
        });
    },

    forget: (noteId) => {
        const { links, indexed } = get();
        if (!(noteId in links) && !(noteId in indexed)) return;
        const nextLinks = { ...links };
        delete nextLinks[noteId];
        const nextIndexed = { ...indexed };
        delete nextIndexed[noteId];
        set({ links: nextLinks, indexed: nextIndexed });
        schedulePersist();
    },

    clear: () => {
        if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
        set({ links: {}, indexed: {}, ready: true });
        if (ownerId) void saveEncryptedOfflineCache(CACHE_KEY_PREFIX + ownerId, { v: 1, links: {} } satisfies PersistedIndex);
    },
}));
