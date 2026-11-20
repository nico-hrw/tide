import type { Editor, JSONContent } from '@tiptap/core';
import { parseFormula } from './parser';
import { parseDefinitions, type Definition } from './scope';
import { isFormulaText } from './tableCalc';
import type { Expr } from './types';

const VARIABLES_NODE = 'variablesBlock';
const EMPTY_PARAMS: ReadonlySet<string> = new Set();

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

interface RefBucket {
    vars: Set<string>;
    calls: Set<string>;
}

function collectExprRefs(expr: Expr, boundParams: ReadonlySet<string>, refs: RefBucket): void {
    switch (expr.k) {
        case 'var':
            if (!boundParams.has(expr.name)) refs.vars.add(expr.name);
            return;
        case 'call':
            refs.calls.add(expr.name);
            for (const arg of expr.args) collectExprRefs(arg, boundParams, refs);
            return;
        case 'bin':
            collectExprRefs(expr.l, boundParams, refs);
            collectExprRefs(expr.r, boundParams, refs);
            return;
        case 'neg':
        case 'pct':
            collectExprRefs(expr.e, boundParams, refs);
            return;
        case 'num':
        case 'str':
        case 'ref':
        case 'range':
            return;
    }
}

function scanFormula(src: string, boundParams: ReadonlySet<string>, refs: RefBucket): void {
    try {
        collectExprRefs(parseFormula(src), boundParams, refs);
    } catch {
        // Ignore malformed formulas while scanning for global dependencies.
    }
}

function extractNodeText(node: unknown): string {
    if (!isRecord(node)) return '';
    if (node.type === 'text') return typeof node.text === 'string' ? node.text : '';
    if (node.type === 'hardBreak') return '\n';
    if (!Array.isArray(node.content)) return '';
    const sep = node.type === 'tableCell' || node.type === 'tableHeader' ? '\n' : '';
    return node.content.map(extractNodeText).join(sep);
}

function extractInlineFormulas(text: string, formulaTexts: string[]): void {
    const re = /(?:^|[^=])==([^=\n]+)==/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        const cleanExpr = match[1].trim().replace(/^@\s*/, '');
        if (cleanExpr) formulaTexts.push('=' + cleanExpr);
    }
}

function walkJsonNode(node: unknown, formulaTexts: string[], localDefs: Definition[]): void {
    if (Array.isArray(node)) {
        for (const item of node) walkJsonNode(item, formulaTexts, localDefs);
        return;
    }
    if (!isRecord(node)) return;

    if (node.type === VARIABLES_NODE) {
        if (isRecord(node.attrs) && typeof node.attrs.code === 'string') {
            localDefs.push(...parseDefinitions(node.attrs.code));
        }
        return;
    }

    if (node.type === 'tableCell' || node.type === 'tableHeader') {
        const text = extractNodeText(node);
        if (isFormulaText(text)) formulaTexts.push(text);
        else extractInlineFormulas(text, formulaTexts);
        return;
    }

    if (node.type === 'text' && typeof node.text === 'string') {
        extractInlineFormulas(node.text, formulaTexts);
        return;
    }

    if (Array.isArray(node.content)) {
        for (const child of node.content) walkJsonNode(child, formulaTexts, localDefs);
    }
}

function extractFromInput(docJsonOrText: unknown): { formulaTexts: string[]; localDefs: Definition[] } {
    const formulaTexts: string[] = [];
    const localDefs: Definition[] = [];
    if (docJsonOrText === null || docJsonOrText === undefined) return { formulaTexts, localDefs };

    if (typeof docJsonOrText === 'string') {
        const trimmed = docJsonOrText.trim();
        if (!trimmed) return { formulaTexts, localDefs };

        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                const parsed: unknown = JSON.parse(trimmed);
                walkJsonNode(parsed, formulaTexts, localDefs);
                return { formulaTexts, localDefs };
            } catch {
                // Not valid JSON; fall through to HTML / plain text extraction.
            }
        }

        if (typeof DOMParser !== 'undefined' && /<[a-z][\s\S]*>/i.test(trimmed)) {
            const doc = new DOMParser().parseFromString(trimmed, 'text/html');
            doc.querySelectorAll('variables-block').forEach((el) => {
                const code = el.getAttribute('data-code') ?? '';
                if (code) localDefs.push(...parseDefinitions(code));
            });
            doc.querySelectorAll('td, th').forEach((cell) => {
                const text = cell.textContent ?? '';
                if (isFormulaText(text)) formulaTexts.push(text);
            });
            if (doc.body) {
                if (typeof doc.createTreeWalker === 'function' && typeof NodeFilter !== 'undefined') {
                    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
                    let current = walker.nextNode();
                    while (current) {
                        if (current.nodeValue) extractInlineFormulas(current.nodeValue, formulaTexts);
                        current = walker.nextNode();
                    }
                } else {
                    extractInlineFormulas(doc.body.textContent ?? '', formulaTexts);
                }
            }
            return { formulaTexts, localDefs };
        }

        localDefs.push(...parseDefinitions(trimmed));
        for (const line of trimmed.split('\n')) {
            if (isFormulaText(line)) formulaTexts.push(line);
            else extractInlineFormulas(line, formulaTexts);
        }
        return { formulaTexts, localDefs };
    }

    walkJsonNode(docJsonOrText, formulaTexts, localDefs);
    return { formulaTexts, localDefs };
}

/**
 * Finds all global definitions referenced (directly or transitively) by table formulas
 * or local variable definitions in a note's document JSON or text.
 */
export function findUsedGlobals(
    docJsonOrText: unknown,
    globalDefs: Definition[],
): { usedDefs: Definition[]; usedNames: string[] } {
    const { formulaTexts, localDefs } = extractFromInput(docJsonOrText);

    const localVarNames = new Set<string>();
    const localFnNames = new Set<string>();
    for (const def of localDefs) {
        if (def.params) localFnNames.add(def.name.toUpperCase());
        else localVarNames.add(def.name);
    }

    const globalVarMap = new Map<string, Definition>();
    const globalFnMap = new Map<string, Definition>();
    for (const def of globalDefs) {
        if (def.params) {
            const upper = def.name.toUpperCase();
            if (!globalFnMap.has(upper)) globalFnMap.set(upper, def);
        } else if (!globalVarMap.has(def.name)) {
            globalVarMap.set(def.name, def);
        }
    }

    const initialRefs: RefBucket = { vars: new Set(), calls: new Set() };
    for (const formula of formulaTexts) scanFormula(formula, EMPTY_PARAMS, initialRefs);
    for (const def of localDefs) scanFormula(def.expr, new Set(def.params ?? []), initialRefs);

    const usedDefs: Definition[] = [];
    const usedNames: string[] = [];
    const seenDefs = new Set<Definition>();
    const seenNames = new Set<string>();
    const queue: Definition[] = [];

    const enqueueRefs = (refs: RefBucket): void => {
        for (const varName of refs.vars) {
            if (localVarNames.has(varName)) continue;
            const match = globalVarMap.get(varName);
            if (match && !seenDefs.has(match)) {
                seenDefs.add(match);
                usedDefs.push(match);
                queue.push(match);
                if (!seenNames.has(match.name)) {
                    seenNames.add(match.name);
                    usedNames.push(match.name);
                }
            }
        }
        for (const callName of refs.calls) {
            const upper = callName.toUpperCase();
            if (localFnNames.has(upper)) continue;
            const match = globalFnMap.get(upper);
            if (match && !seenDefs.has(match)) {
                seenDefs.add(match);
                usedDefs.push(match);
                queue.push(match);
                if (!seenNames.has(match.name)) {
                    seenNames.add(match.name);
                    usedNames.push(match.name);
                }
            }
        }
    };

    enqueueRefs(initialRefs);

    while (queue.length > 0) {
        const def = queue.shift();
        if (!def) continue;
        const subRefs: RefBucket = { vars: new Set(), calls: new Set() };
        scanFormula(def.expr, new Set(def.params ?? []), subRefs);
        enqueueRefs(subRefs);
    }

    return { usedDefs, usedNames };
}

function cloneSnapshot(snapshot: Definition[]): Definition[] {
    return snapshot.map((d) => (d.params ? { ...d, params: [...d.params] } : { ...d }));
}

/**
 * Returns a new copy of `docJson` with `snapshot` applied to the first `variablesBlock`
 * (and `[]` on subsequent blocks), or prepends one if none exists and `snapshot` is non-empty.
 */
export function applySnapshotToDocJson(
    docJson: Record<string, unknown>,
    snapshot: Definition[],
): Record<string, unknown> {
    let foundFirst = false;

    const visit = (node: unknown): unknown => {
        if (!isRecord(node)) return node;

        if (node.type === VARIABLES_NODE) {
            const nextSnapshot = foundFirst ? [] : cloneSnapshot(snapshot);
            foundFirst = true;
            const nextAttrs = isRecord(node.attrs)
                ? { ...node.attrs, snapshot: nextSnapshot }
                : { code: '', snapshot: nextSnapshot };
            return { ...node, attrs: nextAttrs };
        }

        if (Array.isArray(node.content)) {
            return { ...node, content: node.content.map(visit) };
        }

        return { ...node };
    };

    const nextDoc = visit(docJson);
    const result: Record<string, unknown> = isRecord(nextDoc) ? nextDoc : { ...docJson };

    if (!foundFirst && snapshot.length > 0) {
        const block: JSONContent = {
            type: VARIABLES_NODE,
            attrs: { code: '', snapshot: cloneSnapshot(snapshot) },
        };
        const existingContent = Array.isArray(result.content) ? result.content : [];
        result.content = [block, ...existingContent];
    }

    return result;
}

function isTipTapEditor(v: unknown): v is Editor {
    if (!isRecord(v)) return false;
    if (!isRecord(v.state) || !isRecord(v.schema) || !isRecord(v.view)) return false;
    return typeof v.view.dispatch === 'function'
        && isRecord(v.state.doc)
        && isRecord(v.state.tr)
        && isRecord(v.schema.nodes);
}

/**
 * Applies `snapshot` to the first `variablesBlock` node in a TipTap editor (clearing
 * subsequent blocks), or inserts one at the top when none exists and `snapshot` is non-empty.
 */
export function applySnapshotToEditor(editor: unknown, snapshot: Definition[]): boolean {
    if (!isTipTapEditor(editor)) return false;
    const blockType = editor.schema.nodes[VARIABLES_NODE];
    if (!blockType) return false;

    const blocks: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === VARIABLES_NODE) {
            blocks.push({ pos, attrs: node.attrs });
            return false;
        }
        return true;
    });

    if (blocks.length === 0) {
        if (snapshot.length === 0) return false;
        const node = blockType.create({ code: '', snapshot: cloneSnapshot(snapshot) });
        const tr = editor.state.tr.insert(0, node);
        editor.view.dispatch(tr);
        return true;
    }

    const tr = editor.state.tr;
    let changed = false;
    blocks.forEach((block, idx) => {
        const targetSnap = idx === 0 ? cloneSnapshot(snapshot) : [];
        const currentSnap = block.attrs.snapshot;
        if (JSON.stringify(currentSnap ?? []) === JSON.stringify(targetSnap)) return;
        tr.setNodeMarkup(block.pos, undefined, { ...block.attrs, snapshot: targetSnap });
        changed = true;
    });

    if (!changed) return false;
    editor.view.dispatch(tr);
    return true;
}
