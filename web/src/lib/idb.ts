import { get, set, del, keys } from 'idb-keyval';

export const idb = {
    get: async <T>(key: string): Promise<T | undefined> => {
        try {
            return await get(key);
        } catch (e) {
            console.error('[IDB] Get error', e);
            return undefined;
        }
    },
    set: async (key: string, value: any): Promise<void> => {
        try {
            await set(key, value);
        } catch (e) {
            console.error('[IDB] Set error', e);
        }
    },
    /** Like `set`, but reports failure (quota full, storage blocked) as `false` instead of swallowing it. */
    setChecked: async (key: string, value: unknown): Promise<boolean> => {
        try {
            await set(key, value);
            return true;
        } catch (e) {
            console.error('[IDB] Set error', e);
            return false;
        }
    },
    del: async (key: string): Promise<void> => {
        try {
            await del(key);
        } catch (e) {
            console.error('[IDB] Del error', e);
        }
    },
    keys: async (): Promise<IDBValidKey[]> => {
        try {
            return await keys();
        } catch (e) {
            console.error('[IDB] Keys error', e);
            return [];
        }
    }
};
