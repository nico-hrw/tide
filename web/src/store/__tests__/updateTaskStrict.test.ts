import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDataStore } from '../useDataStore';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({
    apiFetch: vi.fn(),
    getApiBase: vi.fn().mockReturnValue(''),
}));
vi.mock('@/lib/crypto', async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    encryptMetadata: vi.fn(async () => 'cipher'),
}));

const fakeKey = {} as CryptoKey;

describe('updateTask strict option', () => {
    beforeEach(() => {
        vi.mocked(apiFetch).mockReset();
        useDataStore.setState({
            tasks: [{ id: 't1', title: 'T', isCompleted: false, tags: ['a'] }],
            publicKey: fakeKey,
        });
    });

    it('strict: rejects on a failing PUT', async () => {
        vi.mocked(apiFetch).mockResolvedValue({ ok: false, status: 500 } as Response);
        await expect(useDataStore.getState().updateTask('t1', { tags: [] }, { strict: true })).rejects.toThrow();
    });

    it('default: does not reject on a failing PUT', async () => {
        vi.mocked(apiFetch).mockResolvedValue({ ok: false, status: 500 } as Response);
        await expect(useDataStore.getState().updateTask('t1', { tags: [] })).resolves.toBeUndefined();
    });

    it('strict: resolves on success', async () => {
        vi.mocked(apiFetch).mockResolvedValue({ ok: true, status: 200 } as Response);
        await expect(useDataStore.getState().updateTask('t1', { tags: [] }, { strict: true })).resolves.toBeUndefined();
    });

    it('strict: rejects when keys are missing, default stays silent', async () => {
        useDataStore.setState({ publicKey: null });
        await expect(useDataStore.getState().updateTask('t1', { tags: [] }, { strict: true })).rejects.toThrow();
        await expect(useDataStore.getState().updateTask('t1', { tags: [] })).resolves.toBeUndefined();
    });

    it('strict: rejects when the task is unknown, default stays silent', async () => {
        await expect(useDataStore.getState().updateTask('nope', { tags: [] }, { strict: true })).rejects.toThrow();
        await expect(useDataStore.getState().updateTask('nope', { tags: [] })).resolves.toBeUndefined();
    });
});
