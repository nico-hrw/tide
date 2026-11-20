import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCellAligned, TableHeaderAligned } from '../TableCellAttrs';
import { TableFormulas } from '../TableFormulas';
import { VariablesBlockNode } from '../VariablesBlockNode';
import { collectDocDefinitions, scopeForDoc } from '../variablesScope';
import { parseDefinitionLines, setGlobalAtLine } from '@/lib/formula/scope';

const editors: Editor[] = [];
afterEach(() => { editors.splice(0).forEach((e) => { const el = e.options.element as HTMLElement; e.destroy(); el.remove(); }); });

function makeEditor(content: unknown, global: () => never[] | { name: string; expr: string; global: boolean }[] = () => []) {
  const element = document.body.appendChild(document.createElement('div'));
  const editor = new Editor({
    element,
    extensions: [
      Document, Paragraph, Text, Table, TableRow, TableHeaderAligned, TableCellAligned, VariablesBlockNode,
      TableFormulas.configure({ getScope: (doc) => scopeForDoc(doc, global) }),
    ],
    content: content as never,
  });
  editors.push(editor);
  return editor;
}

const table = (cells: string[]) => ({
  type: 'table',
  content: [{ type: 'tableRow', content: cells.map((t) => ({ type: 'tableCell', content: [{ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : [] }] })) }],
});

describe('parseDefinitionLines / setGlobalAtLine', () => {
  it('reports the source line of each definition', () => {
    const lines = parseDefinitionLines('# c\n\nzins = 3\n@kurs = 0,9');
    expect(lines.map((l) => [l.line, l.def.name, l.def.global])).toEqual([[2, 'zins', false], [3, 'kurs', true]]);
  });
  it('toggles the @ marker on one line only', () => {
    expect(setGlobalAtLine('a = 1\nb = 2', 1, true)).toBe('a = 1\n@b = 2');
    expect(setGlobalAtLine('a = 1\n@b = 2', 1, false)).toBe('a = 1\nb = 2');
    expect(setGlobalAtLine('@a = 1', 0, true)).toBe('@a = 1');
  });
});

describe('variables in the document', () => {
  it('collects local definitions and snapshots from all blocks', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        { type: 'variablesBlock', attrs: { code: 'zins = 3,9 %\n@kurs = 0,92', snapshot: [{ name: 'mwst', expr: '19 %', global: true }] } },
        { type: 'variablesBlock', attrs: { code: 'laufzeit = 48', snapshot: [] } },
      ],
    });
    const { local, snapshot } = collectDocDefinitions(editor.state.doc);
    expect(local.map((d) => d.name)).toEqual(['zins', 'kurs', 'laufzeit']);
    expect(snapshot.map((d) => d.name)).toEqual(['mwst']);
  });

  it('table formulas use local variables', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        { type: 'variablesBlock', attrs: { code: 'zins = 3,9 %', snapshot: [] } },
        table(['=zins*100', 'x']),
      ],
    });
    editor.commands.setTextSelection(editor.state.doc.content.size - 3); // caret in the non-formula cell
    const cell = editor.view.dom.querySelector('td') as HTMLElement;
    expect(cell.getAttribute('data-result')).toBe('3,9');
  });

  it('missing variables show #VAR with a hover hint', () => {
    const editor = makeEditor({ type: 'doc', content: [table(['=nichts', 'x'])] });
    editor.commands.setTextSelection(editor.state.doc.content.size - 3);
    const cell = editor.view.dom.querySelector('td') as HTMLElement;
    expect(cell.getAttribute('data-result')).toBe('#VAR');
    expect(cell.getAttribute('title')).toContain('nichts');
  });

  it('globals from the provider fill in when nothing local matches', () => {
    const editor = makeEditor({ type: 'doc', content: [table(['=g*2', 'x'])] }, () => [{ name: 'g', expr: '21', global: true }]);
    editor.commands.setTextSelection(editor.state.doc.content.size - 3);
    expect((editor.view.dom.querySelector('td') as HTMLElement).getAttribute('data-result')).toBe('42');
  });

  it('round-trips the block through HTML', () => {
    const editor = makeEditor({ type: 'doc', content: [{ type: 'variablesBlock', attrs: { code: 'a = 1', snapshot: [{ name: 'm', expr: '2', global: true }] } }] });
    const again = makeEditor(editor.getHTML());
    const attrs = again.getJSON().content![0].attrs!;
    expect(attrs.code).toBe('a = 1');
    expect(attrs.snapshot).toEqual([{ name: 'm', expr: '2', global: true }]);
  });
});

describe('definition change reporting', () => {
  function withReporter(content: unknown) {
    const calls: Array<{ names: string[]; prev: string[] | null }> = [];
    const element = document.body.appendChild(document.createElement('div'));
    const editor = new Editor({
      element,
      extensions: [Document, Paragraph, Text, VariablesBlockNode.configure({
        onDefinitionsChange: (defs, prev) => calls.push({ names: defs.map((d) => d.name), prev: prev ? prev.map((d) => d.name) : null }),
      })],
      content: content as never,
    });
    editors.push(editor);
    return { editor, calls };
  }

  const doc = (code: string) => ({ type: 'doc', content: [{ type: 'variablesBlock', attrs: { code, snapshot: [] } }, { type: 'paragraph' }] });

  it('reports the initial definitions once on mount', () => {
    const { calls } = withReporter(doc('a = 1\n@b = 2'));
    expect(calls).toEqual([{ names: ['a', 'b'], prev: null }]);
  });

  it('reports again with the previous state when the block changes, but not for unrelated edits', () => {
    const { editor, calls } = withReporter(doc('a = 1'));
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, 'hello'); // text in the paragraph
    expect(calls).toHaveLength(1);
    editor.view.dispatch(editor.state.tr.setNodeMarkup(0, undefined, { code: 'a = 1\nc = 3', snapshot: [] }));
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ names: ['a', 'c'], prev: ['a'] });
  });
});

describe('registry refresh', () => {
  it('re-evaluates formulas when the subscription fires', () => {
    let globals: { name: string; expr: string; global: boolean }[] = [];
    let notify = () => {};
    const element = document.body.appendChild(document.createElement('div'));
    const editor = new Editor({
      element,
      extensions: [
        Document, Paragraph, Text, Table, TableRow, TableHeaderAligned, TableCellAligned,
        TableFormulas.configure({
          getScope: (doc) => scopeForDoc(doc, () => globals),
          subscribe: (cb) => { notify = cb; return () => {}; },
        }),
      ],
      content: { type: 'doc', content: [table(['=g*2', 'x'])] } as never,
    });
    editors.push(editor);
    editor.commands.setTextSelection(editor.state.doc.content.size - 3);
    const cell = () => editor.view.dom.querySelector('td') as HTMLElement;
    expect(cell().getAttribute('data-result')).toBe('#VAR');
    globals = [{ name: 'g', expr: '21', global: true }];
    notify();
    expect(cell().getAttribute('data-result')).toBe('42');
  });
});
