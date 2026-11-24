import { describe, expect, it } from 'vitest';
import type { ContactItem } from '@/store/slices/types';
import {
    applyMentionPick,
    fromEditText,
    mentionRows,
    mentionTrigger,
    parseEventMentions,
    removeEventMention,
    removedMentions,
    toEditText,
} from '../eventMentions';

const anna = { id: 'u-anna', label: 'anna' };
const tok = (m: { id: string; label: string }) => `[@${m.label}](tide://contact/${m.id})`;

describe('parseEventMentions', () => {
    it('returns nothing for plain or empty text (old events)', () => {
        expect(parseEventMentions('')).toEqual([]);
        expect(parseEventMentions('Treffen mit @anna im Büro')).toEqual([]);
        expect(parseEventMentions('[Notiz](tide://note/n1)')).toEqual([]);
    });
    it('reads each contact once, in order', () => {
        const s = `Mit ${tok(anna)} und ${tok({ id: 'u-ben', label: 'ben' })} und nochmal ${tok(anna)}`;
        expect(parseEventMentions(s)).toEqual([anna, { id: 'u-ben', label: 'ben' }]);
    });
});

describe('toEditText / fromEditText', () => {
    it('shows @label for tokens and leaves plain text untouched', () => {
        expect(toEditText(`Hi ${tok(anna)}!`)).toBe('Hi @anna!');
        expect(toEditText('nur Text')).toBe('nur Text');
    });
    it('turns @label of known mentions back into tokens', () => {
        expect(fromEditText('Hi @anna!', [anna])).toBe(`Hi ${tok(anna)}!`);
    });
    it('round-trips', () => {
        const stored = `a ${tok(anna)} b ${tok({ id: 'u2', label: 'anna.b' })} c`;
        const ms = parseEventMentions(stored);
        expect(fromEditText(toEditText(stored), ms)).toBe(stored);
    });
    it('does not touch mails, longer names or unknown names', () => {
        expect(fromEditText('mail@anna', [anna])).toBe('mail@anna');
        expect(fromEditText('@annabelle', [anna])).toBe('@annabelle');
        expect(fromEditText('@ben', [anna])).toBe('@ben');
    });
    it('without mentions the text is unchanged', () => {
        expect(fromEditText('@anna', [])).toBe('@anna');
    });
    it('escapes regex characters in labels', () => {
        const m = { id: 'x', label: 'a.b+c' };
        expect(fromEditText('@a.b+c ok', [m])).toBe(`${tok(m)} ok`);
    });
});

describe('mentionTrigger / applyMentionPick', () => {
    it('detects @query before the caret', () => {
        expect(mentionTrigger('Treffen @an', 11)).toEqual({ start: 8, query: 'an' });
        expect(mentionTrigger('@', 1)).toEqual({ start: 0, query: '' });
        expect(mentionTrigger('x\n@b', 4)).toEqual({ start: 2, query: 'b' });
    });
    it('ignores mails, spaces inside and no @', () => {
        expect(mentionTrigger('mail@an', 7)).toBeNull();
        expect(mentionTrigger('@an ja', 6)).toBeNull();
        expect(mentionTrigger('hallo', 5)).toBeNull();
    });
    it('replaces @query with @label, adds a space only when none follows, caret after it', () => {
        expect(applyMentionPick('Hi @an dort', { start: 3, query: 'an' }, 6, 'anna')).toEqual({ text: 'Hi @anna dort', caret: 9 });
        expect(applyMentionPick('Hi @an', { start: 3, query: 'an' }, 6, 'anna')).toEqual({ text: 'Hi @anna ', caret: 9 });
    });
});

describe('removal', () => {
    it('removedMentions lists people whose last token is gone', () => {
        const prev = `${tok(anna)} ${tok({ id: 'u2', label: 'ben' })}`;
        expect(removedMentions(prev, tok(anna))).toEqual([{ id: 'u2', label: 'ben' }]);
        expect(removedMentions(prev, prev)).toEqual([]);
        expect(removedMentions('', prev)).toEqual([]);
    });
    it('removeEventMention drops every token of that person and one following space', () => {
        expect(removeEventMention(`Hi ${tok(anna)} da ${tok(anna)}`, 'u-anna')).toBe('Hi da ');
        expect(removeEventMention('plain', 'u-anna')).toBe('plain');
    });
});

describe('mentionRows', () => {
    const c = (id: string, username: string, status: string, public_key?: string) =>
        ({ id, username, status, public_key, avatar_seed: '', avatar_salt: '', avatar_style: '' }) as unknown as ContactItem;
    const contacts = [c('1', 'anna', 'accepted', 'K'), c('2', 'annika', 'pending', 'K'), c('3', 'bob', 'accepted', 'K'), c('4', 'cara', 'accepted')];
    it('offers accepted contacts only, ranked by prefix', () => {
        expect(mentionRows(contacts, 'an').map((r) => r.id)).toEqual(['1']);
        expect(mentionRows(contacts, '').map((r) => r.id)).toEqual(['1', '3', '4']);
    });
    it('keeps accepted contacts without a key (the hint explains)', () => {
        expect(mentionRows(contacts, 'ca')[0]).toMatchObject({ id: '4', shareable: false });
    });
});
