export type ErrorCode = '#DIV/0' | '#WERT' | '#BEZUG' | '#NAME' | '#ZIRKEL' | '#VAR';

export class FormulaError extends Error {
    constructor(public readonly code: ErrorCode, message?: string) {
        super(message ?? code);
        this.name = 'FormulaError';
    }
}

export interface ErrorValue { error: ErrorCode; detail?: string }
export type Value = number | string | ErrorValue;

export const isErr = (v: unknown): v is ErrorValue =>
    typeof v === 'object' && v !== null && 'error' in v;

export const err = (error: ErrorCode, detail?: string): ErrorValue => ({ error, detail });

/** 0-based cell coordinate. */
export interface CellRef { col: number; row: number }

export type Expr =
    | { k: 'num'; v: number }
    | { k: 'str'; v: string }
    | { k: 'ref'; col: number; row: number }
    | { k: 'range'; from: CellRef; to: CellRef }
    | { k: 'var'; name: string }
    | { k: 'call'; name: string; args: Expr[] }
    | { k: 'bin'; op: string; l: Expr; r: Expr }
    | { k: 'neg'; e: Expr }
    | { k: 'pct'; e: Expr };

export function colToLetters(col: number): string {
    let n = col + 1;
    let s = '';
    while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

export function lettersToCol(letters: string): number {
    let n = 0;
    for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
}

/** "B2" for col 1, row 1 (0-based). */
export const refKey = (col: number, row: number): string => `${colToLetters(col)}${row + 1}`;
