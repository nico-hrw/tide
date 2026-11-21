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

    it('loadViews does not overwrite a view added while the load was in flight', async () => {
        let release: (v: SavedView[]) => void = () => undefined;
        const slow: ViewsStorage = {
            load: () => new Promise<SavedView[]>((r) => { release = r; }),
            save: async () => undefined,
        };
        const s = makeStore(slow);
        const loading = s.getState().loadViews();
        const adding = s.getState().addView(base);
        release([]);
        await Promise.all([loading, adding]);
        expect(s.getState().views).toHaveLength(1);
        expect(s.getState().views[0].name).toBe('Arbeit');
    });

    it('keeps stored views when a mutation happens before the startup load resolved', async () => {
        const a: SavedView = { id: 'a', name: 'A', tagIds: [], untagged: false, viewMode: 'week' };
        const b: SavedView = { id: 'b', name: 'B', tagIds: [], untagged: true, viewMode: 'day' };
        let release: (v: SavedView[]) => void = () => undefined;
        const saves: SavedView[][] = [];
        const deferred: ViewsStorage = {
            load: () => new Promise<SavedView[]>((r) => { release = r; }),
            save: async (views) => { saves.push(views); },
        };
        const s = makeStore(deferred);
        const loading = s.getState().loadViews();
        const adding = s.getState().addView({ ...base, name: 'C' });
        // optimistic: local state shows the new view at once, nothing persisted yet
        expect(s.getState().views.map((v) => v.name)).toEqual(['C']);
        expect(saves).toEqual([]);
        release([a, b]);
        await Promise.all([loading, adding]);
        expect(s.getState().views.map((v) => v.name)).toEqual(['A', 'B', 'C']);
        expect(saves).toHaveLength(1);
        expect(saves[0].map((v) => v.name)).toEqual(['A', 'B', 'C']);
    });

    it('does not persist when the startup load fails, but keeps the change locally', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const save = vi.fn(async () => undefined);
        const s = makeStore({ load: async () => { throw new Error('locked'); }, save });
        await s.getState().loadViews();
        await s.getState().addView(base);
        expect(save).not.toHaveBeenCalled();
        expect(s.getState().views).toHaveLength(1);
        warn.mockRestore();
    });

    it('retries the load on a later mutation and saves stored + pending + new changes', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const a: SavedView = { id: 'a', name: 'A', tagIds: [], untagged: false, viewMode: 'week' };
        const b: SavedView = { id: 'b', name: 'B', tagIds: [], untagged: false, viewMode: 'week' };
        let fail = true;
        const saves: SavedView[][] = [];
        const s = makeStore({
            load: async () => { if (fail) throw new Error('down'); return [a, b]; },
            save: async (v) => { saves.push(v); },
        });
        await s.getState().loadViews();
        await s.getState().addView({ ...base, name: 'C' });
        expect(saves).toEqual([]);
        fail = false;
        await s.getState().addView({ ...base, name: 'D' });
        expect(saves).toHaveLength(1);
        expect(saves[0].map((v) => v.name)).toEqual(['A', 'B', 'C', 'D']);
        expect(s.getState().views.map((v) => v.name)).toEqual(['A', 'B', 'C', 'D']);
        warn.mockRestore();
    });

    it('never saves when the load keeps failing', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const save = vi.fn(async () => undefined);
        const s = makeStore({ load: async () => { throw new Error('down'); }, save });
        await s.getState().loadViews();
        await s.getState().addView(base);
        await s.getState().addView({ ...base, name: 'B' });
        expect(save).not.toHaveBeenCalled();
        expect(s.getState().views).toHaveLength(2);
        warn.mockRestore();
    });

    it('queues mutations made before any load and saves them after the first successful load', async () => {
        const a: SavedView = { id: 'a', name: 'A', tagIds: [], untagged: false, viewMode: 'week' };
        const mem2 = memoryStorage([a]);
        const s = makeStore(mem2.storage);
        await s.getState().addView({ ...base, name: 'C' });
        expect(mem2.state.saved.map((v) => v.name)).toEqual(['A', 'C']);
    });

    describe('account switch', () => {
        const mk = (id: string): SavedView => ({ id, name: id, tagIds: [], untagged: false, viewMode: 'week' });
        function userStore(storages: Record<string, ViewsStorage>) {
            return create<DataStoreState>()(
                (set, get, api) => ({
                    myId: 'A',
                    ...createViewsSliceWith((g) => storages[g().myId as string])(set, get, api),
                }) as unknown as DataStoreState
            );
        }

        it('does not replay or persist user A ops for user B, and clears views on switch', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            const bMem = memoryStorage([mk('b1')]);
            const s = userStore({
                A: { load: async () => { throw new Error('down'); }, save: async () => undefined },
                B: bMem.storage,
            });
            await s.getState().addView({ ...base, name: 'fromA' });
            expect(s.getState().views).toHaveLength(1);
            s.setState({ myId: 'B' } as Partial<DataStoreState>);
            const adding = s.getState().addView({ ...base, name: 'fromB' });
            expect(s.getState().views.map((v) => v.name)).toEqual(['fromB']); // A's view gone, B not yet loaded
            await adding;
            expect(bMem.state.saved.map((v) => v.name)).toEqual(['b1', 'fromB']);
            expect(s.getState().views.map((v) => v.name)).toEqual(['b1', 'fromB']);
            warn.mockRestore();
        });

        it('ignores the in-flight load of the previous user', async () => {
            let releaseA: (v: SavedView[]) => void = () => undefined;
            const s = userStore({
                A: { load: () => new Promise<SavedView[]>((r) => { releaseA = r; }), save: async () => undefined },
                B: memoryStorage([mk('b1')]).storage,
            });
            const loadingA = s.getState().loadViews();
            s.setState({ myId: 'B' } as Partial<DataStoreState>);
            await s.getState().loadViews();
            expect(s.getState().views.map((v) => v.id)).toEqual(['b1']);
            releaseA([mk('a1')]);
            await loadingA;
            expect(s.getState().views.map((v) => v.id)).toEqual(['b1']);
        });
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
