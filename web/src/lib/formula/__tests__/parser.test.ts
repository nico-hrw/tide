import { describe, it, expect } from 'vitest';
import { parseFormula, parseNumber } from '../parser';
import { FormulaError } from '../types';

describe('parseNumber', () => {
  it('reads German decimals and thousands', () => {
    expect(parseNumber('3,9')).toBe(3.9);
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('12.000,00 €')).toBe(12000);
    expect(parseNumber('-4')).toBe(-4);
  });
  it('reads percent as a fraction', () => {
    expect(parseNumber('12 %')).toBeCloseTo(0.12);
    expect(parseNumber('3,9 %')).toBeCloseTo(0.039);
  });
  it('rejects dot decimals and text', () => {
    expect(parseNumber('1.5')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });
});

describe('parseFormula', () => {
  it('parses 3,9 as 3.9', () => {
    expect(parseFormula('=3,9')).toEqual({ k: 'num', v: 3.9 });
  });
  it('parses 1.234,5 as 1234.5', () => {
    expect(parseFormula('=1.234,5')).toEqual({ k: 'num', v: 1234.5 });
  });
  it('parses 12 % as a percent node', () => {
    expect(parseFormula('=12 %')).toEqual({ k: 'pct', e: { k: 'num', v: 12 } });
  });
  it('parses B2:B9 as a range (0-based col/row)', () => {
    expect(parseFormula('=SUMME(B2:B9)')).toEqual({
      k: 'call', name: 'SUMME',
      args: [{ k: 'range', from: { col: 1, row: 1 }, to: { col: 1, row: 8 } }],
    });
  });
  it('respects precedence: 1+2*3^2', () => {
    expect(parseFormula('=1+2*3^2')).toEqual({
      k: 'bin', op: '+', l: { k: 'num', v: 1 },
      r: { k: 'bin', op: '*', l: { k: 'num', v: 2 }, r: { k: 'bin', op: '^', l: { k: 'num', v: 3 }, r: { k: 'num', v: 2 } } },
    });
  });
  it('makes ^ right associative', () => {
    expect(parseFormula('=2^3^2')).toEqual({
      k: 'bin', op: '^', l: { k: 'num', v: 2 },
      r: { k: 'bin', op: '^', l: { k: 'num', v: 3 }, r: { k: 'num', v: 2 } },
    });
  });
  it('parses rate(B2, zins, 48) with comma separators', () => {
    expect(parseFormula('=rate(B2, zins, 48)')).toEqual({
      k: 'call', name: 'RATE',
      args: [{ k: 'ref', col: 1, row: 1 }, { k: 'var', name: 'zins' }, { k: 'num', v: 48 }],
    });
  });
  it('treats ; as separator and digit,digit as a decimal', () => {
    expect(parseFormula('=RMZ(0,039/12; 48; 100)')).toMatchObject({ k: 'call', name: 'RMZ' });
    const e = parseFormula('=RMZ(0,039/12; 48; 100)');
    expect(e.k === 'call' && e.args).toHaveLength(3);
  });
  it('parses unary minus and strings', () => {
    expect(parseFormula('=-B1')).toEqual({ k: 'neg', e: { k: 'ref', col: 1, row: 0 } });
    expect(parseFormula('="a"')).toEqual({ k: 'str', v: 'a' });
  });
  it('rejects an unclosed paren with #WERT', () => {
    try { parseFormula('=(1+2'); expect.unreachable(); }
    catch (e) { expect(e).toBeInstanceOf(FormulaError); expect((e as FormulaError).code).toBe('#WERT'); }
  });
  it('rejects trailing garbage with #WERT', () => {
    expect(() => parseFormula('=1 2')).toThrow(FormulaError);
  });

  it('tokenizes & as a binary operator', () => {
    expect(() => parseFormula('="a"&"b"')).not.toThrow();
    expect(parseFormula('="a"&"b"')).toEqual({ k: 'bin', op: '&', l: { k: 'str', v: 'a' }, r: { k: 'str', v: 'b' } });
  });
  it('& is left-associative and weaker than +', () => {
    expect(parseFormula('=1&2&3')).toEqual({
      k: 'bin', op: '&',
      l: { k: 'bin', op: '&', l: { k: 'num', v: 1 }, r: { k: 'num', v: 2 } },
      r: { k: 'num', v: 3 },
    });
    expect(parseFormula('=1&2+3')).toEqual({
      k: 'bin', op: '&', l: { k: 'num', v: 1 },
      r: { k: 'bin', op: '+', l: { k: 'num', v: 2 }, r: { k: 'num', v: 3 } },
    });
  });
});
