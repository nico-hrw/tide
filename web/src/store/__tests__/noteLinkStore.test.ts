import { beforeEach, describe, expect, it, vi } from 'vitest';

const saved: Record<string, unknown> = {};

vi.mock('@/lib/offlineCacheCrypto', () => ({
    loadEncryptedOfflineCache: vi.fn(async (key: string) => saved[key] ?? null),
    saveEncryptedOfflineCache: vi.fn(async (key: string, data: unknown) => { saved[key] = data; }),
}));

const mention = (id: string) => ({ type: 'mention', attrs: { id } });
const doc = (...ids: string[]) => ({ type: 'doc', content: [{ type: 'paragraph', content: ids.map(mention) }] });

async function setup(userId = 'u1') {
    vi.resetModules();
    sessionStorage.setItem('tide_user_id', userId);
    const data = await import('@/store/useDataStore');
    data.useDataStore.setState({ notes: ['a', 'b', 'c'].map((id) => ({ id, title: id.toUpperCase(), type: 'note' })) } as never);
    const links = await import('@/store/useNoteLinkStore');
    const events = await import('@/lib/graphEvents');
    const seen: unknown[] = [];
    events.onGraphEvent((e) => seen.push(e));
    return { store: links.useNoteLinkStore, seen };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('note link store', () => {
    beforeEach(() => {
        for (const k of Object.keys(saved)) delete saved[k];
        sessionStorage.clear();
    });

    it('stores ids only and only for notes the user can see', async () => {
        const { store } = await setup();
        store.getState().record('a', doc('b', 'not-my-note'));
        await flush();
        expect(store.getState().links).toEqual({ a: ['b'] });
        expect(JSON.stringify(store.getState().links)).not.toContain('not-my-note');
    });

    it('does not announce links found when a note is first read, only links added afterwards', async () => {
        const { store, seen } = await setup();
        store.getState().record('a', doc('b'));
        await flush();
        expect(seen).toEqual([]);
        store.getState().record('a', doc('b', 'c'));
        await flush();
        expect(seen).toEqual([{ kind: 'link', a: 'a', b: 'c' }]);
    });

    it('stays silent when nothing changed', async () => {
        const { store, seen } = await setup();
        store.getState().record('a', doc('b'));
        await flush();
        store.getState().record('a', doc('b'));
        await flush();
        expect(seen).toEqual([]);
    });

    it('keeps nothing while the note list has not loaded', async () => {
        const { store } = await setup();
        const data = await import('@/store/useDataStore');
        data.useDataStore.setState({ notes: [] } as never);
        store.getState().record('a', doc('b'));
        await flush();
        expect(store.getState().links).toEqual({});
    });

    it('wipes memory and the stored copy on clear', async () => {
        const { store } = await setup();
        store.getState().record('a', doc('b'));
        await flush();
        store.getState().clear();
        expect(store.getState().links).toEqual({});
        expect(saved['note_links:u1']).toEqual({ v: 1, links: {} });
    });

    it('never shows a previous account\'s links to the next one', async () => {
        const { store } = await setup('u1');
        store.getState().record('a', doc('b'));
        await flush();
        sessionStorage.setItem('tide_user_id', 'u2');
        store.getState().record('c', doc('a'));
        await flush();
        expect(store.getState().links).toEqual({ c: ['a'] });
    });
});
