import type {
  EvaluationResult,
  ExecutionScope,
  VarSheetEngine,
} from './types';
import {
  type ExprNode,
  type StmtNode,
  TideEngineError,
  TideParser,
  tokenizeTideFormula,
} from './tideParser';

const MAX_CALL_DEPTH = 100;

const deNumberFormatter = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 10,
});

interface RuntimeEnv {
  readonly locals: Map<string, unknown>;
  readonly parent?: RuntimeEnv;
  readonly bindings: ReadonlyMap<string, unknown>;
  readonly signal?: AbortSignal;
}

type BuiltinFn = (args: readonly number[]) => number;

const BUILTINS: Readonly<Record<string, BuiltinFn>> = {
  summe: (args) => args.reduce((acc, n) => acc + n, 0),
  sum: (args) => args.reduce((acc, n) => acc + n, 0),
  min: (args) => {
    if (args.length === 0) {
      throw new TideEngineError('ARITY_ERROR', 'min() requires at least 1 argument');
    }
    return Math.min(...args);
  },
  max: (args) => {
    if (args.length === 0) {
      throw new TideEngineError('ARITY_ERROR', 'max() requires at least 1 argument');
    }
    return Math.max(...args);
  },
  runden: (args) => {
    if (args.length < 1 || args.length > 2) {
      throw new TideEngineError('ARITY_ERROR', 'runden() requires 1 or 2 arguments');
    }
    const value = args[0];
    const decimals = args[1] ?? 0;
    if (!Number.isInteger(decimals) || decimals < -15 || decimals > 15) {
      throw new TideEngineError(
        'TYPE_ERROR',
        'runden() decimals must be an integer between -15 and 15',
      );
    }
    const factor = Math.pow(10, decimals);
    return Math.round((value + Math.sign(value) * Number.EPSILON) * factor) / factor;
  },
};

function isBuiltinName(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILTINS, name.toLowerCase());
}

function collectExprDeps(expr: ExprNode, scope: ReadonlySet<string>, deps: Set<string>): void {
  switch (expr.type) {
    case 'NumberLiteral':
      return;
    case 'Ident':
      if (!scope.has(expr.name)) deps.add(expr.name);
      return;
    case 'Unary':
    case 'Percent':
      collectExprDeps(expr.expr, scope, deps);
      return;
    case 'Binary':
      collectExprDeps(expr.left, scope, deps);
      collectExprDeps(expr.right, scope, deps);
      return;
    case 'Call':
      if (!scope.has(expr.callee) && !isBuiltinName(expr.callee)) {
        deps.add(expr.callee);
      }
      for (const arg of expr.args) collectExprDeps(arg, scope, deps);
      return;
    case 'Block':
      collectStmtListDeps(expr.statements, scope, deps);
      return;
  }
}

function collectStmtListDeps(
  statements: readonly StmtNode[],
  parentScope: ReadonlySet<string>,
  deps: Set<string>,
): void {
  const scope = new Set(parentScope);
  for (const stmt of statements) {
    if (stmt.type === 'Assign') {
      collectExprDeps(stmt.value, scope, deps);
      scope.add(stmt.name);
    } else if (stmt.type === 'FuncDef') {
      const fnScope = new Set(scope);
      fnScope.add(stmt.name);
      for (const p of stmt.params) fnScope.add(p);
      collectExprDeps(stmt.body, fnScope, deps);
      scope.add(stmt.name);
    } else {
      collectExprDeps(stmt.expr, scope, deps);
    }
  }
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TideEngineError('TYPE_ERROR', `${label} must evaluate to a finite number`);
  }
  return value;
}

function lookupSymbol(name: string, env: RuntimeEnv): { found: boolean; value: unknown } {
  let curr: RuntimeEnv | undefined = env;
  while (curr) {
    if (curr.locals.has(name)) {
      return { found: true, value: curr.locals.get(name) };
    }
    curr = curr.parent;
  }
  if (env.bindings.has(name)) {
    return { found: true, value: env.bindings.get(name) };
  }
  return { found: false, value: undefined };
}

function evaluateExpr(expr: ExprNode, env: RuntimeEnv, depth: number): number {
  if (env.signal?.aborted) {
    throw new TideEngineError('ABORTED', 'Execution aborted');
  }

  switch (expr.type) {
    case 'NumberLiteral':
      return expr.value;

    case 'Ident': {
      const found = lookupSymbol(expr.name, env);
      if (!found.found) {
        throw new TideEngineError('UNDEFINED_SYMBOL', `Unknown symbol: ${expr.name}`);
      }
      return assertFiniteNumber(found.value, `Symbol '${expr.name}'`);
    }

    case 'Unary': {
      const v = evaluateExpr(expr.expr, env, depth);
      return expr.op === '-' ? -v : v;
    }

    case 'Percent':
      return evaluateExpr(expr.expr, env, depth) / 100;

    case 'Binary': {
      const left = evaluateExpr(expr.left, env, depth);
      const right = evaluateExpr(expr.right, env, depth);
      let result: number;
      switch (expr.op) {
        case '+':
          result = left + right;
          break;
        case '-':
          result = left - right;
          break;
        case '*':
          result = left * right;
          break;
        case '/':
          if (right === 0) {
            throw new TideEngineError('DIVISION_BY_ZERO', 'Division by zero');
          }
          result = left / right;
          break;
        case '^':
          result = Math.pow(left, right);
          break;
      }
      if (!Number.isFinite(result)) {
        throw new TideEngineError('MATH_ERROR', 'Operation did not produce a finite number');
      }
      return result;
    }

    case 'Call': {
      const argValues = expr.args.map((arg) => evaluateExpr(arg, env, depth));

      let curr: RuntimeEnv | undefined = env;
      while (curr) {
        if (curr.locals.has(expr.callee)) {
          const localMatch = curr.locals.get(expr.callee);
          if (typeof localMatch !== 'function') {
            throw new TideEngineError('TYPE_ERROR', `'${expr.callee}' is not callable`);
          }
          if (depth >= MAX_CALL_DEPTH) {
            throw new TideEngineError('MAX_DEPTH', 'Maximum call depth exceeded');
          }
          const out = (localMatch as (...a: number[]) => unknown)(...argValues);
          return assertFiniteNumber(out, `Return value of '${expr.callee}'`);
        }
        curr = curr.parent;
      }

      const builtin = BUILTINS[expr.callee.toLowerCase()];
      if (builtin) {
        return assertFiniteNumber(builtin(argValues), `Result of '${expr.callee}()'`);
      }

      if (env.bindings.has(expr.callee)) {
        const bound = env.bindings.get(expr.callee);
        if (typeof bound !== 'function') {
          throw new TideEngineError('TYPE_ERROR', `'${expr.callee}' is not callable`);
        }
        if (depth >= MAX_CALL_DEPTH) {
          throw new TideEngineError('MAX_DEPTH', 'Maximum call depth exceeded');
        }
        const out = (bound as (...a: number[]) => unknown)(...argValues);
        return assertFiniteNumber(out, `Return value of '${expr.callee}'`);
      }

      throw new TideEngineError('UNDEFINED_SYMBOL', `Unknown function: ${expr.callee}`);
    }

    case 'Block': {
      const childEnv: RuntimeEnv = {
        locals: new Map(),
        parent: env,
        bindings: env.bindings,
        signal: env.signal,
      };
      const outcome = evaluateStatementList(expr.statements, childEnv, depth);
      if (outcome.kind !== 'value') {
        throw new TideEngineError(
          'TYPE_ERROR',
          'Block must evaluate to a numeric value in its final expression',
        );
      }
      return outcome.value;
    }
  }
}

type StmtListOutcome =
  | { readonly kind: 'value'; readonly value: number; readonly definedSymbol: string | null }
  | {
      readonly kind: 'func';
      readonly definedSymbol: string;
      readonly params: readonly string[];
      readonly fn: (...args: unknown[]) => number;
    };

function evaluateStatementList(
  statements: readonly StmtNode[],
  env: RuntimeEnv,
  depth: number,
): StmtListOutcome {
  let lastOutcome: StmtListOutcome | undefined;

  for (const stmt of statements) {
    if (stmt.type === 'Assign') {
      const value = evaluateExpr(stmt.value, env, depth);
      env.locals.set(stmt.name, value);
      lastOutcome = { kind: 'value', value, definedSymbol: stmt.name };
    } else if (stmt.type === 'FuncDef') {
      const { name, params, body } = stmt;
      let activeDepth = 0;
      const fn = (...rawArgs: unknown[]): number => {
        if (rawArgs.length !== params.length) {
          throw new TideEngineError(
            'ARITY_ERROR',
            `${name}() expects ${params.length} argument(s), got ${rawArgs.length}`,
          );
        }
        if (activeDepth >= MAX_CALL_DEPTH) {
          throw new TideEngineError('MAX_DEPTH', 'Maximum call depth exceeded');
        }
        const callLocals = new Map<string, unknown>();
        for (let i = 0; i < params.length; i += 1) {
          callLocals.set(params[i], assertFiniteNumber(rawArgs[i], `Argument '${params[i]}'`));
        }
        const callEnv: RuntimeEnv = {
          locals: callLocals,
          parent: env,
          bindings: env.bindings,
          signal: env.signal,
        };
        activeDepth += 1;
        try {
          return evaluateExpr(body, callEnv, depth + 1);
        } finally {
          activeDepth -= 1;
        }
      };
      env.locals.set(name, fn);
      lastOutcome = { kind: 'func', definedSymbol: name, params, fn };
    } else {
      const value = evaluateExpr(stmt.expr, env, depth);
      lastOutcome = { kind: 'value', value, definedSymbol: null };
    }
  }

  if (!lastOutcome) {
    throw new TideEngineError('SYNTAX_ERROR', 'No statements to evaluate');
  }
  return lastOutcome;
}

function formatNumber(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value;
  return deNumberFormatter.format(normalized);
}

/**
 * Default synchronous Tide Formula execution engine.
 * Supports German number formatting, arithmetic, variable assignments,
 * single-line/block functions, and multi-line `{ ... }` blocks.
 */
export const tideEngine: VarSheetEngine = {
  id: 'tide',
  label: 'Tide Formula',
  capabilities: {
    reactivePropagation: true,
    asyncExecution: false,
    multiLineBlocks: true,
  },

  async execute(code: string, context: ExecutionScope): Promise<EvaluationResult> {
    if (context.signal?.aborted) {
      return {
        kind: 'error',
        definedSymbol: null,
        deps: new Set(),
        rawValue: undefined,
        displayText: '',
        errorCode: 'ABORTED',
        errorMessage: 'Execution aborted',
      };
    }

    if (code.trim() === '') {
      return {
        kind: 'empty',
        definedSymbol: null,
        deps: new Set(),
        rawValue: undefined,
        displayText: '',
      };
    }

    const deps = new Set<string>();

    try {
      const tokens = tokenizeTideFormula(code);
      const hasContent = tokens.some(
        (t) => t.kind !== 'NEWLINE' && t.kind !== 'SEMI' && t.kind !== 'EOF',
      );
      if (!hasContent) {
        return {
          kind: 'empty',
          definedSymbol: null,
          deps,
          rawValue: undefined,
          displayText: '',
        };
      }

      const statements = new TideParser(tokens).parseProgram();
      collectStmtListDeps(statements, new Set(), deps);

      const rootEnv: RuntimeEnv = {
        locals: new Map(),
        bindings: context.bindings,
        signal: context.signal,
      };
      const outcome = evaluateStatementList(statements, rootEnv, 0);

      if (outcome.kind === 'func') {
        return {
          kind: 'func',
          definedSymbol: outcome.definedSymbol,
          deps,
          rawValue: outcome.fn,
          displayText: `${outcome.definedSymbol}(${outcome.params.join(', ')})`,
        };
      }

      return {
        kind: 'value',
        definedSymbol: outcome.definedSymbol,
        deps,
        rawValue: outcome.value,
        displayText: formatNumber(outcome.value),
      };
    } catch (err) {
      const errorCode = err instanceof TideEngineError ? err.code : 'RUNTIME_ERROR';
      const errorMessage = err instanceof Error ? err.message : 'Unknown evaluation error';
      return {
        kind: 'error',
        definedSymbol: null,
        deps,
        rawValue: undefined,
        displayText: `#ERR: ${errorMessage}`,
        errorCode,
        errorMessage,
      };
    }
  },
};
