const IDENT_START_RE = /[A-Za-zÀ-ÖØ-öø-ÿ_$]/;
const IDENT_CONT_RE = /[A-Za-zÀ-ÖØ-öø-ÿ0-9_$]/;
const GERMAN_THOUSANDS_RE = /^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?(?![.\d])/;
const GERMAN_DECIMAL_RE = /^\d+,\d+/;
const STANDARD_NUMBER_RE = /^\d+(?:\.\d+)?/;

export class TideEngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'TideEngineError';
    this.code = code;
  }
}

export type TokenKind =
  | 'NUMBER'
  | 'IDENT'
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH'
  | 'CARET'
  | 'PERCENT'
  | 'EQ'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACE'
  | 'RBRACE'
  | 'COMMA'
  | 'SEMI'
  | 'NEWLINE'
  | 'EOF';

export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly numValue?: number;
  readonly pos: number;
}

export type ExprNode =
  | { readonly type: 'NumberLiteral'; readonly value: number }
  | { readonly type: 'Ident'; readonly name: string }
  | { readonly type: 'Unary'; readonly op: '+' | '-'; readonly expr: ExprNode }
  | { readonly type: 'Percent'; readonly expr: ExprNode }
  | {
      readonly type: 'Binary';
      readonly op: '+' | '-' | '*' | '/' | '^';
      readonly left: ExprNode;
      readonly right: ExprNode;
    }
  | { readonly type: 'Call'; readonly callee: string; readonly args: readonly ExprNode[] }
  | { readonly type: 'Block'; readonly statements: readonly StmtNode[] };

export type StmtNode =
  | { readonly type: 'Assign'; readonly name: string; readonly value: ExprNode }
  | {
      readonly type: 'FuncDef';
      readonly name: string;
      readonly params: readonly string[];
      readonly body: ExprNode;
    }
  | { readonly type: 'ExprStmt'; readonly expr: ExprNode };

const SINGLE_CHAR_TOKENS: Readonly<Record<string, TokenKind>> = {
  '+': 'PLUS',
  '-': 'MINUS',
  '*': 'STAR',
  '/': 'SLASH',
  '^': 'CARET',
  '%': 'PERCENT',
  '=': 'EQ',
  '(': 'LPAREN',
  ')': 'RPAREN',
  '{': 'LBRACE',
  '}': 'RBRACE',
  ',': 'COMMA',
  ';': 'SEMI',
};

export function tokenizeTideFormula(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      tokens.push({ kind: 'NEWLINE', text: '\n', pos: i });
      i += 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }

    if (ch >= '0' && ch <= '9') {
      const rest = source.slice(i);
      const thousandsMatch = GERMAN_THOUSANDS_RE.exec(rest);
      if (thousandsMatch) {
        const raw = thousandsMatch[0];
        const normalized = raw.replace(/\./g, '').replace(',', '.');
        tokens.push({ kind: 'NUMBER', text: raw, numValue: Number(normalized), pos: i });
        i += raw.length;
        continue;
      }
      const decimalMatch = GERMAN_DECIMAL_RE.exec(rest);
      if (decimalMatch) {
        const raw = decimalMatch[0];
        tokens.push({
          kind: 'NUMBER',
          text: raw,
          numValue: Number(raw.replace(',', '.')),
          pos: i,
        });
        i += raw.length;
        continue;
      }
      const stdMatch = STANDARD_NUMBER_RE.exec(rest);
      if (stdMatch) {
        const raw = stdMatch[0];
        tokens.push({ kind: 'NUMBER', text: raw, numValue: Number(raw), pos: i });
        i += raw.length;
        continue;
      }
    }

    if (IDENT_START_RE.test(ch)) {
      const start = i;
      i += 1;
      while (i < source.length && IDENT_CONT_RE.test(source[i])) i += 1;
      tokens.push({ kind: 'IDENT', text: source.slice(start, i), pos: start });
      continue;
    }

    const singleKind = SINGLE_CHAR_TOKENS[ch];
    if (singleKind) {
      tokens.push({ kind: singleKind, text: ch, pos: i });
      i += 1;
      continue;
    }

    throw new TideEngineError('SYNTAX_ERROR', `Unexpected character '${ch}' at position ${i}`);
  }

  tokens.push({ kind: 'EOF', text: '', pos: source.length });
  return tokens;
}

export class TideParser {
  private readonly tokens: readonly Token[];
  private cursor = 0;

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.cursor + offset, this.tokens.length - 1)];
  }

  private advance(): Token {
    const token = this.peek();
    if (this.cursor < this.tokens.length - 1) this.cursor += 1;
    return token;
  }

  private expect(kind: TokenKind, message: string): Token {
    const token = this.peek();
    if (token.kind !== kind) {
      throw new TideEngineError('SYNTAX_ERROR', `${message} (got '${token.text || token.kind}')`);
    }
    return this.advance();
  }

  private skipSeparators(): void {
    while (this.peek().kind === 'NEWLINE' || this.peek().kind === 'SEMI') this.advance();
  }

  private skipNewlines(): void {
    while (this.peek().kind === 'NEWLINE') this.advance();
  }

  parseProgram(): StmtNode[] {
    const statements = this.parseStatementList('EOF');
    this.expect('EOF', 'Expected end of input');
    return statements;
  }

  private parseStatementList(stopKind: 'EOF' | 'RBRACE'): StmtNode[] {
    const statements: StmtNode[] = [];
    this.skipSeparators();

    while (this.peek().kind !== stopKind && this.peek().kind !== 'EOF') {
      statements.push(this.parseStatement());
      if (this.peek().kind === stopKind || this.peek().kind === 'EOF') break;
      if (this.peek().kind !== 'NEWLINE' && this.peek().kind !== 'SEMI') {
        throw new TideEngineError(
          'SYNTAX_ERROR',
          `Unexpected token '${this.peek().text || this.peek().kind}' after statement`,
        );
      }
      this.skipSeparators();
    }
    return statements;
  }

  private isFuncDefLookahead(): boolean {
    if (this.peek(0).kind !== 'IDENT' || this.peek(1).kind !== 'LPAREN') return false;
    let idx = 2;
    let depth = 1;
    while (this.cursor + idx < this.tokens.length) {
      const kind = this.tokens[this.cursor + idx].kind;
      if (kind === 'LPAREN') depth += 1;
      else if (kind === 'RPAREN') {
        depth -= 1;
        if (depth === 0) return this.tokens[this.cursor + idx + 1]?.kind === 'EQ';
      } else if (kind === 'EOF') return false;
      idx += 1;
    }
    return false;
  }

  private parseStatement(): StmtNode {
    if (this.isFuncDefLookahead()) {
      const name = this.advance().text;
      this.advance(); // LPAREN
      const params: string[] = [];
      const seen = new Set<string>();
      this.skipNewlines();
      if (this.peek().kind !== 'RPAREN') {
        while (true) {
          this.skipNewlines();
          const param = this.expect('IDENT', 'Expected parameter name').text;
          if (seen.has(param)) {
            throw new TideEngineError('SYNTAX_ERROR', `Duplicate parameter '${param}'`);
          }
          seen.add(param);
          params.push(param);
          this.skipNewlines();
          if (this.peek().kind === 'COMMA' || this.peek().kind === 'SEMI') {
            this.advance();
            continue;
          }
          break;
        }
      }
      this.expect('RPAREN', "Expected ')' after parameter list");
      this.expect('EQ', "Expected '=' after function signature");
      return { type: 'FuncDef', name, params, body: this.parseExpr() };
    }

    if (this.peek(0).kind === 'IDENT' && this.peek(1).kind === 'EQ') {
      const name = this.advance().text;
      this.advance(); // EQ
      return { type: 'Assign', name, value: this.parseExpr() };
    }

    return { type: 'ExprStmt', expr: this.parseExpr() };
  }

  private parseExpr(): ExprNode {
    let left = this.parseMulDiv();
    while (this.peek().kind === 'PLUS' || this.peek().kind === 'MINUS') {
      const op = this.advance().kind === 'PLUS' ? '+' : '-';
      left = { type: 'Binary', op, left, right: this.parseMulDiv() };
    }
    return left;
  }

  private parseMulDiv(): ExprNode {
    let left = this.parseUnary();
    while (this.peek().kind === 'STAR' || this.peek().kind === 'SLASH') {
      const op = this.advance().kind === 'STAR' ? '*' : '/';
      left = { type: 'Binary', op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): ExprNode {
    if (this.peek().kind === 'PLUS' || this.peek().kind === 'MINUS') {
      const op = this.advance().kind === 'PLUS' ? '+' : '-';
      return { type: 'Unary', op, expr: this.parseUnary() };
    }
    return this.parsePower();
  }

  private parsePower(): ExprNode {
    const base = this.parsePostfix();
    if (this.peek().kind === 'CARET') {
      this.advance();
      return { type: 'Binary', op: '^', left: base, right: this.parseUnary() };
    }
    return base;
  }

  private parsePostfix(): ExprNode {
    let expr = this.parsePrimary();
    while (this.peek().kind === 'PERCENT') {
      this.advance();
      expr = { type: 'Percent', expr };
    }
    return expr;
  }

  private parsePrimary(): ExprNode {
    const token = this.peek();

    if (token.kind === 'NUMBER') {
      this.advance();
      return { type: 'NumberLiteral', value: token.numValue ?? 0 };
    }

    if (token.kind === 'LPAREN') {
      this.advance();
      this.skipNewlines();
      const expr = this.parseExpr();
      this.skipNewlines();
      this.expect('RPAREN', "Expected ')'");
      return expr;
    }

    if (token.kind === 'LBRACE') {
      this.advance();
      const statements = this.parseStatementList('RBRACE');
      this.expect('RBRACE', "Expected '}'");
      if (statements.length === 0) {
        throw new TideEngineError('SYNTAX_ERROR', 'Block cannot be empty');
      }
      return { type: 'Block', statements };
    }

    if (token.kind === 'IDENT') {
      const name = this.advance().text;
      if (this.peek().kind === 'LPAREN') {
        this.advance();
        const args: ExprNode[] = [];
        this.skipNewlines();
        if (this.peek().kind !== 'RPAREN') {
          while (true) {
            this.skipNewlines();
            args.push(this.parseExpr());
            this.skipNewlines();
            if (this.peek().kind === 'COMMA' || this.peek().kind === 'SEMI') {
              this.advance();
              continue;
            }
            break;
          }
        }
        this.expect('RPAREN', "Expected ')' after arguments");
        return { type: 'Call', callee: name, args };
      }
      return { type: 'Ident', name };
    }

    throw new TideEngineError(
      'SYNTAX_ERROR',
      `Expected expression, got '${token.text || token.kind}'`,
    );
  }
}
