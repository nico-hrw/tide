import { createEncryptedSingletonStorage, type SingletonKeys } from './encryptedSingletonStorage';

/** Server file type of the saved-views file (a free-form TEXT column, no schema change needed). */
export const VIEWS_FILE_TYPE = 'views';

export type SavedViewMode = 'day' | 'week' | 'month' | 'continuous';

/** A saved calendar view ("Ansicht"): a tag filter plus the calendar mode. */
export interface SavedView {
    id: string;
    name: string;
    tagIds: string[];
    untagged: boolean;
    viewMode: SavedViewMode;
}

export interface ViewsStorage {
    load(): Promise<SavedView[]>;
    save(views: SavedView[]): Promise<void>;
}

export type ViewsKeys = SingletonKeys;

const VIEW_MODES: readonly SavedViewMode[] = ['day', 'week', 'month', 'continuous'];

/** Tolerant parser for the decrypted payload: drops invalid entries, unknown viewMode becomes 'week'. */
export function parseViews(raw: unknown): SavedView[] {
    if (!Array.isArray(raw)) return [];
    const out: SavedView[] = [];
    for (const e of raw) {
        if (!e || typeof e !== 'object') continue;
        const r = e as Record<string, unknown>;
        if (typeof r.id !== 'string' || !r.id) continue;
        if (typeof r.name !== 'string' || !r.name.trim()) continue;
        const tagIds = Array.isArray(r.tagIds) ? r.tagIds.filter((t): t is string => typeof t === 'string') : [];
        const viewMode = VIEW_MODES.includes(r.viewMode as SavedViewMode) ? (r.viewMode as SavedViewMode) : 'week';
        out.push({ id: r.id, name: r.name, tagIds, untagged: r.untagged === true, viewMode });
    }
    return out;
}

/** Saved views as one encrypted file (shared implementation with the variable registry). */
export function createApiViewsStorage(getKeys: () => ViewsKeys | null): ViewsStorage {
    return createEncryptedSingletonStorage<SavedView[]>(getKeys, {
        type: VIEWS_FILE_TYPE,
        label: 'views',
        blobName: 'views',
        empty: () => [],
        parse: (text) => {
            try {
                return parseViews(JSON.parse(text));
            } catch {
                return [];
            }
        },
    });
}
