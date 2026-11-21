import { describe, expect, it } from 'vitest';
import { filterEventsByTags } from '../calendarUtils';
import type { CalendarEvent } from '../calendarUtils';
import type { Tag } from '../tags';

const tags: Tag[] = [
    { id: 'a', title: 'A' },
    { id: 'b', title: 'B' },
    { id: 'c', title: 'C' },
];

const ev = (id: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id, title: id, start: '2026-11-21T09:00:00.000Z', end: '2026-11-21T10:00:00.000Z', ...extra,
});

const events = [
    ev('e1', { groupIds: ['a'] }),
    ev('e2', { groupIds: ['b'] }),
    ev('e3'),
    ev('e4', { groupIds: ['gone'] }),
    ev('e5', { groupIds: ['a', 'b'] }),
    ev('e6', { parent_id: 'c' }),
];
const ids = (list: CalendarEvent[]) => list.map((e) => e.id);

describe('filterEventsByTags', () => {
    it('returns all events for an empty filter', () => {
        expect(ids(filterEventsByTags(events, { tagIds: [], untagged: false }, tags))).toEqual(ids(events));
    });
    it('returns events with the selected tag', () => {
        expect(ids(filterEventsByTags(events, { tagIds: ['a'], untagged: false }, tags))).toEqual(['e1', 'e5']);
    });
    it('ORs over several tags', () => {
        expect(ids(filterEventsByTags(events, { tagIds: ['a', 'c'], untagged: false }, tags))).toEqual(['e1', 'e5', 'e6']);
    });
    it('untagged returns events without tags and with only unknown tag ids', () => {
        expect(ids(filterEventsByTags(events, { tagIds: [], untagged: true }, tags))).toEqual(['e3', 'e4']);
    });
    it('matches an event with several tags on any of them', () => {
        expect(ids(filterEventsByTags(events, { tagIds: ['b'], untagged: false }, tags))).toEqual(['e2', 'e5']);
    });
    it('untagged plus a tag shows both groups', () => {
        expect(ids(filterEventsByTags(events, { tagIds: ['b'], untagged: true }, tags))).toEqual(['e2', 'e3', 'e4', 'e5']);
    });
});
