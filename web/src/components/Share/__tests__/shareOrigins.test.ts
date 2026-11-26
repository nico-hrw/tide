import { describe, it, expect } from 'vitest';
import { getShareOrigins } from '../shareOrigins';
import type { CalendarShareRules } from '@/lib/calendarShare';

const rules: CalendarShareRules = {
    g1: { groupId: 'g1', recipients: [{ userId: 'anna', permission: 'view' }], autoShareNew: true },
    g2: { groupId: 'g2', recipients: [{ userId: 'ben', permission: 'edit' }], autoShareNew: false },
};
const titles = { g1: 'Arbeit', g2: 'Privat' };

describe('getShareOrigins', () => {
    it('returns nothing without mention entry or matching rule', () => {
        expect(getShareOrigins({ userId: 'anna', groupIds: [], rules, groupTitles: titles })).toEqual([]);
        expect(getShareOrigins({ userId: 'anna', groupIds: ['g2'], rules, groupTitles: titles })).toEqual([]);
    });
    it('reports a mention origin', () => {
        expect(getShareOrigins({ userId: 'anna', groupIds: [], rules, mentionOrigin: 'mention' })).toEqual([{ kind: 'mention' }]);
    });
    it('reports a calendar origin only when the person is in the rule of one of the groups', () => {
        expect(getShareOrigins({ userId: 'anna', groupIds: ['g1'], rules, groupTitles: titles })).toEqual([{ kind: 'calendar', groupId: 'g1', name: 'Arbeit' }]);
        expect(getShareOrigins({ userId: 'ben', groupIds: ['g1'], rules, groupTitles: titles })).toEqual([]);
    });
    it('lists both, mention first', () => {
        expect(getShareOrigins({ userId: 'anna', groupIds: ['g1'], rules, groupTitles: titles, mentionOrigin: 'mention' }))
            .toEqual([{ kind: 'mention' }, { kind: 'calendar', groupId: 'g1', name: 'Arbeit' }]);
    });
    it('keeps a calendar origin without a known title', () => {
        expect(getShareOrigins({ userId: 'anna', groupIds: ['g1'], rules })).toEqual([{ kind: 'calendar', groupId: 'g1', name: undefined }]);
    });
});
