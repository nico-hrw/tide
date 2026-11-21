import { normalizeTagName, type Tag } from '@/lib/tags';

export interface TagQueryResult {
    tagIds: string[];
    text: string;
    ambiguous: { token: string; candidates: Tag[] } | null;
}

/** `#word` at the start of the query or after whitespace; word has no whitespace and no `#`. */
const TOKEN_RE = /(^|\s)#([^\s#]+)/g;

/**
 * Splits an @-menu query into tag filters and free text.
 * Exact (normalized) name wins, else a unique prefix match; several prefix
 * matches make the first such token ambiguous (not applied, removed from text).
 * Unknown tokens stay part of the text.
 */
export function parseTagQuery(query: string, tags: Tag[]): TagQueryResult {
    const tagIds: string[] = [];
    let ambiguous: TagQueryResult['ambiguous'] = null;
    const removals: Array<[number, number]> = [];

    for (const m of query.matchAll(TOKEN_RE)) {
        const start = (m.index ?? 0) + m[1].length;
        const end = start + 1 + m[2].length;
        const word = normalizeTagName(m[2]);
        const exact = tags.find((t) => normalizeTagName(t.title) === word);
        if (exact) {
            if (!tagIds.includes(exact.id)) tagIds.push(exact.id);
            removals.push([start, end]);
            continue;
        }
        const prefixed = tags.filter((t) => normalizeTagName(t.title).startsWith(word));
        if (prefixed.length === 1) {
            if (!tagIds.includes(prefixed[0].id)) tagIds.push(prefixed[0].id);
            removals.push([start, end]);
        } else if (prefixed.length > 1 && !ambiguous) {
            ambiguous = { token: `#${m[2]}`, candidates: prefixed };
            removals.push([start, end]);
        }
    }

    let text = '';
    let pos = 0;
    for (const [s, e] of removals) {
        text += query.slice(pos, s);
        pos = e;
    }
    text += query.slice(pos);
    text = text.replace(/\s+/g, ' ').trim();

    return { tagIds, text, ambiguous };
}

/** AND over wanted tag ids; ids not in knownTagIds (deleted/foreign) do not count. */
export function matchesAllTags(
    itemTagIds: readonly string[] | undefined,
    tagIds: readonly string[],
    knownTagIds: ReadonlySet<string>,
): boolean {
    if (tagIds.length === 0) return true;
    if (!itemTagIds || itemTagIds.length === 0) return false;
    const own = new Set(itemTagIds.filter((id) => knownTagIds.has(id)));
    return tagIds.every((id) => own.has(id));
}
