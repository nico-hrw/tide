import type { Editor } from '@tiptap/core';
import type { CellTextAlign, CellVerticalAlign } from '../extensions/TableCellAttrs';

/** Sets horizontal and/or vertical alignment on the selected cell(s). Undefined values are left untouched. */
export function setCellAlign(editor: Editor, h?: CellTextAlign | null, v?: CellVerticalAlign | null): boolean {
    let chain = editor.chain().focus();
    if (h !== undefined) chain = chain.setCellAttribute('textAlign', h);
    if (v !== undefined) chain = chain.setCellAttribute('verticalAlign', v);
    return chain.run();
}

export function canMerge(editor: Editor): boolean {
    return editor.can().mergeCells();
}

export function canSplit(editor: Editor): boolean {
    return editor.can().splitCell();
}

export function mergeSelectedCells(editor: Editor): boolean {
    return editor.chain().focus().mergeCells().run();
}

export function splitSelectedCell(editor: Editor): boolean {
    return editor.chain().focus().splitCell().run();
}
