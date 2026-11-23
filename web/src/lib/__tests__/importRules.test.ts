import { describe, expect, it } from 'vitest';
import { applyImportRules, removeRuleMatch, suggestPrefixRules, tagNamesForEvent, type ImportRule } from '../importRules';
import { applyTagColorOverride } from '../tagColorOverride';

const rule = (over: Partial<ImportRule>): ImportRule => ({
    id: 'r', field: 'title', mode: 'startsWith', pattern: 'V:', tagName: 'Vorlesung', ...over,
});

describe('tagNamesForEvent', () => {
    it('matches title prefixes case-insensitively', () => {
        expect(tagNamesForEvent({ title: 'V: Controlling | Sattler' }, [rule({})])).toEqual(['Vorlesung']);
        expect(tagNamesForEvent({ title: 'P: CAD' }, [rule({})])).toEqual([]);
    });
    it('searches description and dedupes tag names', () => {
        const rules = [
            rule({ id: 'a', field: 'description', mode: 'contains', pattern: 'pflicht', tagName: 'Pflicht' }),
            rule({ id: 'b', field: 'both', mode: 'contains', pattern: 'Pflicht', tagName: ' pflicht ' }),
        ];
        expect(tagNamesForEvent({ title: 'x', description: 'Praktikum (pflicht)' }, rules)).toEqual(['Pflicht']);
    });
    it('ignores rules with an empty pattern or tag', () => {
        expect(tagNamesForEvent({ title: 'abc' }, [rule({ pattern: ' ' }), rule({ tagName: '' })])).toEqual([]);
    });
});

describe('suggestPrefixRules', () => {
    it('suggests V, P and Ü', () => {
        const rules = suggestPrefixRules([{ title: 'V: a' }, { title: 'P: b' }, { title: 'Ü: c' }, { title: 'V: d' }]);
        expect(rules.map((r) => [r.pattern, r.tagName])).toEqual([['V:', 'Vorlesung'], ['P:', 'Praktikum'], ['Ü:', 'Übung']]);
    });
    it('suggests nothing when only one prefix exists', () => {
        expect(suggestPrefixRules([{ title: 'V: a' }, { title: 'V: b' }])).toEqual([]);
    });
});

describe('applyTagColorOverride', () => {
    const tags = [{ id: 'main', color: '#111' }, { id: 'sec', color: '#222' }, { id: 'plain', color: '#333' }];
    it('lets a flagged secondary tag win over the main tag', () => {
        const e = { groupIds: ['main', 'plain', 'sec'], color: '#111' };
        expect(applyTagColorOverride(e, tags, ['sec']).color).toBe('#222');
    });
    it('never lets the main tag override itself and keeps the object otherwise', () => {
        const e = { groupIds: ['main', 'plain'], color: '#111' };
        expect(applyTagColorOverride(e, tags, ['main'])).toBe(e);
        expect(applyTagColorOverride(e, tags, [])).toBe(e);
    });
});

describe('removing matched text', () => {
    it('strips a title prefix and leftover separators', () => {
        expect(removeRuleMatch('V: Controlling | Sattler', { mode: 'startsWith', pattern: 'V:' })).toBe('Controlling | Sattler');
        expect(removeRuleMatch('Ü:Projekt', { mode: 'startsWith', pattern: 'ü:' })).toBe('Projekt');
    });
    it('removes every occurrence for contains and treats the pattern literally', () => {
        expect(removeRuleMatch('a (pflicht) b (pflicht)', { mode: 'contains', pattern: '(pflicht)' })).toBe('a b');
        // The pattern is literal (a regex dot would wipe everything); removed text leaves one space.
        expect(removeRuleMatch('x.y', { mode: 'contains', pattern: '.' })).toBe('x y');
    });
    it('returns text unchanged when nothing matches', () => {
        expect(removeRuleMatch('Controlling', { mode: 'startsWith', pattern: 'V:' })).toBe('Controlling');
    });
    it('applies removal only for rules that ask for it and keeps the tag', () => {
        const keep = rule({ id: 'k', pattern: 'P:', tagName: 'Praktikum' });
        const strip = rule({ id: 's', removeMatch: true });
        expect(applyImportRules({ title: 'V: CAD' }, [keep, strip])).toEqual({ title: 'CAD', tagNames: ['Vorlesung'] });
        expect(applyImportRules({ title: 'P: CAD' }, [keep, strip])).toEqual({ title: 'P: CAD', tagNames: ['Praktikum'] });
    });
    it('never produces an empty title', () => {
        expect(applyImportRules({ title: 'V:' }, [rule({ removeMatch: true })]).title).toBe('V:');
    });
});

describe('buildSecuredEventMeta', () => {
    it('keeps the RSA payload under the OAEP limit even for long titles', async () => {
        const { buildSecuredEventMeta, MAX_SECURED_META_BYTES } = await import('../securedEventMeta');
        const meta = buildSecuredEventMeta({ title: 'T'.repeat(400), start: '2026-10-05T07:45:00.000Z', end: '2026-10-05T09:15:00.000Z', allDay: false });
        expect(new TextEncoder().encode(JSON.stringify(meta)).length).toBeLessThanOrEqual(MAX_SECURED_META_BYTES);
        expect(String(meta.title).length).toBeGreaterThan(10);
    });
});
