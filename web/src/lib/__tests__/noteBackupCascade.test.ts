import { describe, it, expect } from 'vitest';
import {
    BACKUP_TIERS,
    type BackupSlotMeta,
    type BackupSlotName,
    areSnapshotsEquivalent,
    chooseArchiveCandidate,
    isBackupSlotName,
    planBackupCascade,
} from '../noteBackupCascade';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const BASE_NOW = 1_700_000_000_000;

function applyActions(
    slots: Partial<Record<BackupSlotName, { content: string; updatedAtMs: number }>>,
    actions: ReturnType<typeof planBackupCascade>
): Partial<Record<BackupSlotName, { content: string; updatedAtMs: number }>> {
    const next: Partial<Record<BackupSlotName, { content: string; updatedAtMs: number }>> = { ...slots };
    for (const action of actions) {
        if (action.type === 'promote') {
            const source = next[action.fromSlot];
            if (!source) {
                throw new Error(`Missing source slot ${action.fromSlot} during promote`);
            }
            next[action.toSlot] = { content: source.content, updatedAtMs: action.updatedAtMs };
        } else {
            next[action.toSlot] = { content: action.contentString, updatedAtMs: action.updatedAtMs };
        }
    }
    return next;
}

describe('isBackupSlotName', () => {
    it('accepts every configured tier name and rejects unknown names', () => {
        for (const tier of BACKUP_TIERS) {
            expect(isBackupSlotName(tier.name)).toBe(true);
        }
        expect(isBackupSlotName('5 minutes')).toBe(false);
        expect(isBackupSlotName('1 month')).toBe(false);
        expect(isBackupSlotName('')).toBe(false);
    });
});

describe('areSnapshotsEquivalent', () => {
    it('returns false when either input is null, undefined, or empty', () => {
        expect(areSnapshotsEquivalent(null, '{"type":"doc"}')).toBe(false);
        expect(areSnapshotsEquivalent('{"type":"doc"}', undefined)).toBe(false);
        expect(areSnapshotsEquivalent('', '')).toBe(false);
    });

    it('returns true for identical strings', () => {
        expect(areSnapshotsEquivalent('{"type":"doc"}', '{"type":"doc"}')).toBe(true);
    });

    it('ignores object key order recursively and strips top-level __yjs', () => {
        const a = JSON.stringify({
            __yjs: 'base64-state-1',
            type: 'doc',
            content: [{ attrs: { level: 2, align: 'left' }, type: 'heading' }],
            meta: { b: 2, a: 1 },
        });
        const b = JSON.stringify({
            meta: { a: 1, b: 2 },
            content: [{ type: 'heading', attrs: { align: 'left', level: 2 } }],
            type: 'doc',
            __yjs: 'base64-state-2',
        });
        const c = JSON.stringify({
            meta: { a: 1, b: 2 },
            content: [{ type: 'heading', attrs: { align: 'left', level: 2 } }],
            type: 'doc',
        });

        expect(areSnapshotsEquivalent(a, b)).toBe(true);
        expect(areSnapshotsEquivalent(a, c)).toBe(true);
    });

    it('preserves nested __yjs fields and detects real content diffs', () => {
        const a = JSON.stringify({ type: 'doc', nested: { __yjs: 'one' } });
        const b = JSON.stringify({ type: 'doc', nested: {} });
        const c = JSON.stringify({ type: 'doc', text: 'hello' });
        const d = JSON.stringify({ type: 'doc', text: 'world' });

        expect(areSnapshotsEquivalent(a, b)).toBe(false);
        expect(areSnapshotsEquivalent(c, d)).toBe(false);
    });

    it('falls back to trimmed string comparison when JSON parsing fails', () => {
        expect(areSnapshotsEquivalent('  plain text note  ', 'plain text note')).toBe(true);
        expect(areSnapshotsEquivalent('plain text a', 'plain text b')).toBe(false);
        expect(areSnapshotsEquivalent('{"type":"doc"}', 'not-json')).toBe(false);
    });
});

describe('chooseArchiveCandidate', () => {
    it('returns previousContent with clamped timestamp when previousContent differs from currentContent', () => {
        const nowMs = BASE_NOW;
        const result = chooseArchiveCandidate({
            previousContent: '{"type":"doc","v":1}',
            previousCapturedAtMs: nowMs - 5 * MIN,
            currentContent: '{"type":"doc","v":2}',
            hasExistingBackups: true,
            nowMs,
        });

        expect(result).toEqual({
            contentString: '{"type":"doc","v":1}',
            capturedAtMs: nowMs - 5 * MIN,
        });
    });

    it('clamps future or invalid previousCapturedAtMs to nowMs', () => {
        const nowMs = BASE_NOW;
        expect(
            chooseArchiveCandidate({
                previousContent: 'old',
                previousCapturedAtMs: nowMs + 60_000,
                currentContent: 'new',
                hasExistingBackups: true,
                nowMs,
            })
        ).toEqual({ contentString: 'old', capturedAtMs: nowMs });

        for (const invalidTs of [null, 0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(
                chooseArchiveCandidate({
                    previousContent: 'old',
                    previousCapturedAtMs: invalidTs,
                    currentContent: 'new',
                    hasExistingBackups: true,
                    nowMs,
                })
            ).toEqual({ contentString: 'old', capturedAtMs: nowMs });
        }
    });

    it('stores initial baseline snapshot on first save when no backups exist', () => {
        const nowMs = BASE_NOW;
        expect(
            chooseArchiveCandidate({
                previousContent: null,
                previousCapturedAtMs: null,
                currentContent: '{"type":"doc","v":1}',
                hasExistingBackups: false,
                nowMs,
            })
        ).toEqual({
            contentString: '{"type":"doc","v":1}',
            capturedAtMs: nowMs,
        });

        expect(
            chooseArchiveCandidate({
                previousContent: '{"type":"doc","v":1,"__yjs":"a"}',
                previousCapturedAtMs: nowMs - 1000,
                currentContent: '{"__yjs":"b","v":1,"type":"doc"}',
                hasExistingBackups: false,
                nowMs,
            })
        ).toEqual({
            contentString: '{"__yjs":"b","v":1,"type":"doc"}',
            capturedAtMs: nowMs,
        });
    });

    it('returns null when backups exist and previous content is equivalent or empty', () => {
        const nowMs = BASE_NOW;
        expect(
            chooseArchiveCandidate({
                previousContent: '{"type":"doc","v":1,"__yjs":"a"}',
                previousCapturedAtMs: nowMs - 1000,
                currentContent: '{"__yjs":"b","v":1,"type":"doc"}',
                hasExistingBackups: true,
                nowMs,
            })
        ).toBeNull();

        expect(
            chooseArchiveCandidate({
                previousContent: '   ',
                previousCapturedAtMs: nowMs - 1000,
                currentContent: '   ',
                hasExistingBackups: false,
                nowMs,
            })
        ).toBeNull();
    });
});

describe('planBackupCascade', () => {
    it('returns [] for empty incoming content or semantically equivalent newest slot content', () => {
        expect(
            planBackupCascade({
                existingSlots: {},
                newestSlotContent: null,
                incomingContent: '   ',
                incomingCapturedAtMs: BASE_NOW,
                nowMs: BASE_NOW,
            })
        ).toEqual([]);

        expect(
            planBackupCascade({
                existingSlots: {
                    '10 minutes': { slotName: '10 minutes', updatedAtMs: BASE_NOW - 20 * MIN },
                },
                newestSlotContent: JSON.stringify({ __yjs: 'old', b: 2, a: 1 }),
                incomingContent: JSON.stringify({ a: 1, b: 2, __yjs: 'new' }),
                incomingCapturedAtMs: BASE_NOW,
                nowMs: BASE_NOW,
            })
        ).toEqual([]);
    });

    it('writes only to "10 minutes" on empty slots and clamps incomingCapturedAtMs', () => {
        const actions = planBackupCascade({
            existingSlots: {},
            newestSlotContent: null,
            incomingContent: 'v1',
            incomingCapturedAtMs: BASE_NOW + 99_999,
            nowMs: BASE_NOW,
        });

        expect(actions).toEqual([
            { type: 'write', toSlot: '10 minutes', contentString: 'v1', updatedAtMs: BASE_NOW },
        ]);
    });

    it('handles legacy notes where only "1 week" exists by writing only "10 minutes"', () => {
        const actions = planBackupCascade({
            existingSlots: {
                '1 week': { slotName: '1 week', updatedAtMs: BASE_NOW - 3 * DAY },
            },
            newestSlotContent: 'legacy-v0',
            incomingContent: 'v1',
            incomingCapturedAtMs: BASE_NOW - 1000,
            nowMs: BASE_NOW,
        });

        expect(actions).toEqual([
            { type: 'write', toSlot: '10 minutes', contentString: 'v1', updatedAtMs: BASE_NOW - 1000 },
        ]);
    });

    it('does nothing while "10 minutes" is younger than 10 minutes', () => {
        const actions = planBackupCascade({
            existingSlots: {
                '10 minutes': { slotName: '10 minutes', updatedAtMs: BASE_NOW - (10 * MIN - 1) },
            },
            newestSlotContent: 'v1',
            incomingContent: 'v2',
            incomingCapturedAtMs: BASE_NOW,
            nowMs: BASE_NOW,
        });

        expect(actions).toEqual([]);
    });

    it('promotes 10m -> 30m at t=12m when 30m is empty', () => {
        const t0 = BASE_NOW;
        const nowMs = t0 + 12 * MIN;
        const actions = planBackupCascade({
            existingSlots: {
                '10 minutes': { slotName: '10 minutes', updatedAtMs: t0 },
            },
            newestSlotContent: 'v1',
            incomingContent: 'v2',
            incomingCapturedAtMs: nowMs,
            nowMs,
        });

        expect(actions).toEqual([
            { type: 'promote', fromSlot: '10 minutes', toSlot: '30 minutes', updatedAtMs: t0 },
            { type: 'write', toSlot: '10 minutes', contentString: 'v2', updatedAtMs: nowMs },
        ]);
    });

    it('overwrites 10m while preserving fresh 30m at t=24m', () => {
        const t0 = BASE_NOW;
        const t12 = t0 + 12 * MIN;
        const nowMs = t0 + 24 * MIN;
        const actions = planBackupCascade({
            existingSlots: {
                '10 minutes': { slotName: '10 minutes', updatedAtMs: t12 },
                '30 minutes': { slotName: '30 minutes', updatedAtMs: t0 },
            },
            newestSlotContent: 'v2',
            incomingContent: 'v3',
            incomingCapturedAtMs: nowMs,
            nowMs,
        });

        expect(actions).toEqual([
            { type: 'write', toSlot: '10 minutes', contentString: 'v3', updatedAtMs: nowMs },
        ]);
    });

    it('cascades 30m -> 1h then 10m -> 30m in reverse order at t=36m', () => {
        const t0 = BASE_NOW;
        const t24 = t0 + 24 * MIN;
        const nowMs = t0 + 36 * MIN;
        const actions = planBackupCascade({
            existingSlots: {
                '10 minutes': { slotName: '10 minutes', updatedAtMs: t24 },
                '30 minutes': { slotName: '30 minutes', updatedAtMs: t0 },
            },
            newestSlotContent: 'v3',
            incomingContent: 'v4',
            incomingCapturedAtMs: nowMs,
            nowMs,
        });

        expect(actions).toEqual([
            { type: 'promote', fromSlot: '30 minutes', toSlot: '1 hour', updatedAtMs: t0 },
            { type: 'promote', fromSlot: '10 minutes', toSlot: '30 minutes', updatedAtMs: t24 },
            { type: 'write', toSlot: '10 minutes', contentString: 'v4', updatedAtMs: nowMs },
        ]);
    });

    it('preserves fresh 1h when 30m is expired and 10m cascades at t=36m', () => {
        const t0 = BASE_NOW;
        const tMinus5 = t0 - 5 * MIN;
        const t24 = t0 + 24 * MIN;
        const nowMs = t0 + 36 * MIN;

        const actions = planBackupCascade({
            existingSlots: {
                '10 minutes': { slotName: '10 minutes', updatedAtMs: t24 },
                '30 minutes': { slotName: '30 minutes', updatedAtMs: t0 },
                '1 hour': { slotName: '1 hour', updatedAtMs: tMinus5 },
            },
            newestSlotContent: 'v3',
            incomingContent: 'v4',
            incomingCapturedAtMs: nowMs,
            nowMs,
        });

        expect(actions).toEqual([
            { type: 'promote', fromSlot: '10 minutes', toSlot: '30 minutes', updatedAtMs: t24 },
            { type: 'write', toSlot: '10 minutes', contentString: 'v4', updatedAtMs: nowMs },
        ]);
    });

    it('performs big-gap multi-tier shift into empty 2 days in reverse order at t=3d', () => {
        const nowMs = BASE_NOW + 3 * DAY;
        const ts10m = nowMs - 20 * MIN;
        const ts30m = nowMs - 45 * MIN;
        const ts1h = nowMs - 2 * HOUR;
        const ts1d = nowMs - 2 * DAY;

        const existingSlots: Partial<Record<BackupSlotName, BackupSlotMeta>> = {
            '10 minutes': { slotName: '10 minutes', updatedAtMs: ts10m },
            '30 minutes': { slotName: '30 minutes', updatedAtMs: ts30m },
            '1 hour': { slotName: '1 hour', updatedAtMs: ts1h },
            '1 day': { slotName: '1 day', updatedAtMs: ts1d },
        };

        const actions = planBackupCascade({
            existingSlots,
            newestSlotContent: 'v5',
            incomingContent: 'v6',
            incomingCapturedAtMs: nowMs,
            nowMs,
        });

        expect(actions).toEqual([
            { type: 'promote', fromSlot: '1 day', toSlot: '2 days', updatedAtMs: ts1d },
            { type: 'promote', fromSlot: '1 hour', toSlot: '1 day', updatedAtMs: ts1h },
            { type: 'promote', fromSlot: '30 minutes', toSlot: '1 hour', updatedAtMs: ts30m },
            { type: 'promote', fromSlot: '10 minutes', toSlot: '30 minutes', updatedAtMs: ts10m },
            { type: 'write', toSlot: '10 minutes', contentString: 'v6', updatedAtMs: nowMs },
        ]);

        const applied = applyActions(
            {
                '10 minutes': { content: 'v5', updatedAtMs: ts10m },
                '30 minutes': { content: 'v4', updatedAtMs: ts30m },
                '1 hour': { content: 'v3', updatedAtMs: ts1h },
                '1 day': { content: 'v1', updatedAtMs: ts1d },
            },
            actions
        );

        expect(applied['2 days']).toEqual({ content: 'v1', updatedAtMs: ts1d });
        expect(applied['1 day']).toEqual({ content: 'v3', updatedAtMs: ts1h });
        expect(applied['1 hour']).toEqual({ content: 'v4', updatedAtMs: ts30m });
        expect(applied['30 minutes']).toEqual({ content: 'v5', updatedAtMs: ts10m });
        expect(applied['10 minutes']).toEqual({ content: 'v6', updatedAtMs: nowMs });
    });

    it('cascades all 6 tiers in reverse order at t=10d when all slots are expired', () => {
        const nowMs = BASE_NOW + 10 * DAY;
        const ts10m = nowMs - 15 * MIN;
        const ts30m = nowMs - 40 * MIN;
        const ts1h = nowMs - 3 * HOUR;
        const ts1d = nowMs - 30 * HOUR;
        const ts2d = nowMs - 3 * DAY;
        const ts1w = nowMs - 8 * DAY;

        const actions = planBackupCascade({
            existingSlots: {
                '10 minutes': { slotName: '10 minutes', updatedAtMs: ts10m },
                '30 minutes': { slotName: '30 minutes', updatedAtMs: ts30m },
                '1 hour': { slotName: '1 hour', updatedAtMs: ts1h },
                '1 day': { slotName: '1 day', updatedAtMs: ts1d },
                '2 days': { slotName: '2 days', updatedAtMs: ts2d },
                '1 week': { slotName: '1 week', updatedAtMs: ts1w },
            },
            newestSlotContent: 'v6',
            incomingContent: 'v7',
            incomingCapturedAtMs: nowMs,
            nowMs,
        });

        expect(actions).toEqual([
            { type: 'promote', fromSlot: '2 days', toSlot: '1 week', updatedAtMs: ts2d },
            { type: 'promote', fromSlot: '1 day', toSlot: '2 days', updatedAtMs: ts1d },
            { type: 'promote', fromSlot: '1 hour', toSlot: '1 day', updatedAtMs: ts1h },
            { type: 'promote', fromSlot: '30 minutes', toSlot: '1 hour', updatedAtMs: ts30m },
            { type: 'promote', fromSlot: '10 minutes', toSlot: '30 minutes', updatedAtMs: ts10m },
            { type: 'write', toSlot: '10 minutes', contentString: 'v7', updatedAtMs: nowMs },
        ]);
    });

    it('stops at an empty gap without disturbing deeper existing slots', () => {
        const nowMs = BASE_NOW + 5 * DAY;
        const ts10m = nowMs - 20 * MIN;
        const ts30m = nowMs - 40 * MIN;
        const ts1d = nowMs - 2 * DAY;

        const actions = planBackupCascade({
            existingSlots: {
                '10 minutes': { slotName: '10 minutes', updatedAtMs: ts10m },
                '30 minutes': { slotName: '30 minutes', updatedAtMs: ts30m },
                '1 day': { slotName: '1 day', updatedAtMs: ts1d },
            },
            newestSlotContent: 'v3',
            incomingContent: 'v4',
            incomingCapturedAtMs: nowMs,
            nowMs,
        });

        expect(actions).toEqual([
            { type: 'promote', fromSlot: '30 minutes', toSlot: '1 hour', updatedAtMs: ts30m },
            { type: 'promote', fromSlot: '10 minutes', toSlot: '30 minutes', updatedAtMs: ts10m },
            { type: 'write', toSlot: '10 minutes', contentString: 'v4', updatedAtMs: nowMs },
        ]);
    });
});
