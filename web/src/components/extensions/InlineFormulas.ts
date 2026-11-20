import { Extension } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { evaluate } from '@/lib/formula/evaluate';
import { formatResult } from '@/lib/formula/format';
import { parseFormula, parseNumber } from '@/lib/formula/parser';
import {
    computeDocumentTables,
    EMPTY_SCOPE,
    gridFromPmTable,
    type CalcScope,
    type TableEntry,
} from '@/lib/formula/tableCalc';
import { FormulaError, err, isErr, refKey, type Value } from '@/lib/formula/types';

export interface InlineFormulasOptions {
    /** Variables and functions available to formulas in this document; called on every recalculation. */
    getScope: (doc: PmNode) => CalcScope;
    /** Called when variables changed outside the document (e.g. the registry finished loading). Returns an unsubscribe function. */
    subscribe?: (onUpdate: () => void) => () => void;
}

export const inlineFormulasKey = new PluginKey<DecorationSet>('inlineFormulas');

const SKIP_NODES = new Set(['codeBlock', 'mathBlock', 'variablesBlock']);
const INLINE_FORMULA_RE = /==([^=\n]+)==/g;
const HIDE_STYLE =
    'font-size: 0; line-height: 0; opacity: 0; display: inline-block; width: 0; overflow: hidden; pointer-events: none;';

function evalInlineFormula(cleanExpr: string, doc: PmNode, scope: CalcScope): Value {
    let tablesCache: { tables: TableEntry[]; computed: Map<string, Map<string, Value>> } | null = null;
    try {
        const expr = parseFormula('=' + cleanExpr);
        return evaluate(expr, {
            cell: (col, row, table) => {
                if (!table) {
                    return err('#BEZUG', 'Zellbezug ohne Tabelle in Fließtext nicht möglich (z.B. T1!A1 nutzen)');
                }
                if (!tablesCache) {
                    const tables: TableEntry[] = [];
                    let idx = 1;
                    doc.descendants((node) => {
                        if (node.type.spec.tableRole === 'table') {
                            const id = `T${idx}`;
                            tables.push({
                                id,
                                aliases: [`t${idx}`, `tabelle${idx}`, `table${idx}`, `tabelle ${idx}`, `table ${idx}`],
                                grid: gridFromPmTable(node),
                            });
                            idx++;
                            return false;
                        }
                        return true;
                    });
                    tablesCache = {
                        tables,
                        computed: computeDocumentTables(tables, scope),
                    };
                }
                const normalized = table.toLowerCase().trim();
                const targetEntry = tablesCache.tables.find(
                    (t) => t.aliases.includes(normalized) || t.id.toLowerCase() === normalized,
                );
                if (!targetEntry) return err('#BEZUG', `Tabelle "${table}" nicht gefunden`);
                if (col < 0 || row < 0 || col >= targetEntry.grid.cols || row >= targetEntry.grid.rows) {
                    return err('#BEZUG', 'Zelle außerhalb der Tabelle');
                }
                const tableResults = tablesCache.computed.get(targetEntry.id);
                const val = tableResults?.get(refKey(col, row));
                if (val !== undefined) return val;
                const text = targetEntry.grid.text(col, row);
                return parseNumber(text) ?? text;
            },
            variable: (name) => scope.variable(name),
            userFunction: (name) => scope.userFunction(name),
        });
    } catch (e) {
        if (e instanceof FormulaError) return err(e.code, e.message);
        return err('#WERT');
    }
}

function buildInlineFormulaDecorations(
    state: EditorState,
    getScope: (doc: PmNode) => CalcScope,
): DecorationSet {
    const { doc, selection } = state;
    const decos: Decoration[] = [];
    let scope: CalcScope | null = null;

    doc.descendants((node, pos) => {
        if (SKIP_NODES.has(node.type.name)) return false;
        if (!node.isText || !node.text) return true;

        INLINE_FORMULA_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = INLINE_FORMULA_RE.exec(node.text)) !== null) {
            const matchStart = pos + match.index;
            const matchEnd = matchStart + match[0].length;

            // Show raw ==expr== when cursor/selection intersects [matchStart, matchEnd]
            if (selection.from <= matchEnd && selection.to >= matchStart) continue;

            const raw = match[1].trim();
            const cleanExpr = raw.replace(/^@\s*/, '');
            scope ??= getScope(doc);
            const val = evalInlineFormula(cleanExpr, doc, scope);

            decos.push(Decoration.inline(matchStart, matchEnd, { style: HIDE_STYLE }));
            decos.push(
                Decoration.widget(
                    matchStart,
                    (view) => {
                        const span = document.createElement('span');
                        span.className = isErr(val)
                            ? 'text-t2-late font-semibold tabular-nums cursor-pointer'
                            : 'text-t2-ink-2 font-normal tabular-nums cursor-pointer hover:underline';
                        span.title = isErr(val) ? val.detail || val.error : `==${cleanExpr}==`;
                        span.textContent = isErr(val) ? val.error : formatResult(val);
                        span.onclick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            view.focus();
                            view.dispatch(
                                view.state.tr.setSelection(
                                    TextSelection.create(view.state.doc, matchStart + 2),
                                ),
                            );
                        };
                        return span;
                    },
                    { side: -1 },
                ),
            );
        }

        return true;
    });

    return DecorationSet.create(doc, decos);
}

/**
 * Evaluates inline formulas written as `==expr==` (or `==@expr==`) in prose text
 * and renders the formatted result as an inline widget while the cursor is outside.
 */
export const InlineFormulas = Extension.create<InlineFormulasOptions>({
    name: 'inlineFormulas',

    addOptions() {
        return { getScope: () => EMPTY_SCOPE };
    },

    addProseMirrorPlugins() {
        const { getScope, subscribe } = this.options;

        return [
            new Plugin<DecorationSet>({
                key: inlineFormulasKey,
                state: {
                    init(_, state) {
                        return buildInlineFormulaDecorations(state, getScope);
                    },
                    apply(tr, prev, _oldState, newState) {
                        if (
                            tr.docChanged ||
                            tr.selectionSet ||
                            tr.getMeta(inlineFormulasKey) === 'refresh'
                        ) {
                            return buildInlineFormulaDecorations(newState, getScope);
                        }
                        return prev;
                    },
                },
                view: (editorView) => {
                    const unsubscribe = subscribe?.(() => {
                        if (editorView.isDestroyed) return;
                        editorView.dispatch(editorView.state.tr.setMeta(inlineFormulasKey, 'refresh'));
                    });
                    return { destroy: () => unsubscribe?.() };
                },
                props: {
                    decorations(state) {
                        return inlineFormulasKey.getState(state) ?? DecorationSet.empty;
                    },
                },
            }),
        ];
    },
});
