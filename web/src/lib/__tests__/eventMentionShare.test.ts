import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/mentionShare', () => ({
    shareViaMention: vi.fn(),
    revokeMentionShare: vi.fn(),
    handleRemovedContactMentions: vi.fn(),
}));
vi.mock('@/lib/feedback', () => ({ askConfirm: vi.fn(), notifyError: vi.fn() }));

import { revokeMentionShare, shareViaMention } from '@/lib/mentionShare';
import { useDataStore } from '@/store/useDataStore';
import { useMentionShareStore } from '@/store/useMentionShareStore';
import { canMentionInEvent, precheckEventMention, shareEventViaMention, undoEventMentionShare } from '../eventMentionShare';

const shareMock = vi.mocked(shareViaMention);
const revokeMock = vi.mocked(revokeMentionShare);

const contact = { id: 'u1', email: 'a@x.de', username: 'anna', status: 'accepted', public_key: 'KEY' };

function setup(event: Record<string, unknown> | null, contacts: Array<Record<string, unknown>> = [contact]) {
    useDataStore.setState({
        myId: 'me',
        events: event ? [{ id: 'e1', title: 'Plan', type: 'event', owner_id: 'me', ...event }] : [],
        contacts,
    } as never);
}

beforeEach(() => {
    shareMock.mockReset();
    revokeMock.mockReset();
    localStorage.clear();
    useMentionShareStore.setState({ userId: null, entries: {}, hint: null });
});

describe('canMentionInEvent', () => {
    it('is true only for an own event that exists', () => {
        setup({});
        expect(canMentionInEvent('e1')).toBe(true);
        expect(canMentionInEvent('e1_1700000000000')).toBe(true); // occurrence -> base id
        expect(canMentionInEvent('missing')).toBe(false);
        setup({ owner_id: 'other' });
        expect(canMentionInEvent('e1')).toBe(false);
        setup({ owner_id: undefined, share_status: 'accepted' });
        expect(canMentionInEvent('e1')).toBe(false);
    });
});

describe('precheckEventMention', () => {
    it('passes for an own, non-private event and an accepted contact with a key', () => {
        setup({});
        expect(precheckEventMention({ eventId: 'e1', contactId: 'u1' })).toEqual({ ok: true });
    });
    it('blocks private events (store flag or live flag) and shows the hint', () => {
        setup({ private: true });
        expect(precheckEventMention({ eventId: 'e1', contactId: 'u1' })).toEqual({ ok: false, reason: 'private' });
        expect(useMentionShareStore.getState().hint).toMatchObject({ fileId: 'e1', status: 'blocked', reason: 'private' });
        setup({});
        expect(precheckEventMention({ eventId: 'e1', contactId: 'u1', isPrivate: true })).toEqual({ ok: false, reason: 'private' });
    });
    it('blocks foreign events, unconfirmed contacts and contacts without key', () => {
        setup({ owner_id: 'other' });
        expect(precheckEventMention({ eventId: 'e1', contactId: 'u1' })).toEqual({ ok: false, reason: 'not-allowed' });
        setup({}, [{ ...contact, status: 'pending' }]);
        expect(precheckEventMention({ eventId: 'e1', contactId: 'u1' })).toEqual({ ok: false, reason: 'not-shareable' });
        setup({}, [{ ...contact, public_key: undefined }]);
        expect(precheckEventMention({ eventId: 'e1', contactId: 'u1' })).toEqual({ ok: false, reason: 'no-key' });
    });
    it('does not call the share flow', () => {
        setup({ private: true });
        precheckEventMention({ eventId: 'e1', contactId: 'u1' });
        expect(shareMock).not.toHaveBeenCalled();
    });
});

describe('shareEventViaMention', () => {
    it('shares the base event file as an event with the contact and shows the hint', async () => {
        setup({});
        shareMock.mockResolvedValue({ status: 'shared' });
        const r = await shareEventViaMention({ eventId: 'e1_1700000000000', contactId: 'u1', label: 'anna' });
        expect(r.status).toBe('shared');
        expect(shareMock).toHaveBeenCalledWith({
            file: { id: 'e1', title: 'Plan', type: 'event' },
            contact: { id: 'u1', email: 'a@x.de', public_key: 'KEY', shareable: true },
            callerCanShare: true,
        });
        expect(useMentionShareStore.getState().hint).toMatchObject({ fileId: 'e1', contactId: 'u1', name: 'anna', status: 'shared', permission: 'view' });
    });
    it('shows no hint when the person already had access', async () => {
        setup({});
        shareMock.mockResolvedValue({ status: 'already' });
        await shareEventViaMention({ eventId: 'e1', contactId: 'u1', label: 'anna' });
        expect(useMentionShareStore.getState().hint).toBeNull();
    });
    it('shows the failure hint and never throws', async () => {
        setup({});
        shareMock.mockResolvedValue({ status: 'failed', reason: 'x' });
        const r = await shareEventViaMention({ eventId: 'e1', contactId: 'u1', label: 'anna' });
        expect(r.status).toBe('failed');
        expect(useMentionShareStore.getState().hint).toMatchObject({ status: 'failed' });
    });
    it('refuses without calling the share flow when the precheck fails', async () => {
        setup({ private: true });
        const r = await shareEventViaMention({ eventId: 'e1', contactId: 'u1', label: 'anna' });
        expect(r).toEqual({ status: 'blocked', reason: 'private' });
        expect(shareMock).not.toHaveBeenCalled();
    });
});

describe('undoEventMentionShare', () => {
    it('revokes on the base event and forgets the entry', async () => {
        setup({});
        useMentionShareStore.setState({ userId: 'me', entries: { 'e1:u1': 1 } });
        revokeMock.mockResolvedValue(undefined);
        expect(await undoEventMentionShare('e1_17', 'u1')).toBe(true);
        expect(revokeMock).toHaveBeenCalledWith('e1', 'u1');
        expect(useMentionShareStore.getState().origin('e1', 'u1')).toBeUndefined();
    });
    it('keeps the entry and reports false when the revoke fails', async () => {
        setup({});
        useMentionShareStore.getState().record('e1', 'u1');
        revokeMock.mockRejectedValue(new Error('403'));
        expect(await undoEventMentionShare('e1', 'u1')).toBe(false);
        expect(useMentionShareStore.getState().origin('e1', 'u1')).toBe('mention');
    });
});
