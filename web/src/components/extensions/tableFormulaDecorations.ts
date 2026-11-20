import type { EditorState } from '@tiptap/pm/state';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { CellSelection } from '@tiptap/pm/tables';
import { computeTable, gridFromPmTable, isFormulaText, type CalcScope, type PmGrid } from '@/lib/formula/tableCalc';
import { findRefs } from '@/lib/formula/formulaRefs';
import { formatResult } from '@/lib/formula/format';
import { parseNumber } from '@/lib/formula/parser';
import { colToLetters, isErr, refKey, type Value } from '@/lib/formula/types';
import { locateCell } from './tableFormulaUtils';

/** Decorations for all tables: results of formula cells and, while a formula is edited, the "formula mode" overlay. */
export function buildFormulaDecorations(state: EditorState, scope: CalcScope): DecorationSet {
    const { doc, selection } = state;
    const active = selection instanceof CellSelection ? null : locateCell(doc, selection.from);
    const activeInside = active && selection.to <= active.cellPos + active.cell.nodeSize ? active : null;
    const decos: Decoration[] = [];

    doc.descendants((node, pos) => {
        if (node.type.spec.tableRole !== 'table') return true;
        const grid = gridFromPmTable(node);
        let hasFormula = false;
        for (let r = 0; r < grid.rows && !hasFormula; r++)
            for (let c = 0; c < grid.cols; c++)
                if (isFormulaText(grid.text(c, r))) { hasFormula = true; break; }
        if (!hasFormula) return false;

        const results = computeTable(grid, scope);
        const tableStart = pos + 1;
        const activeHere = activeInside && activeInside.tablePos === pos && isFormulaText(activeInside.cell.textContent) ? activeInside : null;

        for (let r = 0; r < grid.rows; r++) {
            for (let c = 0; c < grid.cols; c++) {
                const off = grid.offset(c, r);
                if (off === null) continue;
                const cellPos = tableStart + off;
                const cell = node.nodeAt(off);
                if (!cell) continue;
                const end = cellPos + cell.nodeSize;
                const isActive = activeHere !== null && activeHere.cellPos === cellPos;

                if (activeHere) {
                    if (r === 0) decos.push(Decoration.node(cellPos, end, { 'data-col-label': colToLetters(c) }));
                    if (c === 0) decos.push(Decoration.node(cellPos, end, { 'data-row-label': String(r + 1) }));
                    if (!isActive && isNumeric(grid, results, c, r)) decos.push(Decoration.node(cellPos, end, { class: 'tt-cand' }));
                }

                const text = grid.text(c, r);
                if (!isFormulaText(text) || isActive) continue;
                const v = results.get(refKey(c, r));
                if (v === undefined) continue;
                const classes = ['tt-formula-cell'];
                if (typeof v === 'number') classes.push('tt-num');
                if (isErr(v)) classes.push('tt-err');
                decos.push(Decoration.node(cellPos, end, {
                    class: classes.join(' '),
                    'data-result': formatResult(v),
                    ...(isErr(v) && v.detail ? { title: `${v.error}: ${v.detail}` } : {}),
                }));
            }
        }

        if (activeHere) addReferenceHighlights(decos, activeHere.cellPos, activeHere.cell, grid, tableStart);
        return false;
    });

    return DecorationSet.create(doc, decos);
}

function isNumeric(grid: PmGrid, results: Map<string, Value>, c: number, r: number): boolean {
    const text = grid.text(c, r);
    if (isFormulaText(text)) return typeof results.get(refKey(c, r)) === 'number';
    return parseNumber(text) !== null;
}

function addReferenceHighlights(decos: Decoration[], cellPos: number, cell: PmNode, grid: PmGrid, tableStart: number) {
    const text = cell.textContent;
    // text positions map linearly only for a single paragraph that holds plain text
    const plain = cell.childCount === 1 && cell.child(0).type.name === 'paragraph' && cell.child(0).childCount <= 1 && (cell.child(0).firstChild?.isText ?? true);
    for (const m of findRefs(text)) {
        // clamp to the table: formula text can come from other people and may name absurd ranges
        const c0 = Math.min(m.from.col, m.to.col), c1 = Math.min(Math.max(m.from.col, m.to.col), grid.cols - 1);
        const r0 = Math.min(m.from.row, m.to.row), r1 = Math.min(Math.max(m.from.row, m.to.row), grid.rows - 1);
        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                const off = grid.offset(c, r);
                if (off === null) continue;
                const pos = tableStart + off;
                const size = grid.cellSize(c, r);
                if (pos === cellPos) continue;
                decos.push(Decoration.node(pos, pos + size, { class: `tt-ref tt-refc-${m.color}` }));
            }
        }
        // colour the reference text inside the formula (text starts at cellPos + 2)
        if (plain) decos.push(Decoration.inline(cellPos + 2 + m.start, cellPos + 2 + m.end, { class: `tt-reftext tt-refc-${m.color}` }));
    }
}
