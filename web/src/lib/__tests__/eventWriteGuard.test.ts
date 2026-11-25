import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiFetch } from '@/lib/api';
import {
    acquireEventWriteSlot, eventContentSignature, isNoneLikeRecurrenceRule, isUnchangedSinceLastWrite,
    normalizeRecurrenceRule, putEventGuarded, resetEventWriteGuard, EVENT_WRITE_MAX_PER_MINUTE,
} from '../eventWriteGuard';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn(), getApiBase: vi.fn().mockReturnValue('') }));

const res = (status: number, body: unknown = {}): Response =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('eventContentSignature', () => {
    it('ignores key order, list order, empty values and "no repetition" spellings', () => {
        const a = { title: 'A', completed_dates: ['2026-10-29', '2026-10-28'], recurrence_rule: 'NONE', is_completed: false, description: '' };
        const b = { completed_dates: ['2026-10-28', '2026-10-29'], title: 'A' };
        expect(eventContentSignature(a)).toBe(eventContentSignature(b));
        expect(eventContentSignature({ start: '2026-10-28T23:00:00Z' })).toBe(eventContentSignature({ start: '2026-10-28T23:00:00.000Z' }));
    });

    it('still tells real changes apart', () => {
        expect(eventContentSignature({ is_completed: true })).not.toBe(eventContentSignature({ is_completed: false }));
        expect(eventContentSignature({ recurrence_rule: 'FREQ=WEEKLY' })).not.toBe(eventContentSignature({}));
    });

    it('normalizes recurrence rules', () => {
        for (const none of ['', 'NONE', 'none', ' FREQ=NONE;INTERVAL=1 ', undefined, null]) expect(normalizeRecurrenceRule(none)).toBe('');
        expect(normalizeRecurrenceRule('freq=weekly;interval=2')).toBe('FREQ=WEEKLY;INTERVAL=2');
        expect(isNoneLikeRecurrenceRule('NONE')).toBe(true);
        expect(isNoneLikeRecurrenceRule('')).toBe(false);
        expect(isNoneLikeRecurrenceRule('FREQ=DAILY')).toBe(false);
    });
});

describe('write brake', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resetEventWriteGuard();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('lets a short burst through, then spaces writes to one per 2 s and warns', async () => {
        for (let i = 0; i < 3; i++) await expect(acquireEventWriteSlot('f')).resolves.toBe(true);
        let fourth = false;
        void acquireEventWriteSlot('f').then(() => { fourth = true; });
        await vi.advanceTimersByTimeAsync(1_000);
        expect(fourth).toBe(false);
        expect(console.warn).toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(5_100);
        expect(fourth).toBe(true);
        // Other files are not affected.
        await expect(acquireEventWriteSlot('g')).resolves.toBe(true);
    });

    it('a newer write for the same file replaces a waiting one', async () => {
        for (let i = 0; i < 3; i++) await acquireEventWriteSlot('f');
        const older = acquireEventWriteSlot('f');
        const newer = acquireEventWriteSlot('f');
        await vi.advanceTimersByTimeAsync(10_000);
        await expect(older).resolves.toBe(false);
        await expect(newer).resolves.toBe(true);
    });

    it('caps a file at EVENT_WRITE_MAX_PER_MINUTE writes per minute', async () => {
        let done = 0;
        const loop = (async () => {
            for (let i = 0; i < EVENT_WRITE_MAX_PER_MINUTE + 5; i++) {
                await acquireEventWriteSlot('f');
                done++;
            }
        })();
        await vi.advanceTimersByTimeAsync(59_000);
        expect(done).toBeLessThanOrEqual(EVENT_WRITE_MAX_PER_MINUTE);
        await vi.advanceTimersByTimeAsync(120_000);
        await loop;
        expect(done).toBe(EVENT_WRITE_MAX_PER_MINUTE + 5);
    });
});

describe('putEventGuarded', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resetEventWriteGuard();
        vi.mocked(apiFetch).mockReset();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const body = () => ({ version: 5, metadata: { title: 'T', is_completed: true, color: '#111' } });
    const opts = { signature: 'sig', ownKeys: ['is_completed', 'title'] };
    const puts = () => vi.mocked(apiFetch).mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PUT');

    it('remembers a successful write so an identical rewrite can be skipped', async () => {
        vi.mocked(apiFetch).mockResolvedValue(res(200, { version: 6 }));
        await expect(putEventGuarded('f', body(), opts)).resolves.toBe('written');
        expect(isUnchangedSinceLastWrite('f', 'sig', 6)).toBe(true);
        expect(isUnchangedSinceLastWrite('f', 'sig', 7)).toBe(false); // someone else wrote since
        expect(isUnchangedSinceLastWrite('f', 'other', 6)).toBe(false);
    });

    it('on 409 retries once with the fresh server state, keeping keys it does not own', async () => {
        vi.mocked(apiFetch)
            .mockResolvedValueOnce(res(409, { error: 'conflict', current_version: 9 }))
            .mockResolvedValueOnce(res(200, { version: 10, metadata: { title: 'T', is_completed: false, color: '#222' } }))
            .mockResolvedValueOnce(res(200, { version: 11 }));
        const p = putEventGuarded('f', body(), opts);
        await vi.advanceTimersByTimeAsync(1_000);
        await expect(p).resolves.toBe('written');
        expect(puts()).toHaveLength(2);
        const retry = JSON.parse(String((puts()[1][1] as RequestInit).body)) as { version: number; metadata: Record<string, unknown> };
        expect(retry.version).toBe(10);
        expect(retry.metadata).toEqual({ title: 'T', is_completed: true, color: '#222' });
    });

    it('skips the retry when the server already holds the wanted content', async () => {
        vi.mocked(apiFetch)
            .mockResolvedValueOnce(res(409, { current_version: 9 }))
            .mockResolvedValueOnce(res(200, { version: 9, metadata: { title: 'T', is_completed: true, color: '#999' } }));
        const p = putEventGuarded('f', body(), opts);
        await vi.advanceTimersByTimeAsync(1_000);
        await expect(p).resolves.toBe('unchanged');
        expect(puts()).toHaveLength(1);
    });

    it('gives up after the one retry (no endless loop) and warns; strict throws', async () => {
        vi.mocked(apiFetch).mockImplementation(async (_url, init) =>
            (init as RequestInit | undefined)?.method === 'PUT'
                ? res(409, { current_version: 9 })
                : res(200, { version: 9, metadata: { title: 'X' } }));
        const p = putEventGuarded('f', body(), opts);
        await vi.advanceTimersByTimeAsync(1_000);
        await expect(p).resolves.toBe('failed');
        expect(puts()).toHaveLength(2);
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Gave up'));

        const strict = putEventGuarded('f', body(), { ...opts, strict: true });
        const assertion = expect(strict).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(10_000);
        await assertion;
        expect(puts()).toHaveLength(4);
    });
});
