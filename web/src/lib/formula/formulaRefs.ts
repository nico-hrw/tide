import { lettersToCol, refKey, type CellRef } from './types';
import { parseNumber } from './parser';
import { isFormulaText, type CellGrid } from './tableCalc';

/** Number of distinct highlight colours for references (CSS classes tt-refc-0..5). */
export const REF_COLOR_COUNT = 6;

export interface RefMatch {
    /** Offsets in the formula text. */
    start: number;
    end: number;
    table?: string;
    from: CellRef;
    to: CellRef;
    /** Highlight colour index (same reference text = same colour). */
    color: number;
}

const REF_RE = /(?<![A-Za-zÄÖÜäöüß0-9_])(?:(?:'([^']+)'|([A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß0-9_]*))!)?([A-Za-z]{1,2})(\d+)(?::([A-Za-z]{1,2})(\d+))?(?![A-Za-z0-9_(])/g;

export function findRefs(text: string): RefMatch[] {
    const colors = new Map<string, number>();
    const out: RefMatch[] = [];
    for (const m of text.matchAll(REF_RE)) {
        const table = m[1] ?? m[2];
        const from = { col: lettersToCol(m[3]), row: Number(m[4]) - 1 };
        const to = m[5] ? { col: lettersToCol(m[5]), row: Number(m[6]) - 1 } : from;
        if (from.row < 0 || to.row < 0) continue;
        const key = m[0].toUpperCase();
        if (!colors.has(key)) colors.set(key, colors.size % REF_COLOR_COUNT);
        out.push({
            start: m.index!,
            end: m.index! + m[0].length,
            ...(table !== undefined ? { table } : {}),
            from,
            to,
            color: colors.get(key)!,
        });
    }
    return out;
}

/** True when the caret sits where a reference is expected: right after "=", an operator, "(", a separator, or "!". */
export function canInsertRefAt(textBeforeCaret: string): boolean {
    const t = textBeforeCaret.trimEnd();
    return t.startsWith('=') && /[=+\-*/^(;,<>!]$/.test(t);
}

function numericLike(text: string): boolean {
    return text.trim() !== '' && (isFormulaText(text) || parseNumber(text) !== null);
}

/** Range text for a "Σ" button: the contiguous numeric cells above the cell, else those on its left; null if none. */
export function sumRangeFor(grid: CellGrid, col: number, row: number): string | null {
    let r = row - 1;
    while (r >= 0 && numericLike(grid.text(col, r))) r--;
    if (r < row - 1) return `${refKey(col, r + 1)}:${refKey(col, row - 1)}`;
    let c = col - 1;
    while (c >= 0 && numericLike(grid.text(c, row))) c--;
    if (c < col - 1) return `${refKey(c + 1, row)}:${refKey(col - 1, row)}`;
    return null;
}
