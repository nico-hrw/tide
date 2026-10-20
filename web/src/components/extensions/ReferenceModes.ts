import { Extension, CommandProps } from '@tiptap/core';
import { useReferenceStore, ReferenceItem } from '@/store/useReferenceStore';
import { Plugin, PluginKey, Transaction, EditorState } from 'prosemirror-state';
import { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { EditorView } from 'prosemirror-view';

// Augment Tiptap's command type registry so TypeScript knows about scanReferences
declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        referenceScannerMode: {
            scanReferences: () => ReturnType;
        };
    }
}

// ----------------------------------------------------------------------------
// Helpers for regex compilation, caching, and scanning
// ----------------------------------------------------------------------------

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface CompiledReferencePattern {
    regex: RegExp;
    termMap: Map<string, ReferenceItem>;
}

let cachedReferences: readonly ReferenceItem[] | null = null;
let cachedCompiledPattern: CompiledReferencePattern | null = null;

function getOrBuildReferenceRegex(references: readonly ReferenceItem[]): CompiledReferencePattern | null {
    if (references === cachedReferences && cachedCompiledPattern !== null) {
        return cachedCompiledPattern;
    }

    const termMap = new Map<string, ReferenceItem>();

    for (const ref of references) {
        if (!ref.term) continue;
        const trimmed = ref.term.trim();
        if (!trimmed) continue;
        const lower = trimmed.toLowerCase();
        if (!termMap.has(lower)) {
            termMap.set(lower, ref);
        }
    }

    if (termMap.size === 0) {
        cachedReferences = references;
        cachedCompiledPattern = null;
        return null;
    }

    // Sort terms by length descending so longer phrases match first
    const sortedTerms = Array.from(termMap.keys()).sort((a, b) => b.length - a.length);
    const escapedTerms = sortedTerms.map(escapeRegex);
    const pattern = escapedTerms.join('|');
    const regex = new RegExp(`(?<=^|[^\\wäöüÄÖÜß])(${pattern})(?=[^\\wäöüÄÖÜß]|$)`, 'gi');

    cachedReferences = references;
    cachedCompiledPattern = { regex, termMap };
    return cachedCompiledPattern;
}

/**
 * Scans text nodes within an optional [from, to] range in a single pass
 * and applies reference marks to matching terms.
 * Preserves existing reference marks and source marks.
 */
function scanAndApplyReferences(
    doc: ProseMirrorNode,
    schema: Schema,
    tr: Transaction,
    range?: { from: number; to: number }
): number {
    const markType = schema.marks.reference;
    if (!markType) return 0;

    const references = useReferenceStore.getState().references;
    if (!references || references.length === 0) return 0;

    const compiled = getOrBuildReferenceRegex(references);
    if (!compiled) return 0;

    const { regex, termMap } = compiled;
    const fromPos = range ? Math.max(0, range.from) : 0;
    const toPos = range ? Math.min(doc.content.size, range.to) : doc.content.size;

    if (fromPos >= toPos) return 0;

    let appliedCount = 0;

    doc.nodesBetween(fromPos, toPos, (node, pos) => {
        if (!node.isText || !node.text) return;

        // Skip text nodes that already carry a reference mark
        if (node.marks.some((m) => m.type.name === 'reference')) {
            return;
        }

        regex.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(node.text)) !== null) {
            if (match[0].length === 0) {
                regex.lastIndex++;
                continue;
            }

            const matchedWord = match[0];
            const ref = termMap.get(matchedWord.toLowerCase());
            if (!ref) continue;

            const startPos = pos + match.index;
            const endPos = startPos + matchedWord.length;

            if (startPos < fromPos || endPos > toPos) {
                continue;
            }

            // Do NOT replace existing marks or overwrite if already marked
            if (tr.doc.rangeHasMark(startPos, endPos, markType)) {
                continue;
            }

            const markAttrs: Record<string, unknown> = {
                referenceId: ref.id,
                ...(ref.color ? { color: ref.color } : {}),
                ...(ref.emoji ? { emoji: ref.emoji } : {}),
            };

            tr.addMark(startPos, endPos, markType.create(markAttrs));
            appliedCount++;
        }
    });

    return appliedCount;
}

// ----------------------------------------------------------------------------
// Browser Idle scheduling helper (strictly typed, SSR-safe)
// ----------------------------------------------------------------------------

function scheduleIdle(callback: () => void, timeoutMs: number): () => void {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        const handle = window.requestIdleCallback(() => callback(), { timeout: timeoutMs });
        return () => {
            if (typeof window.cancelIdleCallback === 'function') {
                window.cancelIdleCallback(handle);
            }
        };
    }
    const timer = setTimeout(callback, Math.min(timeoutMs, 1000));
    return () => clearTimeout(timer);
}

// ----------------------------------------------------------------------------
// MODE 2: "On-Demand Scanner" (Slash Command '/scan' or '/ref')
// Single-pass combined regex reference scanner
// ----------------------------------------------------------------------------
export const ReferenceScannerMode = Extension.create({
    name: 'referenceScannerMode',

    addCommands() {
        return {
            scanReferences:
                () =>
                ({ tr, state, dispatch }: CommandProps) => {
                    const references = useReferenceStore.getState().references;
                    if (!references || references.length === 0) return false;

                    const compiled = getOrBuildReferenceRegex(references);
                    if (!compiled) return false;

                    if (dispatch) {
                        const count = scanAndApplyReferences(state.doc, state.schema, tr);
                        if (count > 0) {
                            dispatch(tr);
                        }
                    }
                    return true;
                },
        };
    },
});

// ----------------------------------------------------------------------------
// MODE 3: "Autopilot" — Incremental zero-lag dirty-block autoscan
// ----------------------------------------------------------------------------
export const ReferenceAutopilotMode = Extension.create({
    name: 'referenceAutopilotMode',

    addProseMirrorPlugins() {
        const pluginKey = new PluginKey('reference-autopilot');

        let currentView: EditorView | null = null;
        let dirtyRange: { from: number; to: number } | null = null;
        let isFullScanScheduled = false;

        let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
        let cancelIdleFn: (() => void) | null = null;

        const cancelPending = () => {
            if (debounceTimeout !== null) {
                clearTimeout(debounceTimeout);
                debounceTimeout = null;
            }
            if (cancelIdleFn !== null) {
                cancelIdleFn();
                cancelIdleFn = null;
            }
        };

        const executePendingScan = () => {
            if (!currentView || currentView.isDestroyed) return;

            const store = useReferenceStore.getState();
            if (!store.autoScanEnabled) {
                dirtyRange = null;
                isFullScanScheduled = false;
                return;
            }

            const { state } = currentView;
            const doc = state.doc;
            const docSize = doc.content.size;
            if (docSize === 0) {
                dirtyRange = null;
                isFullScanScheduled = false;
                return;
            }

            const range = isFullScanScheduled || dirtyRange === null
                ? { from: 0, to: docSize }
                : {
                    from: Math.max(0, Math.min(dirtyRange.from, docSize)),
                    to: Math.max(0, Math.min(dirtyRange.to, docSize)),
                };

            dirtyRange = null;
            isFullScanScheduled = false;

            if (range.from >= range.to) return;

            const tr = state.tr;
            const count = scanAndApplyReferences(doc, state.schema, tr, range);

            if (count > 0) {
                tr.setMeta('isReferenceAutopilot', true);
                tr.setMeta('addToHistory', false);
                tr.setSelection(state.selection);
                currentView.dispatch(tr);
            }
        };

        const scheduleDebouncedScan = () => {
            cancelPending();

            debounceTimeout = setTimeout(() => {
                debounceTimeout = null;
                cancelIdleFn = scheduleIdle(() => {
                    cancelIdleFn = null;
                    executePendingScan();
                }, 1000);
            }, 800);
        };

        const scheduleFullScan = () => {
            if (!useReferenceStore.getState().autoScanEnabled) return;
            isFullScanScheduled = true;
            cancelPending();

            cancelIdleFn = scheduleIdle(() => {
                cancelIdleFn = null;
                executePendingScan();
            }, 1500);
        };

        return [
            new Plugin({
                key: pluginKey,

                appendTransaction(transactions, _oldState, newState: EditorState) {
                    if (!useReferenceStore.getState().autoScanEnabled) {
                        return null;
                    }

                    const userTrs = transactions.filter(
                        (tr) => tr.docChanged && !tr.getMeta('isReferenceAutopilot')
                    );
                    if (userTrs.length === 0) {
                        return null;
                    }

                    let minPos = Infinity;
                    let maxPos = -Infinity;

                    for (const tr of userTrs) {
                        // Map existing dirty range through this user transaction to stay accurate
                        if (dirtyRange !== null) {
                            dirtyRange = {
                                from: tr.mapping.map(dirtyRange.from, -1),
                                to: tr.mapping.map(dirtyRange.to, 1),
                            };
                        }

                        for (const step of tr.steps) {
                            step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
                                if (newStart < minPos) minPos = newStart;
                                if (newEnd > maxPos) maxPos = newEnd;
                            });
                        }
                    }

                    if (minPos === Infinity || maxPos === -Infinity) {
                        return null;
                    }

                    const docSize = newState.doc.content.size;
                    const clampedMin = Math.max(0, Math.min(minPos, docSize));
                    const clampedMax = Math.max(clampedMin, Math.min(maxPos, docSize));

                    const $min = newState.doc.resolve(clampedMin);
                    const $max = newState.doc.resolve(clampedMax);

                    const startPos = Math.max(0, $min.start());
                    const endPos = Math.min(docSize, $max.end());

                    if (startPos < endPos) {
                        if (dirtyRange === null) {
                            dirtyRange = { from: startPos, to: endPos };
                        } else {
                            dirtyRange = {
                                from: Math.min(dirtyRange.from, startPos),
                                to: Math.max(dirtyRange.to, endPos),
                            };
                        }
                        scheduleDebouncedScan();
                    }

                    return null;
                },

                view(editorView: EditorView) {
                    currentView = editorView;

                    // Background full scan on initialization if enabled
                    scheduleFullScan();

                    // Subscribe to dictionary / store changes
                    let lastRefs = useReferenceStore.getState().references;
                    let lastAutoScan = useReferenceStore.getState().autoScanEnabled;

                    const unsubscribe = useReferenceStore.subscribe((state) => {
                        const refsChanged = state.references !== lastRefs;
                        const autoScanToggledOn = state.autoScanEnabled && !lastAutoScan;
                        lastRefs = state.references;
                        lastAutoScan = state.autoScanEnabled;

                        if (state.autoScanEnabled && (refsChanged || autoScanToggledOn)) {
                            scheduleFullScan();
                        }
                    });

                    return {
                        update(view: EditorView) {
                            currentView = view;
                        },
                        destroy() {
                            unsubscribe();
                            cancelPending();
                            currentView = null;
                            dirtyRange = null;
                            isFullScanScheduled = false;
                        },
                    };
                },
            }),
        ];
    },
});
