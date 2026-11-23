import type { DataStoreSlice, DataStoreState, ViewsSlice } from './types';
import { createApiViewsStorage, type SavedView, type ViewsStorage } from '@/lib/viewsStorage';
import { generateSecureId } from '@/lib/offlineCacheCrypto';

type StorageProvider = (get: () => DataStoreState) => ViewsStorage;

function newId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : generateSecureId('view');
}

/** Default provider: one API storage per signed-in user, keys read lazily from the store. */
function apiStorageProvider(): StorageProvider {
    let cached: { userId: string | null; storage: ViewsStorage } | null = null;
    return (get) => {
        const userId = get().myId ?? null;
        if (!cached || cached.userId !== userId) {
            cached = {
                userId,
                storage: createApiViewsStorage(() => {
                    const s = get();
                    return s.privateKey && s.publicKey && s.myId
                        ? { privateKey: s.privateKey, publicKey: s.publicKey, userId: s.myId }
                        : null;
                }),
            };
        }
        return cached.storage;
    };
}

/** Slice factory with an injectable storage (used by tests). */
export const createViewsSliceWith =
    (provider: StorageProvider): DataStoreSlice<ViewsSlice> =>
    (set, get) => {
        const persist = async (views: SavedView[]): Promise<void> => {
            try {
                await provider(get).save(views);
            } catch (e) {
                console.warn('[views] could not persist saved views', e);
            }
        };
        type Op = (list: SavedView[]) => SavedView[];
        // Nothing is persisted before a load has succeeded: saving the local list over a stored file that could
        // not be read would drop the stored views. Mutations made before that are replayed on top of the loaded list.
        let loaded = false;
        let pending: Op[] = [];
        let inflight: Promise<boolean> | null = null;
        // All of the above belongs to one user. On an account switch (no logout hook exists, so detected on the
        // next access) it is dropped, the shown views are cleared and any in-flight load of the old user is ignored.
        let owner: string | null | undefined;
        let generation = 0;
        const syncUser = (): void => {
            const current = get().myId ?? null;
            if (owner !== undefined && owner !== current) {
                generation += 1;
                loaded = false;
                pending = [];
                inflight = null;
                set({ views: [] });
            }
            owner = current;
        };
        const doLoad = (): Promise<boolean> => {
            if (inflight) return inflight;
            const gen = generation;
            const run = (async () => {
                try {
                    const stored = await provider(get).load();
                    if (gen !== generation) return false; // user switched meanwhile: stale result
                    const ops = pending;
                    pending = [];
                    set({ views: ops.reduce((list, op) => op(list), stored) });
                    loaded = true;
                    return true;
                } catch (e) {
                    console.warn('[views] could not load saved views', e);
                    return false; // pending changes stay queued for the next successful load
                } finally {
                    if (gen === generation) inflight = null;
                }
            })();
            inflight = run;
            return run;
        };
        const apply = async (op: Op): Promise<void> => {
            syncUser();
            const next = op(get().views);
            set({ views: next }); // optimistic: the UI shows the change immediately
            if (loaded && !inflight) {
                await persist(next);
                return;
            }
            pending.push(op);
            if (await doLoad()) await persist(get().views); // merged list (loaded + replayed local changes)
            else console.warn('[views] saved views not persisted: the stored list could not be loaded');
        };

        return {
            views: [],

            loadViews: async () => {
                syncUser();
                await doLoad();
            },

            addView: async (v) => {
                const name = v.name.trim();
                if (!name) throw new Error('View name must not be empty');
                const view: SavedView = { ...v, name, tagIds: [...v.tagIds], id: newId() };
                await apply((list) => [...list, view]);
                return view.id;
            },

            renameView: async (id, name) => {
                const trimmed = name.trim();
                if (!trimmed) return;
                if (!get().views.some((x) => x.id === id)) return;
                await apply((list) => list.map((x) => (x.id === id ? { ...x, name: trimmed } : x)));
            },

            removeView: async (id) => {
                if (!get().views.some((x) => x.id === id)) return;
                await apply((list) => list.filter((x) => x.id !== id));
            },

            pruneTagFromViews: async (tagId) => {
                if (!get().views.some((x) => x.tagIds.includes(tagId))) return;
                await apply((list) => list.map((x) => ({ ...x, tagIds: x.tagIds.filter((t) => t !== tagId) })));
            },
        };
    };

export const createViewsSlice: DataStoreSlice<ViewsSlice> = (set, get, api) =>
    createViewsSliceWith(apiStorageProvider())(set, get, api);
