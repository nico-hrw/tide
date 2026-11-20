import { describe, it, expect } from 'vitest';
import { evaluate } from '../evaluate';
import { parseFormula } from '../parser';
import { buildScope, type Definition } from '../scope';
import type { Value } from '../types';
import { applySnapshotToDocJson, findUsedGlobals } from '../usedGlobals';

const def = (name: string, expr: string, params?: string[], global = true): Definition =>
    params ? { name, params, expr, global } : { name, expr, global };

function makeDoc(
    rows: string[][],
    blocks: Array<{ code: string; snapshot?: Definition[] }> = [],
): Record<string, unknown> {
    const blockNodes = blocks.map((b) => ({
        type: 'variablesBlock',
        attrs: b.snapshot !== undefined ? { code: b.code, snapshot: b.snapshot } : { code: b.code },
    }));

    const tableNode = {
        type: 'table',
        content: rows.map((row) => ({
            type: 'tableRow',
            content: row.map((text) => ({
                type: 'tableCell',
                content: [
                    text
                        ? { type: 'paragraph', content: [{ type: 'text', text }] }
                        : { type: 'paragraph' },
                ],
            })),
        })),
    };

    return {
        type: 'doc',
        content: [...blockNodes, tableNode],
    };
}

function evalWithScope(formula: string, snapshot: Definition[]): Value {
    const scope = buildScope({ local: [], global: () => [], snapshot });
    return evaluate(parseFormula(formula), { cell: () => '', ...scope });
}

describe('findUsedGlobals', () => {
    it('returns global variable referenced in a table cell formula', () => {
        const zins = def('zins', '3,9 %');
        const unused = def('steuer', '19 %');
        const doc = makeDoc([['100', '= A1 * zins']]);

        const res = findUsedGlobals(doc, [zins, unused]);

        expect(res.usedNames).toEqual(['zins']);
        expect(res.usedDefs).toEqual([zins]);
    });

    it('excludes variables defined locally in a variablesBlock', () => {
        const globalZins = def('zins', '3,9 %');
        const doc = makeDoc([['100', '= A1 * zins']], [{ code: 'zins = 2,5 %' }]);

        const res = findUsedGlobals(doc, [globalZins]);

        expect(res.usedNames).toEqual([]);
        expect(res.usedDefs).toEqual([]);
    });

    it('includes transitive global dependencies from global function calls', () => {
        const basis = def('basis', '4,8 %');
        const rate = def('rate', 'RMZ(basis / 12, n, -b)', ['b', 'n']);
        const doc = makeDoc([['= rate(100, 12)']]);

        const res = findUsedGlobals(doc, [basis, rate]);

        expect(res.usedNames).toEqual(['rate', 'basis']);
        expect(res.usedDefs).toEqual([rate, basis]);
    });

    it('handles empty docs, non-formula cells, and invalid formulas without throwing', () => {
        const zins = def('zins', '3,9 %');

        expect(findUsedGlobals({ type: 'doc', content: [] }, [zins])).toEqual({
            usedDefs: [],
            usedNames: [],
        });
        expect(findUsedGlobals(null, [zins])).toEqual({
            usedDefs: [],
            usedNames: [],
        });
        expect(findUsedGlobals('', [zins])).toEqual({
            usedDefs: [],
            usedNames: [],
        });

        const docNonFormula = makeDoc([['100', 'Text mit zins', '']]);
        expect(findUsedGlobals(docNonFormula, [zins])).toEqual({
            usedDefs: [],
            usedNames: [],
        });

        const docInvalid = makeDoc([['= (1 +', '= "unclosed', '= zins * 2']]);
        expect(() => findUsedGlobals(docInvalid, [zins])).not.toThrow();
        expect(findUsedGlobals(docInvalid, [zins]).usedNames).toEqual(['zins']);
    });
});

describe('applySnapshotToDocJson', () => {
    it('updates attrs.snapshot on an existing variablesBlock', () => {
        const zins = def('zins', '3,9 %');
        const doc = makeDoc([['= A1 * zins']], [{ code: 'foo = 1' }]);

        const updated = applySnapshotToDocJson(doc, [zins]);
        const content = updated.content as Array<Record<string, unknown>>;

        expect(content).toHaveLength(2);
        expect(content[0]).toEqual({
            type: 'variablesBlock',
            attrs: { code: 'foo = 1', snapshot: [zins] },
        });
        // Original doc remains unchanged
        const origContent = doc.content as Array<Record<string, unknown>>;
        expect((origContent[0].attrs as Record<string, unknown>).snapshot).toBeUndefined();
    });

    it('prepends a new variablesBlock with snapshot when none exists', () => {
        const zins = def('zins', '3,9 %');
        const doc = makeDoc([['= zins']]);

        const updated = applySnapshotToDocJson(doc, [zins]);
        const content = updated.content as Array<Record<string, unknown>>;

        expect(content).toHaveLength(2);
        expect(content[0]).toEqual({
            type: 'variablesBlock',
            attrs: { code: '', snapshot: [zins] },
        });
        expect(content[1].type).toBe('table');
    });

    it('clears snapshot by setting attrs.snapshot to []', () => {
        const zins = def('zins', '3,9 %');
        const doc = makeDoc([['= zins']], [{ code: 'foo = 1', snapshot: [zins] }]);

        const cleared = applySnapshotToDocJson(doc, []);
        const content = cleared.content as Array<Record<string, unknown>>;

        expect(content[0]).toEqual({
            type: 'variablesBlock',
            attrs: { code: 'foo = 1', snapshot: [] },
        });
    });
});

describe('buildScope snapshot resolution', () => {
    it('resolves variable when snapshot is provided and evaluates missing variable to #VAR with empty snapshot', () => {
        const zins = def('zins', '3,9 %');

        expect(evalWithScope('=zins * 100', [zins])).toBeCloseTo(3.9, 10);
        expect(evalWithScope('=zins * 100', [])).toEqual(
            expect.objectContaining({ error: '#VAR' }),
        );
    });
});
