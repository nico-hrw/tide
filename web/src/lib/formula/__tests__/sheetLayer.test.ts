import { describe, it, expect } from 'vitest';
import { buildScope, type Definition } from '../scope';
import { parseFormula } from '../parser';
import { evaluate } from '../evaluate';
import type { Value } from '../types';

const def = (name: string, expr: string): Definition => ({ name, expr, global: false });

function run(src: string, layers: Partial<Parameters<typeof buildScope>[0]> = {}): Value {
    const scope = buildScope({ local: [], global: () => [], snapshot: [], ...layers });
    return evaluate(parseFormula(src), { cell: () => '', ...scope });
}

const sheet = (entries: Array<[string, unknown]>) => new Map<string, unknown>(entries);

describe('buildScope: VarSheet layer', () => {
    it('reads a number defined in the VarSheet', () => {
        expect(run('=x*2', { sheet: sheet([['x', 3]]) })).toBe(6);
    });

    it('finds a name regardless of case', () => {
        expect(run('=Zins*100', { sheet: sheet([['zins', 0.039]]) })).toBeCloseTo(3.9, 10);
    });

    it('local definitions win over the VarSheet', () => {
        expect(run('=x', { local: [def('x', '1')], sheet: sheet([['x', 99]]) })).toBe(1);
    });

    it('the VarSheet wins over the central registry', () => {
        expect(run('=x', { global: () => [def('x', '2')], sheet: sheet([['x', 5]]) })).toBe(5);
    });

    it('does not read the central registry when the VarSheet resolves the name', () => {
        let called = 0;
        run('=x', { global: () => { called++; return []; }, sheet: sheet([['x', 5]]) });
        expect(called).toBe(0);
    });

    it('falls through to the registry for names the VarSheet does not know', () => {
        expect(run('=y', { global: () => [def('y', '7')], sheet: sheet([['x', 5]]) })).toBe(7);
    });

    it('calls a function defined in the VarSheet', () => {
        const f = (a: number, b: number) => a * b + 1;
        expect(run('=mal(3; 4)', { sheet: sheet([['mal', f]]) })).toBe(13);
    });

    it('reports #WERT instead of throwing when a VarSheet function fails', () => {
        const boom = () => { throw new Error('kaputt'); };
        expect(run('=boom(1)', { sheet: sheet([['boom', boom]]) })).toMatchObject({ error: '#WERT' });
    });

    it('reports #WERT when a VarSheet function returns no finite number', () => {
        expect(run('=nan(1)', { sheet: sheet([['nan', () => Number.NaN]]) })).toMatchObject({ error: '#WERT' });
    });

    it('reports #WERT for a variable that is not a finite number', () => {
        expect(run('=x', { sheet: sheet([['x', Infinity]]) })).toMatchObject({ error: '#WERT' });
    });

    it('ignores a function when it is used as a plain variable', () => {
        expect(run('=f', { sheet: sheet([['f', () => 1]]) })).toMatchObject({ error: '#VAR' });
    });

    it('an unknown name stays #VAR', () => {
        expect(run('=nichtda', { sheet: sheet([['x', 1]]) })).toMatchObject({ error: '#VAR' });
    });
});
