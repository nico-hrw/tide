import type { Node as PmNode } from '@tiptap/pm/model';
import { TableMap } from '@tiptap/pm/tables';
import { evaluate, type EvalContext } from './evaluate';
import { parseFormula, parseNumber } from './parser';
import { FormulaError, err, refKey, type Value } from './types';

/** Read-only view of a table: text per coordinate. Cells covered by a merged cell are "". */
export interface CellGrid {
    rows: number;
    cols: number;
    text(col: number, row: number): string;
}

/** A grid backed by a ProseMirror table; `offset` locates the cell node (relative to the table node start). */
export interface PmGrid extends CellGrid {
    offset(col: number, row: number): number | null;
    /** nodeSize of the cell whose top-left corner is (col, row); 0 for covered coordinates. */
    cellSize(col: number, row: number): number;
}

/** Variable and function resolution for formulas in this table. */
export type CalcScope = Pick<EvalContext, 'variable' | 'userFunction'>;

export const EMPTY_SCOPE: CalcScope = { variable: () => undefined, userFunction: () => undefined };

export const isFormulaText = (text: string): boolean => text.trimStart().startsWith('=');

export function gridFromRows(rows: string[][]): CellGrid {
    const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    return { rows: rows.length, cols, text: (c, r) => rows[r]?.[c] ?? '' };
}

export function gridFromPmTable(table: PmNode): PmGrid {
    const map = TableMap.get(table);
    const topLeft = (c: number, r: number): number | null => {
        if (c < 0 || r < 0 || c >= map.width || r >= map.height) return null;
        const pos = map.map[r * map.width + c];
        const rect = map.findCell(pos);
        return rect.left === c && rect.top === r ? pos : null;
    };
    return {
        rows: map.height,
        cols: map.width,
        offset: topLeft,
        cellSize: (c, r) => {
            const pos = topLeft(c, r);
            return pos === null ? 0 : (table.nodeAt(pos)?.nodeSize ?? 0);
        },
        text: (c, r) => {
            const pos = topLeft(c, r);
            if (pos === null) return '';
            const cell = table.nodeAt(pos);
            return cell ? cell.textBetween(0, cell.content.size, '\n') : '';
        },
    };
}

/**
 * Computes every formula cell of a table. The result is keyed by cell name ("B2") and contains formula cells only.
 * Reference cycles yield #ZIRKEL for every cell on or depending on the cycle.
 */
export function computeTable(grid: CellGrid, scope: CalcScope): Map<string, Value> {
    const memo = new Map<string, Value>();
    const stack = new Set<string>();

    const ctx: EvalContext = {
        cell: (c, r) => valueAt(c, r),
        variable: scope.variable,
        userFunction: scope.userFunction,
    };

    function valueAt(col: number, row: number): Value {
        if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return '';
        const text = grid.text(col, row);
        if (!isFormulaText(text)) return parseNumber(text) ?? text;

        const key = refKey(col, row);
        const cached = memo.get(key);
        if (cached !== undefined) return cached;
        if (stack.has(key)) return err('#ZIRKEL', 'Zirkelbezug');

        stack.add(key);
        let v: Value;
        try {
            v = evaluate(parseFormula(text), ctx);
        } catch (e) {
            if (!(e instanceof FormulaError)) throw e;
            v = err(e.code, e.message);
        } finally {
            stack.delete(key);
        }
        memo.set(key, v);
        return v;
    }

    const out = new Map<string, Value>();
    for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
            if (isFormulaText(grid.text(c, r))) out.set(refKey(c, r), valueAt(c, r));
        }
    }
    return out;
}
