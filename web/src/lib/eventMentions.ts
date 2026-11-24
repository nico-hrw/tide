import type { ContactItem } from '@/store/slices/types';
import { buildContactItems, type ContactMentionItem } from '@/components/extensions/mentionGroups';

/**
 * @-contact mentions in the plain-text description of events (and task events).
 *
 * Data format: the description stays one string. A mention is the inline token
 * `[@username](tide://contact/<userId>)`, the same `tide://` link syntax the description already
 * uses for notes and events. No new metadata key: it survives every existing save path, old
 * descriptions without tokens are unchanged, and the id (not the label) identifies the person.
 * The textarea shows `@username` instead of the token (toEditText) and turns the names of the
 * known mentions back into tokens while typing (fromEditText). Plain `@name` text never becomes
 * a mention on its own; only a menu pick creates a token.
 */
export interface EventMention { id: string; label: string }

const TOKEN_SOURCE = '\\[@([^\\[\\]]+)\\]\\(tide://contact/([^)\\s]+)\\)';

export function parseEventMentions(stored: string): EventMention[] {
    const out: EventMention[] = [];
    for (const m of (stored || '').matchAll(new RegExp(TOKEN_SOURCE, 'g'))) {
        if (!out.some((x) => x.id === m[2])) out.push({ id: m[2], label: m[1] });
    }
    return out;
}

export function toEditText(stored: string): string {
    return (stored || '').replace(new RegExp(TOKEN_SOURCE, 'g'), '@$1');
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function fromEditText(text: string, mentions: EventMention[]): string {
    if (mentions.length === 0) return text;
    const byLabel = new Map<string, EventMention>();
    for (const m of mentions) if (!byLabel.has(m.label)) byLabel.set(m.label, m);
    const labels = [...byLabel.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
    // Not inside a word or mail address, and not the start of a longer name.
    const re = new RegExp(String.raw`(?<![\w@])@(${labels.join('|')})(?![\w-]|\.\w)`, 'g');
    return text.replace(re, (_all, label: string) => {
        const m = byLabel.get(label);
        return m ? `[@${m.label}](tide://contact/${m.id})` : _all;
    });
}

/** `@query` directly before the caret (at the start or after whitespace), or null. */
export function mentionTrigger(text: string, caret: number): { start: number; query: string } | null {
    const m = /(?:^|\s)@([\w.-]{0,32})$/.exec(text.slice(0, caret));
    if (!m) return null;
    return { start: caret - m[1].length - 1, query: m[1] };
}

export function applyMentionPick(
    text: string,
    trigger: { start: number; query: string },
    caret: number,
    label: string,
): { text: string; caret: number } {
    const before = text.slice(0, trigger.start);
    const after = text.slice(caret);
    const insert = `@${label}${/^\s/.test(after) ? '' : ' '}`;
    return { text: before + insert + after, caret: before.length + `@${label} `.length };
}

/** People who had a token in `prev` and have none in `next`. */
export function removedMentions(prev: string, next: string): EventMention[] {
    const still = new Set(parseEventMentions(next).map((m) => m.id));
    return parseEventMentions(prev).filter((m) => !still.has(m.id));
}

/** Drops every token of one person (and one space after it). */
export function removeEventMention(stored: string, id: string): string {
    return (stored || '').replace(new RegExp(`${TOKEN_SOURCE} ?`, 'g'), (all, _l: string, mid: string) => (mid === id ? '' : all));
}

/** Rows of the picker: accepted contacts only, same ranking as the note menu. */
export function mentionRows(contacts: ContactItem[], query: string): ContactMentionItem[] {
    return buildContactItems(contacts.filter((c) => c.status === 'accepted'), query);
}
