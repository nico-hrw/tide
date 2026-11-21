import { getEventGroupIds } from '@/lib/calendarUtils';
import { normalizeTagName, type Tag } from '@/lib/tags';
import { DEFAULT_TAG_COLOR } from '@/components/Todo/useTodoTags';
import { matchesAllTags, parseTagQuery, type TagQueryResult } from './tagQuery';

/** Row shown in the `@` menu to disambiguate a `#token` that matches several tags. */
export interface TagSuggestionRow {
    id: string;
    label: string;
    type: 'tag';
    color: string;
    query?: string;
}

/** Keeps the items carrying all wanted tags; an empty filter returns the items unchanged. */
export function applyTagFilter<T>(
    items: T[],
    getTagIds: (item: T) => readonly string[] | undefined,
    tagIds: readonly string[],
    knownTagIds: ReadonlySet<string>,
): T[] {
    if (tagIds.length === 0) return items;
    return items.filter((item) => matchesAllTags(getTagIds(item), tagIds, knownTagIds));
}

/** One row per candidate of an ambiguous `#token`; no ambiguity -> no rows. */
export function buildTagRows(ambiguous: { token: string; candidates: Tag[] } | null): TagSuggestionRow[] {
    if (!ambiguous) return [];
    return ambiguous.candidates.map((t) => ({
        id: `TAG:${t.id}`,
        label: t.title,
        type: 'tag' as const,
        color: t.color || DEFAULT_TAG_COLOR,
    }));
}

/** Text used for the 'Create File/Create Todo' rows: the query without applied `#tokens`. */
export function cleanActionLabelQuery(parsed: { text: string }): string {
    return parsed.text;
}

/**
 * Shortest whitespace-free `#token` (a prefix of the tag's normalized title, up to its first
 * whitespace) that the real parser resolves to exactly this tag, or null when none does
 * (e.g. 'NZ Reise' next to 'NZ Trip', or 'Reise Asien' next to 'Reise', where `#reise` exact-matches the other tag).
 */
export function tagTokenFor(tag: Tag, tags: Tag[]): string | null {
    const firstWord = normalizeTagName(tag.title).split(' ')[0] ?? '';
    for (let len = 1; len <= firstWord.length; len++) {
        const candidate = firstWord.slice(0, len);
        if (candidate.includes('#')) return null;
        const r = parseTagQuery(`#${candidate}`, tags);
        if (r.tagIds.length === 1 && r.tagIds[0] === tag.id) return candidate;
    }
    return null;
}

/** Query used for the title of a created note/todo: the cleaned text in tag mode, else the raw suggestion query. */
export function actionQueryFor(item: object, rawQuery?: string): string | undefined {
    const { query, tagMode } = item as { query?: string; tagMode?: boolean };
    return tagMode ? (query ?? '') : rawQuery;
}

/** Replaces the first occurrence of `token` (e.g. `#n`) that stands at the start or after whitespace. */
export function rewriteQueryForTagPick(query: string, token: string, replacementToken: string): string {
    const idx = findToken(query, token);
    if (idx < 0) return query;
    return query.slice(0, idx) + `#${replacementToken}` + query.slice(idx + token.length);
}

function findToken(query: string, token: string): number {
    let from = 0;
    for (;;) {
        const idx = query.indexOf(token, from);
        if (idx < 0) return -1;
        const before = idx === 0 || /\s/.test(query[idx - 1]);
        const after = idx + token.length;
        if (before && (after >= query.length || /[\s#]/.test(query[after]))) return idx;
        from = idx + 1;
    }
}

/** New query text after the user picks `tagId` from an ambiguous list; null if the pick is stale or cannot be expressed as a token. */
export function queryAfterTagPick(query: string, tagId: string, tags: Tag[]): string | null {
    const tag = tags.find((t) => t.id === tagId);
    const ambiguous = parseTagQuery(query, tags).ambiguous;
    if (!tag || !ambiguous) return null;
    const token = tagTokenFor(tag, tags);
    // No whitespace-free token resolves to this tag: leave the query untouched (menu stays open, user types more).
    if (token === null) return null;
    return rewriteQueryForTagPick(query, ambiguous.token, token);
}

interface TaggedLists<N, E, T> {
    notes: N[];
    events: E[];
    tasks: T[];
}

type EventTags = { groupIds?: string[]; parent_id?: string | null };

/**
 * Plain-search filtering for the three item kinds (notes `tagIds`, events groups, todos `tags`).
 * The element types are opaque to the caller (the store types are loose), so each kind is read through its tag field.
 */
export function filterByTagQuery<N extends object, E extends object, T extends object>(
    lists: TaggedLists<N, E, T>,
    parsed: Pick<TagQueryResult, 'tagIds'>,
    knownTagIds: ReadonlySet<string>,
): TaggedLists<N, E, T> {
    return {
        notes: applyTagFilter(lists.notes, (n) => (n as { tagIds?: string[] }).tagIds, parsed.tagIds, knownTagIds),
        events: applyTagFilter(lists.events, (e) => getEventGroupIds(e as EventTags), parsed.tagIds, knownTagIds),
        tasks: applyTagFilter(lists.tasks, (t) => (t as { tags?: string[] }).tags, parsed.tagIds, knownTagIds),
    };
}
