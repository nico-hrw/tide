import { describe, it, expect, vi } from 'vitest';
import { parseDefinitions, buildScope, type Definition } from '../scope';
import { parseFormula } from '../parser';
import { evaluate } from '../evaluate';
import type { Value } from '../types';

const def = (name: string, expr: string, params?: string[]): Definition => ({ name, expr, params, global: false });

function run(src: string, layers: Partial<Parameters<typeof buildScope>[0]> = {}): Value {
  const scope = buildScope({ local: [], global: () => [], snapshot: [], ...layers });
  return evaluate(parseFormula(src), { cell: () => '', ...scope });
}

describe('parseDefinitions', () => {
  it('parses values, functions, @global and skips blanks, comments and junk', () => {
    const defs = parseDefinitions(['@zins = 3,9 %', 'laufzeit = 48', '', '# Notiz', 'rate(b, z, n) = RMZ(z / 12, n, -b)', 'kaputt ohne gleich', '1abc = 3'].join('\n'));
    expect(defs).toEqual([
      { name: 'zins', expr: '3,9 %', global: true },
      { name: 'laufzeit', expr: '48', global: false },
      { name: 'rate', params: ['b', 'z', 'n'], expr: 'RMZ(z / 12, n, -b)', global: false },
    ]);
  });
});

describe('buildScope', () => {
  it('resolves local values and percent', () => {
    expect(run('=zins*100', { local: [def('zins', '3,9 %')] })).toBeCloseTo(3.9, 10);
  });

  it('local wins over global', () => {
    expect(run('=x', { local: [def('x', '1')], global: () => [def('x', '2')] })).toBe(1);
  });

  it('does not read the global registry when local resolves', () => {
    const global = vi.fn(() => [def('x', '2')]);
    run('=x', { local: [def('x', '1')], global });
    expect(global).not.toHaveBeenCalled();
  });

  it('falls back to global, then snapshot, then stdlib', () => {
    expect(run('=g', { global: () => [def('g', '5')] })).toBe(5);
    expect(run('=s', { snapshot: [def('s', '7')] })).toBe(7);
    expect(run('=pi')).toBeCloseTo(Math.PI, 10);
  });

  it('global wins over snapshot', () => {
    expect(run('=v', { global: () => [def('v', '1')], snapshot: [def('v', '2')] })).toBe(1);
  });

  it('pi can be overridden', () => {
    expect(run('=pi', { local: [def('pi', '3')] })).toBe(3);
  });

  it('derived variables resolve through each other', () => {
    expect(run('=b', { local: [def('a', '2'), def('b', 'a*3')] })).toBe(6);
  });

  it('variable cycles give #ZIRKEL', () => {
    expect(run('=a', { local: [def('a', 'b'), def('b', 'a')] })).toEqual(expect.objectContaining({ error: '#ZIRKEL' }));
  });

  it('unknown names give #VAR', () => {
    expect(run('=nichts')).toEqual(expect.objectContaining({ error: '#VAR' }));
  });

  it('user functions bind parameters and are case-insensitive', () => {
    const local = [def('rate', 'RMZ(z / 12; n; -b)', ['b', 'z', 'n'])];
    expect(run('=rate(12000; 0,039; 48)', { local })).toBeCloseTo(270.412, 2);
    expect(run('=RATE(12000; 0,039; 48)', { local })).toBeCloseTo(270.412, 2);
  });

  it('user function parameters shadow variables', () => {
    expect(run('=f(10)', { local: [def('x', '1'), def('f', 'x*2', ['x'])] })).toBe(20);
  });

  it('recursive user functions give #ZIRKEL instead of overflowing', () => {
    expect(run('=f(1)', { local: [def('f', 'f(x)', ['x'])] })).toEqual(expect.objectContaining({ error: '#ZIRKEL' }));
  });

  it('exponentially branching functions hit the call budget instead of stalling', () => {
    const local = [def('f', 'WENN(n; f(n-1)+f(n-1); 1)', ['n'])];
    const t0 = performance.now();
    const v = run('=f(18)', { local });
    expect(performance.now() - t0).toBeLessThan(500);
    expect(v).toEqual(expect.objectContaining({ error: '#WERT' }));
  });

  it('a normal bounded recursion below the budget still works', () => {
    const local = [def('f', 'WENN(n; n+f(n-1); 0)', ['n'])];
    expect(run('=f(10)', { local })).toBe(55);
  });

  it('variables cannot reference cells', () => {
    expect(run('=a', { local: [def('a', 'B2')] })).toEqual(expect.objectContaining({ error: '#BEZUG' }));
  });
});
