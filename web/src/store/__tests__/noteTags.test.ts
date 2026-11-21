import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDataStore } from '../useDataStore';
import { decryptAndNormalizeFileItem } from '../slices/fsHelpers';
import { apiFetch } from '@/lib/api';
import { setNoteTags } from '@/hooks/dashboard/useNoteTags';

vi.mock('@/lib/api', () => ({
    apiFetch: vi.fn(),
    getApiBase: vi.fn().mockReturnValue(''),
}));

type Raw = Parameters<typeof decryptAndNormalizeFileItem>[0];

async function normalize(metadata: Record<string, unknown> | undefined) {
    const file = { id: 'n1', type: 'note', version: 2, metadata, visibility: 'private' } as unknown as Raw;
    const r = await decryptAndNormalizeFileItem(file, null, {});
    return (r as { item: { tagIds?: unknown } }).item;
}

describe('note tag normalization', () => {
    it('takes tags from metadata', async () => {
        expect((await normalize({ title: 'x', tagIds: ['a', 'b'] })).tagIds).toEqual(['a', 'b']);
    });
    it('defaults to an empty list', async () => {
        expect((await normalize({ title: 'x' })).tagIds).toEqual([]);
    });
    it('does not treat legacy free-form tags as tag ids', async () => {
        const item = await normalize({ title: 'x', tags: ['foo'] });
        expect(item.tagIds).toEqual([]);
        expect((item as { tags?: unknown }).tags).toEqual(['foo']);
    });
    it('ignores non-array values', async () => {
        expect((await normalize({ title: 'x', tagIds: 'a' })).tagIds).toEqual([]);
        expect((await normalize({ title: 'x', tagIds: { a: 1 } })).tagIds).toEqual([]);
    });
    it('filters non-string entries', async () => {
        expect((await normalize({ title: 'x', tagIds: ['a', 1, null, 'b'] })).tagIds).toEqual(['a', 'b']);
    });
    it('reads plaintext metadata.tagIds for legacy v1 notes', async () => {
        const file = { id: 'n1', type: 'note', version: 1, metadata: { title: 'x', tagIds: ['a'] }, visibility: 'private' } as unknown as Raw;
        const r = await decryptAndNormalizeFileItem(file, null, {});
        expect((r as { item: { tagIds?: unknown } }).item.tagIds).toEqual(['a']);
    });
    it('reads plaintext metadata.tagIds for public notes', async () => {
        const file = { id: 'n1', type: 'note', version: 2, metadata: { tagIds: ['p'] }, public_meta: { title: 'P' }, visibility: 'public' } as unknown as Raw;
        const r = await decryptAndNormalizeFileItem(file, null, {});
        expect((r as { item: { tagIds?: unknown } }).item.tagIds).toEqual(['p']);
    });
    it('keeps tagIds on the cached path', async () => {
        const file = { id: 'n1', type: 'note', version: 2, metadata: { title: 'x' } } as unknown as Raw;
        const r = await decryptAndNormalizeFileItem(file, null, { cachedMetadata: { n1: { title: 'x', tagIds: ['c'] } } });
        expect((r as { item: { tagIds?: unknown } }).item.tagIds).toEqual(['c']);
    });
    it('gives events and folders no tagIds', async () => {
        const ev = { id: 'e1', type: 'event', version: 2, metadata: { title: 'x' }, visibility: 'private' } as unknown as Raw;
        const fo = { id: 'f1', type: 'folder', version: 2, metadata: { title: 'x' }, visibility: 'private' } as unknown as Raw;
        expect(((await decryptAndNormalizeFileItem(ev, null, {})) as { item: { tagIds?: unknown } }).item.tagIds).toBeUndefined();
        expect(((await decryptAndNormalizeFileItem(fo, null, {})) as { item: { tagIds?: unknown } }).item.tagIds).toBeUndefined();
    });
});

const json = (body: unknown, status = 200) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

function putCalls() {
    return vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === 'PUT');
}
function putBody(i = 0): Record<string, unknown> {
    return JSON.parse(String(putCalls()[i][1]?.body));
}

describe('setNoteTags', () => {
    beforeEach(() => {
        vi.mocked(apiFetch).mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        useDataStore.setState({
            myId: 'me',
            notes: [{ id: 'n1', title: 'N', type: 'note', owner_id: 'me', tagIds: [], metadata: { old: 1 } }],
        });
    });

    it('PUTs the fresh metadata merged with tags and the current version only', async () => {
        vi.mocked(apiFetch).mockImplementation(async (_u, init) =>
            init?.method === 'PUT'
                ? json({ version: 8 })
                : json({ id: 'n1', version: 7, metadata: { dek: 'k', iv: 'i', title: 'N', tagIds: ['z'], tags: ['legacy'] } }),
        );
        await setNoteTags('n1', ['a', 'b']);
        expect(putCalls()).toHaveLength(1);
        expect(putCalls()[0][0]).toBe('/api/v1/files/n1');
        const body = putBody();
        expect(body).toEqual({ metadata: { dek: 'k', iv: 'i', title: 'N', tags: ['legacy'], tagIds: ['a', 'b'] }, version: 7 });
        expect(body).not.toHaveProperty('content_ciphertext');
        expect(body).not.toHaveProperty('secured_meta');
        expect(useDataStore.getState().notes[0].version).toBe(8);
    });

    it('updates the store optimistically before the request resolves', async () => {
        let release: (r: Response) => void = () => {};
        vi.mocked(apiFetch).mockImplementation(() => new Promise<Response>((res) => { release = res; }));
        const p = setNoteTags('n1', ['a']);
        const n = useDataStore.getState().notes[0];
        expect(n.tagIds).toEqual(['a']);
        expect(n.metadata).toEqual({ old: 1, tagIds: ['a'] });
        release(json({}, 500));
        await p;
    });

    it('dedupes keeping order', async () => {
        vi.mocked(apiFetch).mockImplementation(async (_u, init) =>
            init?.method === 'PUT' ? json({ version: 2 }) : json({ version: 1, metadata: {} }),
        );
        await setNoteTags('n1', ['b', 'a', 'b']);
        expect((putBody().metadata as { tagIds: string[] }).tagIds).toEqual(['b', 'a']);
        expect(useDataStore.getState().notes[0].tagIds).toEqual(['b', 'a']);
    });

    it('retries once on 409 with the refetched version and metadata', async () => {
        let gets = 0;
        let puts = 0;
        vi.mocked(apiFetch).mockImplementation(async (_u, init) => {
            if (init?.method === 'PUT') return ++puts === 1 ? json({ current_version: 5 }, 409) : json({ version: 6 });
            gets++;
            return json({ version: gets === 1 ? 4 : 5, metadata: { dek: gets === 1 ? 'old' : 'new' } });
        });
        await setNoteTags('n1', ['a']);
        expect(putCalls()).toHaveLength(2);
        expect(putBody(0).version).toBe(4);
        expect(putBody(1)).toEqual({ metadata: { dek: 'new', tagIds: ['a'] }, version: 5 });
    });

    it('does not retry a second time', async () => {
        vi.mocked(apiFetch).mockImplementation(async (_u, init) =>
            init?.method === 'PUT' ? json({ current_version: 5 }, 409) : json({ version: 4, metadata: {} }),
        );
        await expect(setNoteTags('n1', ['a'], { strict: true })).rejects.toThrow();
        expect(putCalls()).toHaveLength(2);
    });

    it('strict rethrows on non-OK, default stays silent', async () => {
        vi.mocked(apiFetch).mockImplementation(async (_u, init) =>
            init?.method === 'PUT' ? json({}, 500) : json({ version: 1, metadata: {} }),
        );
        await expect(setNoteTags('n1', ['a'], { strict: true })).rejects.toThrow();
        await expect(setNoteTags('n1', ['a'])).resolves.toBeUndefined();
    });

    it('never sends a PUT when the current metadata cannot be read', async () => {
        vi.mocked(apiFetch).mockResolvedValue(json({}, 500));
        await expect(setNoteTags('n1', ['a'], { strict: true })).rejects.toThrow();
        expect(putCalls()).toHaveLength(0);
    });

    it('does nothing for a note owned by someone else', async () => {
        useDataStore.setState({ notes: [{ id: 'n1', title: 'N', type: 'note', owner_id: 'other', tagIds: [] }] });
        await setNoteTags('n1', ['a']);
        expect(apiFetch).not.toHaveBeenCalled();
        expect(useDataStore.getState().notes[0].tagIds).toEqual([]);
        await expect(setNoteTags('n1', ['a'], { strict: true })).rejects.toThrow();
        expect(apiFetch).not.toHaveBeenCalled();
    });

    it('keeps tagIds when autosave merges the note metadata after an optimistic update', async () => {
        vi.mocked(apiFetch).mockResolvedValue(json({}, 500));
        await setNoteTags('n1', ['a']);
        const existingMeta = (useDataStore.getState().notes[0].metadata ?? {}) as Record<string, unknown>;
        const merged: Record<string, unknown> = { ...existingMeta, title: 'N', tags: ['legacy'] };
        expect(merged.tagIds).toEqual(['a']);
    });

    it('strict: rejects for an unknown note, default stays silent', async () => {
        await expect(setNoteTags('nope', ['a'], { strict: true })).rejects.toThrow();
        await expect(setNoteTags('nope', ['a'])).resolves.toBeUndefined();
        expect(apiFetch).not.toHaveBeenCalled();
    });
});
