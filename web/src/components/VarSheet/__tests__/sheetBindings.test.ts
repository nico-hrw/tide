import { describe, it, expect, beforeEach } from 'vitest';
import { getDefaultEngine } from '@/lib/varsheet';
import { buildScope } from '@/lib/formula/scope';
import { parseFormula } from '@/lib/formula/parser';
import { evaluate } from '@/lib/formula/evaluate';
import { evaluateSheetBindings } from '../useVarSheetBindings';

const KEY = (noteId: string) => `tide_varsheet_${noteId}`;

function saveSheet(noteId: string, tabs: string[][]) {
    window.localStorage.setItem(KEY(noteId), JSON.stringify({
        version: 2,
        activeTabId: 't0',
        tabs: tabs.map((codes, ti) => ({
            id: `t${ti}`,
            name: `Tab ${ti + 1}`,
            rows: codes.map((code, ri) => ({ id: `r${ti}_${ri}`, code })),
        })),
    }));
}

beforeEach(() => { window.localStorage.clear(); });

describe('evaluateSheetBindings', () => {
    it('evaluates rows top-down and returns the defined symbols', async () => {
        saveSheet('n1', [['x = 3', 'y = x * 2']]);
        const out = await evaluateSheetBindings('n1', getDefaultEngine());
        expect(out.get('x')).toBe(3);
        expect(out.get('y')).toBe(6);
    });

    it('returns functions as callables', async () => {
        saveSheet('n1', [['f(a) = a + 1']]);
        const out = await evaluateSheetBindings('n1', getDefaultEngine());
        expect(typeof out.get('f')).toBe('function');
        expect((out.get('f') as (n: number) => number)(4)).toBe(5);
    });

    it('collects the symbols of all tabs, not only the first', async () => {
        saveSheet('n1', [['x = 1'], ['z = 9']]);
        const out = await evaluateSheetBindings('n1', getDefaultEngine());
        expect(out.get('x')).toBe(1);
        expect(out.get('z')).toBe(9);
    });

    it('keeps tabs independent: a tab cannot use symbols of another tab', async () => {
        saveSheet('n1', [['x = 1'], ['y = x + 1']]);
        const out = await evaluateSheetBindings('n1', getDefaultEngine());
        expect(out.has('y')).toBe(false);
        expect(out.get('x')).toBe(1);
    });

    it('a broken row does not stop the rows after it', async () => {
        saveSheet('n1', [['x = (', 'y = 2']]);
        const out = await evaluateSheetBindings('n1', getDefaultEngine());
        expect(out.has('x')).toBe(false);
        expect(out.get('y')).toBe(2);
    });

    it('returns nothing for a note without a saved sheet', async () => {
        const out = await evaluateSheetBindings('unbekannt', getDefaultEngine());
        expect(out.size).toBe(0);
    });

    it('lets a note formula use the evaluated symbols end to end', async () => {
        saveSheet('n1', [['x = 3', 'f(a) = a + 1']]);
        const sheet = await evaluateSheetBindings('n1', getDefaultEngine());
        const scope = buildScope({ local: [], global: () => [], snapshot: [], sheet });
        const v = evaluate(parseFormula('=x*2+f(1)'), { cell: () => '', ...scope });
        expect(v).toBe(8);
    });
});
