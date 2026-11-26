import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useCalendarActions, type UseCalendarActionsReturn } from '../useCalendarActions';
import { useDataStore } from '@/store/useDataStore';
import { apiFetch } from '@/lib/api';
import { autoShareEventIntoGroups } from '@/lib/calendarShareActions';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn(), getApiBase: vi.fn().mockReturnValue('') }));
vi.mock('@/lib/crypto', async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    encryptMetadata: vi.fn(async () => 'cipher'),
}));
vi.mock('@/lib/cryptoV2', () => ({
    encryptFileV2: vi.fn(async () => ({ metadata: {}, encrypted_dek: 'k', content_ciphertext: 'c' })),
}));
vi.mock('@/lib/calendarShareActions', () => ({ autoShareEventIntoGroups: vi.fn(async () => ({ done: 0, failed: 0 })) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const key = {} as CryptoKey;
function hook(): UseCalendarActionsReturn {
    const out: { current: UseCalendarActionsReturn | null } = { current: null };
    const Probe = ({ onApi }: { onApi: (a: UseCalendarActionsReturn) => void }) => {
        const api = useCalendarActions({ publicKey: key, privateKey: key, myId: 'me' });
        useEffect(() => { onApi(api); });
        return null;
    };
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe onApi={(a) => { out.current = a; }} />));
    return out.current as unknown as UseCalendarActionsReturn;
}

describe('private events and calendar auto-share', () => {
    beforeEach(() => {
        vi.mocked(apiFetch).mockReset();
        vi.mocked(autoShareEventIntoGroups).mockClear();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(apiFetch).mockImplementation(async (_url: string, init?: RequestInit) =>
            ({ ok: true, status: 200, json: async () => (init?.method === 'POST' ? { id: 'copy' } : {}) }) as Response);
        useDataStore.setState({
            events: [{
                id: 'series', title: 'Weekly', type: 'event', start: '2026-01-05T10:00:00Z', end: '2026-01-05T11:00:00Z',
                groupIds: ['g1'], recurrence_rule: 'FREQ=WEEKLY;INTERVAL=1', private: true, owner_id: 'me',
            } as never],
            notes: [],
        });
    });

    it('moving one occurrence of a private series keeps the copy private and never auto-shares it', async () => {
        const ts = new Date('2026-01-12T10:00:00Z').getTime();
        await hook().handleEventSave(`series_${ts}`, { start: '2026-01-13T10:00:00Z', end: '2026-01-13T11:00:00Z' }, { scope: 'this' });
        const post = vi.mocked(apiFetch).mock.calls.find(([url, init]) => url === '/api/v1/files' && init?.method === 'POST');
        const body = JSON.parse(String(post?.[1]?.body)) as { metadata?: { private?: boolean } };
        expect(body.metadata?.private).toBe(true);
        expect(autoShareEventIntoGroups).not.toHaveBeenCalled();
    });

    it('a private new event is never auto-shared, a normal one is', async () => {
        const { handleEventCreate } = hook();
        await handleEventCreate(new Date(), new Date(), false, { title: 'P', groupIds: ['g1'], private: true });
        expect(autoShareEventIntoGroups).not.toHaveBeenCalled();
        await handleEventCreate(new Date(), new Date(), false, { title: 'N', groupIds: ['g1'] });
        expect(autoShareEventIntoGroups).toHaveBeenCalledWith('copy', ['g1']);
    });

    it('a save flagged skipAutoShare (tag migration) never auto-shares', async () => {
        useDataStore.setState({ events: [{ id: 'e1', title: 'E', type: 'event', start: '2026-01-05T10:00:00Z', end: '2026-01-05T11:00:00Z', owner_id: 'me' } as never] });
        await hook().handleEventSave('e1', { groupIds: ['g1'] }, { skipAutoShare: true });
        expect(autoShareEventIntoGroups).not.toHaveBeenCalled();
        await hook().handleEventSave('e1', { groupIds: ['g1', 'g2'] });
        expect(autoShareEventIntoGroups).toHaveBeenCalledWith('e1', ['g2']);
    });
});
