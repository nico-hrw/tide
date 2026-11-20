import { FormulaError, isErr, type Value } from './types';
import { parseNumber } from './parser';

/** A function argument: a single value or an expanded range. */
export type Arg = Value | Value[];
export type BuiltinFn = (args: Arg[]) => Value;

/** Number coercion for arithmetic: "" is 0, numeric text is parsed, errors propagate, other text is #WERT. */
export function toNum(v: Value): number {
    if (isErr(v)) throw new FormulaError(v.error, v.detail);
    if (typeof v === 'number') {
        if (!Number.isFinite(v)) throw new FormulaError('#WERT', 'Ungültige Zahl');
        return v;
    }
    if (v.trim() === '') return 0;
    const n = parseNumber(v);
    if (n === null) throw new FormulaError('#WERT', `"${v}" ist keine Zahl`);
    return n;
}

/** Numbers from arguments. In ranges, empty and text cells are skipped (like Excel); direct text arguments are #WERT. */
function numbers(args: Arg[]): number[] {
    const out: number[] = [];
    for (const a of args) {
        if (Array.isArray(a)) {
            for (const v of a) {
                if (isErr(v)) throw new FormulaError(v.error, v.detail);
                if (typeof v === 'number') out.push(v);
                else if (v.trim() !== '') {
                    const n = parseNumber(v);
                    if (n !== null) out.push(n);
                }
            }
        } else {
            out.push(toNum(a));
        }
    }
    return out;
}

function scalar(a: Arg | undefined, name: string): Value {
    if (a === undefined) throw new FormulaError('#WERT', `${name}: Argument fehlt`);
    if (Array.isArray(a)) throw new FormulaError('#WERT', `${name}: Bereich nicht erlaubt`);
    return a;
}

const num = (args: Arg[], i: number, name: string, dflt?: number): number => {
    if (args[i] === undefined) {
        if (dflt === undefined) throw new FormulaError('#WERT', `${name}: Argument ${i + 1} fehlt`);
        return dflt;
    }
    return toNum(scalar(args[i], name));
};

function roundHalfAway(x: number, digits: number): number {
    const f = 10 ** digits;
    const r = Math.round(Number((Math.abs(x) * f).toPrecision(15))) / f;
    return Math.sign(x) * r;
}

/** Excel-compatible annuity helpers (rate, nper, pmt, pv, fv, type). */
function pmt(rate: number, nper: number, pv: number, fv: number, type: number): number {
    if (nper === 0) throw new FormulaError('#WERT', 'Laufzeit 0');
    if (rate === 0) return -(pv + fv) / nper;
    const g = (1 + rate) ** nper;
    return -(rate * (pv * g + fv)) / ((1 + rate * type) * (g - 1));
}
function fv(rate: number, nper: number, p: number, pv: number, type: number): number {
    if (rate === 0) return -(pv + p * nper);
    const g = (1 + rate) ** nper;
    return -(pv * g + (p * (1 + rate * type) * (g - 1)) / rate);
}
function pv(rate: number, nper: number, p: number, fvv: number, type: number): number {
    if (rate === 0) return -(fvv + p * nper);
    const g = (1 + rate) ** nper;
    return -(fvv + (p * (1 + rate * type) * (g - 1)) / rate) / g;
}

export const ALIASES: Record<string, string> = {
    SUM: 'SUMME', AVERAGE: 'MITTELWERT', COUNT: 'ANZAHL', ROUND: 'RUNDEN',
    IF: 'WENN', SQRT: 'WURZEL', POWER: 'POTENZ', PMT: 'RMZ', FV: 'ZW', PV: 'BW',
};

/** WENN is lazy and handled in evaluate.ts; it is listed here so callers can tell it exists. */
export const LAZY_FUNCTIONS = new Set(['WENN']);

export const BUILTINS: Record<string, BuiltinFn> = {
    SUMME: (a) => numbers(a).reduce((s, x) => s + x, 0),
    MITTELWERT: (a) => {
        const n = numbers(a);
        if (n.length === 0) throw new FormulaError('#DIV/0', 'Keine Zahlen');
        return n.reduce((s, x) => s + x, 0) / n.length;
    },
    MIN: (a) => { const n = numbers(a); return n.length ? Math.min(...n) : 0; },
    MAX: (a) => { const n = numbers(a); return n.length ? Math.max(...n) : 0; },
    ANZAHL: (a) => {
        let c = 0;
        for (const x of a) {
            if (Array.isArray(x)) c += x.filter((v) => typeof v === 'number' || (typeof v === 'string' && parseNumber(v) !== null)).length;
            else c += 1;
        }
        return c;
    },
    RUNDEN: (a) => roundHalfAway(num(a, 0, 'RUNDEN'), num(a, 1, 'RUNDEN', 0)),
    ABS: (a) => Math.abs(num(a, 0, 'ABS')),
    WURZEL: (a) => {
        const x = num(a, 0, 'WURZEL');
        if (x < 0) throw new FormulaError('#WERT', 'Wurzel aus negativer Zahl');
        return Math.sqrt(x);
    },
    POTENZ: (a) => {
        const r = num(a, 0, 'POTENZ') ** num(a, 1, 'POTENZ');
        if (!Number.isFinite(r)) throw new FormulaError('#WERT', 'Ungültige Potenz');
        return r;
    },
    RMZ: (a) => pmt(num(a, 0, 'RMZ'), num(a, 1, 'RMZ'), num(a, 2, 'RMZ'), num(a, 3, 'RMZ', 0), num(a, 4, 'RMZ', 0)),
    ZW: (a) => fv(num(a, 0, 'ZW'), num(a, 1, 'ZW'), num(a, 2, 'ZW'), num(a, 3, 'ZW', 0), num(a, 4, 'ZW', 0)),
    BW: (a) => pv(num(a, 0, 'BW'), num(a, 1, 'BW'), num(a, 2, 'BW'), num(a, 3, 'BW', 0), num(a, 4, 'BW', 0)),
};
