import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/lib/calendarShareActions', () => ({
    groupRecipientsWithShare: vi.fn(async () => ['anna']),
    revokeEventShares: vi.fn(async () => ({ done: 1, failed: 0 })),
}));
vi.mock('@/lib/mentionShare', () => ({
    shareViaMention: vi.fn(async () => ({ status: 'shared' })),
    revokeMentionShare: vi.fn(async () => undefined),
    handleRemovedContactMentions: vi.fn(async () => undefined),
}));
vi.mock('framer-motion', async () => {
    const React = await import('react');
    const MOTION_PROPS = ['initial', 'animate', 'exit', 'transition', 'drag', 'dragConstraints', 'dragElastic', 'onDragEnd'];
    const strip = (props: Record<string, unknown>) => Object.fromEntries(Object.entries(props).filter(([k]) => !MOTION_PROPS.includes(k)));
    return { motion: { div: (props: Record<string, unknown>) => React.createElement('div', strip(props)) } };
});
vi.mock('@/lib/feedback', () => ({ askConfirm: vi.fn(async () => true), notifyError: vi.fn() }));

import { revokeEventShares } from '@/lib/calendarShareActions';
import { useDataStore } from '@/store/useDataStore';
import { MobileEditEventSheet } from '../MobileEventEditSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('MobileEditEventSheet: Privat halten', () => {
    let root: Root;
    let host: HTMLDivElement;

    const render = (id: string, onSetPrivate?: (id: string, v: boolean) => Promise<void>) => act(() => root.render(
        <MobileEditEventSheet
            event={{ id, title: 'Plan', start: '2026-05-01T10:00:00Z', end: '2026-05-01T11:00:00Z', groupIds: ['g1'] }}
            onSave={vi.fn()}
            onDismiss={vi.fn()}
            onSetPrivate={onSetPrivate}
        />,
    ));
    const sw = () => host.querySelector('button[role="switch"]') as HTMLButtonElement | null;

    beforeEach(() => {
        vi.mocked(revokeEventShares).mockClear();
        localStorage.clear();
        useDataStore.setState({
            language: 'de',
            myId: 'me',
            events: [
                { id: 'e1', title: 'Plan', type: 'event', owner_id: 'me' },
                { id: 'e2', title: 'Fremd', type: 'event', owner_id: 'other' },
            ],
            contacts: [],
        } as never);
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });
    afterEach(() => { act(() => root.unmount()); host.remove(); });

    it('shows the lock for an own event', () => {
        render('e1', vi.fn(async () => undefined));
        expect(sw()).not.toBeNull();
        expect(host.textContent).toContain('Privat halten');
    });

    it('hides the lock for a foreign event, a draft, or without a save callback', () => {
        render('e2', vi.fn(async () => undefined));
        expect(sw()).toBeNull();
        render('', vi.fn(async () => undefined));
        expect(sw()).toBeNull();
        render('e1', undefined);
        expect(sw()).toBeNull();
    });

    it('saves through onSetPrivate before revoking', async () => {
        const order: string[] = [];
        vi.mocked(revokeEventShares).mockImplementationOnce(async () => { order.push('revoke'); return { done: 1, failed: 0 }; });
        const onSetPrivate = vi.fn(async () => { order.push('save'); });
        render('e1', onSetPrivate);
        await act(async () => { sw()!.click(); });
        expect(onSetPrivate).toHaveBeenCalledWith('e1', true);
        expect(order).toEqual(['save', 'revoke']);
        expect(sw()!.getAttribute('aria-checked')).toBe('true');
    });

    it('a failed save revokes nothing and the switch stays off', async () => {
        render('e1', vi.fn(async () => { throw new Error('offline'); }));
        await act(async () => { sw()!.click(); });
        expect(revokeEventShares).not.toHaveBeenCalled();
        expect(sw()!.getAttribute('aria-checked')).toBe('false');
    });
});
