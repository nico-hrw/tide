import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('@/lib/calendarShareActions', () => ({
    groupRecipientsWithShare: vi.fn(async () => ['anna']),
    revokeEventShares: vi.fn(async () => ({ done: 1, failed: 0 })),
}));
vi.mock('@/lib/feedback', () => ({ askConfirm: vi.fn(async () => true), notifyError: vi.fn() }));

import { revokeEventShares } from '@/lib/calendarShareActions';
import { notifyError } from '@/lib/feedback';
import { useDataStore } from '@/store/useDataStore';
import { EventPrivateToggle } from '../EventPrivateToggle';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderToggle(onChange: (next: boolean) => Promise<void>) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => createRoot(host).render(<EventPrivateToggle eventId="e1" isPrivate={false} onChange={onChange} />));
    return host.querySelector('button[role="switch"]') as HTMLButtonElement;
}

beforeEach(() => {
    document.body.innerHTML = '';
    vi.mocked(revokeEventShares).mockClear();
    vi.mocked(notifyError).mockClear();
    useDataStore.setState({ myId: 'me', language: 'de', events: [{ id: 'e1', owner_id: 'me' }] } as never);
});

describe('EventPrivateToggle', () => {
    it('revokes only after the private flag was saved', async () => {
        const order: string[] = [];
        vi.mocked(revokeEventShares).mockImplementationOnce(async () => { order.push('revoke'); return { done: 1, failed: 0 }; });
        const sw = renderToggle(async () => { order.push('save'); });
        await act(async () => { sw.click(); });
        expect(order).toEqual(['save', 'revoke']);
    });

    it('a failed save revokes nothing and shows an error', async () => {
        const sw = renderToggle(async () => { throw new Error('offline'); });
        await act(async () => { sw.click(); });
        expect(revokeEventShares).not.toHaveBeenCalled();
        expect(notifyError).toHaveBeenCalled();
    });
});
