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

export interface TableEntry {
    id: string; // canonical ID, e.g. "T1"
    aliases: string[]; // e.g. ["t1", "tabelle1", "table1", "tabelle 1", "table 1"]
    grid: CellGrid;
}

/**
 * Computes every formula cell across all tables in a document, supporting cross-table references.
 * Returns a map keyed by canonical table `id`, mapping each formula cell name ("B2") to its computed `Value`.
 * Reference cycles yield #ZIRKEL for every cell on or depending on the cycle.
 */
export function computeDocumentTables(
    tables: TableEntry[],
    scope: CalcScope,
): Map<string, Map<string, Value>> {
    const aliasMap = new Map<string, TableEntry>();
    for (const entry of tables) {
        aliasMap.set(entry.id.toLowerCase().trim(), entry);
        for (const alias of entry.aliases) {
            aliasMap.set(alias.toLowerCase().trim(), entry);
        }
    }

    const memo = new Map<string, Value>();
    const stack = new Set<string>();
    const ctxCache = new Map<string, EvalContext>();

    function getCtx(entry: TableEntry): EvalContext {
        let ctx = ctxCache.get(entry.id);
        if (!ctx) {
            ctx = {
                cell: (c, r, targetTable) => evalCell(entry, c, r, targetTable),
                variable: scope.variable,
                userFunction: scope.userFunction,
            };
            ctxCache.set(entry.id, ctx);
        }
        return ctx;
    }

    function evalCell(current: TableEntry, col: number, row: number, targetTable?: string): Value {
        let target: TableEntry;
        if (targetTable) {
            const found = aliasMap.get(targetTable.toLowerCase().trim());
            if (!found) return err('#BEZUG', `Tabelle "${targetTable}" nicht gefunden`);
            target = found;
        } else {
            target = current;
        }

        if (col < 0 || row < 0 || col >= target.grid.cols || row >= target.grid.rows) {
            return err('#BEZUG', 'Zelle außerhalb der Tabelle');
        }

        const key = `${target.id}!${refKey(col, row)}`;
        const cached = memo.get(key);
        if (cached !== undefined) return cached;
        if (stack.has(key)) return err('#ZIRKEL', 'Zirkulärer Bezug');

        const text = target.grid.text(col, row);
        let v: Value;
        if (!isFormulaText(text)) {
            v = parseNumber(text) ?? text;
        } else {
            stack.add(key);
            try {
                v = evaluate(parseFormula(text), getCtx(target));
            } catch (e) {
                v = e instanceof FormulaError ? err(e.code, e.message) : err('#WERT', 'Unerwarteter Fehler');
            } finally {
                stack.delete(key);
            }
        }
        memo.set(key, v);
        return v;
    }

    const result = new Map<string, Map<string, Value>>();
    for (const entry of tables) {
        const out = new Map<string, Value>();
        for (let r = 0; r < entry.grid.rows; r++) {
            for (let c = 0; c < entry.grid.cols; c++) {
                if (isFormulaText(entry.grid.text(c, r))) {
                    out.set(refKey(c, r), evalCell(entry, c, r));
                }
            }
        }
        result.set(entry.id, out);
    }
    return result;
}

/**
 * Computes every formula cell of a table. The result is keyed by cell name ("B2") and contains formula cells only.
 * Reference cycles yield #ZIRKEL for every cell on or depending on the cycle.
 */
export function computeTable(grid: CellGrid, scope: CalcScope): Map<string, Value> {
    const entry: TableEntry = { id: 'T1', aliases: ['t1', 'tabelle1', 'table1'], grid };
    const res = computeDocumentTables([entry], scope);
    return res.get('T1') ?? new Map();
}
