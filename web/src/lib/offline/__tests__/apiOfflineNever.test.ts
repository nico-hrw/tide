import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockIdb = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
    get: vi.fn(async (k: string) => mockIdb.get(k)),
    set: vi.fn(async (k: string, v: unknown) => {
        mockIdb.set(k, v);
    }),
    del: vi.fn(async (k: string) => {
        mockIdb.delete(k);
    }),
    keys: vi.fn(async () => Array.from(mockIdb.keys())),
}));

vi.mock('../../offlineCacheCrypto', () => ({
    encryptCacheValue: vi.fn(async (s: string) => `sealed:${s}`),
    decryptCacheValue: vi.fn(async (s: unknown) =>
        typeof s === 'string' && s.startsWith('sealed:') ? s.slice(7) : null,
    ),
    clearOfflineCacheCrypto: vi.fn(async () => {}),
}));

const addToSyncQueue = vi.fn(async () => {});
vi.mock('../../syncQueue', () => ({ addToSyncQueue: (...a: unknown[]) => addToSyncQueue(...(a as [])) }));

import { apiFetch } from '../../api';
import { mirrorWrite } from '../store';

const okJson = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe("apiFetch offline: 'never'", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockIdb.clear();
        addToSyncQueue.mockClear();
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('tide_user_id', 'alice');
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('throws on a network error although a mirrored copy exists', async () => {
        await mirrorWrite('/api/v1/files/f1/shares', JSON.stringify([{ user_id: 'bob' }]), 'alice');
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await expect(apiFetch('/api/v1/files/f1/shares', { offline: 'never' })).rejects.toThrow();
    });

    it('control: a normal GET still serves the mirror on a network error', async () => {
        await mirrorWrite('/api/v1/files/f1/shares', JSON.stringify([{ user_id: 'bob' }]), 'alice');
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        const res = await apiFetch('/api/v1/files/f1/shares');
        expect(res.headers.get('X-Tide-Offline')).toBe('1');
    });

    it('returns the real 502 instead of the mirror', async () => {
        await mirrorWrite('/api/v1/files/f1/shares', JSON.stringify([{ user_id: 'bob' }]), 'alice');
        fetchMock.mockResolvedValueOnce(new Response('bad gateway', { status: 502 }));
        const res = await apiFetch('/api/v1/files/f1/shares', { offline: 'never' });
        expect(res.status).toBe(502);
        expect(res.ok).toBe(false);
    });

    it('does not queue a mutation or invent a 200 offline', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await expect(
            apiFetch('/api/v1/files/f1/shares/bob', { method: 'DELETE', offline: 'never' }),
        ).rejects.toThrow();
        expect(addToSyncQueue).not.toHaveBeenCalled();
    });

    it('control: a normal mutation is still queued offline', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        const res = await apiFetch('/api/v1/files/f1/shares/bob', { method: 'DELETE' });
        expect(res.ok).toBe(true);
        expect(addToSyncQueue).toHaveBeenCalledTimes(1);
    });

    it('does not share a request with a concurrent normal GET', async () => {
        fetchMock.mockResolvedValue(okJson([]));
        await Promise.all([apiFetch('/api/v1/x'), apiFetch('/api/v1/x', { offline: 'never' })]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not pass the option on to fetch', async () => {
        fetchMock.mockResolvedValueOnce(okJson([]));
        await apiFetch('/api/v1/x', { offline: 'never' });
        expect((fetchMock.mock.calls[0][1] as Record<string, unknown>).offline).toBeUndefined();
    });
});
