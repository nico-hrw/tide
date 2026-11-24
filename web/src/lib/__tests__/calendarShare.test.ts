import { describe, expect, it, vi } from 'vitest';
import {
    applyGroupShares,
    isOwnedEvent,
    mergeRulesForEvent,
    parseShareRules,
    planGroupShares,
    removeShareRule,
    shareNewEvent,
    summarizeGroupShares,
    upsertShareRule,
    type CalendarShareRule,
} from '../calendarShare';

const rule = (over: Partial<CalendarShareRule> = {}): CalendarShareRule => ({
    groupId: 'g1',
    recipients: [{ userId: 'anna', permission: 'view' }],
    autoShareNew: true,
    ...over,
});

describe('planGroupShares', () => {
    it('returns nothing for an empty group', () => {
        expect(planGroupShares({ events: [], rule: rule() })).toEqual([]);
        expect(planGroupShares({ events: [{ id: 'e1', groupId: 'g1', owned: true, sharedWith: [] }], rule: rule({ recipients: [] }) })).toEqual([]);
    });

    it('leaves out private events', () => {
        const plan = planGroupShares({
            events: [
                { id: 'e1', groupId: 'g1', owned: true, sharedWith: [] },
                { id: 'e2', groupId: 'g1', owned: true, private: true, sharedWith: [] },
            ],
            rule: rule(),
        });
        expect(plan).toEqual([{ eventId: 'e1', userId: 'anna', permission: 'view' }]);
    });

    it('leaves out events the person already has', () => {
        const plan = planGroupShares({
            events: [
                { id: 'e1', groupId: 'g1', owned: true, sharedWith: ['anna'] },
                { id: 'e2', groupId: 'g1', owned: true, sharedWith: ['ben'] },
            ],
            rule: rule(),
        });
        expect(plan).toEqual([{ eventId: 'e2', userId: 'anna', permission: 'view' }]);
    });

    it('two recipients times two events gives four entries', () => {
        const plan = planGroupShares({
            events: [
                { id: 'e1', groupId: 'g1', owned: true, sharedWith: [] },
                { id: 'e2', groupIds: ['other', 'g1'], owned: true },
            ],
            rule: rule({ recipients: [{ userId: 'anna', permission: 'view' }, { userId: 'ben', permission: 'edit' }] }),
        });
        expect(plan).toEqual([
            { eventId: 'e1', userId: 'anna', permission: 'view' },
            { eventId: 'e1', userId: 'ben', permission: 'edit' },
            { eventId: 'e2', userId: 'anna', permission: 'view' },
            { eventId: 'e2', userId: 'ben', permission: 'edit' },
        ]);
    });

    it('leaves out events of another group', () => {
        const plan = planGroupShares({
            events: [
                { id: 'e1', groupId: 'g2', owned: true, sharedWith: [] },
                { id: 'e2', groupIds: ['g2'], owned: true },
                { id: 'e3', groupId: null, owned: true },
            ],
            rule: rule(),
        });
        expect(plan).toEqual([]);
    });

    it('leaves out events the user does not own', () => {
        const plan = planGroupShares({
            events: [
                { id: 'e1', groupId: 'g1', owned: false, sharedWith: [] },
                { id: 'e2', groupId: 'g1', sharedWith: [] },
            ],
            rule: rule(),
        });
        expect(plan).toEqual([]);
    });
});

describe('applyGroupShares', () => {
    const plan = [
        { eventId: 'e1', userId: 'anna', permission: 'view' as const },
        { eventId: 'e2', userId: 'anna', permission: 'view' as const },
        { eventId: 'e3', userId: 'anna', permission: 'view' as const },
    ];

    it('one failure does not stop the rest', async () => {
        const shareOne = vi.fn(async (eventId: string) => {
            if (eventId === 'e2') throw new Error('boom');
        });
        await expect(applyGroupShares(plan, shareOne)).resolves.toEqual({ done: 2, failed: 1 });
        expect(shareOne).toHaveBeenCalledTimes(3);
    });

    it('runs one after another, in plan order, and reports progress', async () => {
        const log: string[] = [];
        let running = 0;
        const shareOne = async (eventId: string) => {
            running += 1;
            expect(running).toBe(1);
            log.push(`start ${eventId}`);
            await new Promise((r) => setTimeout(r, 1));
            log.push(`end ${eventId}`);
            running -= 1;
        };
        const progress: Array<[number, number, number]> = [];
        await applyGroupShares(plan, shareOne, (p) => progress.push([p.done, p.failed, p.total]));
        expect(log).toEqual(['start e1', 'end e1', 'start e2', 'end e2', 'start e3', 'end e3']);
        expect(progress).toEqual([[1, 0, 3], [2, 0, 3], [3, 0, 3]]);
    });
});

describe('shareNewEvent', () => {
    const event = { id: 'e9', groupIds: ['g1'], owned: true };

    it('shares nothing when autoShareNew is off', async () => {
        const shareOne = vi.fn(async () => {});
        await expect(shareNewEvent(event, rule({ autoShareNew: false }), shareOne)).resolves.toEqual({ done: 0, failed: 0 });
        expect(shareOne).not.toHaveBeenCalled();
    });

    it('shares nothing for a private event', async () => {
        const shareOne = vi.fn(async () => {});
        await shareNewEvent({ ...event, private: true }, rule(), shareOne);
        expect(shareOne).not.toHaveBeenCalled();
    });

    it('shares nothing for an event outside the group or not owned', async () => {
        const shareOne = vi.fn(async () => {});
        await shareNewEvent({ id: 'e9', groupIds: ['g2'], owned: true }, rule(), shareOne);
        await shareNewEvent({ ...event, owned: false }, rule(), shareOne);
        expect(shareOne).not.toHaveBeenCalled();
    });

    it('shares with every recipient of the rule', async () => {
        const shareOne = vi.fn(async () => {});
        const res = await shareNewEvent(event, rule({ recipients: [{ userId: 'anna', permission: 'view' }, { userId: 'ben', permission: 'edit' }] }), shareOne);
        expect(res).toEqual({ done: 2, failed: 0 });
        expect(shareOne.mock.calls).toEqual([['e9', 'anna', 'view'], ['e9', 'ben', 'edit']]);
    });
});

describe('mergeRulesForEvent', () => {
    it('combines the auto-share rules of the event groups, the stricter permission wins', () => {
        const merged = mergeRulesForEvent(['g1', 'g2', 'g3'], {
            g1: rule({ recipients: [{ userId: 'anna', permission: 'edit' }] }),
            g2: rule({ groupId: 'g2', recipients: [{ userId: 'anna', permission: 'view' }, { userId: 'ben', permission: 'edit' }] }),
            g3: rule({ groupId: 'g3', autoShareNew: false, recipients: [{ userId: 'cleo', permission: 'view' }] }),
        });
        expect(merged).toEqual({
            groupId: 'g1',
            autoShareNew: true,
            recipients: [{ userId: 'anna', permission: 'view' }, { userId: 'ben', permission: 'edit' }],
        });
    });

    it('returns null when no group of the event auto-shares', () => {
        expect(mergeRulesForEvent(['g1'], { g1: rule({ autoShareNew: false }) })).toBeNull();
        expect(mergeRulesForEvent([], { g1: rule() })).toBeNull();
    });
});

describe('summarizeGroupShares', () => {
    it('counts shared, private, foreign and unchecked events of the group', () => {
        const s = summarizeGroupShares({
            events: [
                { id: 'e1', groupId: 'g1', owned: true, sharedWith: ['anna'] },
                { id: 'e2', groupId: 'g1', owned: true, sharedWith: [] },
                { id: 'e3', groupId: 'g1', owned: true, private: true, sharedWith: [] },
                { id: 'e4', groupId: 'g1', owned: false },
                { id: 'e5', groupId: 'g1', owned: true },
                { id: 'e6', groupId: 'g2', owned: true, sharedWith: [] },
            ],
            rule: rule(),
        });
        expect(s).toEqual({ total: 5, shared: 1, privateCount: 1, notOwned: 1, unchecked: 1 });
    });
});

describe('isOwnedEvent', () => {
    it('own when owner_id matches or is missing with owner share status', () => {
        expect(isOwnedEvent({ owner_id: 'me' }, 'me')).toBe(true);
        expect(isOwnedEvent({}, 'me')).toBe(true);
        expect(isOwnedEvent({ share_status: 'owner' }, 'me')).toBe(true);
        expect(isOwnedEvent({ owner_id: 'you' }, 'me')).toBe(false);
        expect(isOwnedEvent({ share_status: 'shared' }, 'me')).toBe(false);
        expect(isOwnedEvent({ owner_id: 'me' }, null)).toBe(false);
    });
});

describe('rule persistence helpers', () => {
    it('parseShareRules keeps valid rules and drops broken entries', () => {
        const parsed = parseShareRules({
            g1: { groupId: 'g1', recipients: [{ userId: 'anna', permission: 'edit' }, { userId: 'ben', permission: 'admin' }, { userId: '' }], autoShareNew: true },
            g2: { groupId: 'other', recipients: [{ userId: 'anna', permission: 'view' }], autoShareNew: false },
            g3: 'nope',
            g4: { groupId: 'g4', recipients: [], autoShareNew: true },
            g5: { groupId: 'g5', recipients: [{ userId: 'cleo', permission: 'view' }, { userId: 'cleo', permission: 'edit' }], autoShareNew: 'yes' },
        });
        expect(parsed).toEqual({
            g1: { groupId: 'g1', recipients: [{ userId: 'anna', permission: 'edit' }], autoShareNew: true },
            g5: { groupId: 'g5', recipients: [{ userId: 'cleo', permission: 'view' }], autoShareNew: false },
        });
        expect(parseShareRules(null)).toEqual({});
        expect(parseShareRules([1, 2])).toEqual({});
    });

    it('upsertShareRule stores a copy and an empty rule removes the group', () => {
        const r = rule();
        const next = upsertShareRule({}, r);
        expect(next).toEqual({ g1: r });
        expect(next.g1).not.toBe(r);
        expect(upsertShareRule(next, rule({ recipients: [] }))).toEqual({});
    });

    it('removeShareRule drops the group without touching others', () => {
        const base = { g1: rule(), g2: rule({ groupId: 'g2' }) };
        expect(removeShareRule(base, 'g1')).toEqual({ g2: base.g2 });
        expect(base.g1).toBeDefined();
    });

    it('keeps a rule that only has pending removals', () => {
        const parsed = parseShareRules({ g1: { groupId: 'g1', recipients: [], autoShareNew: true, pendingRevoke: ['bob', 7, 'bob'] } });
        expect(parsed).toEqual({ g1: { groupId: 'g1', recipients: [], autoShareNew: true, pendingRevoke: ['bob'] } });
        expect(upsertShareRule({}, { groupId: 'g1', recipients: [], autoShareNew: false, pendingRevoke: ['bob'] })).toHaveProperty('g1');
    });
});
