import { describe, it, expect } from 'vitest';
import { effectivePluginTagIds, isJobEvent, JOB_TAG_NAMES } from '../jobTags';

const titles: Record<string, string> = { t1: ' Uni ', t2: 'Sport', t3: 'Job' };
const resolve = (id: string) => titles[id];

describe('JOB_TAG_NAMES', () => {
    it('lists the legacy names', () => {
        expect(JOB_TAG_NAMES).toEqual(['job', 'arbeit', 'uni', 'studium']);
    });
});

describe('isJobEvent without assignment (legacy)', () => {
    it('matches the legacy group id via groupIds and parent_id', () => {
        expect(isJobEvent({ groupIds: ['g1'] }, [], 'g1')).toBe(true);
        expect(isJobEvent({ parent_id: 'g1' }, [], 'g1')).toBe(true);
        expect(isJobEvent({ groupIds: ['x'] }, [], 'g1')).toBe(false);
    });
    it('matches legacy names via event.tags', () => {
        expect(isJobEvent({ tags: ['Arbeit'] }, [], null)).toBe(true);
        expect(isJobEvent({ tags: ['sport'] }, [], null)).toBe(false);
    });
    it('matches legacy names via resolved tag titles (case/whitespace insensitive)', () => {
        expect(isJobEvent({ groupIds: ['t1'] }, [], null, resolve)).toBe(true);
        expect(isJobEvent({ groupIds: ['t2'] }, [], null, resolve)).toBe(false);
        expect(isJobEvent({ groupIds: ['t1'] }, [], null)).toBe(false);
    });
});

describe('isJobEvent with assignment', () => {
    it('only assigned tag ids match', () => {
        expect(isJobEvent({ groupIds: ['t2'] }, ['t2'], null, resolve)).toBe(true);
        expect(isJobEvent({ groupIds: ['t2', 'x'] }, ['x'], null)).toBe(true);
    });
    it('ignores legacy names and the legacy group id', () => {
        expect(isJobEvent({ groupIds: ['t2'], tags: ['uni'] }, ['t3'], null, resolve)).toBe(false);
        expect(isJobEvent({ groupIds: ['g1'] }, ['t3'], 'g1', resolve)).toBe(false);
        expect(isJobEvent({ groupIds: ['t1'] }, ['t3'], null, resolve)).toBe(false);
    });
});

describe('effectivePluginTagIds', () => {
    it('drops unknown ids', () => {
        expect(effectivePluginTagIds(['a', 'b'], new Set(['b']))).toEqual(['b']);
    });
    it('returns [] when all are stale', () => {
        expect(effectivePluginTagIds(['a'], new Set(['z']))).toEqual([]);
    });
});
