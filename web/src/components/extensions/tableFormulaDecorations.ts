import type { EditorState } from '@tiptap/pm/state';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { CellSelection } from '@tiptap/pm/tables';
import { computeDocumentTables, gridFromPmTable, isFormulaText, type CalcScope, type PmGrid } from '@/lib/formula/tableCalc';
import { findRefs } from '@/lib/formula/formulaRefs';
import { formatResult } from '@/lib/formula/format';
import { parseNumber } from '@/lib/formula/parser';
import { colToLetters, isErr, refKey, type Value } from '@/lib/formula/types';
import { locateCell } from './tableFormulaUtils';

interface DocTable {
    id: string; // "T1", "T2", ...
    aliases: string[]; // ["t1", "tabelle1", "table1", "tabelle 1", "table 1"]
    grid: PmGrid;
    pos: number;
    node: PmNode;
}

/** Decorations for all tables: results of formula cells and, while a formula is edited, the "formula mode" overlay. */
export function buildFormulaDecorations(state: EditorState, scope: CalcScope): DecorationSet {
    const { doc, selection } = state;
    const active = selection instanceof CellSelection ? null : locateCell(doc, selection.from);
    const activeInside = active && selection.to <= active.cellPos + active.cell.nodeSize ? active : null;
    const activeFormula = activeInside && isFormulaText(activeInside.cell.textContent) ? activeInside : null;

    // Pass 1: Collect all tables in the document (including those without formulas).
    const tables: DocTable[] = [];
    doc.descendants((node, pos) => {
        if (node.type.spec.tableRole !== 'table') return true;
        const idx = tables.length + 1;
        tables.push({
            id: `T${idx}`,
            aliases: [`t${idx}`, `tabelle${idx}`, `table${idx}`, `tabelle ${idx}`, `table ${idx}`],
            grid: gridFromPmTable(node),
            pos,
            node,
        });
        return false;
    });

    if (tables.length === 0) return DecorationSet.empty;

    const aliasMap = new Map<string, DocTable>();
    for (const table of tables) {
        aliasMap.set(table.id.toLowerCase().trim(), table);
        for (const alias of table.aliases) {
            aliasMap.set(alias.toLowerCase().trim(), table);
        }
    }

    // Pass 2: Compute all tables together to resolve cross-table references.
    const allResults = computeDocumentTables(
        tables.map((t) => ({ id: t.id, aliases: t.aliases, grid: t.grid })),
        scope,
    );

    // Pass 3: Build decorations per table.
    const decos: Decoration[] = [];
    for (const table of tables) {
        const results = allResults.get(table.id) ?? new Map<string, Value>();
        const activeHere = activeFormula && activeFormula.tablePos === table.pos ? activeFormula : null;

        if (activeFormula) {
            decos.push(Decoration.node(table.pos, table.pos + table.node.nodeSize, { 'data-table-id': table.id }));
        }

        const { grid, node, pos } = table;
        const tableStart = pos + 1;

        for (let r = 0; r < grid.rows; r++) {
            for (let c = 0; c < grid.cols; c++) {
                const off = grid.offset(c, r);
                if (off === null) continue;
                const cellPos = tableStart + off;
                const cell = node.nodeAt(off);
                if (!cell) continue;
                const end = cellPos + cell.nodeSize;
                const isActive = activeHere !== null && activeHere.cellPos === cellPos;

                if (activeFormula) {
                    if (r === 0) decos.push(Decoration.node(cellPos, end, { 'data-col-label': colToLetters(c) }));
                    if (c === 0) decos.push(Decoration.node(cellPos, end, { 'data-row-label': String(r + 1) }));
                    if (!isActive && isNumeric(grid, results, c, r)) decos.push(Decoration.node(cellPos, end, { class: 'tt-cand' }));
                }

                const text = grid.text(c, r);
                if (!isFormulaText(text)) {
                    if (parseNumber(text) !== null) {
                        decos.push(Decoration.node(cellPos, end, { class: 'tt-num' }));
                    }
                    continue;
                }
                if (isActive) continue;
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

        if (activeHere) addReferenceHighlights(decos, activeHere.cellPos, activeHere.cell, table, aliasMap);
    }

    return DecorationSet.create(doc, decos);
}

function isNumeric(grid: PmGrid, results: Map<string, Value>, c: number, r: number): boolean {
    const text = grid.text(c, r);
    if (isFormulaText(text)) return typeof results.get(refKey(c, r)) === 'number';
    return parseNumber(text) !== null;
}

function addReferenceHighlights(
    decos: Decoration[],
    cellPos: number,
    cell: PmNode,
    currentTable: DocTable,
    aliasMap: Map<string, DocTable>,
) {
    const text = cell.textContent;
    // text positions map linearly only for a single paragraph that holds plain text
    const plain = cell.childCount === 1 && cell.child(0).type.name === 'paragraph' && cell.child(0).childCount <= 1 && (cell.child(0).firstChild?.isText ?? true);
    for (const m of findRefs(text)) {
        const targetTable = m.table !== undefined
            ? aliasMap.get(m.table.toLowerCase().trim())
            : currentTable;
        if (!targetTable) continue;

        const targetGrid = targetTable.grid;
        const targetTableStart = targetTable.pos + 1;
        // clamp to the table: formula text can come from other people and may name absurd ranges
        const c0 = Math.min(m.from.col, m.to.col);
        const c1 = Math.min(Math.max(m.from.col, m.to.col), targetGrid.cols - 1);
        const r0 = Math.min(m.from.row, m.to.row);
        const r1 = Math.min(Math.max(m.from.row, m.to.row), targetGrid.rows - 1);
        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                const off = targetGrid.offset(c, r);
                if (off === null) continue;
                const pos = targetTableStart + off;
                const size = targetGrid.cellSize(c, r);
                if (pos === cellPos) continue;
                decos.push(Decoration.node(pos, pos + size, { class: `tt-ref tt-refc-${m.color}` }));
            }
        }
        // colour the reference text inside the formula (text starts at cellPos + 2)
        if (plain) decos.push(Decoration.inline(cellPos + 2 + m.start, cellPos + 2 + m.end, { class: `tt-reftext tt-refc-${m.color}` }));
    }
}
