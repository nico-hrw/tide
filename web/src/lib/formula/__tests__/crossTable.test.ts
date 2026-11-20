import { describe, it, expect } from 'vitest';
import { parseFormula } from '../parser';
import { computeDocumentTables, gridFromRows, EMPTY_SCOPE, type TableEntry } from '../tableCalc';
import { findRefs } from '../formulaRefs';

describe('cross-table parsing', () => {
  it('parses simple cross-table cell reference', () => {
    expect(parseFormula('= T1!A1')).toEqual({
      k: 'ref',
      table: 'T1',
      col: 0,
      row: 0,
    });
  });

  it('parses named cross-table cell reference', () => {
    expect(parseFormula('= Tabelle2!B3')).toEqual({
      k: 'ref',
      table: 'Tabelle2',
      col: 1,
      row: 2,
    });
  });

  it('parses quoted cross-table range reference', () => {
    expect(parseFormula("= 'Umsatz 2026'!A1:B5")).toEqual({
      k: 'range',
      table: 'Umsatz 2026',
      from: { col: 0, row: 0 },
      to: { col: 1, row: 4 },
    });
  });
});

describe('computeDocumentTables', () => {
  it('evaluates cross-table arithmetic references', () => {
    const tables: TableEntry[] = [
      {
        id: 'T1',
        aliases: ['t1', 'tabelle1'],
        grid: gridFromRows([['100', '200']]),
      },
      {
        id: 'T2',
        aliases: ['t2', 'tabelle2'],
        grid: gridFromRows([['= T1!A1 + T1!B1']]),
      },
    ];
    const res = computeDocumentTables(tables, EMPTY_SCOPE);
    expect(res.get('T2')?.get('A1')).toBe(300);
  });

  it('evaluates cross-table range in SUMME', () => {
    const tables: TableEntry[] = [
      {
        id: 'T1',
        aliases: ['t1'],
        grid: gridFromRows([['100', '200']]),
      },
      {
        id: 'T2',
        aliases: ['t2'],
        grid: gridFromRows([['= SUMME(T1!A1:B1)']]),
      },
    ];
    const res = computeDocumentTables(tables, EMPTY_SCOPE);
    expect(res.get('T2')?.get('A1')).toBe(300);
  });

  it('resolves cross-table aliases', () => {
    const tables: TableEntry[] = [
      {
        id: 'T1',
        aliases: ['t1', 'tabelle1', 'table1'],
        grid: gridFromRows([['100']]),
      },
      {
        id: 'T2',
        aliases: ['t2'],
        grid: gridFromRows([['= Tabelle1!A1']]),
      },
    ];
    const res = computeDocumentTables(tables, EMPTY_SCOPE);
    expect(res.get('T2')?.get('A1')).toBe(100);
  });

  it('returns #BEZUG for a missing table', () => {
    const tables: TableEntry[] = [
      {
        id: 'T1',
        aliases: ['t1'],
        grid: gridFromRows([['= T99!A1']]),
      },
    ];
    const res = computeDocumentTables(tables, EMPTY_SCOPE);
    expect(res.get('T1')?.get('A1')).toEqual(expect.objectContaining({ error: '#BEZUG' }));
  });

  it('detects cross-table cycles and returns #ZIRKEL', () => {
    const tables: TableEntry[] = [
      {
        id: 'T1',
        aliases: ['t1'],
        grid: gridFromRows([['=T2!A1']]),
      },
      {
        id: 'T2',
        aliases: ['t2'],
        grid: gridFromRows([['=T1!A1']]),
      },
    ];
    const res = computeDocumentTables(tables, EMPTY_SCOPE);
    expect(res.get('T1')?.get('A1')).toEqual(expect.objectContaining({ error: '#ZIRKEL' }));
    expect(res.get('T2')?.get('A1')).toEqual(expect.objectContaining({ error: '#ZIRKEL' }));
  });
});

describe('findRefs cross-table', () => {
  it('extracts table names from unquoted and quoted cross-table references', () => {
    const refs = findRefs("= T1!A1 + 'Tabelle 2'!B2:C3");
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      table: 'T1',
      from: { col: 0, row: 0 },
      to: { col: 0, row: 0 },
    });
    expect(refs[1]).toMatchObject({
      table: 'Tabelle 2',
      from: { col: 1, row: 1 },
      to: { col: 2, row: 2 },
    });
  });
});
