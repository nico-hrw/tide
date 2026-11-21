import { describe, it, expect } from 'vitest';
import {
    applyTagFilter,
    buildTagRows,
    actionQueryFor,
    cleanActionLabelQuery,
    filterByTagQuery,
    queryAfterTagPick,
    rewriteQueryForTagPick,
    tagTokenFor,
} from '../tagSuggestion';
import { parseTagQuery } from '../tagQuery';
import { getEventGroupIds } from '@/lib/calendarUtils';
import type { Tag } from '@/lib/tags';

const known = new Set(['a', 'b']);
const tag = (id: string, title: string, color?: string): Tag => (color ? { id, title, color } : { id, title });

describe('applyTagFilter', () => {
    it('passes everything when the filter is empty', () => {
        const items = [{ tags: undefined }, { tags: ['a'] }];
        expect(applyTagFilter(items, (i) => i.tags, [], known)).toBe(items);
    });

    it('applies AND to todos', () => {
        const todos = [{ id: 1, tags: ['a', 'b'] }, { id: 2, tags: ['a'] }, { id: 3 }];
        expect(applyTagFilter(todos, (t) => t.tags, ['a', 'b'], known).map((t) => t.id)).toEqual([1]);
    });

    it('uses groupIds and legacy parent_id for events', () => {
        const events = [{ id: 1, groupIds: ['a'] }, { id: 2, parent_id: 'a' }, { id: 3, groupIds: ['b'] }, { id: 4 }];
        const out = applyTagFilter(events, (e) => getEventGroupIds(e), ['a'], known);
        expect(out.map((e) => e.id)).toEqual([1, 2]);
    });

    it('works on notes with tagIds and ignores unknown ids', () => {
        const notes = [{ id: 1, tagIds: ['a'] }, { id: 2, tagIds: ['gone'] }, { id: 3 }];
        expect(applyTagFilter(notes, (n) => n.tagIds, ['a'], known).map((n) => n.id)).toEqual([1]);
        expect(applyTagFilter(notes, (n) => n.tagIds, ['gone'], known)).toEqual([]);
    });
});

describe('buildTagRows', () => {
    it('returns nothing for null', () => {
        expect(buildTagRows(null)).toEqual([]);
    });

    it('returns one row per candidate with a color fallback', () => {
        const rows = buildTagRows({ token: '#n', candidates: [tag('x', 'NZ', '#ff0000'), tag('y', 'Nord')] });
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual({ id: 'TAG:x', label: 'NZ', type: 'tag', color: '#ff0000' });
        expect(rows[1].id).toBe('TAG:y');
        expect(rows[1].color).toBeTruthy();
    });
});

describe('cleanActionLabelQuery', () => {
    it('drops applied tokens', () => {
        const tags = [tag('nz', 'NZ')];
        expect(cleanActionLabelQuery(parseTagQuery('#NZ Flug buchen', tags))).toBe('Flug buchen');
        expect(cleanActionLabelQuery(parseTagQuery('#NZ', tags))).toBe('');
    });
});

describe('tagTokenFor', () => {
    it('returns the shortest verified prefix', () => {
        const tags = [tag('j', 'Japan'), tag('r', 'Recht')];
        expect(tagTokenFor(tags[0], tags)).toBe('j');
        expect(tagTokenFor(tags[1], tags)).toBe('r');
    });

    it('needs more characters when a shorter prefix is shared', () => {
        const tags = [tag('a', 'Urlaub'), tag('b', 'Umzug')];
        expect(tagTokenFor(tags[0], tags)).toBe('ur');
        expect(tagTokenFor(tags[1], tags)).toBe('um');
    });

    it('only uses the first word of multi-word titles', () => {
        const tags = [tag('r', 'NZ Reise'), tag('o', 'Recht')];
        expect(tagTokenFor(tags[0], tags)).toBe('n');
    });

    it('returns null when the first word is shared', () => {
        const tags = [tag('r', 'NZ Reise'), tag('t', 'NZ Trip')];
        expect(tagTokenFor(tags[0], tags)).toBeNull();
        expect(tagTokenFor(tags[1], tags)).toBeNull();
    });

    it('returns null when another tag exact-matches the first word', () => {
        const tags = [tag('r', 'Reise'), tag('a', 'Reise Asien')];
        expect(tagTokenFor(tags[1], tags)).toBeNull();
        expect(tagTokenFor(tags[0], tags)).toBe('reise');
    });
});

describe('actionQueryFor', () => {
    it('uses the raw query without tag mode', () => {
        expect(actionQueryFor({ query: 'Flug' }, 'Flug')).toBe('Flug');
        expect(actionQueryFor({}, 'x')).toBe('x');
    });

    it('uses the cleaned text in tag mode', () => {
        expect(actionQueryFor({ query: 'Flug', tagMode: true }, '#NZ Flug')).toBe('Flug');
    });

    it('is empty in tag mode without text', () => {
        expect(actionQueryFor({ query: '', tagMode: true }, '#NZ')).toBe('');
        expect(actionQueryFor({ tagMode: true }, '#NZ')).toBe('');
    });
});

describe('rewriteQueryForTagPick / queryAfterTagPick', () => {
    it('replaces only the standalone token', () => {
        expect(rewriteQueryForTagPick('foo #n bar', '#n', 'NZ')).toBe('foo #NZ bar');
        expect(rewriteQueryForTagPick('a#n #n', '#n', 'NZ')).toBe('a#n #NZ');
        expect(rewriteQueryForTagPick('#nz #n', '#n', 'Nord')).toBe('#nz #Nord');
    });

    it('rewrites the ambiguous token of the query for the picked tag', () => {
        const tags = [tag('r', 'NZ Reise'), tag('o', 'Nord')];
        expect(queryAfterTagPick('flug #n', 'r', tags)).toBe('flug #nz');
        expect(queryAfterTagPick('flug #nord', 'r', tags)).toBeNull();
    });

    it('never applies the other tag when the pick cannot be expressed', () => {
        const tags = [tag('r', 'Reise'), tag('a', 'Reise Asien'), tag('o', 'Rest')];
        expect(parseTagQuery('#re', tags).ambiguous).not.toBeNull();
        expect(queryAfterTagPick('#re', 'a', tags)).toBeNull();
    });
});

describe('filterByTagQuery', () => {
    const tags = [tag('a', 'A'), tag('b', 'B')];
    const lists = {
        notes: [{ id: 'n1', tagIds: ['a', 'b'] }, { id: 'n2', tagIds: ['a'] }, { id: 'n3' }],
        events: [{ id: 'e1', groupIds: ['a', 'b'] }, { id: 'e2', parent_id: 'b' }],
        tasks: [{ id: 't1', tags: ['a', 'b'] }, { id: 't2' }],
    };
    const ids = new Set(tags.map((t) => t.id));

    it('filters all three kinds with AND', () => {
        const out = filterByTagQuery(lists, parseTagQuery('#a #b', tags), ids);
        expect(out.notes.map((n) => n.id)).toEqual(['n1']);
        expect(out.events.map((e) => e.id)).toEqual(['e1']);
        expect(out.tasks.map((t) => t.id)).toEqual(['t1']);
    });

    it('is a no-op without tags', () => {
        const out = filterByTagQuery(lists, parseTagQuery('plain', tags), ids);
        expect(out.notes).toHaveLength(3);
        expect(out.events).toHaveLength(2);
        expect(out.tasks).toHaveLength(2);
    });
});
