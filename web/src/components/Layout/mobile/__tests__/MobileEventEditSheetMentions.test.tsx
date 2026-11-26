import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

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
vi.mock('@/lib/feedback', () => ({ askConfirm: vi.fn(), notifyError: vi.fn() }));

import { handleRemovedContactMentions, revokeMentionShare, shareViaMention } from '@/lib/mentionShare';
import { useDataStore } from '@/store/useDataStore';
import { useMentionShareStore } from '@/store/useMentionShareStore';
import { MobileEditEventSheet } from '../MobileEventEditSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const revokeMock = vi.mocked(revokeMentionShare);
const removedMock = vi.mocked(handleRemovedContactMentions);
const TOKEN = '[@anna](tide://contact/u1)';

describe('MobileEditEventSheet mentions: discarding', () => {
    let root: Root;
    let host: HTMLDivElement;
    const onDismiss = vi.fn();
    const onSave = vi.fn();

    const render = (description = '') => act(() => root.render(
        <MobileEditEventSheet
            event={{ id: 'e1', title: 'Plan', start: '2026-05-01T10:00:00Z', end: '2026-05-01T11:00:00Z', description }}
            onSave={onSave}
            onDismiss={onDismiss}
        />,
    ));
    const ta = () => host.querySelector('textarea[aria-label="Notiz"]') as HTMLTextAreaElement;
    const type = (text: string) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
        act(() => {
            ta().focus();
            setter.call(ta(), text);
            ta().setSelectionRange(text.length, text.length);
            ta().dispatchEvent(new Event('input', { bubbles: true }));
        });
    };
    const key = (k: string) => act(() => { ta().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
    const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const closeBtn = () => host.querySelector('button[aria-label="Schließen"]') as HTMLButtonElement;

    beforeEach(() => {
        revokeMock.mockClear();
        removedMock.mockClear();
        vi.mocked(shareViaMention).mockClear();
        onDismiss.mockClear();
        onSave.mockClear();
        localStorage.clear();
        useMentionShareStore.setState({ userId: null, entries: {}, hint: null });
        useDataStore.setState({
            language: 'de',
            myId: 'me',
            events: [{ id: 'e1', title: 'Plan', type: 'event', owner_id: 'me' }],
            contacts: [{ id: 'u1', username: 'anna', email: 'a@x.de', status: 'accepted', public_key: 'K' }],
        } as never);
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });
    afterEach(() => { act(() => root.unmount()); host.remove(); });

    // The share records its origin (the real shareViaMention does; it is mocked here).
    const pick = async () => {
        vi.mocked(shareViaMention).mockImplementationOnce(async () => {
            useMentionShareStore.getState().record('e1', 'u1');
            return { status: 'shared' };
        });
        type('@an');
        key('Enter');
        await flush();
    };

    it('pick, then cancel: the share is revoked once', async () => {
        render();
        await pick();
        act(() => closeBtn().click());
        await flush();
        expect(revokeMock).toHaveBeenCalledTimes(1);
        expect(revokeMock).toHaveBeenCalledWith('e1', 'u1');
        expect(onDismiss).toHaveBeenCalled();
    });

    it('a share that existed before is not touched on cancel', async () => {
        useMentionShareStore.getState().record('e1', 'u1'); // earlier mention share
        render(`Hi ${TOKEN}`);
        act(() => closeBtn().click());
        await flush();
        expect(revokeMock).not.toHaveBeenCalled();
    });

    it('delete the token, then cancel: no revoke and no question', async () => {
        useMentionShareStore.getState().record('e1', 'u1');
        render(`Hi ${TOKEN}`);
        type('Hi ');
        act(() => closeBtn().click());
        act(() => root.unmount());
        root = createRoot(host);
        await flush();
        expect(revokeMock).not.toHaveBeenCalled();
        expect(removedMock).not.toHaveBeenCalled();
    });

    it('pick, then save: nothing is revoked', async () => {
        render();
        await pick();
        act(() => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
        await flush();
        expect(onSave).toHaveBeenCalled();
        expect(onSave.mock.calls[0][3].description).toContain(TOKEN);
        expect(revokeMock).not.toHaveBeenCalled();
    });
});
