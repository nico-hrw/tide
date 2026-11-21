import { FormulaError, err, isErr, type Expr, type Value } from './types';
import { parseNumber } from './parser';
import { formatResult } from './format';
import { ALIASES, BUILTINS, toNum, type Arg } from './functions';

export interface EvalContext {
    /** Already computed value of a cell (0-based col/row, optional table qualifier). Empty cells return "". */
    cell: (col: number, row: number, table?: string) => Value;
    /** Resolved value of a variable, or undefined when it is not available. */
    variable(name: string): Value | undefined;
    /** A user-defined function (case-insensitive name, upper-cased by the parser), if any. */
    userFunction(name: string): ((args: Value[]) => Value) | undefined;
}

/** Largest range a single reference may expand to. */
export const MAX_RANGE_CELLS = 10_000;

function expandRange(e: Extract<Expr, { k: 'range' }>, ctx: EvalContext): Value[] {
    const c0 = Math.min(e.from.col, e.to.col), c1 = Math.max(e.from.col, e.to.col);
    const r0 = Math.min(e.from.row, e.to.row), r1 = Math.max(e.from.row, e.to.row);
    if ((c1 - c0 + 1) * (r1 - r0 + 1) > MAX_RANGE_CELLS) throw new FormulaError('#BEZUG', 'Bereich zu groß');
    const out: Value[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(ctx.cell(c, r, e.table));
    return out;
}

/** Numeric view of a value for comparison; null when it is real text. */
function asNumberOrNull(v: Value): number | null {
    if (isErr(v)) throw new FormulaError(v.error, v.detail);
    if (typeof v === 'number') return v;
    if (v.trim() === '') return 0;
    return parseNumber(v);
}

function compare(op: string, l: Value, r: Value): number {
    const a = asNumberOrNull(l), b = asNumberOrNull(r);
    const [x, y] = a !== null && b !== null ? [a, b] : [String(l), String(r)];
    const res = op === '=' ? x === y : op === '<>' ? x !== y : op === '<' ? x < y : op === '>' ? x > y : op === '<=' ? x <= y : x >= y;
    return res ? 1 : 0;
}

/** Text view of a scalar for concatenation: numbers German-formatted, text unchanged. */
function toText(v: number | string): string {
    return typeof v === 'number' ? formatResult(v) : v;
}

/** True when `v` is text that `toNum` does not accept as a number (empty text counts as text). */
function isPlainText(v: number | string): v is string {
    if (typeof v === 'number') return false;
    if (v.trim() === '') return true;
    try { toNum(v); return false; } catch { return true; }
}

function scalar(r: Value | Value[]): Value {
    if (Array.isArray(r)) throw new FormulaError('#WERT', 'Bereich ohne Funktion');
    return r;
}

function evalRaw(e: Expr, ctx: EvalContext): Value | Value[] {
    switch (e.k) {
        case 'num': return e.v;
        case 'str': return e.v;
        case 'ref': return ctx.cell(e.col, e.row, e.table);
        case 'range': return expandRange(e, ctx);
        case 'var': {
            const v = ctx.variable(e.name);
            if (v === undefined) throw new FormulaError('#VAR', `Variable ${e.name} nicht verfügbar`);
            if (isErr(v)) throw new FormulaError(v.error, v.detail);
            return v;
        }
        case 'neg': return -toNum(scalar(evalRaw(e.e, ctx)));
        case 'pct': return toNum(scalar(evalRaw(e.e, ctx))) / 100;
        case 'bin': {
            const l = scalar(evalRaw(e.l, ctx));
            const r = scalar(evalRaw(e.r, ctx));
            if (['=', '<>', '<', '>', '<=', '>='].includes(e.op)) return compare(e.op, l, r);
            if (isErr(l)) throw new FormulaError(l.error, l.detail);
            if (isErr(r)) throw new FormulaError(r.error, r.detail);
            if (e.op === '&' || (e.op === '+' && (isPlainText(l) || isPlainText(r)))) return toText(l) + toText(r);
            const a = toNum(l), b = toNum(r);
            switch (e.op) {
                case '+': return a + b;
                case '-': return a - b;
                case '*': return a * b;
                case '/':
                    if (b === 0) throw new FormulaError('#DIV/0', 'Division durch 0');
                    return a / b;
                case '^': {
                    const p = a ** b;
                    if (!Number.isFinite(p)) throw new FormulaError('#WERT', 'Ungültige Potenz');
                    return p;
                }
                default: throw new FormulaError('#WERT', `Operator ${e.op}`);
            }
        }
        case 'call': return callFn(e.name, e.args, ctx);
    }
}

function callFn(rawName: string, argExprs: Expr[], ctx: EvalContext): Value | Value[] {
    const name = ALIASES[rawName] ?? rawName;

    if (name === 'WENN') {
        if (argExprs.length < 2) throw new FormulaError('#WERT', 'WENN braucht mindestens 2 Argumente');
        const cond = toNum(scalar(evalRaw(argExprs[0], ctx))) !== 0;
        if (cond) return evalRaw(argExprs[1], ctx);
        return argExprs[2] ? evalRaw(argExprs[2], ctx) : 0;
    }

    const user = ctx.userFunction(rawName);
    if (user) return user(argExprs.map((a) => scalar(evalRaw(a, ctx))));

    const fn = BUILTINS[name];
    if (!fn) throw new FormulaError('#NAME', `Funktion ${rawName} unbekannt`);
    const args: Arg[] = argExprs.map((a) => evalRaw(a, ctx));
    return fn(args);
}

/** Evaluates a parsed formula. Never throws for formula problems; returns an ErrorValue instead. */
export function evaluate(expr: Expr, ctx: EvalContext): Value {
    try {
        return scalar(evalRaw(expr, ctx));
    } catch (e) {
        if (e instanceof FormulaError) return err(e.code, e.message);
        throw e;
    }
}
