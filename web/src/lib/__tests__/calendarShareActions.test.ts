import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/shareLogic', () => ({ performMessengerShare: vi.fn() }));
vi.mock('@/lib/feedback', () => ({ askConfirm: vi.fn(), notify: vi.fn(), notifyError: vi.fn() }));

import { apiFetch } from '@/lib/api';
import { performMessengerShare } from '@/lib/shareLogic';
import { useDataStore } from '@/store/useDataStore';
import { setCalendarShareStorageFactory, useCalendarShareStore } from '@/store/useCalendarShareStore';
import type { CalendarShareRules } from '../calendarShare';
import { autoShareEventIntoGroups, groupRecipientsWithShare, shareEventWithContact, syncGroupShares } from '../calendarShareActions';

const apiMock = vi.mocked(apiFetch);
const shareMock = vi.mocked(performMessengerShare);

const rules: CalendarShareRules = { g1: { groupId: 'g1', recipients: [{ userId: 'anna', permission: 'view' }], autoShareNew: true } };
let lists: Record<string, string[] | 'error'> = {};
let deletes: string[] = [];

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
    lists = {};
    deletes = [];
    shareMock.mockReset();
    apiMock.mockReset();
    apiMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const m = url.match(/\/files\/([^/]+)\/shares(?:\/([^/]+))?$/);
        if (m && init?.method === 'DELETE') { deletes.push(`${m[1]}:${m[2]}`); return json({}); }
        if (m) {
            const l = lists[m[1]];
            return l === 'error' ? json({}, 500) : json((l ?? []).map((user_id) => ({ user_id })));
        }
        return json({}, 404);
    });
    useDataStore.setState({
        myId: 'me',
        privateKey: {} as CryptoKey,
        publicKey: {} as CryptoKey,
        contacts: [{ id: 'anna', username: 'Anna', status: 'accepted', public_key: 'PK', email: 'a@x' }, { id: 'bob', username: 'Bob', status: 'pending', public_key: 'PK' }],
        events: [
            { id: 'e1', title: 'A', groupIds: ['g1'], owner_id: 'me' },
            { id: 'e2', title: 'B', groupIds: ['g1'], owner_id: 'me', private: true },
            { id: 'e3', title: 'C', groupIds: ['g1'], owner_id: 'other' },
        ],
    } as never);
    setCalendarShareStorageFactory(() => ({ load: async () => rules, save: async () => {} }));
    useCalendarShareStore.setState({ userId: null, rules: {}, status: 'idle' });
});

describe('shareEventWithContact', () => {
    it('refuses unconfirmed contacts and foreign events without calling share', async () => {
        await expect(shareEventWithContact('e1', 'bob', 'view')).rejects.toThrow('not-shareable');
        await expect(shareEventWithContact('e3', 'anna', 'view')).rejects.toThrow('not-owner');
        expect(shareMock).not.toHaveBeenCalled();
    });

    it('counts a share that landed before the chat notice failed, and nothing else', async () => {
        shareMock.mockRejectedValueOnce(new Error('message failed'));
        lists.e1 = ['anna'];
        await expect(shareEventWithContact('e1', 'anna', 'view')).resolves.toBeUndefined();
        shareMock.mockRejectedValueOnce(new Error('share failed'));
        lists.e1 = [];
        await expect(shareEventWithContact('e1', 'anna', 'view')).rejects.toThrow('share failed');
    });
});

describe('autoShareEventIntoGroups', () => {
    it('shares a new own event with the rule recipients', async () => {
        await expect(autoShareEventIntoGroups('e1', ['g1'])).resolves.toEqual({ done: 1, failed: 0 });
        expect(shareMock).toHaveBeenCalledTimes(1);
        expect(shareMock.mock.calls[0][5]).toBe('anna');
    });

    it('never shares private, foreign or already shared events', async () => {
        await autoShareEventIntoGroups('e2', ['g1']);
        await autoShareEventIntoGroups('e3', ['g1']);
        lists.e1 = ['anna'];
        await autoShareEventIntoGroups('e1', ['g1']);
        expect(shareMock).not.toHaveBeenCalled();
    });

    it('does nothing without a rule or with auto-share off', async () => {
        await autoShareEventIntoGroups('e1', ['g9']);
        setCalendarShareStorageFactory(() => ({ load: async () => ({ g1: { ...rules.g1, autoShareNew: false } }), save: async () => {} }));
        useCalendarShareStore.setState({ userId: null, rules: {}, status: 'idle' });
        await autoShareEventIntoGroups('e1', ['g1']);
        expect(shareMock).not.toHaveBeenCalled();
    });
});

describe('syncGroupShares', () => {
    it('revokes a removed person on every own event of the group, private ones too', async () => {
        lists = { e1: ['bob'], e2: ['bob'] };
        const res = await syncGroupShares({ rule: { ...rules.g1, recipients: [] }, removed: ['bob'], permissionChanged: [] });
        expect(deletes.sort()).toEqual(['e1:bob', 'e2:bob']);
        expect(res).toMatchObject({ done: 2, failed: 0, total: 2 });
        expect(shareMock).not.toHaveBeenCalled();
    });

    it('reports failures and does not count them as shared', async () => {
        shareMock.mockRejectedValue(new Error('down'));
        const res = await syncGroupShares({ rule: rules.g1, removed: [], permissionChanged: [] });
        expect(res).toMatchObject({ done: 0, failed: 1, total: 1 });
        expect(res.events.find((e) => e.id === 'e1')?.sharedWith).toEqual([]);
    });

    it('leaves events with an unreadable share list alone', async () => {
        lists.e1 = 'error';
        const res = await syncGroupShares({ rule: rules.g1, removed: [], permissionChanged: [] });
        expect(res.total).toBe(0);
        expect(shareMock).not.toHaveBeenCalled();
    });
});

describe('groupRecipientsWithShare', () => {
    it('lists only group recipients that have the event, null when unreadable', async () => {
        lists.e1 = ['anna', 'zoe'];
        await expect(groupRecipientsWithShare('e1_1700000000000')).resolves.toEqual(['anna']);
        lists.e1 = 'error';
        await expect(groupRecipientsWithShare('e1')).resolves.toBeNull();
    });
});
