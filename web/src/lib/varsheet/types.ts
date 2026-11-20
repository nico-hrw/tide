/**
 * Supported VarSheet execution language identifiers.
 * Known built-in/planned languages are autocompleted while allowing custom extensions.
 */
export type VarSheetLanguageId = 'tide' | 'r' | 'python' | 'shell' | (string & {});

/**
 * Runtime scope passed into a VarSheet engine during cell evaluation.
 */
export interface ExecutionScope {
  /** Available symbols (values or callable functions) visible to the cell. */
  readonly bindings: ReadonlyMap<string, unknown>;
  /** Optional cancellation signal for async or long-running executions. */
  readonly signal?: AbortSignal;
  /** Optional identifier of the cell being evaluated. */
  readonly cellId?: string;
  /** Optional engine-specific metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Classification of the result produced by evaluating a VarSheet cell.
 */
export type EvaluationKind = 'empty' | 'value' | 'func' | 'error';

/**
 * Normalized output returned by every VarSheetEngine implementation.
 */
export interface EvaluationResult {
  readonly kind: EvaluationKind;
  /** Name of the variable or function defined by this cell, if any. */
  readonly definedSymbol: string | null;
  /** External symbol names referenced during evaluation. */
  readonly deps: ReadonlySet<string>;
  /** Underlying evaluated JS value or callable function. */
  readonly rawValue: unknown;
  /** Human-readable representation suitable for cell rendering. */
  readonly displayText: string;
  /** Human-readable error description when kind === 'error'. */
  readonly errorMessage?: string;
  /** Machine-readable error classification when kind === 'error'. */
  readonly errorCode?: string;
}

/**
 * Capability flags advertised by a VarSheet engine.
 */
export interface VarSheetEngineCapabilities {
  readonly reactivePropagation: boolean;
  readonly asyncExecution: boolean;
  readonly multiLineBlocks: boolean;
}

/**
 * Contract implemented by all VarSheet execution engines.
 */
export interface VarSheetEngine {
  readonly id: VarSheetLanguageId;
  readonly label: string;
  readonly capabilities: VarSheetEngineCapabilities;
  execute(code: string, context: ExecutionScope): Promise<EvaluationResult>;
}

/**
 * Command payload dispatched to an external runtime adapter (e.g. Python, R, Shell).
 */
export interface ExternalExecutionRequest {
  readonly languageId: VarSheetLanguageId;
  readonly code: string;
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
}

/**
 * Normalized response returned by an external runtime adapter.
 */
export interface ExternalExecutionResponse {
  readonly stdout: string;
  readonly stderr?: string;
  readonly value?: unknown;
  readonly displayText?: string;
  readonly definedSymbol?: string | null;
  readonly deps?: readonly string[];
  readonly exitCode?: number;
  readonly errorMessage?: string;
  readonly errorCode?: string;
}

/**
 * Adapter interface for plugging in external execution runtimes such as R or Python.
 */
export interface ExternalExecutionAdapter {
  readonly id: VarSheetLanguageId;
  readonly label: string;
  executeCommand(request: ExternalExecutionRequest): Promise<ExternalExecutionResponse>;
  dispose?(): Promise<void> | void;
}
