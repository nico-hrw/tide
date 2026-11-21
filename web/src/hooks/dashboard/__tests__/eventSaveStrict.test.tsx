import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useCalendarActions, type UseCalendarActionsReturn } from '../useCalendarActions';
import { useDataStore } from '@/store/useDataStore';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn(), getApiBase: vi.fn().mockReturnValue('') }));
vi.mock('@/lib/crypto', async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    encryptMetadata: vi.fn(async () => 'cipher'),
}));
vi.mock('@/lib/cryptoV2', () => ({
    encryptFileV2: vi.fn(async () => ({ metadata: {}, encrypted_dek: 'k', content_ciphertext: 'c' })),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const key = {} as CryptoKey;
function hook(keys: CryptoKey | null): UseCalendarActionsReturn {
    let api: UseCalendarActionsReturn | null = null;
    const Probe = () => {
        api = useCalendarActions({ publicKey: keys, privateKey: keys, myId: 'me' });
        return null;
    };
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe />));
    return api as unknown as UseCalendarActionsReturn;
}

describe('handleEventSave strict option', () => {
    beforeEach(() => {
        vi.mocked(apiFetch).mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        useDataStore.setState({
            events: [{ id: 'e1', title: 'E', type: 'event', start: '2026-01-01T10:00:00Z', end: '2026-01-01T11:00:00Z', groupIds: ['a'] } as never],
            notes: [],
        });
    });

    it('strict: rejects on a failing PUT, default does not', async () => {
        vi.mocked(apiFetch).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
        const { handleEventSave } = hook(key);
        await expect(handleEventSave('e1', { groupIds: [] }, { strict: true })).rejects.toThrow();
        await expect(handleEventSave('e1', { groupIds: [] })).resolves.toBeUndefined();
    });

    it('strict: resolves on a successful PUT', async () => {
        vi.mocked(apiFetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response);
        await expect(hook(key).handleEventSave('e1', { groupIds: [] }, { strict: true })).resolves.toBeUndefined();
    });

    it('strict: rejects without keys or unknown event, default stays silent', async () => {
        await expect(hook(null).handleEventSave('e1', { groupIds: [] }, { strict: true })).rejects.toThrow();
        await expect(hook(null).handleEventSave('e1', { groupIds: [] })).resolves.toBeUndefined();
        await expect(hook(key).handleEventSave('zzz', { groupIds: [] }, { strict: true })).rejects.toThrow();
        await expect(hook(key).handleEventSave('zzz', { groupIds: [] })).resolves.toBeUndefined();
    });
});
