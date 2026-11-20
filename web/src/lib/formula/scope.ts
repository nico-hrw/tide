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

export function parseDefinitions(text: string): Definition[] {
    const out: Definition[] = [];
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const m = DEF_RE.exec(line);
        if (!m || LOOKS_LIKE_CELL.test(m[2])) continue;
        const def: Definition = { name: m[2], expr: m[4].trim(), global: m[1] === '@' };
        if (m[3] !== undefined) def.params = m[3].split(/[,;]/).map((p) => p.trim()).filter(Boolean);
        out.splice(out.length, 0, def.params ? def : { name: def.name, expr: def.expr, global: def.global });
    }
    return out;
}

export interface ScopeLayers {
    /** Definitions of the current note. */
    local: Definition[];
    /** Central registry; only called when a name is not found locally. */
    global: () => Definition[];
    /** Copy of used globals stored in a shared note. */
    snapshot: Definition[];
}

/** Maximum nesting of user-function calls before giving up with #ZIRKEL. */
const MAX_CALL_DEPTH = 50;

/** Resolution order: local, global, snapshot, stdlib. Values are evaluated lazily and cached per scope. */
export function buildScope(layers: ScopeLayers): CalcScope {
    let globalDefs: Definition[] | null = null;
    const globalGet = () => (globalDefs ??= layers.global());
    const parsed = new Map<Definition, { expr: Expr } | { error: ErrorValue }>();
    const values = new Map<string, Value>();
    const visiting = new Set<string>();
    let depth = 0;

    const find = (match: (d: Definition) => boolean): Definition | undefined =>
        layers.local.find(match) ?? globalGet().find(match) ?? layers.snapshot.find(match);

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
        const d = find((x) => !x.params && x.name === name);
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
        const d = find((x) => !!x.params && x.name.toUpperCase() === upperName);
        if (!d || !d.params) return undefined;
        const params = d.params;
        return (args) => {
            if (args.length < params.length) return err('#WERT', `${d.name} erwartet ${params.length} Argumente`);
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
