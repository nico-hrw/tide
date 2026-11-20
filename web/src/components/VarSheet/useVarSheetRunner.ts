'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EvaluationResult, ExecutionScope, VarSheetEngine } from '@/lib/varsheet/types';

export interface VarSheetRow {
    readonly id: string;
    readonly code: string;
    readonly result: EvaluationResult;
}

interface PersistedVarSheetRow {
    readonly id: string;
    readonly code: string;
}

export interface UseVarSheetRunnerOptions {
    /** Active note identifier used to scope localStorage persistence. */
    readonly noteId?: string | null;
    /** Execution engine instance used to evaluate each row. */
    readonly engine: VarSheetEngine;
    /** Optional seed codes when no persisted sheet exists for the note. */
    readonly initialCodes?: readonly string[];
    /** Optional base bindings injected before row 0 is evaluated. */
    readonly initialBindings?: ReadonlyMap<string, unknown>;
}

export interface UseVarSheetRunnerReturn {
    readonly rows: readonly VarSheetRow[];
    readonly variableCount: number;
    readonly isEvaluating: boolean;
    readonly updateRow: (id: string, code: string) => void;
    readonly insertRowAfter: (id: string, code?: string) => string;
    readonly deleteRow: (id: string) => void;
    readonly moveRow: (fromIndex: number, toIndex: number) => void;
    readonly clearAll: () => void;
}

const STORAGE_KEY_PREFIX = 'tide_varsheet_';

const EMPTY_RESULT: EvaluationResult = {
    kind: 'empty',
    definedSymbol: null,
    deps: new Set<string>(),
    rawValue: undefined,
    displayText: '',
};

let fallbackCounter = 0;

function createRowId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    fallbackCounter += 1;
    return `vs_${Date.now().toString(36)}_${fallbackCounter.toString(36)}`;
}

function makeEmptyRow(code = ''): VarSheetRow {
    return {
        id: createRowId(),
        code,
        result: EMPTY_RESULT,
    };
}

function storageKeyFor(noteId: string): string {
    return `${STORAGE_KEY_PREFIX}${noteId}`;
}

function loadPersistedRows(
    noteId: string | null | undefined,
    initialCodes?: readonly string[],
): VarSheetRow[] {
    if (noteId && typeof window !== 'undefined') {
        try {
            const raw = window.localStorage.getItem(storageKeyFor(noteId));
            if (raw) {
                const parsed: unknown = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    const loaded = parsed
                        .filter(
                            (item): item is PersistedVarSheetRow =>
                                typeof item === 'object' &&
                                item !== null &&
                                typeof (item as Record<string, unknown>).id === 'string' &&
                                typeof (item as Record<string, unknown>).code === 'string',
                        )
                        .map((item) => ({
                            id: item.id,
                            code: item.code,
                            result: EMPTY_RESULT,
                        }));
                    if (loaded.length > 0) return loaded;
                }
            }
        } catch {
            // Ignore malformed localStorage payloads and fall back to fresh rows.
        }
    }

    if (initialCodes && initialCodes.length > 0) {
        return initialCodes.map((code) => makeEmptyRow(code));
    }

    return [makeEmptyRow('')];
}

function savePersistedRows(noteId: string | null | undefined, rows: readonly VarSheetRow[]): void {
    if (!noteId || typeof window === 'undefined') return;
    try {
        const payload: PersistedVarSheetRow[] = rows.map((row) => ({
            id: row.id,
            code: row.code,
        }));
        window.localStorage.setItem(storageKeyFor(noteId), JSON.stringify(payload));
    } catch {
        // Ignore storage quota or private-mode errors.
    }
}

function depsIntersect(deps: ReadonlySet<string>, dirtySymbols: ReadonlySet<string>): boolean {
    if (deps.size === 0 || dirtySymbols.size === 0) return false;
    for (const dep of deps) {
        if (dirtySymbols.has(dep)) return true;
    }
    return false;
}

function resultSignatureChanged(prev: EvaluationResult, next: EvaluationResult): boolean {
    if (prev.kind !== next.kind) return true;
    if (prev.definedSymbol !== next.definedSymbol) return true;
    if (!Object.is(prev.rawValue, next.rawValue)) return true;
    return prev.displayText !== next.displayText;
}

function collectBindingsUpTo(
    rows: readonly VarSheetRow[],
    endExclusive: number,
    initialBindings?: ReadonlyMap<string, unknown>,
): Map<string, unknown> {
    const bindings = new Map<string, unknown>(initialBindings);
    for (let i = 0; i < endExclusive; i++) {
        const res = rows[i]?.result;
        if (res && res.definedSymbol && (res.kind === 'value' || res.kind === 'func')) {
            bindings.set(res.definedSymbol, res.rawValue);
        }
    }
    return bindings;
}

function applyRowBinding(bindings: Map<string, unknown>, result: EvaluationResult): void {
    if (result.definedSymbol && (result.kind === 'value' || result.kind === 'func')) {
        bindings.set(result.definedSymbol, result.rawValue);
    }
}

function toErrorResult(err: unknown): EvaluationResult {
    const message = err instanceof Error ? err.message : 'Unbekannter Ausführungsfehler';
    return {
        kind: 'error',
        definedSymbol: null,
        deps: new Set<string>(),
        rawValue: undefined,
        displayText: '#ERR',
        errorMessage: message,
        errorCode: 'RUNTIME_ERROR',
    };
}

/**
 * Manages VarSheet row state, per-note localStorage persistence, and reactive top-down execution.
 */
export function useVarSheetRunner(options: UseVarSheetRunnerOptions): UseVarSheetRunnerReturn {
    const { noteId, engine, initialCodes, initialBindings } = options;

    const [rows, setRows] = useState<VarSheetRow[]>(() =>
        loadPersistedRows(noteId, initialCodes),
    );
    const [isEvaluating, setIsEvaluating] = useState(false);

    const rowsRef = useRef<VarSheetRow[]>(rows);
    rowsRef.current = rows;

    const evalVersionRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);
    const loadedNoteIdRef = useRef<string | null | undefined>(noteId);

    const runPropagation = useCallback(
        async (
            snapshot: VarSheetRow[],
            startIndex: number,
            forcedUntilIndex: number,
            seedDirtySymbols: ReadonlySet<string>,
        ) => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            const version = ++evalVersionRef.current;

            if (snapshot.length === 0 || startIndex >= snapshot.length) {
                setIsEvaluating(false);
                return;
            }

            setIsEvaluating(true);
            const working = snapshot.slice();
            const dirtySymbols = new Set<string>(seedDirtySymbols);
            const safeStart = Math.max(0, startIndex);
            const bindings = collectBindingsUpTo(working, safeStart, initialBindings);

            try {
                for (let i = safeStart; i < working.length; i++) {
                    if (controller.signal.aborted || evalVersionRef.current !== version) return;

                    const row = working[i];
                    const mustEvaluate =
                        i <= forcedUntilIndex || depsIntersect(row.result.deps, dirtySymbols);

                    if (!mustEvaluate) {
                        applyRowBinding(bindings, row.result);
                        continue;
                    }

                    const scope: ExecutionScope = {
                        bindings: new Map(bindings),
                        signal: controller.signal,
                        cellId: row.id,
                    };

                    let nextResult: EvaluationResult;
                    try {
                        nextResult = await engine.execute(row.code, scope);
                    } catch (err) {
                        if (controller.signal.aborted || evalVersionRef.current !== version) return;
                        nextResult = toErrorResult(err);
                    }

                    if (controller.signal.aborted || evalVersionRef.current !== version) return;

                    const prevResult = row.result;
                    const oldSym = prevResult.definedSymbol;
                    const newSym = nextResult.definedSymbol;

                    if (oldSym && oldSym !== newSym) {
                        dirtySymbols.add(oldSym);
                    }
                    if (newSym && resultSignatureChanged(prevResult, nextResult)) {
                        dirtySymbols.add(newSym);
                    }

                    working[i] = { ...row, result: nextResult };
                    applyRowBinding(bindings, nextResult);
                }

                if (!controller.signal.aborted && evalVersionRef.current === version) {
                    rowsRef.current = working;
                    setRows(working);
                }
            } finally {
                if (evalVersionRef.current === version) {
                    setIsEvaluating(false);
                }
            }
        },
        [engine, initialBindings],
    );

    // Load persisted sheet when noteId changes and evaluate all rows top-down.
    useEffect(() => {
        const noteChanged = loadedNoteIdRef.current !== noteId;
        loadedNoteIdRef.current = noteId;
        const initialRows = noteChanged
            ? loadPersistedRows(noteId, initialCodes)
            : rowsRef.current;

        if (noteChanged) {
            rowsRef.current = initialRows;
            setRows(initialRows);
        }

        void runPropagation(initialRows, 0, initialRows.length - 1, new Set<string>());

        return () => {
            abortRef.current?.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [noteId, engine]);

    // Persist code rows whenever rows change.
    useEffect(() => {
        savePersistedRows(noteId, rows);
    }, [noteId, rows]);

    const updateRow = useCallback(
        (id: string, code: string) => {
            const current = rowsRef.current;
            const index = current.findIndex((r) => r.id === id);
            if (index === -1) return;

            const next = current.slice();
            next[index] = { ...next[index], code };
            rowsRef.current = next;
            setRows(next);

            void runPropagation(next, index, index, new Set<string>());
        },
        [runPropagation],
    );

    const insertRowAfter = useCallback((id: string, code = ''): string => {
        const newRow = makeEmptyRow(code);
        const current = rowsRef.current;
        const index = current.findIndex((r) => r.id === id);
        const next = current.slice();
        if (index === -1) {
            next.push(newRow);
        } else {
            next.splice(index + 1, 0, newRow);
        }
        rowsRef.current = next;
        setRows(next);
        return newRow.id;
    }, []);

    const deleteRow = useCallback(
        (id: string) => {
            const current = rowsRef.current;
            const index = current.findIndex((r) => r.id === id);
            if (index === -1) return;

            if (current.length === 1) {
                const cleared = [{ ...current[0], code: '', result: EMPTY_RESULT }];
                rowsRef.current = cleared;
                setRows(cleared);
                return;
            }

            const removed = current[index];
            const next = current.filter((r) => r.id !== id);
            rowsRef.current = next;
            setRows(next);

            const seedDirty = new Set<string>();
            if (removed.result.definedSymbol) {
                seedDirty.add(removed.result.definedSymbol);
            }

            if (seedDirty.size > 0 && index < next.length) {
                void runPropagation(next, index, -1, seedDirty);
            }
        },
        [runPropagation],
    );

    const moveRow = useCallback(
        (fromIndex: number, toIndex: number) => {
            const current = rowsRef.current;
            if (
                fromIndex === toIndex ||
                fromIndex < 0 ||
                toIndex < 0 ||
                fromIndex >= current.length ||
                toIndex >= current.length
            ) {
                return;
            }

            const next = current.slice();
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            rowsRef.current = next;
            setRows(next);

            const startIdx = Math.min(fromIndex, toIndex);
            const endIdx = Math.max(fromIndex, toIndex);
            const seedDirty = new Set<string>();
            for (let i = startIdx; i <= endIdx; i++) {
                const sym = current[i]?.result.definedSymbol;
                if (sym) seedDirty.add(sym);
            }

            void runPropagation(next, startIdx, endIdx, seedDirty);
        },
        [runPropagation],
    );

    const clearAll = useCallback(() => {
        abortRef.current?.abort();
        evalVersionRef.current += 1;
        const fresh = [makeEmptyRow('')];
        rowsRef.current = fresh;
        setRows(fresh);
        setIsEvaluating(false);
    }, []);

    const variableCount = useMemo(() => {
        const symbols = new Set<string>();
        for (const row of rows) {
            if (row.result.definedSymbol && (row.result.kind === 'value' || row.result.kind === 'func')) {
                symbols.add(row.result.definedSymbol);
            }
        }
        return symbols.size;
    }, [rows]);

    return {
        rows,
        variableCount,
        isEvaluating,
        updateRow,
        insertRowAfter,
        deleteRow,
        moveRow,
        clearAll,
    };
}
