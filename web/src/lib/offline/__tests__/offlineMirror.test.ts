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

// The device key lives in IndexedDB/WebCrypto; here sealing is a reversible stand-in.
vi.mock('../../offlineCacheCrypto', () => ({
    encryptCacheValue: vi.fn(async (s: string) => `sealed:${s}`),
    decryptCacheValue: vi.fn(async (s: unknown) =>
        typeof s === 'string' && s.startsWith('sealed:') ? s.slice(7) : null,
    ),
    clearOfflineCacheCrypto: vi.fn(async () => {}),
}));

import { apiFetch, clearAllSessionData } from '../../api';
import { mirrorKey, mirrorRead, mirrorWrite, clearOfflineData, getLastMirroredAt, getOfflineUserId } from '../store';

function setUser(id: string | null) {
    localStorage.clear();
    sessionStorage.clear();
    if (id) localStorage.setItem('tide_user_id', id);
}

const okJson = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function flush() {
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('offline mirror', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockIdb.clear();
        setUser('alice');
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('mirrors a successful GET', async () => {
        fetchMock.mockResolvedValueOnce(okJson([{ id: 'f1' }]));
        const res = await apiFetch('/api/v1/files?parent=root');
        expect(await res.json()).toEqual([{ id: 'f1' }]);
        await flush();
        const hit = await mirrorRead('/api/v1/files?parent=root', 'alice');
        expect(hit && JSON.parse(hit.body)).toEqual([{ id: 'f1' }]);
        expect(hit?.cachedAt).toBeTypeOf('number');
    });

    it('serves the mirror when the network fails', async () => {
        fetchMock.mockResolvedValueOnce(okJson({ n: 1 }));
        await apiFetch('/api/v1/tasks');
        await flush();
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        const res = await apiFetch('/api/v1/tasks');
        expect(res.headers.get('X-Tide-Offline')).toBe('1');
        expect(await res.json()).toEqual({ n: 1 });
    });

    it('serves the mirror on a 502/503/504 gateway answer, but not on a 500 or 404', async () => {
        fetchMock.mockResolvedValueOnce(okJson({ n: 2 }));
        await apiFetch('/api/v1/events');
        await flush();
        fetchMock.mockResolvedValueOnce(new Response('bad gateway', { status: 502 }));
        expect(await (await apiFetch('/api/v1/events')).json()).toEqual({ n: 2 });
        fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
        expect((await apiFetch('/api/v1/events')).status).toBe(500);
        fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
        expect((await apiFetch('/api/v1/events')).status).toBe(404);
    });

    it('throws when offline and nothing is mirrored', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await expect(apiFetch('/api/v1/never-seen')).rejects.toThrow();
    });

    it('never serves another user\'s data', async () => {
        fetchMock.mockResolvedValueOnce(okJson({ owner: 'alice' }));
        await apiFetch('/api/v1/contacts');
        await flush();
        setUser('bob');
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await expect(apiFetch('/api/v1/contacts')).rejects.toThrow();
        expect(await mirrorRead('/api/v1/contacts', 'bob')).toBeNull();
        expect(await mirrorRead('/api/v1/contacts', 'alice')).not.toBeNull();
    });

    it('mirrors and serves nothing without a user id', async () => {
        setUser(null);
        fetchMock.mockResolvedValueOnce(okJson({ x: 1 }));
        await apiFetch('/api/v1/tags');
        await flush();
        expect(Array.from(mockIdb.keys()).filter((k) => k.startsWith('api_cache_'))).toEqual([]);
    });

    it('does not mirror mutations', async () => {
        for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
            fetchMock.mockResolvedValueOnce(okJson({ ok: true }));
            await apiFetch('/api/v1/tasks', { method, body: JSON.stringify({ a: 1 }) });
        }
        await flush();
        expect(Array.from(mockIdb.keys()).filter((k) => k.startsWith('api_cache_'))).toEqual([]);
    });

    it('does not mirror auth endpoints or token URLs', async () => {
        fetchMock.mockResolvedValue(okJson({ token: 'secret' }));
        await apiFetch('/api/v1/auth/verify');
        await apiFetch('/api/v1/api-tokens');
        await apiFetch('/api/v1/files/x/download?token=abc');
        await flush();
        expect(Array.from(mockIdb.keys()).filter((k) => k.startsWith('api_cache_'))).toEqual([]);
    });

    it('clearOfflineData(user) only removes that user', async () => {
        await mirrorWrite('/api/v1/a', '1', 'alice');
        await mirrorWrite('/api/v1/a', '2', 'bob');
        await clearOfflineData('alice');
        expect(await mirrorRead('/api/v1/a', 'alice')).toBeNull();
        expect(mockIdb.has(mirrorKey('bob', '/api/v1/a'))).toBe(true);
    });

    it('logout (clearAllSessionData) wipes the mirror of every user', async () => {
        await mirrorWrite('/api/v1/a', '1', 'alice');
        await mirrorWrite('/api/v1/a', '2', 'bob');
        await clearAllSessionData({ callServerLogout: false });
        expect(Array.from(mockIdb.keys()).filter((k) => String(k).startsWith('api_cache_'))).toEqual([]);
    });

    it('does not stamp lastMirroredAt when the entry could not be stored (quota full)', async () => {
        const idbKeyval = await import('idb-keyval');
        vi.mocked(idbKeyval.set).mockRejectedValueOnce(new Error('QuotaExceededError'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await mirrorWrite('/api/v1/a', '1', 'alice');
        expect(await mirrorRead('/api/v1/a', 'alice')).toBeNull();
        expect(await getLastMirroredAt('alice')).toBeNull();
        await mirrorWrite('/api/v1/a', '1', 'alice');
        expect(await getLastMirroredAt('alice')).toBeTypeOf('number');
    });

    it('a write that was in flight during clearOfflineData does not land afterwards', async () => {
        const crypto = await import('../../offlineCacheCrypto');
        let release: (v: string) => void = () => {};
        vi.mocked(crypto.encryptCacheValue).mockImplementationOnce(() => new Promise<string>((r) => { release = r; }));
        const pending = mirrorWrite('/api/v1/late', 'x', 'alice');
        await clearOfflineData();
        release('sealed:{}');
        await pending;
        expect(Array.from(mockIdb.keys()).filter((k) => String(k).startsWith('api_cache_'))).toEqual([]);
    });

    it('keys the mirror by the localStorage account (the token owner), not a stale tab-local id', async () => {
        sessionStorage.setItem('tide_user_id', 'old-account');
        fetchMock.mockResolvedValueOnce(okJson({ n: 7 }));
        await apiFetch('/api/v1/switched');
        await flush();
        expect(await mirrorRead('/api/v1/switched', 'alice')).not.toBeNull();
        expect(await mirrorRead('/api/v1/switched', 'old-account')).toBeNull();
        sessionStorage.clear();
        localStorage.removeItem('tide_user_id');
        sessionStorage.setItem('tide_user_id', 'alice');
        expect(getOfflineUserId()).toBe('alice');
    });
});
