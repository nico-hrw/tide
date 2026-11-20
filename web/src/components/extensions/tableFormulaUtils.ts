import type { Node as PmNode } from '@tiptap/pm/model';
import { TableMap } from '@tiptap/pm/tables';

export interface CellLoc {
    tablePos: number;
    table: PmNode;
    cellPos: number;
    cell: PmNode;
    /** 0-based coordinates of the cell's top-left corner. */
    col: number;
    row: number;
}

/** Finds the table cell around a document position (null when the position is not inside a table cell). */
export function locateCell(doc: PmNode, pos: number): CellLoc | null {
    if (pos < 0 || pos > doc.content.size) return null;
    const $pos = doc.resolve(pos);
    for (let d = $pos.depth; d > 1; d--) {
        const role = $pos.node(d).type.spec.tableRole;
        if (role !== 'cell' && role !== 'header_cell') continue;
        const table = $pos.node(d - 2);
        if (table.type.spec.tableRole !== 'table') return null;
        const cellPos = $pos.before(d);
        const tablePos = $pos.before(d - 2);
        const rect = TableMap.get(table).findCell(cellPos - tablePos - 1);
        return { tablePos, table, cellPos, cell: $pos.node(d), col: rect.left, row: rect.top };
    }
    return null;
}
