import type { Editor } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import { CellSelection, TableMap } from '@tiptap/pm/tables';
import type { CellTextAlign, CellVerticalAlign } from '../extensions/TableCellAttrs';
import { sanitizeBgColor } from '../extensions/TableCellAttrs';
import { locateCell } from '../extensions/tableFormulaUtils';

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

function selectionRect(state: EditorState) {
    const sel = state.selection;
    if (sel instanceof CellSelection) {
        const $anchor = sel.$anchorCell;
        for (let d = $anchor.depth; d >= 0; d--) {
            const node = $anchor.node(d);
            if (node.type.spec.tableRole !== 'table') continue;
            const tablePos = $anchor.before(d);
            const map = TableMap.get(node);
            const rect = map.rectBetween(sel.$anchorCell.pos - tablePos - 1, sel.$headCell.pos - tablePos - 1);
            return { tablePos, map, rect };
        }
        return null;
    }
    const loc = locateCell(state.doc, sel.from);
    if (!loc) return null;
    const map = TableMap.get(loc.table);
    return { tablePos: loc.tablePos, map, rect: map.findCell(loc.cellPos - loc.tablePos - 1) };
}

function setAxisBackground(editor: Editor, axis: 'row' | 'col', color: string | null): boolean {
    const normalized = color === null ? null : sanitizeBgColor(color);
    if (color !== null && !normalized) return false;
    return editor.chain().focus().command(({ state, tr, dispatch }) => {
        const found = selectionRect(state);
        if (!found) return false;
        if (!dispatch) return true;
        const { tablePos, map, rect } = found;
        const target = axis === 'row'
            ? { left: 0, right: map.width, top: rect.top, bottom: rect.bottom }
            : { left: rect.left, right: rect.right, top: 0, bottom: map.height };
        for (const relPos of new Set(map.cellsInRect(target))) {
            const absPos = tablePos + 1 + relPos;
            const cell = tr.doc.nodeAt(absPos);
            if (cell) tr.setNodeMarkup(absPos, undefined, { ...cell.attrs, backgroundColor: normalized });
        }
        return true;
    }).run();
}

/** Sets `backgroundColor` on the current cell or selected cells. */
export function setCellBackground(editor: Editor, color: string | null): boolean {
    const normalized = color === null ? null : sanitizeBgColor(color);
    if (color !== null && !normalized) return false;
    return editor.chain().focus().setCellAttribute('backgroundColor', normalized).run();
}

/** Sets `backgroundColor` on all cells in the current row (or selected rows). */
export function setRowBackground(editor: Editor, color: string | null): boolean {
    return setAxisBackground(editor, 'row', color);
}

/** Sets `backgroundColor` on all cells in the current column (or selected columns). */
export function setColumnBackground(editor: Editor, color: string | null): boolean {
    return setAxisBackground(editor, 'col', color);
}
