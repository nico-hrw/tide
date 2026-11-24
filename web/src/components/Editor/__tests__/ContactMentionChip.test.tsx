import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { NodeViewProps } from '@tiptap/react';
import { ContactMentionChip } from '../ContactMentionChip';
import { useDataStore } from '@/store/useDataStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ContactMentionChip', () => {
    let root: Root;
    let host: HTMLDivElement;
    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        useDataStore.setState({
            language: 'de',
            contacts: [{ id: 'u1', username: 'anna', avatar_seed: 's1', avatar_salt: 'x', avatar_style: 'notionists', status: 'accepted' }],
        } as never);
    });
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    const props = (attrs: Record<string, unknown>) =>
        ({ node: { attrs: { id: 'u1', label: 'old-label', type: 'contact', ...attrs } } }) as unknown as NodeViewProps;
    const chipBtn = () => host.querySelector('[data-contact-chip]') as HTMLButtonElement;
    const card = () => host.querySelector('[data-contact-card]') as HTMLElement | null;

    it('renders the live name and an avatar', () => {
        act(() => root.render(<ContactMentionChip {...props({ shareable: true })} />));
        expect(chipBtn().textContent).toContain('anna');
        expect(chipBtn().textContent).not.toContain('old-label');
        expect(chipBtn().querySelector('img')).not.toBeNull();
        expect(chipBtn().textContent).not.toContain('nicht geteilt');
    });

    it('falls back to the node label when the contact is unknown', () => {
        act(() => root.render(<ContactMentionChip {...props({ id: 'zzz', label: 'bob' })} />));
        expect(chipBtn().textContent).toContain('bob');
    });

    it('opens the card on click and dispatches tide:open-profile', () => {
        act(() => root.render(<ContactMentionChip {...props({ shareable: true })} />));
        expect(card()).toBeNull();
        act(() => chipBtn().click());
        expect(card()).not.toBeNull();
        expect(card()!.textContent).toContain('@anna');
        expect(card()!.textContent).toContain('Kann diese Notiz ansehen');
        const spy = vi.fn();
        window.addEventListener('tide:open-profile', spy);
        const open = card()!.querySelector('[data-contact-open-profile]') as HTMLButtonElement;
        act(() => open.click());
        window.removeEventListener('tide:open-profile', spy);
        expect(spy).toHaveBeenCalledTimes(1);
        expect((spy.mock.calls[0][0] as CustomEvent).detail).toEqual({ userId: 'u1', username: 'anna' });
    });

    it('shows "nicht geteilt" when shareable is false and no view line in the card', () => {
        act(() => root.render(<ContactMentionChip {...props({ shareable: false })} />));
        expect(chipBtn().textContent).toContain('nicht geteilt');
        act(() => chipBtn().click());
        expect(card()!.textContent).not.toContain('Kann diese Notiz ansehen');
    });

    it('closes on Escape and returns focus to the chip', () => {
        act(() => root.render(<ContactMentionChip {...props({ shareable: true })} />));
        act(() => chipBtn().click());
        expect(card()).not.toBeNull();
        act(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        expect(card()).toBeNull();
        expect(document.activeElement).toBe(chipBtn());
    });

    it('closes on outside mousedown', () => {
        act(() => root.render(<ContactMentionChip {...props({ shareable: true })} />));
        act(() => chipBtn().click());
        act(() => {
            document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        });
        expect(card()).toBeNull();
    });
});
