import { describe, it, expect, beforeEach, vi } from 'vitest';
import { create } from 'zustand';
import { createViewsSliceWith } from '../slices/createViewsSlice';
import { parseViews, type SavedView, type ViewsStorage } from '@/lib/viewsStorage';
import type { DataStoreState } from '../slices/types';

function memoryStorage(initial: SavedView[] = []) {
    const state = { saved: initial, saves: 0 };
    const storage: ViewsStorage = {
        load: async () => state.saved,
        save: async (views) => {
            state.saved = views;
            state.saves += 1;
        },
    };
    return { state, storage };
}

function makeStore(storage: ViewsStorage) {
    return create<DataStoreState>()(
        (...a) => ({ ...createViewsSliceWith(() => storage)(...a) }) as unknown as DataStoreState
    );
}

const base = { name: 'Arbeit', tagIds: ['t1', 't2'], untagged: false, viewMode: 'week' as const };

describe('viewsSlice', () => {
    let mem: ReturnType<typeof memoryStorage>;
    let store: ReturnType<typeof makeStore>;
    beforeEach(() => {
        mem = memoryStorage();
        store = makeStore(mem.storage);
    });

    it('addView assigns an id, trims the name and persists', async () => {
        const id = await store.getState().addView({ ...base, name: '  Arbeit  ' });
        expect(id).toBeTruthy();
        expect(store.getState().views).toEqual([{ ...base, name: 'Arbeit', id }]);
        expect(mem.state.saved).toEqual(store.getState().views);
    });

    it('addView rejects an empty name', async () => {
        await expect(store.getState().addView({ ...base, name: '   ' })).rejects.toThrow();
        expect(store.getState().views).toEqual([]);
        expect(mem.state.saves).toBe(0);
    });

    it('renameView trims and ignores an empty name', async () => {
        const id = await store.getState().addView(base);
        await store.getState().renameView(id, '  Privat ');
        expect(store.getState().views[0].name).toBe('Privat');
        await store.getState().renameView(id, '   ');
        expect(store.getState().views[0].name).toBe('Privat');
        expect(mem.state.saved[0].name).toBe('Privat');
    });

    it('removeView removes and persists', async () => {
        const a = await store.getState().addView(base);
        const b = await store.getState().addView({ ...base, name: 'B' });
        await store.getState().removeView(a);
        expect(store.getState().views.map((v) => v.id)).toEqual([b]);
        expect(mem.state.saved.map((v) => v.id)).toEqual([b]);
    });

    it('pruneTagFromViews removes the id everywhere and keeps emptied views', async () => {
        await store.getState().addView({ ...base, tagIds: ['t1'] });
        await store.getState().addView({ ...base, name: 'B', tagIds: ['t1', 't2'] });
        await store.getState().addView({ ...base, name: 'C', tagIds: ['t2'] });
        await store.getState().pruneTagFromViews('t1');
        expect(store.getState().views.map((v) => v.tagIds)).toEqual([[], ['t2'], ['t2']]);
        expect(mem.state.saved.map((v) => v.tagIds)).toEqual([[], ['t2'], ['t2']]);
    });

    it('loadViews replaces state', async () => {
        const stored: SavedView[] = [{ id: 'x', name: 'X', tagIds: [], untagged: true, viewMode: 'month' }];
        const m = memoryStorage(stored);
        const s = makeStore(m.storage);
        await s.getState().addView(base);
        m.state.saved = stored;
        await s.getState().loadViews();
        expect(s.getState().views).toEqual(stored);
    });

    it('loadViews does not throw when storage fails', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const s = makeStore({ load: async () => { throw new Error('locked'); }, save: async () => undefined });
        await expect(s.getState().loadViews()).resolves.toBeUndefined();
        expect(s.getState().views).toEqual([]);
        warn.mockRestore();
    });
});

describe('parseViews', () => {
    it('returns [] for non-arrays', () => {
        expect(parseViews(null)).toEqual([]);
        expect(parseViews({})).toEqual([]);
        expect(parseViews('x')).toEqual([]);
    });

    it('filters invalid entries and normalises viewMode', () => {
        const out = parseViews([
            null,
            42,
            { id: 'a', name: 'A', tagIds: ['t', 3], untagged: true, viewMode: 'month' },
            { id: 'b', name: 'B', tagIds: 'oops', viewMode: 'year' },
            { id: '', name: 'no id' },
            { id: 'c', name: '  ' },
            { name: 'missing id' },
        ]);
        expect(out).toEqual([
            { id: 'a', name: 'A', tagIds: ['t'], untagged: true, viewMode: 'month' },
            { id: 'b', name: 'B', tagIds: [], untagged: false, viewMode: 'week' },
        ]);
    });
});
