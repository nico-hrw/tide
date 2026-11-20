import { describe, it, expect } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { CellSelection } from '@tiptap/pm/tables';
import { TableCellAligned, TableHeaderAligned } from '../../extensions/TableCellAttrs';
import { setCellAlign, canMerge, canSplit, mergeSelectedCells, splitSelectedCell } from '../tableCommands';

const HTML =
  '<table><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></table>';

function makeEditor() {
  return new Editor({
    extensions: [Document, Paragraph, Text, Table, TableRow, TableHeaderAligned, TableCellAligned],
    content: HTML,
  });
}

/** Positions of the four cells in the 2x2 table. */
function cellPositions(editor: Editor): number[] {
  const out: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'tableCell') out.push(pos);
  });
  return out;
}

function selectCells(editor: Editor, from: number, to: number) {
  const { state, view } = editor;
  view.dispatch(state.tr.setSelection(CellSelection.create(state.doc, from, to)));
}

function cells(editor: Editor): JSONContent[] {
  const table: JSONContent = editor.getJSON().content![0];
  return table.content!.flatMap((row) => row.content!);
}

describe('tableCommands', () => {
  it('setCellAlign aligns the selected cell', () => {
    const editor = makeEditor();
    const pos = cellPositions(editor)[0];
    editor.commands.setTextSelection(pos + 2);
    expect(setCellAlign(editor, 'right')).toBe(true);
    expect(cells(editor)[0].attrs!.textAlign).toBe('right');
    expect(cells(editor)[1].attrs!.textAlign).toBeNull();
  });

  it('setCellAlign applies to a CellSelection', () => {
    const editor = makeEditor();
    const p = cellPositions(editor);
    selectCells(editor, p[0], p[3]);
    setCellAlign(editor, undefined, 'middle');
    expect(cells(editor).every((c) => c.attrs!.verticalAlign === 'middle')).toBe(true);
  });

  it('canMerge is false for a single cell', () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(cellPositions(editor)[0] + 2);
    expect(canMerge(editor)).toBe(false);
  });

  it('merge then split restores the cell count', () => {
    const editor = makeEditor();
    const p = cellPositions(editor);
    selectCells(editor, p[0], p[1]);
    expect(canMerge(editor)).toBe(true);
    expect(mergeSelectedCells(editor)).toBe(true);
    expect(cells(editor)).toHaveLength(3);
    editor.commands.setTextSelection(cellPositions(editor)[0] + 2);
    expect(canSplit(editor)).toBe(true);
    expect(splitSelectedCell(editor)).toBe(true);
    expect(cells(editor)).toHaveLength(4);
  });
});
