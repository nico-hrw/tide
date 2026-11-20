import { evaluate, type EvalContext } from './evaluate';
import { parseFormula } from './parser';
import { STDLIB_CONSTANTS } from './stdlib';
import type { CalcScope } from './tableCalc';
import { FormulaError, err, type ErrorValue, type Expr, type Value } from './types';

/** One line of a variables block: a value (`zins = 3,9 %`) or a function (`rate(b, z, n) = RMZ(z / 12, n, -b)`). */
export interface Definition {
    name: string;
    /** Present for functions. */
    params?: string[];
    expr: string;
    /** Marked with a leading "@" in the block: also published to the central registry. */
    global: boolean;
}

const DEF_RE = /^(@)?\s*([A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß0-9_]*)\s*(?:\(([^)]*)\))?\s*=\s*(.+)$/;
const LOOKS_LIKE_CELL = /^[A-Za-z]{1,2}\d+$/;

/** Definitions with the (0-based) line they came from; blank, comment and unparsable lines are skipped. */
export function parseDefinitionLines(text: string): Array<{ line: number; def: Definition }> {
    const out: Array<{ line: number; def: Definition }> = [];
    text.split('\n').forEach((raw, line) => {
        const t = raw.trim();
        if (!t || t.startsWith('#')) return;
        const m = DEF_RE.exec(t);
        if (!m || LOOKS_LIKE_CELL.test(m[2])) return;
        const def: Definition = { name: m[2], expr: m[4].trim(), global: m[1] === '@' };
        if (m[3] !== undefined) def.params = m[3].split(/[,;]/).map((p) => p.trim()).filter(Boolean);
        out.push({ line, def });
    });
    return out;
}

export function parseDefinitions(text: string): Definition[] {
    return parseDefinitionLines(text).map((l) => l.def);
}

/** Sets or clears the "@" (global) marker on one line of a variables block. */
export function setGlobalAtLine(text: string, line: number, global: boolean): string {
    const lines = text.split('\n');
    if (line < 0 || line >= lines.length) return text;
    const bare = lines[line].replace(/^\s*@\s*/, '');
    lines[line] = global ? `@${bare}` : bare;
    return lines.join('\n');
}

/** Guards data that arrives in a shared note (snapshots): only well-formed definitions pass. */
export function isDefinition(v: unknown): v is Definition {
    if (typeof v !== 'object' || v === null) return false;
    const d = v as Record<string, unknown>;
    return typeof d.name === 'string' && d.name.length > 0 && d.name.length <= 100
        && typeof d.expr === 'string' && d.expr.length <= 2000
        && (d.params === undefined || (Array.isArray(d.params) && d.params.length <= 20 && d.params.every((p) => typeof p === 'string')));
}

export interface ScopeLayers {
    /** Definitions of the current note. */
    local: Definition[];
    /** Central registry; only called when a name is not found locally. */
    global: () => Definition[];
    /** Copy of used globals stored in a shared note. */
    snapshot: Definition[];
    /**
     * Evaluated symbols of the note's VarSheet (numbers, strings and callable functions).
     * Looked up after the local definitions and before the central registry.
     */
    sheet?: ReadonlyMap<string, unknown>;
}

/** Maximum nesting of user-function calls before giving up with #ZIRKEL. */
const MAX_CALL_DEPTH = 50;
/** Total user-function calls per scope. Depth alone does not stop exponential branching like f(n-1)+f(n-1). */
const MAX_TOTAL_CALLS = 20_000;

/** Resolution order: local, VarSheet, global, snapshot, stdlib. Values are evaluated lazily and cached per scope. */
export function buildScope(layers: ScopeLayers): CalcScope {
    let globalDefs: Definition[] | null = null;
    const globalGet = () => (globalDefs ??= layers.global());
    const parsed = new Map<Definition, { expr: Expr } | { error: ErrorValue }>();
    const values = new Map<string, Value>();
    const visiting = new Set<string>();
    let depth = 0;
    let calls = 0;

    /** A number or string from the VarSheet; exact name first, then ignoring case. */
    function sheetValue(name: string): Value | undefined {
        const sheet = layers.sheet;
        if (!sheet || sheet.size === 0) return undefined;
        let raw = sheet.get(name);
        if (raw === undefined) {
            const lower = name.toLowerCase();
            for (const [k, v] of sheet) if (k.toLowerCase() === lower) { raw = v; break; }
        }
        if (typeof raw === 'number') return Number.isFinite(raw) ? raw : err('#WERT', `${name} ist keine endliche Zahl`);
        if (typeof raw === 'string') return raw;
        return undefined;
    }

    /** A function defined in the VarSheet, called with numbers; anything else becomes #WERT. */
    function sheetFunction(upperName: string): ((args: Value[]) => Value) | undefined {
        const sheet = layers.sheet;
        if (!sheet) return undefined;
        for (const [k, v] of sheet) {
            if (typeof v !== 'function' || k.toUpperCase() !== upperName) continue;
            const fn = v as (...a: number[]) => unknown;
            return (args) => {
                const nums: number[] = [];
                for (const a of args) {
                    if (typeof a !== 'number') return err('#WERT', `${k} erwartet Zahlen`);
                    nums.push(a);
                }
                if (++calls > MAX_TOTAL_CALLS) return err('#WERT', 'Zu viele Funktionsaufrufe');
                try {
                    const out = fn(...nums);
                    return typeof out === 'number' && Number.isFinite(out) ? out : err('#WERT', `${k} liefert keine Zahl`);
                } catch (e) {
                    return err('#WERT', e instanceof Error ? e.message : `${k} fehlgeschlagen`);
                }
            };
        }
        return undefined;
    }

    function exprOf(d: Definition): { expr: Expr } | { error: ErrorValue } {
        let p = parsed.get(d);
        if (p === undefined) {
            try { p = { expr: parseFormula(d.expr) }; }
            catch (e) { p = { error: e instanceof FormulaError ? err(e.code, e.message) : err('#WERT') }; }
            parsed.set(d, p);
        }
        return p;
    }

    function run(d: Definition, params?: Map<string, Value>): Value {
        const p = exprOf(d);
        if ('error' in p) return p.error;
        const ctx: EvalContext = {
            cell: () => err('#BEZUG', 'Zellbezüge sind in Variablen nicht möglich'),
            variable: (n) => variable(n, params),
            userFunction,
        };
        return evaluate(p.expr, ctx);
    }

    function variable(name: string, params?: Map<string, Value>): Value | undefined {
        if (params?.has(name)) return params.get(name);
        const cached = values.get(name);
        if (cached !== undefined) return cached;
        const isVar = (x: Definition) => !x.params && x.name === name;
        const local = layers.local.find(isVar);
        if (!local) {
            const sv = sheetValue(name);
            if (sv !== undefined) { values.set(name, sv); return sv; }
        }
        const d = local ?? globalGet().find(isVar) ?? layers.snapshot.find(isVar);
        if (!d) return STDLIB_CONSTANTS[name];
        if (visiting.has(name)) return err('#ZIRKEL', `Zirkelbezug bei ${name}`);
        visiting.add(name);
        try {
            const v = run(d);
            values.set(name, v);
            return v;
        } finally {
            visiting.delete(name);
        }
    }

    function userFunction(upperName: string): ((args: Value[]) => Value) | undefined {
        const isFn = (x: Definition) => !!x.params && x.name.toUpperCase() === upperName;
        const local = layers.local.find(isFn);
        if (!local) {
            const sf = sheetFunction(upperName);
            if (sf) return sf;
        }
        const d = local ?? globalGet().find(isFn) ?? layers.snapshot.find(isFn);
        if (!d || !d.params) return undefined;
        const params = d.params;
        return (args) => {
            if (args.length < params.length) return err('#WERT', `${d.name} erwartet ${params.length} Argumente`);
            if (++calls > MAX_TOTAL_CALLS) return err('#WERT', 'Zu viele Funktionsaufrufe');
            if (depth >= MAX_CALL_DEPTH) return err('#ZIRKEL', `Rekursion bei ${d.name}`);
            depth++;
            try {
                return run(d, new Map(params.map((p, i) => [p, args[i]])));
            } finally {
                depth--;
            }
        };
    }

    return { variable: (n) => variable(n), userFunction };
}
