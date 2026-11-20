import { describe, it, expect } from 'vitest';
import { findRefs, canInsertRefAt, sumRangeFor, REF_COLOR_COUNT } from '../formulaRefs';
import { gridFromRows } from '../tableCalc';

describe('findRefs', () => {
  it('finds single refs and ranges with offsets', () => {
    const text = '=B2*C2/12+SUMME(D2:D9)';
    const refs = findRefs(text);
    expect(refs.map((r) => text.slice(r.start, r.end))).toEqual(['B2', 'C2', 'D2:D9']);
    expect(refs[2].from).toEqual({ col: 3, row: 1 });
    expect(refs[2].to).toEqual({ col: 3, row: 8 });
  });

  it('gives the same colour to the same ref and different colours to different refs', () => {
    const refs = findRefs('=B2+C2+B2');
    expect(refs[0].color).toBe(refs[2].color);
    expect(refs[0].color).not.toBe(refs[1].color);
    expect(refs.every((r) => r.color < REF_COLOR_COUNT)).toBe(true);
  });

  it('ignores function names and variables that look like refs', () => {
    expect(findRefs('=LOG10(zins2)+kurs_usd')).toEqual([]);
  });
});

describe('canInsertRefAt', () => {
  it('allows after =, operators, ( and separators', () => {
    for (const t of ['=', '=B2*', '= B2 + ', '=SUMME(', '=RMZ(B2;', '=WENN(B2>']) expect(canInsertRefAt(t)).toBe(true);
  });
  it('rejects after a value or when not a formula', () => {
    for (const t of ['=B2', '=12', '=SUMME(B2)', 'B2*', '']) expect(canInsertRefAt(t)).toBe(false);
  });
});

describe('sumRangeFor', () => {
  it('sums the numeric cells above', () => {
    const grid = gridFromRows([['Posten', 'Betrag'], ['Auto', '12.000,00 €'], ['Möbel', '4.500,00 €'], ['Summe', '']]);
    expect(sumRangeFor(grid, 1, 3)).toBe('B2:B3');
  });
  it('falls back to the cells on the left', () => {
    const grid = gridFromRows([['1', '2', '3', '']]);
    expect(sumRangeFor(grid, 3, 0)).toBe('A1:C1');
  });
  it('returns null when nothing numeric is around', () => {
    expect(sumRangeFor(gridFromRows([['x', '']]), 1, 0)).toBeNull();
  });
});
