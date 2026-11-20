import { FormulaError, lettersToCol, type Expr, type CellRef } from './types';

type Tok =
    | { t: 'num'; v: number }
    | { t: 'str'; v: string }
    | { t: 'id'; v: string }
    | { t: 'op'; v: string };

const NUM_RE = /^(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)/;
const ID_RE = /^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß0-9_]*/;
const REF_RE = /^([A-Za-z]{1,2})(\d+)$/;
const OPS = ['<>', '<=', '>=', '+', '-', '*', '/', '^', '(', ')', ',', ';', ':', '%', '=', '<', '>', '!'];

/** German number text ("1.234,5", "3,9 %", "12.000,00 €") to a number; null when it is not one. */
export function parseNumber(text: string): number | null {
    let s = text.trim().replace(/\s*(?:€|\$|£)$/, '');
    let pct = false;
    if (s.endsWith('%')) { pct = true; s = s.slice(0, -1).trim(); }
    let neg = false;
    if (s.startsWith('-')) { neg = true; s = s.slice(1); }
    const m = NUM_RE.exec(s);
    if (!m || m[0].length !== s.length) return null;
    const n = Number(m[0].replace(/\./g, '').replace(',', '.'));
    const v = pct ? n / 100 : n;
    return neg ? -v : v;
}

function tokenize(src: string): Tok[] {
    const out: Tok[] = [];
    let i = 0;
    while (i < src.length) {
        const rest = src.slice(i);
        const ch = rest[0];
        if (/\s/.test(ch)) { i++; continue; }
        if (ch === '"') {
            const end = rest.indexOf('"', 1);
            if (end < 0) throw new FormulaError('#WERT', 'Text nicht geschlossen');
            out.push({ t: 'str', v: rest.slice(1, end) });
            i += end + 1;
            continue;
        }
        if (ch === "'") {
            let content = '';
            let j = i + 1;
            let closed = false;
            while (j < src.length) {
                const c = src[j];
                if (c === '\\' && j + 1 < src.length) {
                    content += src[j + 1];
                    j += 2;
                    continue;
                }
                if (c === "'") {
                    if (src[j + 1] === "'") {
                        content += "'";
                        j += 2;
                        continue;
                    }
                    closed = true;
                    j++;
                    break;
                }
                content += c;
                j++;
            }
            if (!closed) throw new FormulaError('#WERT', 'Tabellenname nicht geschlossen');
            out.push({ t: 'id', v: content });
            i = j;
            continue;
        }
        const num = NUM_RE.exec(rest);
        if (num) {
            out.push({ t: 'num', v: Number(num[0].replace(/\./g, '').replace(',', '.')) });
            i += num[0].length;
            continue;
        }
        const id = ID_RE.exec(rest);
        if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
        const op = OPS.find((o) => rest.startsWith(o));
        if (op) { out.push({ t: 'op', v: op }); i += op.length; continue; }
        throw new FormulaError('#WERT', `Unerwartetes Zeichen "${ch}"`);
    }
    return out;
}

function toRef(id: string): CellRef | null {
    const m = REF_RE.exec(id);
    if (!m) return null;
    const row = Number(m[2]) - 1;
    if (row < 0) return null;
    return { col: lettersToCol(m[1]), row };
}

class Parser {
    private p = 0;
    constructor(private readonly toks: Tok[]) {}

    parseAll(): Expr {
        const e = this.cmp();
        if (this.p < this.toks.length) throw new FormulaError('#WERT', 'Unerwartetes Ende der Formel');
        return e;
    }

    private peekOp(...ops: string[]): string | null {
        const t = this.toks[this.p];
        return t && t.t === 'op' && ops.includes(t.v) ? t.v : null;
    }

    private expectOp(op: string) {
        if (this.peekOp(op) === null) throw new FormulaError('#WERT', `"${op}" erwartet`);
        this.p++;
    }

    private consumeId(errorMessage: string): string {
        const tok = this.toks[this.p];
        if (!tok || tok.t !== 'id') throw new FormulaError('#BEZUG', errorMessage);
        this.p++;
        return tok.v;
    }

    private cmp(): Expr {
        let l = this.add();
        for (let op = this.peekOp('=', '<>', '<=', '>=', '<', '>'); op; op = this.peekOp('=', '<>', '<=', '>=', '<', '>')) {
            this.p++;
            l = { k: 'bin', op, l, r: this.add() };
        }
        return l;
    }

    private add(): Expr {
        let l = this.mul();
        for (let op = this.peekOp('+', '-'); op; op = this.peekOp('+', '-')) {
            this.p++;
            l = { k: 'bin', op, l, r: this.mul() };
        }
        return l;
    }

    private mul(): Expr {
        let l = this.unary();
        for (let op = this.peekOp('*', '/'); op; op = this.peekOp('*', '/')) {
            this.p++;
            l = { k: 'bin', op, l, r: this.unary() };
        }
        return l;
    }

    private unary(): Expr {
        if (this.peekOp('-')) { this.p++; return { k: 'neg', e: this.unary() }; }
        if (this.peekOp('+')) { this.p++; return this.unary(); }
        return this.pow();
    }

    private pow(): Expr {
        const base = this.postfix();
        if (this.peekOp('^')) { this.p++; return { k: 'bin', op: '^', l: base, r: this.unary() }; }
        return base;
    }

    private postfix(): Expr {
        let e = this.primary();
        while (this.peekOp('%')) { this.p++; e = { k: 'pct', e }; }
        return e;
    }

    private primary(): Expr {
        const t = this.toks[this.p];
        if (!t) throw new FormulaError('#WERT', 'Formel unvollständig');
        this.p++;
        if (t.t === 'num') return { k: 'num', v: t.v };
        if (t.t === 'str') return { k: 'str', v: t.v };
        if (t.t === 'op') {
            if (t.v === '(') { const e = this.cmp(); this.expectOp(')'); return e; }
            throw new FormulaError('#WERT', `Unerwartetes "${t.v}"`);
        }
        // identifier: table-qualified ref/range, call, cell reference / range, or variable
        if (this.peekOp('!')) {
            this.p++;
            const tableName = t.v;
            const refErr = `Ungültiger Zellbezug nach "${tableName}!"`;
            const fromRef = toRef(this.consumeId(refErr));
            if (!fromRef) throw new FormulaError('#BEZUG', refErr);
            if (this.peekOp(':')) {
                this.p++;
                const rangeErr = `Ungültiger Bereichsbezug in "${tableName}!"`;
                let toId = this.consumeId(rangeErr);
                if (this.peekOp('!')) {
                    // Case like T1!A1:T1!B5
                    this.p++;
                    toId = this.consumeId(rangeErr);
                }
                const toRefCell = toRef(toId);
                if (!toRefCell) throw new FormulaError('#BEZUG', rangeErr);
                return { k: 'range', table: tableName, from: fromRef, to: toRefCell };
            }
            return { k: 'ref', table: tableName, col: fromRef.col, row: fromRef.row };
        }
        if (this.peekOp('(')) {
            this.p++;
            const args: Expr[] = [];
            if (!this.peekOp(')')) {
                args.push(this.cmp());
                while (this.peekOp(',', ';')) { this.p++; args.push(this.cmp()); }
            }
            this.expectOp(')');
            return { k: 'call', name: t.v.toUpperCase(), args };
        }
        const ref = toRef(t.v);
        if (ref) {
            if (this.peekOp(':')) {
                this.p++;
                const n = this.toks[this.p];
                const to = n && n.t === 'id' ? toRef(n.v) : null;
                if (!to) throw new FormulaError('#BEZUG', 'Ungültiger Bereich');
                this.p++;
                return { k: 'range', from: ref, to };
            }
            return { k: 'ref', ...ref };
        }
        return { k: 'var', name: t.v };
    }
}

/** Parses a formula; a leading "=" is optional. Throws FormulaError('#WERT' | '#BEZUG'). */
export function parseFormula(src: string): Expr {
    const body = src.trim().replace(/^=/, '');
    if (!body.trim()) throw new FormulaError('#WERT', 'Leere Formel');
    return new Parser(tokenize(body)).parseAll();
}
