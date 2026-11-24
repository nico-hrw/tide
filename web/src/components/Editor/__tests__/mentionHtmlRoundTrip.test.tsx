import { afterEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor as TipTapEditor } from '@tiptap/core';
import { useTipTapConfig } from '../useTipTapConfig';
import { MentionNodeView } from '../MentionNodeView';
import { useDataStore } from '@/store/useDataStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let editorRef: TipTapEditor | null = null;
function Harness() {
    const { editor } = useTipTapConfig({ initialContent: '', activeTabId: 'note-1', myId: 'me' } as never);
    editorRef = editor as TipTapEditor | null;
    return null;
}

describe('contact mention HTML round trip', () => {
    let root: Root | null = null;
    let host: HTMLDivElement | null = null;
    afterEach(() => {
        act(() => root?.unmount());
        host?.remove();
        editorRef = null;
    });

    const mount = () => {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        act(() => root!.render(<Harness />));
        return editorRef!;
    };

    // span rule: the mark[data-type=mention] rule is shadowed by the Highlight mark (pre-existing, see report)
    const html = (shareable: boolean) =>
        `<p><span data-type="mention" data-id="u1" data-label="anna" data-type-link="contact"${shareable ? ' data-shareable="true"' : ''} class="mention">@anna</span></p>`;

    it('keeps type=contact and shareable=true through parse and render', () => {
        const editor = mount();
        editor.commands.setContent(html(true));
        const node = editor.state.doc.firstChild!.firstChild!;
        expect(node.type.name).toBe('mention');
        expect(node.attrs.type).toBe('contact');
        expect(node.attrs.shareable).toBe(true);
        const out = editor.getHTML();
        expect(out).toContain('data-type-link="contact"');
        expect(out).toContain('data-shareable="true"');
    });

    it('defaults shareable to false and does not render the attribute', () => {
        const editor = mount();
        editor.commands.setContent(html(false));
        expect(editor.state.doc.firstChild!.firstChild!.attrs.shareable).toBe(false);
        const out = editor.getHTML();
        expect(out).toContain('data-type-link="contact"');
        expect(out).not.toContain('data-shareable');
    });
});

describe('MentionNodeView dispatch', () => {
    let root: Root;
    let host: HTMLDivElement;
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });
    const render = (attrs: Record<string, unknown>) => {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        useDataStore.setState({ language: 'de', contacts: [], notes: [], events: [] } as never);
        act(() => root.render(<MentionNodeView node={{ attrs }} />));
    };

    it('renders the contact chip for type=contact', () => {
        render({ id: 'u1', label: 'anna', type: 'contact', shareable: true });
        expect(host.querySelector('[data-contact-chip]')).not.toBeNull();
    });

    it('renders the generic mention for other types', () => {
        render({ id: 'n1', label: 'Notiz', type: 'note' });
        expect(host.querySelector('[data-contact-chip]')).toBeNull();
        expect(host.textContent).toContain('@Notiz');
    });
});
