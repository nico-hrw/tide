import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })) }));
vi.mock('@/lib/feedback', () => ({ notify: vi.fn(), notifyError: vi.fn(), askConfirm: vi.fn() }));

import { useDataStore } from '@/store/useDataStore';
import ShareModal from '../ShareModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(callerPermission: 'owner' | 'edit' | 'share') {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<ShareModal fileId="f1" fileName="Notiz" onClose={() => {}} onShare={async () => {}} myId="me" callerPermission={callerPermission} />));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const tiles = () => [...document.querySelectorAll('button')].map((b) => b.textContent ?? '');

beforeEach(() => {
    document.body.innerHTML = '';
    useDataStore.setState({ myId: 'me', language: 'de' } as never);
});

describe('ShareModal invite picker', () => {
    it('hides the share tile for owners and titles the dialog', async () => {
        await render('owner');
        expect(document.querySelector('[role=dialog] h2')?.textContent).toBe('Teilen · Notiz');
        expect(tiles().some((t) => t.startsWith('Ansehen'))).toBe(true);
        expect(tiles().some((t) => t.startsWith('Teilen'))).toBe(false);
    });
    it('shows the share tile for non-owners', async () => {
        await render('share');
        expect(tiles().some((t) => t.startsWith('Teilen'))).toBe(true);
    });
});
