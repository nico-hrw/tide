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
        const apply = async (next: SavedView[]): Promise<void> => {
            set({ views: next });
            await persist(next);
        };

        return {
            views: [],

            loadViews: async () => {
                try {
                    const loaded = await provider(get).load();
                    set({ views: loaded });
                } catch (e) {
                    console.warn('[views] could not load saved views', e);
                }
            },

            addView: async (v) => {
                const name = v.name.trim();
                if (!name) throw new Error('View name must not be empty');
                const view: SavedView = { ...v, name, tagIds: [...v.tagIds], id: newId() };
                await apply([...get().views, view]);
                return view.id;
            },

            renameView: async (id, name) => {
                const trimmed = name.trim();
                if (!trimmed) return;
                if (!get().views.some((x) => x.id === id)) return;
                await apply(get().views.map((x) => (x.id === id ? { ...x, name: trimmed } : x)));
            },

            removeView: async (id) => {
                if (!get().views.some((x) => x.id === id)) return;
                await apply(get().views.filter((x) => x.id !== id));
            },

            pruneTagFromViews: async (tagId) => {
                if (!get().views.some((x) => x.tagIds.includes(tagId))) return;
                await apply(get().views.map((x) => ({ ...x, tagIds: x.tagIds.filter((t) => t !== tagId) })));
            },
        };
    };

export const createViewsSlice: DataStoreSlice<ViewsSlice> = (set, get, api) =>
    createViewsSliceWith(apiStorageProvider())(set, get, api);
