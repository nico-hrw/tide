import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('@/lib/calendarShareActions', () => ({
    startGroupSync: vi.fn(),
    groupSyncInFlight: vi.fn(() => undefined),
    loadGroupEvents: vi.fn(async () => []),
}));
vi.mock('@/lib/feedback', () => ({ notify: vi.fn(), notifyError: vi.fn() }));

import { startGroupSync } from '@/lib/calendarShareActions';
import { useDataStore } from '@/store/useDataStore';
import { setCalendarShareStorageFactory, useCalendarShareStore } from '@/store/useCalendarShareStore';
import type { CalendarShareRules } from '@/lib/calendarShare';
import { CalendarShareDialog } from '../CalendarShareDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const annaRule: CalendarShareRules = { g1: { groupId: 'g1', recipients: [{ userId: 'anna', permission: 'view' }], autoShareNew: true } };
let stored: CalendarShareRules = {};
let release: (() => void) | null = null;
let failLoad = false;

function render() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<CalendarShareDialog group={{ id: 'g1', title: 'Arbeit' }} onClose={() => {}} />));
    return root;
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
/** Lets queued saves/loads run, answering every storage read that comes up. */
const settle = async () => { for (let i = 0; i < 6; i++) { await flush(); await act(async () => { release?.(); }); } };
const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement | undefined;

beforeEach(() => {
    document.body.innerHTML = '';
    stored = annaRule;
    failLoad = false;
    release = null;
    vi.mocked(startGroupSync).mockReset();
    useDataStore.setState({ myId: 'me', language: 'de', contacts: [{ id: 'anna', username: 'Anna', status: 'accepted', public_key: 'PK' }] } as never);
    useCalendarShareStore.setState({ userId: null, rules: {}, status: 'idle', loadedAt: 0 });
    setCalendarShareStorageFactory(() => ({
        load: () => new Promise<CalendarShareRules>((resolve, reject) => {
            release = () => (failLoad ? reject(new Error('offline')) : resolve(stored));
        }),
        save: async (r) => { stored = r; },
    }));
});

describe('CalendarShareDialog', () => {
    it('shows no form and cannot confirm until the stored rule is loaded, then seeds from it', async () => {
        render();
        expect(document.body.textContent).toContain('Freigaben werden geladen');
        expect(button('Teilen')?.disabled).toBe(true);
        expect(document.body.textContent).not.toContain('Anna');
        await act(async () => { release?.(); });
        await flush();
        expect(document.body.textContent).toContain('Anna');
        expect(button('Speichern')).toBeDefined();
    });

    it('a failed load shows an error with retry and keeps confirm disabled', async () => {
        failLoad = true;
        render();
        await act(async () => { release?.(); });
        await flush();
        expect(document.querySelector('[role="alert"]')?.textContent).toContain('Erneut versuchen');
        expect(button('Teilen')?.disabled).toBe(true);
    });

    it('removing everyone shows the outcome; a failure shows "fehlgeschlagen · Erneut versuchen"', async () => {
        vi.mocked(startGroupSync).mockResolvedValueOnce({ done: 0, failed: 1, total: 1, events: [], pendingRevoke: ['anna'], persistFailed: false });
        render();
        await act(async () => { release?.(); });
        await flush();
        act(() => (document.querySelector('button[aria-label="Anna entfernen"]') as HTMLButtonElement).click());
        const save = button('Speichern') as HTMLButtonElement;
        // double click: only one save + sync
        act(() => { save.click(); save.click(); });
        await settle();
        expect(startGroupSync).toHaveBeenCalledTimes(1);
        expect(vi.mocked(startGroupSync).mock.calls[0][0].rule.pendingRevoke).toEqual(['anna']);
        expect(document.body.textContent).toContain('1 von 1 fehlgeschlagen');
        expect(button('Erneut versuchen')).toBeDefined();
    });

    it('removing everyone successfully says so', async () => {
        vi.mocked(startGroupSync).mockResolvedValueOnce({ done: 1, failed: 0, total: 1, events: [], pendingRevoke: [], persistFailed: false });
        render();
        await act(async () => { release?.(); });
        await flush();
        act(() => (document.querySelector('button[aria-label="Anna entfernen"]') as HTMLButtonElement).click());
        act(() => (button('Speichern') as HTMLButtonElement).click());
        await settle();
        expect(document.body.textContent).toContain('Zugriff auf alle Termine entzogen');
    });

    it('opening with pending removals runs a revoke-only sync, no sharing', async () => {
        stored = { g1: { ...annaRule.g1, pendingRevoke: ['bob'] } };
        vi.mocked(startGroupSync).mockResolvedValueOnce({ done: 1, failed: 0, total: 1, events: [], pendingRevoke: [], persistFailed: false });
        render();
        await settle();
        expect(startGroupSync).toHaveBeenCalledTimes(1);
        expect(vi.mocked(startGroupSync).mock.calls[0][0].mode).toBe('revoke-only');
    });

    it('confirm runs a full sync; a running sync gets its own message', async () => {
        vi.mocked(startGroupSync).mockRejectedValueOnce(new Error('sync-running'));
        render();
        await settle();
        act(() => (document.querySelector('button[aria-label="Anna entfernen"]') as HTMLButtonElement).click());
        act(() => (button('Speichern') as HTMLButtonElement).click());
        await settle();
        expect(vi.mocked(startGroupSync).mock.calls[0][0].mode).toBe('full');
        expect(document.body.textContent).toContain('Eine Freigabe läuft bereits');
    });

    it('confirm unions its pending removals with entries another device added meanwhile', async () => {
        vi.mocked(startGroupSync).mockResolvedValueOnce({ done: 1, failed: 0, total: 1, events: [], pendingRevoke: [], persistFailed: false });
        render();
        await settle();
        stored = { g1: { ...annaRule.g1, pendingRevoke: ['carl'] } }; // written elsewhere after the dialog loaded
        act(() => (document.querySelector('button[aria-label="Anna entfernen"]') as HTMLButtonElement).click());
        act(() => (button('Speichern') as HTMLButtonElement).click());
        await settle();
        expect(stored.g1?.pendingRevoke?.sort()).toEqual(['anna', 'carl']);
    });
});
