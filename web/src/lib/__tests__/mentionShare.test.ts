import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/shareLogic', () => ({ performMessengerShare: vi.fn() }));
vi.mock('@/lib/feedback', () => ({ askConfirm: vi.fn(), notifyError: vi.fn() }));

import { apiFetch } from '@/lib/api';
import { performMessengerShare } from '@/lib/shareLogic';
import { askConfirm } from '@/lib/feedback';
import { useDataStore } from '@/store/useDataStore';
import { useMentionShareStore } from '@/store/useMentionShareStore';
import {
    callerCanShareFile,
    countContactMentions,
    handleRemovedContactMentions,
    removedContactMentions,
    revokeMentionShare,
    shareViaMention,
    stepsTouchContactMention,
} from '../mentionShare';

const apiFetchMock = vi.mocked(apiFetch);
const shareMock = vi.mocked(performMessengerShare);
const askMock = vi.mocked(askConfirm);

const file = { id: 'f1', title: 'Plan' };
const contact = { id: 'u1', email: 'anna@example.com', public_key: 'PUBKEY', shareable: true };

function sharesResponse(list: Array<{ user_id: string }>): Response {
    return new Response(JSON.stringify(list), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
    apiFetchMock.mockReset();
    shareMock.mockReset();
    askMock.mockReset();
    localStorage.clear();
    useMentionShareStore.setState({ entries: {}, hint: null });
    useDataStore.setState({
        privateKey: {} as CryptoKey,
        publicKey: {} as CryptoKey,
        myId: 'me',
        events: [],
    });
});

describe('shareViaMention', () => {
    it('(a) blocks an unshareable contact without any network call', async () => {
        const r = await shareViaMention({ file, contact: { ...contact, shareable: false }, callerCanShare: true });
        expect(r.status).toBe('blocked');
        expect(r.reason).toBe('not-shareable');
        expect(shareMock).not.toHaveBeenCalled();
        expect(apiFetchMock).not.toHaveBeenCalled();
    });

    it('blocks when the caller may not share, without any network call', async () => {
        const r = await shareViaMention({ file, contact, callerCanShare: false });
        expect(r).toEqual({ status: 'blocked', reason: 'not-allowed' });
        expect(shareMock).not.toHaveBeenCalled();
        expect(apiFetchMock).not.toHaveBeenCalled();
    });

    it('(b) reports failed and records nothing when the share throws', async () => {
        apiFetchMock.mockImplementation(async () => sharesResponse([]));
        shareMock.mockRejectedValue(new Error('boom'));
        const r = await shareViaMention({ file, contact, callerCanShare: true });
        expect(r.status).toBe('failed');
        expect(useMentionShareStore.getState().origin('f1', 'u1')).toBeUndefined();
    });

    it('(c) returns already when the user is in the share list: no share, no entry', async () => {
        apiFetchMock.mockImplementation(async () => sharesResponse([{ user_id: 'u1' }]));
        const r = await shareViaMention({ file, contact, callerCanShare: true });
        expect(r.status).toBe('already');
        expect(shareMock).not.toHaveBeenCalled();
        expect(useMentionShareStore.getState().origin('f1', 'u1')).toBeUndefined();
        expect(localStorage.getItem('tide_mention_shares') ?? '{}').not.toContain('u1');
    });

    it('(d) shares with view permission and records the entry', async () => {
        apiFetchMock.mockImplementation(async () => sharesResponse([]));
        shareMock.mockResolvedValue(undefined);
        const r = await shareViaMention({ file, contact, callerCanShare: true });
        expect(r.status).toBe('shared');
        expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/files/f1/shares');
        expect(shareMock).toHaveBeenCalledTimes(1);
        const args = shareMock.mock.calls[0];
        expect(args[0]).toEqual(file);
        expect(args[1]).toBe('me');
        expect(args[5]).toBe('u1');
        expect(args[6]).toBe('anna@example.com');
        expect(args[7]).toBe('PUBKEY');
        expect(args[8]).toBe('view');
        expect(args[10]).toBe(false);
        expect(useMentionShareStore.getState().origin('f1', 'u1')).toBe('mention');
        expect(localStorage.getItem('tide_mention_shares')).toContain('f1');
    });

    it('(e) two mentions of the same person share once; release reaches 0 only after the second', async () => {
        apiFetchMock
            .mockImplementationOnce(async () => sharesResponse([]))
            .mockImplementationOnce(async () => sharesResponse([{ user_id: 'u1' }]));
        shareMock.mockResolvedValue(undefined);
        const first = await shareViaMention({ file, contact, callerCanShare: true });
        const second = await shareViaMention({ file, contact, callerCanShare: true });
        expect(first.status).toBe('shared');
        expect(second.status).toBe('already');
        expect(shareMock).toHaveBeenCalledTimes(1);
        const store = useMentionShareStore.getState();
        expect(store.release('f1', 'u1')).toBe(1);
        expect(store.release('f1', 'u1')).toBe(0);
        expect(store.origin('f1', 'u1')).toBe('mention');
    });

    it('concurrent mentions of the same person share once', async () => {
        apiFetchMock.mockImplementation(async () => sharesResponse([]));
        shareMock.mockResolvedValue(undefined);
        const [a, b] = await Promise.all([
            shareViaMention({ file, contact, callerCanShare: true }),
            shareViaMention({ file, contact, callerCanShare: true }),
        ]);
        expect([a.status, b.status].sort()).toEqual(['already', 'shared']);
        expect(shareMock).toHaveBeenCalledTimes(1);
        expect(useMentionShareStore.getState().release('f1', 'u1')).toBe(1);
    });

    it('fails without a network call when the share list cannot be read', async () => {
        apiFetchMock.mockImplementation(async () => new Response('no', { status: 403 }));
        const r = await shareViaMention({ file, contact, callerCanShare: true });
        expect(r.status).toBe('failed');
        expect(shareMock).not.toHaveBeenCalled();
    });
});

describe('revokeMentionShare', () => {
    it('(f) sends DELETE to the share URL', async () => {
        apiFetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
        await revokeMentionShare('f1', 'u1');
        expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/files/f1/shares/u1', { method: 'DELETE' });
    });

    it('throws when the server refuses', async () => {
        apiFetchMock.mockResolvedValue(new Response('no', { status: 403 }));
        await expect(revokeMentionShare('f1', 'u1')).rejects.toThrow();
    });
});

describe('callerCanShareFile', () => {
    it('allows the owner only', () => {
        expect(callerCanShareFile({ owner_id: 'me' }, 'me', 'owner')).toBe(true);
        expect(callerCanShareFile({ share_status: 'owner' }, 'me', 'owner')).toBe(true);
        expect(callerCanShareFile({ owner_id: 'x', share_status: 'accepted', permission: 'edit', can_reshare: true }, 'me', 'edit')).toBe(false);
        expect(callerCanShareFile({ owner_id: 'x', share_status: 'accepted', permission: 'view' }, 'me', 'view')).toBe(false);
        expect(callerCanShareFile({ owner_id: 'me' }, 'me', 'view')).toBe(false);
        expect(callerCanShareFile(undefined, 'me', 'owner')).toBe(false);
        expect(callerCanShareFile({ owner_id: 'me' }, null, 'owner')).toBe(false);
    });
});

describe('removedContactMentions', () => {
    type FakeNode = { type: { name: string }; attrs: Record<string, unknown> };
    const doc = (nodes: FakeNode[]) => ({
        descendants: (cb: (n: FakeNode) => boolean | void) => { nodes.forEach((n) => cb(n)); },
    });
    const m = (id: string, type = 'contact', label = id): FakeNode => ({ type: { name: 'mention' }, attrs: { id, type, label } });

    it('counts contact mentions only', () => {
        const c = countContactMentions(doc([m('u1'), m('u1'), m('n1', 'note'), m('u2')]));
        expect([...c.entries()]).toEqual([['u1', { count: 2, label: 'u1' }], ['u2', { count: 1, label: 'u2' }]]);
    });

    it('lists one entry per removed chip', () => {
        const before = doc([m('u1'), m('u1'), m('u2')]);
        const after = doc([m('u1')]);
        expect(removedContactMentions(before, after)).toEqual([
            { id: 'u1', label: 'u1' },
            { id: 'u2', label: 'u2' },
        ]);
    });
});

describe('handleRemovedContactMentions', () => {
    it('asks nothing for a share that no mention created', async () => {
        await handleRemovedContactMentions('f1', [{ id: 'u1', label: 'anna' }]);
        expect(askMock).not.toHaveBeenCalled();
        expect(apiFetchMock).not.toHaveBeenCalled();
    });

    it('asks only when the last chip is gone, then revokes on yes', async () => {
        const store = useMentionShareStore.getState();
        store.record('f1', 'u1');
        store.record('f1', 'u1');
        await handleRemovedContactMentions('f1', [{ id: 'u1', label: 'anna' }]);
        expect(askMock).not.toHaveBeenCalled();

        askMock.mockResolvedValue(true);
        apiFetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
        await handleRemovedContactMentions('f1', [{ id: 'u1', label: 'anna' }]);
        expect(askMock).toHaveBeenCalledTimes(1);
        expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/files/f1/shares/u1', { method: 'DELETE' });
        expect(useMentionShareStore.getState().origin('f1', 'u1')).toBeUndefined();
    });

    it('keeps access on no', async () => {
        useMentionShareStore.getState().record('f1', 'u1');
        askMock.mockResolvedValue(false);
        await handleRemovedContactMentions('f1', [{ id: 'u1', label: 'anna' }]);
        expect(apiFetchMock).not.toHaveBeenCalled();
        expect(useMentionShareStore.getState().origin('f1', 'u1')).toBe('mention');
    });

    it('ignores quicknote editors', async () => {
        useMentionShareStore.getState().record('quicknote:x', 'u1');
        await handleRemovedContactMentions('quicknote:x', [{ id: 'u1', label: 'anna' }]);
        expect(askMock).not.toHaveBeenCalled();
    });
});

describe('stepsTouchContactMention', () => {
    type N = { type: { name: string }; attrs: Record<string, unknown> };
    const step = (from: number, to: number) => ({ getMap: () => ({ forEach: (fn: (a: number, b: number) => void) => fn(from, to) }) });
    const docWith = (nodes: Array<[number, N]>) => ({
        nodesBetween: (from: number, to: number, cb: (n: N) => boolean | void) => {
            for (const [p, n] of nodes) if (p >= from && p < to) cb(n);
        },
    });
    const chip: N = { type: { name: 'mention' }, attrs: { id: 'u1', type: 'contact' } };
    const note: N = { type: { name: 'mention' }, attrs: { id: 'n1', type: 'note' } };

    it('is true only when a replaced range held a contact chip', () => {
        expect(stepsTouchContactMention({ steps: [step(4, 6)], docs: [docWith([[5, chip]])] })).toBe(true);
        expect(stepsTouchContactMention({ steps: [step(4, 6)], docs: [docWith([[5, note]])] })).toBe(false);
        expect(stepsTouchContactMention({ steps: [step(7, 7)], docs: [docWith([[5, chip]])] })).toBe(false);
    });
});
