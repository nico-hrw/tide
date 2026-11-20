'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EvaluationResult, ExecutionScope, VarSheetEngine } from '@/lib/varsheet/types';
import { notifySheetChanged } from '@/lib/varsheet/noteBindings';

export interface VarSheetRow {
    readonly id: string;
    readonly code: string;
    readonly result: EvaluationResult;
}

export interface PersistedVarSheetRow {
    readonly id: string;
    readonly code: string;
}

export interface VarSheetTab {
    id: string;
    name: string;
    rows: VarSheetRow[];
}

export interface PersistedVarSheetTab {
    id: string;
    name: string;
    rows: PersistedVarSheetRow[];
}

export interface PersistedVarSheetData {
    version: 2;
    activeTabId: string;
    tabs: PersistedVarSheetTab[];
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
    readonly tabs: readonly VarSheetTab[];
    readonly activeTabId: string;
    readonly activeTab: VarSheetTab;
    readonly rows: readonly VarSheetRow[];
    readonly variableCount: number;
    readonly isEvaluating: boolean;
    readonly createTab: (name?: string) => string;
    readonly renameTab: (tabId: string, newName: string) => void;
    readonly deleteTab: (tabId: string) => void;
    readonly selectTab: (tabId: string) => void;
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

function createUniqueId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    fallbackCounter += 1;
    return `${prefix}_${Date.now().toString(36)}_${fallbackCounter.toString(36)}`;
}

const createRowId = (): string => createUniqueId('vs');
const createTabId = (): string => createUniqueId('vst');
const storageKeyFor = (noteId: string): string => `${STORAGE_KEY_PREFIX}${noteId}`;
const makeEmptyRow = (code = ''): VarSheetRow => ({ id: createRowId(), code, result: EMPTY_RESULT });

function makeDefaultTab(name = 'Tab 1', initialCodes?: readonly string[]): VarSheetTab {
    const rows = initialCodes && initialCodes.length > 0
        ? initialCodes.map((code) => makeEmptyRow(code))
        : [makeEmptyRow('')];
    return { id: createTabId(), name, rows };
}

function parsePersistedRows(rawRows: unknown): VarSheetRow[] {
    if (!Array.isArray(rawRows)) return [];
    const rows: VarSheetRow[] = [];
    for (const item of rawRows) {
        if (typeof item !== 'object' || item === null) continue;
        const rec = item as Record<string, unknown>;
        if (typeof rec.id === 'string' && typeof rec.code === 'string') {
            rows.push({ id: rec.id, code: rec.code, result: EMPTY_RESULT });
        }
    }
    return rows;
}

export function loadPersistedSheet(
    noteId: string | null | undefined,
    initialCodes?: readonly string[],
): { tabs: VarSheetTab[]; activeTabId: string } {
    if (noteId && typeof window !== 'undefined') {
        try {
            const raw = window.localStorage.getItem(storageKeyFor(noteId));
            if (raw) {
                const parsed: unknown = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    const loadedRows = parsePersistedRows(parsed);
                    if (loadedRows.length > 0) {
                        const tab: VarSheetTab = { id: createTabId(), name: 'Tab 1', rows: loadedRows };
                        return { tabs: [tab], activeTabId: tab.id };
                    }
                } else if (typeof parsed === 'object' && parsed !== null) {
                    const record = parsed as Record<string, unknown>;
                    if (record.version === 2 && Array.isArray(record.tabs)) {
                        const loadedTabs: VarSheetTab[] = [];
                        for (const item of record.tabs) {
                            if (typeof item !== 'object' || item === null) continue;
                            const tabObj = item as Record<string, unknown>;
                            if (typeof tabObj.id !== 'string' || typeof tabObj.name !== 'string') continue;
                            const loadedRows = parsePersistedRows(tabObj.rows);
                            loadedTabs.push({
                                id: tabObj.id,
                                name: tabObj.name,
                                rows: loadedRows.length > 0 ? loadedRows : [makeEmptyRow('')],
                            });
                        }
                        if (loadedTabs.length > 0) {
                            const req = record.activeTabId;
                            const activeTabId = typeof req === 'string' && loadedTabs.some((t) => t.id === req)
                                ? req
                                : loadedTabs[0].id;
                            return { tabs: loadedTabs, activeTabId };
                        }
                    }
                }
            }
        } catch {
            // Ignore malformed localStorage payloads and fall back to fresh sheet.
        }
    }
    const defaultTab = makeDefaultTab('Tab 1', initialCodes);
    return { tabs: [defaultTab], activeTabId: defaultTab.id };
}

function savePersistedSheet(
    noteId: string | null | undefined,
    tabs: readonly VarSheetTab[],
    activeTabId: string,
): void {
    if (!noteId || typeof window === 'undefined') return;
    try {
        const payload: PersistedVarSheetData = {
            version: 2,
            activeTabId,
            tabs: tabs.map((tab) => ({
                id: tab.id,
                name: tab.name,
                rows: tab.rows.map((row) => ({ id: row.id, code: row.code })),
            })),
        };
        window.localStorage.setItem(storageKeyFor(noteId), JSON.stringify(payload));
        notifySheetChanged(noteId);
    } catch {
        // Ignore storage quota or private-mode errors.
    }
}

function getActiveTab(tabs: readonly VarSheetTab[], activeTabId: string): VarSheetTab {
    return tabs.find((t) => t.id === activeTabId) ?? tabs[0];
}

function depsIntersect(deps: ReadonlySet<string>, dirtySymbols: ReadonlySet<string>): boolean {
    if (deps.size === 0 || dirtySymbols.size === 0) return false;
    for (const dep of deps) {
        if (dirtySymbols.has(dep)) return true;
    }
    return false;
}

function resultSignatureChanged(prev: EvaluationResult, next: EvaluationResult): boolean {
    return (
        prev.kind !== next.kind ||
        prev.definedSymbol !== next.definedSymbol ||
        !Object.is(prev.rawValue, next.rawValue) ||
        prev.displayText !== next.displayText
    );
}

function applyRowBinding(bindings: Map<string, unknown>, result: EvaluationResult): void {
    if (result.definedSymbol && (result.kind === 'value' || result.kind === 'func')) {
        bindings.set(result.definedSymbol, result.rawValue);
    }
}

function collectBindingsUpTo(
    rows: readonly VarSheetRow[],
    endExclusive: number,
    initialBindings?: ReadonlyMap<string, unknown>,
): Map<string, unknown> {
    const bindings = new Map<string, unknown>(initialBindings);
    for (let i = 0; i < endExclusive; i++) {
        const res = rows[i]?.result;
        if (res) applyRowBinding(bindings, res);
    }
    return bindings;
}

function toErrorResult(err: unknown): EvaluationResult {
    return {
        kind: 'error',
        definedSymbol: null,
        deps: new Set<string>(),
        rawValue: undefined,
        displayText: '#ERR',
        errorMessage: err instanceof Error ? err.message : 'Unbekannter Ausführungsfehler',
        errorCode: 'RUNTIME_ERROR',
    };
}

interface SheetState {
    readonly noteId: string | null | undefined;
    readonly tabs: VarSheetTab[];
    readonly activeTabId: string;
}

/**
 * Manages multi-tab VarSheet state, per-note localStorage persistence, and reactive top-down execution.
 */
export function useVarSheetRunner(options: UseVarSheetRunnerOptions): UseVarSheetRunnerReturn {
    const { noteId, engine, initialCodes, initialBindings } = options;

    const [sheet, setSheet] = useState<SheetState>(() => ({
        noteId,
        ...loadPersistedSheet(noteId, initialCodes),
    }));
    const [isEvaluating, setIsEvaluating] = useState(false);

    const sheetRef = useRef<SheetState>(sheet);
    sheetRef.current = sheet;

    const evalVersionRef = useRef(0);
    const abortRef = useRef<AbortController | null>(null);
    const loadedNoteIdRef = useRef<string | null | undefined>(noteId);

    const commitSheet = useCallback((next: SheetState) => {
        sheetRef.current = next;
        setSheet(next);
    }, []);

    const cancelActiveEval = useCallback(() => {
        abortRef.current?.abort();
        evalVersionRef.current += 1;
        setIsEvaluating(false);
    }, []);

    const replaceTabRows = useCallback(
        (tabId: string, nextRows: VarSheetRow[]) => {
            const current = sheetRef.current;
            const nextTabs = current.tabs.map((t) => (t.id === tabId ? { ...t, rows: nextRows } : t));
            commitSheet({ ...current, tabs: nextTabs });
        },
        [commitSheet],
    );

    const runPropagation = useCallback(async (
        targetTabId: string,
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
                if (!(i <= forcedUntilIndex || depsIntersect(row.result.deps, dirtySymbols))) {
                    applyRowBinding(bindings, row.result);
                    continue;
                }

                const scope: ExecutionScope = { bindings: new Map(bindings), signal: controller.signal, cellId: row.id };
                let nextResult: EvaluationResult;
                try {
                    nextResult = await engine.execute(row.code, scope);
                } catch (err) {
                    if (controller.signal.aborted || evalVersionRef.current !== version) return;
                    nextResult = toErrorResult(err);
                }
                if (controller.signal.aborted || evalVersionRef.current !== version) return;

                const prevResult = row.result;
                if (prevResult.definedSymbol && prevResult.definedSymbol !== nextResult.definedSymbol) {
                    dirtySymbols.add(prevResult.definedSymbol);
                }
                if (nextResult.definedSymbol && resultSignatureChanged(prevResult, nextResult)) {
                    dirtySymbols.add(nextResult.definedSymbol);
                }
                working[i] = { ...row, result: nextResult };
                applyRowBinding(bindings, nextResult);
            }

            if (!controller.signal.aborted && evalVersionRef.current === version) {
                replaceTabRows(targetTabId, working);
            }
        } finally {
            if (evalVersionRef.current === version) setIsEvaluating(false);
        }
    }, [engine, initialBindings, replaceTabRows]);

    // Load persisted sheet when noteId changes and evaluate active tab rows top-down.
    useEffect(() => {
        const noteChanged = loadedNoteIdRef.current !== noteId;
        loadedNoteIdRef.current = noteId;
        let active: VarSheetTab;
        if (noteChanged) {
            const loaded = loadPersistedSheet(noteId, initialCodes);
            commitSheet({ noteId, tabs: loaded.tabs, activeTabId: loaded.activeTabId });
            active = getActiveTab(loaded.tabs, loaded.activeTabId);
        } else {
            active = getActiveTab(sheetRef.current.tabs, sheetRef.current.activeTabId);
        }
        void runPropagation(active.id, active.rows, 0, active.rows.length - 1, new Set<string>());
        return () => { abortRef.current?.abort(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [noteId, engine]);

    // Persist tabs whenever sheet state changes for the active noteId.
    useEffect(() => {
        if (sheet.noteId !== noteId) return;
        savePersistedSheet(noteId, sheet.tabs, sheet.activeTabId);
    }, [noteId, sheet]);

    const createTab = useCallback((name?: string): string => {
        cancelActiveEval();
        const current = sheetRef.current;
        const trimmed = name?.trim();
        const tabName = trimmed && trimmed.length > 0 ? trimmed : `Tab ${current.tabs.length + 1}`;
        const newTab = makeDefaultTab(tabName);
        commitSheet({ ...current, tabs: [...current.tabs, newTab], activeTabId: newTab.id });
        return newTab.id;
    }, [cancelActiveEval, commitSheet]);

    const renameTab = useCallback((tabId: string, newName: string) => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        const current = sheetRef.current;
        if (!current.tabs.some((t) => t.id === tabId)) return;
        commitSheet({ ...current, tabs: current.tabs.map((t) => (t.id === tabId ? { ...t, name: trimmed } : t)) });
    }, [commitSheet]);

    const deleteTab = useCallback((tabId: string) => {
        const current = sheetRef.current;
        const index = current.tabs.findIndex((t) => t.id === tabId);
        if (index === -1) return;
        if (current.tabs.length <= 1) {
            cancelActiveEval();
            const fresh = makeDefaultTab('Tab 1');
            commitSheet({ ...current, tabs: [fresh], activeTabId: fresh.id });
            return;
        }
        const nextTabs = current.tabs.filter((t) => t.id !== tabId);
        if (current.activeTabId !== tabId) {
            commitSheet({ ...current, tabs: nextTabs });
            return;
        }
        const nextActive = nextTabs[Math.min(index, nextTabs.length - 1)];
        commitSheet({ ...current, tabs: nextTabs, activeTabId: nextActive.id });
        void runPropagation(nextActive.id, nextActive.rows, 0, nextActive.rows.length - 1, new Set<string>());
    }, [cancelActiveEval, commitSheet, runPropagation]);

    const selectTab = useCallback((tabId: string) => {
        const current = sheetRef.current;
        if (current.activeTabId === tabId) return;
        const target = current.tabs.find((t) => t.id === tabId);
        if (!target) return;
        commitSheet({ ...current, activeTabId: target.id });
        void runPropagation(target.id, target.rows, 0, target.rows.length - 1, new Set<string>());
    }, [commitSheet, runPropagation]);

    const updateRow = useCallback((id: string, code: string) => {
        const active = getActiveTab(sheetRef.current.tabs, sheetRef.current.activeTabId);
        const index = active.rows.findIndex((r) => r.id === id);
        if (index === -1) return;
        const next = active.rows.slice();
        next[index] = { ...next[index], code };
        replaceTabRows(active.id, next);
        void runPropagation(active.id, next, index, index, new Set<string>());
    }, [replaceTabRows, runPropagation]);

    const insertRowAfter = useCallback((id: string, code = ''): string => {
        const newRow = makeEmptyRow(code);
        const active = getActiveTab(sheetRef.current.tabs, sheetRef.current.activeTabId);
        const index = active.rows.findIndex((r) => r.id === id);
        const next = active.rows.slice();
        if (index === -1) next.push(newRow);
        else next.splice(index + 1, 0, newRow);
        replaceTabRows(active.id, next);
        return newRow.id;
    }, [replaceTabRows]);

    const deleteRow = useCallback((id: string) => {
        const active = getActiveTab(sheetRef.current.tabs, sheetRef.current.activeTabId);
        const current = active.rows;
        const index = current.findIndex((r) => r.id === id);
        if (index === -1) return;
        if (current.length === 1) {
            replaceTabRows(active.id, [{ ...current[0], code: '', result: EMPTY_RESULT }]);
            return;
        }
        const removed = current[index];
        const next = current.filter((r) => r.id !== id);
        replaceTabRows(active.id, next);
        const seedDirty = new Set<string>();
        if (removed.result.definedSymbol) seedDirty.add(removed.result.definedSymbol);
        if (seedDirty.size > 0 && index < next.length) {
            void runPropagation(active.id, next, index, -1, seedDirty);
        }
    }, [replaceTabRows, runPropagation]);

    const moveRow = useCallback((fromIndex: number, toIndex: number) => {
        const active = getActiveTab(sheetRef.current.tabs, sheetRef.current.activeTabId);
        const current = active.rows;
        if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length) return;
        const next = current.slice();
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        replaceTabRows(active.id, next);
        const startIdx = Math.min(fromIndex, toIndex);
        const endIdx = Math.max(fromIndex, toIndex);
        const seedDirty = new Set<string>();
        for (let i = startIdx; i <= endIdx; i++) {
            const sym = current[i]?.result.definedSymbol;
            if (sym) seedDirty.add(sym);
        }
        void runPropagation(active.id, next, startIdx, endIdx, seedDirty);
    }, [replaceTabRows, runPropagation]);

    const clearAll = useCallback(() => {
        cancelActiveEval();
        const active = getActiveTab(sheetRef.current.tabs, sheetRef.current.activeTabId);
        replaceTabRows(active.id, [makeEmptyRow('')]);
    }, [cancelActiveEval, replaceTabRows]);

    const activeTab = useMemo(() => getActiveTab(sheet.tabs, sheet.activeTabId), [sheet.tabs, sheet.activeTabId]);
    const rows = activeTab.rows;

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
        tabs: sheet.tabs, activeTabId: sheet.activeTabId, activeTab, rows, variableCount, isEvaluating,
        createTab, renameTab, deleteTab, selectTab, updateRow, insertRowAfter, deleteRow, moveRow, clearAll,
    };
}
