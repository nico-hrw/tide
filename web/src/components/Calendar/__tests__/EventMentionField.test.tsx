import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/lib/mentionShare', () => ({
    shareViaMention: vi.fn(async () => ({ status: 'shared' })),
    revokeMentionShare: vi.fn(async () => undefined),
    handleRemovedContactMentions: vi.fn(async () => undefined),
}));
vi.mock('@/lib/feedback', () => ({ askConfirm: vi.fn(), notifyError: vi.fn() }));

import { handleRemovedContactMentions, shareViaMention } from '@/lib/mentionShare';
import { useDataStore } from '@/store/useDataStore';
import { useMentionShareStore } from '@/store/useMentionShareStore';
import { EventMentionField } from '../EventMentionField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const shareMock = vi.mocked(shareViaMention);
const removedMock = vi.mocked(handleRemovedContactMentions);
const TOKEN = '[@anna](tide://contact/u1)';

describe('EventMentionField', () => {
    let root: Root;
    let host: HTMLDivElement;
    let latest = '';

    function Harness({ initial = '', eventId = 'e1', isPrivate = false }: { initial?: string; eventId?: string; isPrivate?: boolean }) {
        const [v, setV] = useState(initial);
        return <EventMentionField eventId={eventId} value={v} onChange={(s) => { latest = s; setV(s); }} isPrivate={isPrivate} />;
    }

    const ta = () => host.querySelector('textarea') as HTMLTextAreaElement;
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
    const flush = () => act(async () => { await Promise.resolve(); });

    beforeEach(() => {
        shareMock.mockClear();
        removedMock.mockClear();
        localStorage.clear();
        useMentionShareStore.setState({ userId: null, entries: {}, hint: null });
        useDataStore.setState({
            language: 'de',
            myId: 'me',
            events: [{ id: 'e1', title: 'Plan', type: 'event', owner_id: 'me' }],
            contacts: [
                { id: 'u1', username: 'anna', email: 'a@x.de', status: 'accepted', public_key: 'K', avatar_seed: 's', avatar_salt: '', avatar_style: 'notionists' },
                { id: 'u2', username: 'ben', status: 'pending', public_key: 'K' },
            ],
        } as never);
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });
    afterEach(() => { act(() => root.unmount()); host.remove(); });

    it('typing @ offers accepted contacts only (listbox with options)', () => {
        act(() => root.render(<Harness />));
        type('Mit @');
        const opts = [...host.querySelectorAll('[role="option"]')];
        expect(opts.map((o) => o.textContent)).toEqual(['anna']);
        expect(ta().getAttribute('role')).toBe('combobox');
        expect(ta().getAttribute('aria-activedescendant')).toBe(opts[0].id);
    });

    it('Enter picks: stores the token, shows @name in the text, shares the event as view once', async () => {
        act(() => root.render(<Harness />));
        type('Mit @an');
        key('Enter');
        await flush();
        expect(latest).toBe(`Mit ${TOKEN} `);
        expect(ta().value).toBe('Mit @anna ');
        expect(shareMock).toHaveBeenCalledTimes(1);
        expect(shareMock.mock.calls[0][0]).toMatchObject({ file: { id: 'e1', type: 'event' }, contact: { id: 'u1' }, callerCanShare: true });
        expect(host.querySelector('[data-event-mentions]')?.textContent).toContain('anna');
    });

    it('does not share while typing or on a plain @name (no pick)', () => {
        act(() => root.render(<Harness initial="" />));
        type('Hi @anna');
        key('Escape');
        expect(shareMock).not.toHaveBeenCalled();
        expect(latest).toBe('Hi @anna');
    });

    it('does not share when a stored description with a token is only loaded', async () => {
        act(() => root.render(<Harness initial={`Hi ${TOKEN}`} />));
        await flush();
        expect(shareMock).not.toHaveBeenCalled();
        expect(ta().value).toBe('Hi @anna');
    });

    it('a private event shows the private hint and inserts nothing', async () => {
        act(() => root.render(<Harness isPrivate />));
        type('@an');
        key('Enter');
        await flush();
        expect(latest).toBe('@an');
        expect(shareMock).not.toHaveBeenCalled();
        expect(useMentionShareStore.getState().hint).toMatchObject({ status: 'blocked', reason: 'private' });
        expect(host.querySelector('[role="status"]')?.textContent).toContain('Termin ist privat');
    });

    it('offers no menu for a foreign event or a draft', () => {
        useDataStore.setState({ events: [{ id: 'e1', title: 'x', type: 'event', owner_id: 'other' }] } as never);
        act(() => root.render(<Harness />));
        type('@an');
        expect(host.querySelector('[role="listbox"]')).toBeNull();
        act(() => root.render(<Harness eventId="" />));
        type('@an');
        expect(host.querySelector('[role="listbox"]')).toBeNull();
    });

    it('Escape closes the menu without touching the text', () => {
        act(() => root.render(<Harness />));
        type('@an');
        expect(host.querySelector('[role="listbox"]')).not.toBeNull();
        key('Escape');
        expect(host.querySelector('[role="listbox"]')).toBeNull();
        expect(latest).toBe('@an');
    });

    it('deleting the mention text asks about the revoke on blur, not while typing', () => {
        act(() => root.render(<Harness initial={`Hi ${TOKEN}`} />));
        act(() => { ta().focus(); });
        type('Hi @ann');
        expect(removedMock).not.toHaveBeenCalled();
        act(() => { ta().blur(); });
        expect(removedMock).toHaveBeenCalledWith('e1', [{ id: 'u1', label: 'anna' }]);
    });

    it('typing the name back before blur keeps the mention and asks nothing', () => {
        act(() => root.render(<Harness initial={`Hi ${TOKEN}`} />));
        act(() => { ta().focus(); });
        type('Hi @ann');
        type('Hi @anna');
        expect(latest).toBe(`Hi ${TOKEN}`);
        act(() => { ta().blur(); });
        expect(removedMock).not.toHaveBeenCalled();
    });

    it('the chip x removes the mention and asks about the revoke', () => {
        act(() => root.render(<Harness initial={`Hi ${TOKEN} da`} />));
        const x = host.querySelector('[data-event-mentions] button[aria-label]:not([data-contact-chip])') as HTMLButtonElement;
        act(() => x.click());
        expect(latest).toBe('Hi da');
        expect(removedMock).toHaveBeenCalledWith('e1', [{ id: 'u1', label: 'anna' }]);
    });
});
