import { describe, it, expect } from 'vitest';
import {
    diffWords,
    createLinePatch,
    applyLinePatch,
    computeDiffStats,
    getPlainTextFromJSON,
    type DiffChange,
} from '../diff';

function assertDiffInvariants(oldText: string, newText: string, changes: DiffChange[]) {
    const reconstructedOld = changes
        .filter((c) => c.type !== 'added')
        .map((c) => c.text)
        .join('');
    const reconstructedNew = changes
        .filter((c) => c.type !== 'removed')
        .map((c) => c.text)
        .join('');

    expect(reconstructedOld).toBe(oldText);
    expect(reconstructedNew).toBe(newText);

    for (let i = 0; i < changes.length; i++) {
        expect(changes[i].text.length).toBeGreaterThan(0);
        if (i > 0) {
            expect(changes[i].type).not.toBe(changes[i - 1].type);
        }
    }
}

describe('diffWords', () => {
    it('handles Stage 0 empty and identical inputs', () => {
        expect(diffWords('', '')).toEqual([]);
        expect(diffWords('abc', 'abc')).toEqual([{ type: 'equal', text: 'abc' }]);
        expect(diffWords('', 'abc')).toEqual([{ type: 'added', text: 'abc' }]);
        expect(diffWords('abc', '')).toEqual([{ type: 'removed', text: 'abc' }]);
    });

    it('handles Stage 2 punctuation and whitespace/newline token diffs', () => {
        const comma = diffWords('Hallo', 'Hallo,');
        assertDiffInvariants('Hallo', 'Hallo,', comma);
        expect(comma).toEqual([
            { type: 'equal', text: 'Hallo' },
            { type: 'added', text: ',' },
        ]);

        const nl = diffWords('Hallo Welt', 'Hallo\nWelt');
        assertDiffInvariants('Hallo Welt', 'Hallo\nWelt', nl);
        expect(nl).toEqual([
            { type: 'equal', text: 'Hallo' },
            { type: 'removed', text: ' ' },
            { type: 'added', text: '\n' },
            { type: 'equal', text: 'Welt' },
        ]);

        const hyphens = diffWords('a-b-c', 'a b c');
        assertDiffInvariants('a-b-c', 'a b c', hyphens);
        expect(hyphens).toEqual([
            { type: 'equal', text: 'a' },
            { type: 'removed', text: '-' },
            { type: 'added', text: ' ' },
            { type: 'equal', text: 'b' },
            { type: 'removed', text: '-' },
            { type: 'added', text: ' ' },
            { type: 'equal', text: 'c' },
        ]);
    });

    it('accepts pure character insertions and deletions unconditionally', () => {
        const cases: Array<[string, string, DiffChange[]]> = [
            [
                'HalloWelt',
                'Hallo Welt',
                [
                    { type: 'equal', text: 'Hallo' },
                    { type: 'added', text: ' ' },
                    { type: 'equal', text: 'Welt' },
                ],
            ],
            [
                'Hallo Welt',
                'HalloWelt',
                [
                    { type: 'equal', text: 'Hallo' },
                    { type: 'removed', text: ' ' },
                    { type: 'equal', text: 'Welt' },
                ],
            ],
            [
                'ab',
                'a b',
                [
                    { type: 'equal', text: 'a' },
                    { type: 'added', text: ' ' },
                    { type: 'equal', text: 'b' },
                ],
            ],
            [
                'Dasistgut',
                'Das ist gut',
                [
                    { type: 'equal', text: 'Das' },
                    { type: 'added', text: ' ' },
                    { type: 'equal', text: 'ist' },
                    { type: 'added', text: ' ' },
                    { type: 'equal', text: 'gut' },
                ],
            ],
            [
                'Versionirung',
                'Versionierung',
                [
                    { type: 'equal', text: 'Versioni' },
                    { type: 'added', text: 'e' },
                    { type: 'equal', text: 'rung' },
                ],
            ],
        ];

        for (const [oldText, newText, expected] of cases) {
            const res = diffWords(oldText, newText);
            assertDiffInvariants(oldText, newText, res);
            expect(res).toEqual(expected);
        }
    });

    it('refines high-similarity mixed replacements and rejects noisy whole-word changes', () => {
        const einkauf = diffWords('Einkaufsliste', 'Einkaufszettel');
        assertDiffInvariants('Einkaufsliste', 'Einkaufszettel', einkauf);
        expect(einkauf).toEqual([
            { type: 'equal', text: 'Einkaufs' },
            { type: 'removed', text: 'liste' },
            { type: 'added', text: 'zettel' },
        ]);

        const caseSpace = diffWords('HalloWelt', 'Hallo welt');
        assertDiffInvariants('HalloWelt', 'Hallo welt', caseSpace);
        expect(caseSpace).toEqual([
            { type: 'equal', text: 'Hallo' },
            { type: 'removed', text: 'W' },
            { type: 'added', text: ' w' },
            { type: 'equal', text: 'elt' },
        ]);

        const timeChange = diffWords('10:00', '10:30');
        assertDiffInvariants('10:00', '10:30', timeChange);
        expect(timeChange).toEqual([
            { type: 'equal', text: '10:' },
            { type: 'removed', text: '00' },
            { type: 'added', text: '30' },
        ]);

        const wholeWords: Array<[string, string]> = [
            ['Katze', 'Hund'],
            ['Apfel', 'Birne'],
            ['das', 'der'],
            ['in', 'im'],
            ['Montag', 'Freitag'],
        ];
        for (const [oldW, newW] of wholeWords) {
            const res = diffWords(oldW, newW);
            assertDiffInvariants(oldW, newW, res);
            expect(res).toEqual([
                { type: 'removed', text: oldW },
                { type: 'added', text: newW },
            ]);
        }
    });

    it('merges mixed-replacement whitespace bridges without merging pure insertions', () => {
        const phrase = diffWords('Der Fuchs', 'Die Katze');
        assertDiffInvariants('Der Fuchs', 'Die Katze', phrase);
        expect(phrase).toEqual([
            { type: 'removed', text: 'Der Fuchs' },
            { type: 'added', text: 'Die Katze' },
        ]);

        const multiInsert = diffWords('HalloWelt testFoo', 'Hallo Welt test Foo');
        assertDiffInvariants('HalloWelt testFoo', 'Hallo Welt test Foo', multiInsert);
        expect(multiInsert).toEqual([
            { type: 'equal', text: 'Hallo' },
            { type: 'added', text: ' ' },
            { type: 'equal', text: 'Welt test' },
            { type: 'added', text: ' ' },
            { type: 'equal', text: 'Foo' },
        ]);
    });

    it('performs lossless boundary shifting on line boundaries', () => {
        const middleLine = diffWords('foo\nbar', 'foo\nbaz\nbar');
        assertDiffInvariants('foo\nbar', 'foo\nbaz\nbar', middleLine);
        expect(middleLine).toEqual([
            { type: 'equal', text: 'foo\n' },
            { type: 'added', text: 'baz\n' },
            { type: 'equal', text: 'bar' },
        ]);

        const duplicateLine = diffWords('foo\nbar\nbaz', 'foo\nbar\nbar\nbaz');
        assertDiffInvariants('foo\nbar\nbaz', 'foo\nbar\nbar\nbaz', duplicateLine);
        expect(duplicateLine).toEqual([
            { type: 'equal', text: 'foo\nbar\n' },
            { type: 'added', text: 'bar\n' },
            { type: 'equal', text: 'baz' },
        ]);
    });

    it('never splits emojis or surrogate pairs', () => {
        const emojiSpace = diffWords('Hello 👋World', 'Hello 👋 World');
        assertDiffInvariants('Hello 👋World', 'Hello 👋 World', emojiSpace);
        expect(emojiSpace).toEqual([
            { type: 'equal', text: 'Hello 👋' },
            { type: 'added', text: ' ' },
            { type: 'equal', text: 'World' },
        ]);

        const emojiSwap = diffWords('🎉Test', '🎊Test');
        assertDiffInvariants('🎉Test', '🎊Test', emojiSwap);
        expect(emojiSwap).toEqual([
            { type: 'removed', text: '🎉' },
            { type: 'added', text: '🎊' },
            { type: 'equal', text: 'Test' },
        ]);
    });

    it('handles a 2000-line document quickly and preserves invariants', () => {
        const lines = Array.from({ length: 2000 }, (_, i) => `Zeile ${i}: Inhalt der Notiz`);
        const oldDoc = lines.join('\n');
        const modified = [...lines];
        modified[150] = 'Zeile 150: Aktualisierter Inhalt der Notiz';
        modified.splice(1000, 0, 'Eingeschobene neue Zeile');
        modified.splice(1750, 2);
        const newDoc = modified.join('\n');

        const start = performance.now();
        const changes = diffWords(oldDoc, newDoc);
        const elapsedMs = performance.now() - start;

        assertDiffInvariants(oldDoc, newDoc, changes);
        expect(elapsedMs).toBeLessThan(1000);
    });

    it('falls back gracefully when edit distance exceeds maxD', () => {
        const oldHuge = Array.from({ length: 2500 }, (_, i) => `old_${i}`).join('\n');
        const newHuge = Array.from({ length: 2500 }, (_, i) => `new_${i}`).join('\n');
        const changes = diffWords(oldHuge, newHuge);
        assertDiffInvariants(oldHuge, newHuge, changes);
    });
});

describe('createLinePatch & applyLinePatch', () => {
    it('creates and applies line patches cleanly across edge cases and 2000-line docs', () => {
        expect(createLinePatch('same\ntext', 'same\ntext')).toEqual([]);

        const pairs: Array<[string, string]> = [
            ['', 'a\nb'],
            ['a\nb', ''],
            ['a\nb\nc', 'a\nx\ny\nc'],
            ['start\nmid\nend', 'prepended\nstart\nend\nappended'],
        ];

        for (const [oldStr, newStr] of pairs) {
            const patch = createLinePatch(oldStr, newStr);
            expect(applyLinePatch(oldStr, patch)).toBe(newStr);
        }

        const bigOld = Array.from({ length: 2000 }, (_, i) => `Line ${i}`).join('\n');
        const bigArr = bigOld.split('\n');
        bigArr[123] = 'Line 123 edited';
        bigArr.splice(1500, 3, 'Inserted A', 'Inserted B');
        const bigNew = bigArr.join('\n');

        const bigPatch = createLinePatch(bigOld, bigNew);
        expect(applyLinePatch(bigOld, bigPatch)).toBe(bigNew);
    });
});

describe('computeDiffStats', () => {
    it('computes char and word counts accurately', () => {
        expect(computeDiffStats([])).toEqual({
            addedChars: 0,
            removedChars: 0,
            addedWords: 0,
            removedWords: 0,
            hasChanges: false,
        });

        expect(computeDiffStats([{ type: 'equal', text: 'Hallo Welt' }])).toEqual({
            addedChars: 0,
            removedChars: 0,
            addedWords: 0,
            removedWords: 0,
            hasChanges: false,
        });

        const stats = computeDiffStats([
            { type: 'equal', text: 'Hallo ' },
            { type: 'removed', text: 'alte Welt' },
            { type: 'added', text: 'schöne neue 🎉 Welt' },
        ]);
        expect(stats).toEqual({
            addedChars: 18,
            removedChars: 9,
            addedWords: 3,
            removedWords: 2,
            hasChanges: true,
        });
    });
});

describe('getPlainTextFromJSON', () => {
    it('returns empty string for nullish or non-object inputs', () => {
        expect(getPlainTextFromJSON(null)).toBe('');
        expect(getPlainTextFromJSON(undefined)).toBe('');
        expect(getPlainTextFromJSON('raw')).toBe('');
    });

    it('extracts text across rich TipTap node types', () => {
        const doc = {
            type: 'doc',
            content: [
                { type: 'heading', content: [{ type: 'text', text: 'Titel' }] },
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: 'Hallo' },
                        { type: 'hardBreak' },
                        { type: 'inlineMath', attrs: { code: 'a^2+b^2=c^2' } },
                        { type: 'text', text: ' ' },
                        { type: 'dateMention', attrs: { label: 'Heute', isoDate: '2026-11-23' } },
                        { type: 'text', text: ' ' },
                        { type: 'taskMention', attrs: { id: 't1', label: 'Aufgabe 1' } },
                        { type: 'text', text: ' ' },
                        { type: 'mention', attrs: { id: 'u1' } },
                        { type: 'text', text: ' ' },
                        { type: 'calendarEvent', attrs: { title: 'Sync' } },
                        { type: 'text', text: ' ' },
                        { type: 'viewMention', attrs: { label: 'Kanban' } },
                        { type: 'text', text: ' ' },
                        { type: 'anchor', attrs: { anchorId: 'sec-1' } },
                        { type: 'text', text: ' ' },
                        { type: 'inlineComment', content: [{ type: 'text', text: 'Kommentar' }] },
                    ],
                },
                { type: 'horizontalRule' },
                { type: 'pageBreak' },
                { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;' }] },
                {
                    type: 'blockquote',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Zitat' }] }],
                },
                {
                    type: 'bulletList',
                    content: [{ type: 'listItem', content: [{ type: 'text', text: 'Punkt' }] }],
                },
                {
                    type: 'taskList',
                    content: [
                        {
                            type: 'taskItem',
                            attrs: { checked: true },
                            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Erledigt' }] }],
                        },
                        {
                            type: 'taskItem',
                            attrs: { checked: false },
                            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Offen' }] }],
                        },
                    ],
                },
                {
                    type: 'table',
                    content: [
                        {
                            type: 'tableRow',
                            content: [
                                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Spalte A' }] }] },
                                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Wert 1' }] }] },
                            ],
                        },
                    ],
                },
                { type: 'image', attrs: { alt: 'Diagramm' } },
                { type: 'image', attrs: {} },
                { type: 'mathBlock', attrs: { code: 'E = mc^2' } },
                { type: 'variablesBlock', attrs: { code: 'x = 10' } },
            ],
            attrs: {
                inkStrokes: [{}, {}],
            },
        };

        const plain = getPlainTextFromJSON(doc);
        expect(plain).toContain('Titel\n');
        expect(plain).toContain('Hallo\n$a^2+b^2=c^2$ @Heute @Aufgabe 1 @u1 [Termin: Sync] [Ansicht: Kanban] [Anker: sec-1] Kommentar\n');
        expect(plain).toContain('---\n');
        expect(plain).toContain('\n--- Seitenumbruch ---\n');
        expect(plain).toContain('const x = 1;\n');
        expect(plain).toContain('Zitat\n');
        expect(plain).toContain('Punkt\n');
        expect(plain).toContain('[x] Erledigt\n');
        expect(plain).toContain('[ ] Offen\n');
        expect(plain).toContain('Spalte A | Wert 1\n');
        expect(plain).toContain('[Bild: Diagramm]');
        expect(plain).toContain('[Bild]');
        expect(plain).toContain('$$E = mc^2$$\n');
        expect(plain).toContain('[Variablen]\nx = 10\n');
        expect(plain).toContain('[Zeichnung: 2 Striche]\n');
    });
});
