import { Extension } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import type { DecorationSet, EditorView } from '@tiptap/pm/view';
import { CellSelection } from '@tiptap/pm/tables';
import { EMPTY_SCOPE, isFormulaText, gridFromPmTable, type CalcScope } from '@/lib/formula/tableCalc';
import { canInsertRefAt, sumRangeFor } from '@/lib/formula/formulaRefs';
import { refKey } from '@/lib/formula/types';
import { buildFormulaDecorations } from './tableFormulaDecorations';
import { locateCell, type CellLoc } from './tableFormulaUtils';

export interface TableFormulasOptions {
    /** Variables and functions available to formulas in this document; called on every recalculation. */
    getScope: (doc: PmNode) => CalcScope;
    /** Called to learn when variables changed outside the document (e.g. the registry finished loading). Returns an unsubscribe function. */
    subscribe?: (onChange: () => void) => () => void;
}

const key = new PluginKey('tableFormulas');

/** The formula cell that currently holds the caret (null for cell selections and non-formula cells). */
function activeFormulaCell(state: EditorState): CellLoc | null {
    const { selection, doc } = state;
    if (selection instanceof CellSelection) return null;
    const loc = locateCell(doc, selection.from);
    if (!loc || selection.to > loc.cellPos + loc.cell.nodeSize) return null;
    return isFormulaText(loc.cell.textContent) ? loc : null;
}

/** Returns the 1-based table identifier ("T1", "T2", ...) for the table node at `tablePos`. */
function getTableId(doc: PmNode, tablePos: number): string {
    let idx = 1;
    let found = 'T1';
    doc.descendants((node, pos) => {
        if (node.type.spec.tableRole === 'table') {
            if (pos === tablePos) {
                found = `T${idx}`;
                return false;
            }
            idx++;
        }
        return true;
    });
    return found;
}

/** Replaces the text of the range [from,to] with `text` only if it still reads `expected`. */
function replaceIfUnchanged(view: EditorView, from: number, to: number, expected: string, text: string) {
    if (to > view.state.doc.content.size || view.state.doc.textBetween(from, to) !== expected) return;
    view.dispatch(view.state.tr.insertText(text, from, to));
}

function startRefInsert(view: EditorView, target: CellLoc, tablePrefix: string) {
    const { from, to } = view.state.selection;
    const startKey = `${tablePrefix}${refKey(target.col, target.row)}`;
    view.dispatch(view.state.tr.insertText(startKey, from, to));
    const insertFrom = from;
    const insertTo = from + startKey.length;

    const onUp = (e: MouseEvent) => {
        document.removeEventListener('mouseup', onUp, true);
        const el = (e.target as HTMLElement | null)?.closest?.('td,th');
        if (!el) return;
        let endLoc: CellLoc | null = null;
        try { endLoc = locateCell(view.state.doc, view.posAtDOM(el, 0)); } catch { return; }
        if (!endLoc || endLoc.tablePos !== target.tablePos) return;
        if (endLoc.col === target.col && endLoc.row === target.row) return;
        const a = { col: Math.min(target.col, endLoc.col), row: Math.min(target.row, endLoc.row) };
        const b = { col: Math.max(target.col, endLoc.col), row: Math.max(target.row, endLoc.row) };
        replaceIfUnchanged(view, insertFrom, insertTo, startKey, `${tablePrefix}${refKey(a.col, a.row)}:${refKey(b.col, b.row)}`);
    };
    document.addEventListener('mouseup', onUp, true);
}

/** Click on another cell while a formula expects a reference: insert it instead of moving the caret. */
function handleMouseDown(view: EditorView, event: MouseEvent): boolean {
    if (!view.editable || event.button !== 0) return false;
    const active = activeFormulaCell(view.state);
    if (!active) return false;
    const el = (event.target as HTMLElement | null)?.closest?.('td,th');
    if (!el) return false;
    let target: CellLoc | null = null;
    try { target = locateCell(view.state.doc, view.posAtDOM(el, 0)); } catch { return false; }
    if (!target || (target.tablePos === active.tablePos && target.cellPos === active.cellPos)) return false;
    const before = view.state.doc.textBetween(active.cellPos + 1, view.state.selection.from, '\n');
    if (!canInsertRefAt(before)) return false;
    event.preventDefault();
    const tablePrefix = target.tablePos !== active.tablePos ? `${getTableId(view.state.doc, target.tablePos)}!` : '';
    startRefInsert(view, target, tablePrefix);
    return true;
}

export const TableFormulas = Extension.create<TableFormulasOptions>({
    name: 'tableFormulas',

    addOptions() {
        return { getScope: () => EMPTY_SCOPE };
    },

    addProseMirrorPlugins() {
        const { getScope, subscribe } = this.options;
        let cache: { doc: unknown; from: number; to: number; set: DecorationSet } | null = null;
        return [
            new Plugin({
                key,
                view: (editorView) => {
                    const unsubscribe = subscribe?.(() => {
                        if (editorView.isDestroyed) return;
                        cache = null;
                        editorView.dispatch(editorView.state.tr.setMeta(key, 'refresh'));
                    });
                    return { destroy: () => unsubscribe?.() };
                },
                props: {
                    decorations(state) {
                        const { doc, selection } = state;
                        if (cache && cache.doc === doc && cache.from === selection.from && cache.to === selection.to) return cache.set;
                        const set = buildFormulaDecorations(state, getScope(doc));
                        cache = { doc, from: selection.from, to: selection.to, set };
                        return set;
                    },
                    handleDOMEvents: {
                        mousedown: (view, event) => handleMouseDown(view, event as MouseEvent),
                    },
                },
            }),
        ];
    },
});

/**
 * Writes "=SUMME(<range>)" into the cell with the caret. The range is the numeric run above the cell, else to its left.
 * Returns false when there is no table cell or nothing to sum.
 */
export function insertSumFormula(view: EditorView): boolean {
    const { state } = view;
    const loc = locateCell(state.doc, state.selection.from);
    if (!loc) return false;
    const range = sumRangeFor(gridFromPmTable(loc.table), loc.col, loc.row);
    if (!range) return false;
    const para = state.schema.nodes.paragraph.create(null, state.schema.text(`=SUMME(${range})`));
    const start = loc.cellPos + 1;
    const end = loc.cellPos + loc.cell.nodeSize - 1;
    const tr = state.tr.replaceWith(start, end, para);
    view.dispatch(tr);
    return true;
}
