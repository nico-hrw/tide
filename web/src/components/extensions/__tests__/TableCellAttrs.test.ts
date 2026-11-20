import { describe, it, expect } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCellAligned, TableHeaderAligned } from '../TableCellAttrs';

function makeEditor(html: string) {
  return new Editor({
    extensions: [Document, Paragraph, Text, Table, TableRow, TableHeaderAligned, TableCellAligned],
    content: html,
  });
}

function firstCell(editor: Editor) {
  const table: JSONContent = editor.getJSON().content![0];
  return table.content![0].content![0];
}

describe('TableCellAligned', () => {
  it('parses and renders alignment attrs', () => {
    const editor = makeEditor('<table><tr><td style="text-align:right;vertical-align:middle"><p>1</p></td></tr></table>');
    const cell = firstCell(editor);
    expect(cell.attrs!.textAlign).toBe('right');
    expect(cell.attrs!.verticalAlign).toBe('middle');
    expect(editor.getHTML()).toContain('text-align: right');
    expect(editor.getHTML()).toContain('vertical-align: middle');
  });

  it('old documents without attrs stay unchanged', () => {
    const editor = makeEditor('<table><tr><td><p>1</p></td></tr></table>');
    const cell = firstCell(editor);
    expect(cell.attrs!.textAlign).toBeNull();
    expect(cell.attrs!.verticalAlign).toBeNull();
    expect(editor.getHTML()).not.toContain('text-align');
    expect(editor.getHTML()).not.toContain('vertical-align');
  });

  it('applies to header cells as well', () => {
    const editor = makeEditor('<table><tr><th style="text-align:center"><p>T</p></th></tr></table>');
    expect(firstCell(editor).attrs!.textAlign).toBe('center');
  });

  it('never renders attribute values outside the allowlist', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, Table, TableRow, TableHeaderAligned, TableCellAligned],
      content: {
        type: 'doc',
        content: [{
          type: 'table',
          content: [{
            type: 'tableRow',
            content: [{
              type: 'tableCell',
              attrs: { textAlign: 'right; background: url(https://evil.example/x)', verticalAlign: 'top; position: fixed' },
              content: [{ type: 'paragraph' }],
            }],
          }],
        }],
      },
    });
    const html = editor.getHTML();
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain('position');
    expect(html).not.toContain('text-align');
    expect(html).not.toContain('vertical-align');
  });
});
