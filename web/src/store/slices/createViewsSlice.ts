import type { DataStoreSlice, DataStoreState, ViewsSlice } from './types';
import { createApiViewsStorage, type SavedView, type ViewsStorage } from '@/lib/viewsStorage';

type StorageProvider = (get: () => DataStoreState) => ViewsStorage;

function newId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
        // Mutations made while the startup load is in flight. Persisting before the load resolved would overwrite
        // the stored file with only the new list, so they are replayed on top of the loaded list and saved after.
        let loading: Promise<void> | null = null;
        let pending: Op[] = [];
        const apply = async (op: Op): Promise<void> => {
            const next = op(get().views);
            set({ views: next }); // optimistic: the UI shows the change immediately
            if (loading) {
                pending.push(op);
                await loading; // never rejects
                await persist(get().views); // merged list (loaded + replayed local changes)
                return;
            }
            await persist(next);
        };

        return {
            views: [],

            loadViews: async () => {
                const run = (async () => {
                    try {
                        const loaded = await provider(get).load();
                        const ops = pending;
                        pending = [];
                        set({ views: ops.reduce((list, op) => op(list), loaded) });
                    } catch (e) {
                        pending = []; // local state already holds the changes; keep it
                        console.warn('[views] could not load saved views', e);
                    }
                })();
                loading = run;
                await run;
                if (loading === run) loading = null;
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
