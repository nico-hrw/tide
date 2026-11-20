import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { CellSelection } from '@tiptap/pm/tables';
import { TableCellAligned, TableHeaderAligned } from '../../../components/extensions/TableCellAttrs';
import { computeTable, gridFromRows, gridFromPmTable, EMPTY_SCOPE } from '../tableCalc';

describe('computeTable', () => {
  it('computes a dependent chain', () => {
    const grid = gridFromRows([
      ['Posten', 'Betrag', 'Zins'],
      ['Auto', '12.000,00 €', '3,9 %'],
      ['', '=B2*C2', '=C2/12'],
    ]);
    const res = computeTable(grid, EMPTY_SCOPE);
    expect(res.get('B3')).toBeCloseTo(468, 6);
    expect(res.get('C3')).toBeCloseTo(0.00325, 8);
  });

  it('A1=B1, B1=A1 gives #ZIRKEL for both', () => {
    const res = computeTable(gridFromRows([['=B1', '=A1']]), EMPTY_SCOPE);
    expect(res.get('A1')).toEqual(expect.objectContaining({ error: '#ZIRKEL' }));
    expect(res.get('B1')).toEqual(expect.objectContaining({ error: '#ZIRKEL' }));
  });

  it('a self reference gives #ZIRKEL', () => {
    const res = computeTable(gridFromRows([['=A1+1']]), EMPTY_SCOPE);
    expect(res.get('A1')).toEqual(expect.objectContaining({ error: '#ZIRKEL' }));
  });

  it('cells depending on a cycle show the error too', () => {
    const res = computeTable(gridFromRows([['=B1', '=A1', '=A1+1']]), EMPTY_SCOPE);
    expect(res.get('C1')).toEqual(expect.objectContaining({ error: '#ZIRKEL' }));
  });

  it('syntax errors give #WERT instead of throwing', () => {
    const res = computeTable(gridFromRows([['=(1+']]), EMPTY_SCOPE);
    expect(res.get('A1')).toEqual(expect.objectContaining({ error: '#WERT' }));
  });

  it('only formula cells appear in the result', () => {
    const res = computeTable(gridFromRows([['1', '=A1*2']]), EMPTY_SCOPE);
    expect([...res.keys()]).toEqual(['B1']);
  });

  it('uses variables from the scope', () => {
    const res = computeTable(gridFromRows([['=zins*100']]), { variable: (n) => (n === 'zins' ? 0.039 : undefined), userFunction: () => undefined });
    expect(res.get('A1')).toBeCloseTo(3.9, 10);
  });
});

describe('gridFromPmTable with merged cells', () => {
  function editorWithMerge() {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, Table, TableRow, TableHeaderAligned, TableCellAligned],
      content:
        '<table><tr><td><p>5</p></td><td><p>7</p></td><td><p>=SUMME(A1:B1)</p></td></tr>' +
        '<tr><td><p>1</p></td><td><p>2</p></td><td><p>3</p></td></tr></table>',
    });
    const pos: number[] = [];
    editor.state.doc.descendants((n, p) => { if (n.type.name === 'tableCell') pos.push(p); });
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, pos[0], pos[1])));
    editor.commands.mergeCells();
    return editor;
  }

  it('merged cell address is top-left and covered coordinates are empty', () => {
    const editor = editorWithMerge();
    const table = editor.state.doc.firstChild!;
    const grid = gridFromPmTable(table);
    expect(grid.cols).toBe(3);
    expect(grid.rows).toBe(2);
    expect(grid.text(0, 0)).toContain('5');
    expect(grid.text(1, 0)).toBe('');
    expect(grid.offset(0, 0)).not.toBeNull();
    expect(grid.offset(1, 0)).toBeNull();
  });

  it('a range over merged cells counts the merged cell once', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, Table, TableRow, TableHeaderAligned, TableCellAligned],
      content:
        '<table><tr><td><p>=SUMME(A2:C2)</p></td><td><p>5</p></td><td><p>6</p></td></tr>' +
        '<tr><td colspan="2"><p>10</p></td><td><p>1</p></td></tr></table>',
    });
    const grid = gridFromPmTable(editor.state.doc.firstChild!);
    expect(computeTable(grid, EMPTY_SCOPE).get('A1')).toBe(11);
  });
});
