import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCellAligned, TableHeaderAligned } from '../TableCellAttrs';
import { TableFormulas, insertSumFormula } from '../TableFormulas';
import { locateCell } from '../tableFormulaUtils';

function html(rows: string[][]): string {
  return '<table>' + rows.map((r) => '<tr>' + r.map((t) => `<td><p>${t}</p></td>`).join('') + '</tr>').join('') + '</table>';
}

const editors: Editor[] = [];
afterEach(() => {
  editors.splice(0).forEach((e) => { const el = e.options.element as HTMLElement; e.destroy(); el.remove(); });
});

function makeEditor(rows: string[][]) {
  // attached to the document so that document-level listeners (drag end) see events
  const element = document.body.appendChild(document.createElement('div'));
  const editor = new Editor({
    element,
    extensions: [Document, Paragraph, Text, Table, TableRow, TableHeaderAligned, TableCellAligned, TableFormulas],
    content: html(rows),
  });
  editors.push(editor);
  return editor;
}

/** Moves the caret to the end of the text of cell (col,row). */
function caretInCell(editor: Editor, col: number, row: number) {
  const table = editor.state.doc.firstChild!;
  let pos = 1;
  for (let r = 0; r < row; r++) pos += table.child(r).nodeSize;
  pos += 1; // into the row
  for (let c = 0; c < col; c++) pos += table.child(row).child(c).nodeSize;
  const cell = table.child(row).child(col);
  editor.commands.setTextSelection(pos + 1 + cell.textContent.length + 1); // cell open + paragraph open + text
}

const cellEls = (editor: Editor) => Array.from(editor.view.dom.querySelectorAll('td,th')) as HTMLElement[];

describe('TableFormulas', () => {
  it('shows the result on unfocused formula cells', () => {
    const editor = makeEditor([['12.000,00 €', '3,9 %'], ['=A1*B1', 'x']]);
    editor.commands.setTextSelection(1 + 1 + 1 + 1); // inside A1, which is not a formula
    const cell = cellEls(editor)[2];
    expect(cell.classList.contains('tt-formula-cell')).toBe(true);
    expect(cell.classList.contains('tt-num')).toBe(true);
    expect(cell.getAttribute('data-result')).toBe('468');
  });

  it('marks errors with a class and a hover title', () => {
    const editor = makeEditor([['=1/0', 'x']]);
    caretInCell(editor, 1, 0);
    const cell = cellEls(editor)[0];
    expect(cell.classList.contains('tt-err')).toBe(true);
    expect(cell.getAttribute('data-result')).toBe('#DIV/0');
    expect(cell.getAttribute('title')).toContain('Division durch 0');
  });

  it('does not touch tables without formulas', () => {
    const editor = makeEditor([['1', '2']]);
    expect(editor.view.dom.querySelectorAll('.tt-formula-cell, .tt-cand').length).toBe(0);
  });

  it('formula mode: labels, candidates and referenced cells light up while the formula cell has the caret', () => {
    const editor = makeEditor([['Posten', 'Betrag', 'Zins'], ['Auto', '12.000,00 €', '3,9 %'], ['', '=B2', '']]);
    caretInCell(editor, 1, 2);
    const dom = editor.view.dom;
    expect(dom.querySelectorAll('[data-col-label]').length).toBe(3);
    expect(dom.querySelector('[data-col-label="B"]')).not.toBeNull();
    expect(dom.querySelectorAll('[data-row-label]').length).toBe(3);
    expect(dom.querySelectorAll('.tt-cand').length).toBe(2); // B2, C2 (numeric, not the active cell)
    expect(dom.querySelectorAll('.tt-ref').length).toBe(1); // B2 is referenced
    expect(dom.querySelectorAll('.tt-formula-cell').length).toBe(0); // the active cell shows its text
  });

  it('clicking a cell inserts its reference when a formula expects one', () => {
    const editor = makeEditor([['5', '7'], ['=', '']]);
    caretInCell(editor, 0, 1);
    cellEls(editor)[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    expect(editor.state.doc.firstChild!.child(1).child(0).textContent).toBe('=B1');
  });

  it('clicking does not insert when a value is already complete', () => {
    const editor = makeEditor([['5', '7'], ['=A1', '']]);
    caretInCell(editor, 0, 1);
    cellEls(editor)[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    expect(editor.state.doc.firstChild!.child(1).child(0).textContent).toBe('=A1');
  });

  it('dragging across cells inserts a range', () => {
    const editor = makeEditor([['1', '2'], ['3', '4'], ['=', '']]);
    caretInCell(editor, 0, 2);
    cellEls(editor)[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    // the view re-renders after the first insert, so look the target up again (like the live element under the pointer)
    cellEls(editor)[3].dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    expect(editor.state.doc.firstChild!.child(2).child(0).textContent).toBe('=A1:B2');
  });
});

describe('insertSumFormula', () => {
  it('writes =SUMME over the numeric run above', () => {
    const editor = makeEditor([['Betrag'], ['10'], ['5'], ['']]);
    caretInCell(editor, 0, 3);
    expect(insertSumFormula(editor.view)).toBe(true);
    expect(editor.state.doc.firstChild!.child(3).child(0).textContent).toBe('=SUMME(A2:A3)');
  });

  it('returns false when there is nothing to sum', () => {
    const editor = makeEditor([['x', '']]);
    caretInCell(editor, 1, 0);
    expect(insertSumFormula(editor.view)).toBe(false);
  });

  it('locateCell returns null outside tables', () => {
    const editor = new Editor({ extensions: [Document, Paragraph, Text], content: '<p>hi</p>' });
    expect(locateCell(editor.state.doc, 2)).toBeNull();
  });
});
