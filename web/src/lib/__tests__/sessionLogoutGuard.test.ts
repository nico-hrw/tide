import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllSessionData } from '../api';
import { mayPersistSession, markLogoutStarted, markLogoutStorageCleared, sessionStateKey } from '../sessionState';

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    // reset the module flag to "signed in, no logout"
    localStorage.setItem('tide_user_id', 'u1');
    markLogoutStarted();
    markLogoutStorageCleared();
    mayPersistSession();
});

describe('session record after logout', () => {
    it('may be written while signed in', () => {
        expect(mayPersistSession()).toBe(true);
    });

    it('may not be written without a user', () => {
        localStorage.clear();
        expect(mayPersistSession()).toBe(false);
    });

    it('clearAllSessionData blocks a later write (pagehide / 250 ms timer), also while the server logout is pending', async () => {
        let release: () => void = () => {};
        vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => { release = () => r(new Response(null, { status: 204 })); })));
        const done = clearAllSessionData({ callServerLogout: true });
        expect(mayPersistSession()).toBe(false);
        release();
        await done;
        expect(mayPersistSession()).toBe(false);
        const key = sessionStateKey('u1');
        expect(key && localStorage.getItem(key)).toBeNull();
    });

    it('allows writing again after a new login on the same page', async () => {
        await clearAllSessionData({ callServerLogout: false });
        expect(mayPersistSession()).toBe(false);
        localStorage.setItem('tide_user_id', 'u2');
        expect(mayPersistSession()).toBe(true);
    });
});
