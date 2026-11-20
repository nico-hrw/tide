'use client';

import { useEffect } from 'react';
import { getDefaultEngine } from '@/lib/varsheet';
import type { ExecutionScope, VarSheetEngine } from '@/lib/varsheet/types';
import { clearNoteBindings, onSheetChanged, publishNoteBindings } from '@/lib/varsheet/noteBindings';
import { loadPersistedSheet } from './useVarSheetRunner';

/** Re-evaluating after an edit waits this long, so typing does not run the whole sheet per keystroke. */
const REEVAL_DELAY_MS = 120;

/**
 * Evaluates every tab of a note's saved VarSheet top-down and returns the symbols they define.
 * Independent of whether the VarSheet panel is open. Later tabs win over earlier ones on name clashes.
 */
export async function evaluateSheetBindings(
    noteId: string,
    engine: VarSheetEngine,
    signal?: AbortSignal,
): Promise<Map<string, unknown>> {
    const out = new Map<string, unknown>();
    const { tabs } = loadPersistedSheet(noteId);
    for (const tab of tabs) {
        const bindings = new Map<string, unknown>();
        for (const row of tab.rows) {
            if (signal?.aborted) return out;
            if (!row.code.trim()) continue;
            const scope: ExecutionScope = { bindings: new Map(bindings), signal, cellId: row.id };
            try {
                const res = await engine.execute(row.code, scope);
                if (res.definedSymbol && (res.kind === 'value' || res.kind === 'func')) {
                    bindings.set(res.definedSymbol, res.rawValue);
                }
            } catch {
                // A broken row only affects itself; the other rows keep working.
            }
        }
        for (const [k, v] of bindings) out.set(k, v);
    }
    return out;
}

/**
 * Keeps the note's formulas in sync with its VarSheet: publishes the sheet's symbols for
 * the active note, refreshes them after every edit, and removes them when the plugin is off.
 */
export function useVarSheetBindings(noteId: string | null | undefined, enabled: boolean): void {
    useEffect(() => {
        if (!noteId || !enabled) return;
        const id = noteId;
        const engine = getDefaultEngine();
        let timer: ReturnType<typeof setTimeout> | null = null;
        let controller = new AbortController();

        const run = async () => {
            controller.abort();
            controller = new AbortController();
            const mine = controller;
            const result = await evaluateSheetBindings(id, engine, mine.signal);
            if (!mine.signal.aborted) publishNoteBindings(id, result);
        };

        void run();
        const off = onSheetChanged((changed) => {
            if (changed !== id) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => { void run(); }, REEVAL_DELAY_MS);
        });

        return () => {
            off();
            if (timer) clearTimeout(timer);
            controller.abort();
            clearNoteBindings(id);
        };
    }, [noteId, enabled]);
}
