import { describe, it, expect } from 'vitest';
import { selectTags, normalizeTagName, missingTagNames, buildTagPatches, type Tag } from '../tags';
import type { CalendarEvent } from '@/components/Calendar/types';
import type { DataItem, TaskItem } from '@/store/slices/types';

const ev = (id: string, p: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id, title: id, start: '2026-01-01T10:00:00Z', end: '2026-01-01T11:00:00Z', ...p,
});
const task = (id: string, p: Partial<TaskItem> = {}): TaskItem => ({ id, title: id, isCompleted: false, ...p });
const tags: Tag[] = [{ id: 'g1', title: 'Uni' }];

describe('selectTags', () => {
    it('only returns folders flagged as group', () => {
        const items: DataItem[] = [
            { id: 'g1', title: 'Uni', type: 'folder', isGroup: true, color: '#fff', effect: 'glow' },
            { id: 'f1', title: 'Plain', type: 'folder' },
            { id: 'n1', title: 'Note', type: 'note', isGroup: true },
            { id: 'e1', title: 'Event', type: 'event' },
        ];
        expect(selectTags(items)).toEqual([{ id: 'g1', title: 'Uni', color: '#fff', effect: 'glow' }]);
    });
});

describe('normalizeTagName', () => {
    it('trims, collapses whitespace and lowercases', () => {
        expect(normalizeTagName('  Foo   BAR ')).toBe('foo bar');
    });
});

describe('missingTagNames', () => {
    it('matches known names case-insensitively', () => {
        expect(missingTagNames([ev('e', { tags: ['uni'] })], [], tags)).toEqual([]);
    });
    it('does not report tag ids', () => {
        expect(missingTagNames([], [task('t', { tags: ['g1'] })], tags)).toEqual([]);
    });
    it('dedupes by normalized name keeping first spelling', () => {
        expect(missingTagNames([ev('e', { tags: [' Reise ', 'reise'] })], [], tags)).toEqual(['Reise']);
    });
    it('collects from tasks too', () => {
        expect(missingTagNames([], [task('t', { tags: ['Sport'] })], tags)).toEqual(['Sport']);
    });
});

describe('buildTagPatches', () => {
    it('does not duplicate existing groupIds', () => {
        const r = buildTagPatches([ev('e', { groupIds: ['g1'], tags: ['Uni'] })], [], tags);
        expect(r.eventPatches).toEqual([]);
    });
    it('appends resolved names after existing groupIds', () => {
        const all: Tag[] = [...tags, { id: 'g2', title: 'Reise' }];
        const r = buildTagPatches([ev('e', { groupIds: ['g1'], tags: ['reise', 'Uni', 'Unknown'] })], [], all);
        expect(r.eventPatches).toEqual([{ id: 'e', groupIds: ['g1', 'g2'], tags: ['Unknown'] }]);
    });
    it('resolves todo ids and names to ids', () => {
        const all: Tag[] = [...tags, { id: 'g2', title: 'Reise' }];
        const r = buildTagPatches([], [task('t', { tags: ['g1', 'Reise'] })], all);
        expect(r.taskPatches).toEqual([{ id: 't', tags: ['g1', 'g2'] }]);
    });
    it('is idempotent on migrated data', () => {
        const all: Tag[] = [...tags, { id: 'g2', title: 'Reise' }];
        const events = [ev('e', { groupIds: ['g1', 'g2'], tags: ['reise', 'Uni'] })];
        const tasks = [task('t', { tags: ['g1', 'g2'] })];
        expect(buildTagPatches(events, tasks, all)).toEqual({ eventPatches: [], taskPatches: [] });
    });
    it('keeps the parent_id-only group when adding a resolved name', () => {
        const r = buildTagPatches([ev('e', { parent_id: 'g0', tags: ['Uni'] })], [], [...tags, { id: 'g0', title: 'G' }]);
        expect(r.eventPatches).toEqual([{ id: 'e', groupIds: ['g0', 'g1'], tags: [] }]);
    });
    it('treats empty groupIds like parent_id-only', () => {
        const r = buildTagPatches([ev('e', { groupIds: [], parent_id: 'g0', tags: ['Uni'] })], [], tags);
        expect(r.eventPatches).toEqual([{ id: 'e', groupIds: ['g0', 'g1'], tags: [] }]);
    });
    it('does not rewrite parent_id-only events with nothing to migrate', () => {
        const r = buildTagPatches([ev('e', { parent_id: 'g0' }), ev('e2', { parent_id: 'g0', tags: [] })], [], tags);
        expect(r.eventPatches).toEqual([]);
    });
    it('keeps unresolved names in the event patch', () => {
        const r = buildTagPatches([ev('e', { tags: ['Gym', 'Uni', '123e4567-e89b-12d3-a456-426614174000'] })], [], tags);
        expect(r.eventPatches).toEqual([{ id: 'e', groupIds: ['g1'], tags: ['Gym'] }]);
    });
    it('skips events and todos owned by someone else', () => {
        const r = buildTagPatches(
            [ev('e', { tags: ['Uni'], owner_id: 'other' }), ev('mine', { tags: ['Uni'], owner_id: 'me' })],
            [task('t', { tags: ['Uni'], owner_id: 'other' })],
            tags,
            'me',
        );
        expect(r.eventPatches.map((p) => p.id)).toEqual(['mine']);
        expect(r.taskPatches).toEqual([]);
    });
});
