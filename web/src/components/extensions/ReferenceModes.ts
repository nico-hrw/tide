import { Extension } from '@tiptap/core';
import { useReferenceStore } from '@/store/useReferenceStore';
import { Plugin, PluginKey } from 'prosemirror-state';

// Augment Tiptap's command type registry so TypeScript knows about scanReferences
declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        referenceScannerMode: {
            scanReferences: () => ReturnType;
        };
    }
}

// ----------------------------------------------------------------------------
// MODE 2: "On-Demand Scanner" (Slash Command '/ref')
// Applies permanent reference marks to the document on user request.
// ----------------------------------------------------------------------------
export const ReferenceScannerMode = Extension.create({
    name: 'referenceScannerMode',

    addCommands() {
        return {
            scanReferences:
                () =>
                ({ tr, state, dispatch }: any) => {
                    const doc = state.doc;
                    const references = useReferenceStore.getState().references;
                    
                    console.log(`[References] Scanning for ${references.length} references...`, references);

                    if (references.length === 0) return true;

                    if (dispatch) {
                        const foundIds = new Set<string>();

                        const compiled = references.map(ref => {
                            if (!ref.term || ref.term.trim() === '') return null;
                            const escapedTerm = ref.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            return {
                                id: ref.id,
                                term: ref.term,
                                regex: new RegExp(`(?<=^|[^\\\\wäöüÄÖÜß])(${escapedTerm})(?=[^\\\\wäöüÄÖÜß]|$)`, 'gi')
                            };
                        }).filter(Boolean) as { id: string, term: string, regex: RegExp }[];

                        compiled.forEach((compiledRef) => {
                            let matchesCount = 0;
                            
                            doc.descendants((node: any, pos: any) => {
                                if (node.isText && node.text) {
                                    let match;
                                    compiledRef.regex.lastIndex = 0;
                                    
                                    while ((match = compiledRef.regex.exec(node.text)) !== null) {
                                        if (match[0].length === 0) {
                                            compiledRef.regex.lastIndex++;
                                            continue;
                                        }

                                        const startPos = pos + match.index;
                                        const endPos = startPos + match[0].length;
                                        
                                        const hasMark = node.marks.find((m: any) => m.type.name === 'reference');
                                        if (!hasMark) {
                                            tr.addMark(
                                                startPos,
                                                endPos,
                                                state.schema.marks.reference.create({
                                                    referenceId: compiledRef.id,
                                                })
                                            );
                                            foundIds.add(compiledRef.id);
                                            matchesCount++;
                                        }
                                    }
                                }
                            });
                            console.log(`[References] Term "${compiledRef.term}" yielded ${matchesCount} new marks.`);
                        });
                        
                        console.log(`[References] Applied ${foundIds.size} unique references to the document.`);
                        dispatch(tr);
                    }
                    return true;
                },
        };
    },
});


// ----------------------------------------------------------------------------
// MODE 3: "Autopilot" — Real document marks via appendTransaction
//
// CRITICAL DESIGN CHANGE (fixing the persistence bug):
// Previously, autopilot used Decorations — pure visual overlays that are NOT
// part of the document and therefore NEVER appear in getJSON(). This meant
// reference highlights looked correct visually but were never saved.
//
// The fix: autopilot now applies real `reference` marks via appendTransaction.
// These ARE part of the document JSON and will be encrypted and persisted to
// the server by the auto-save mechanism (docChanged=true triggers onUpdate,
// which triggers the auto-save with 3s debounce).
//
// To avoid infinite scan loops we track the last-scanned doc serialization and
// only apply marks when the plain text actually changed. We also skip
// appendTransaction runs that were themselves triggered by OUR OWN mark
// application (identified by a PluginKey meta flag).
// ----------------------------------------------------------------------------
export const ReferenceAutopilotMode = Extension.create({
    name: 'referenceAutopilotMode',

    addProseMirrorPlugins() {
        const pluginKey = new PluginKey('reference-autopilot');

        // Debounce timer for the scan
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        // Track whether we just applied our own marks so we skip the next appendTransaction
        // (to avoid infinite loop: our marks → docChanged → appendTransaction again)
        let justApplied = false;

        // Cache the text content of the last scan to avoid re-scanning identical docs
        let lastScannedText = '';

        /**
         * Core scan: returns an array of { from, to, referenceId } ranges
         * that need new reference marks applied.
         */
        const scanForNewMarks = (doc: any): { from: number; to: number; referenceId: string }[] => {
            const references = useReferenceStore.getState().references;
            if (references.length === 0) return [];

            const compiled = references
                .filter(ref => ref.term && ref.term.trim() !== '')
                .map(ref => {
                    const escapedTerm = ref.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    return {
                        id: ref.id,
                        term: ref.term,
                        regex: new RegExp(`(?<=^|[^\\\\wäöüÄÖÜß])(${escapedTerm})(?=[^\\\\wäöüÄÖÜß]|$)`, 'gi'),
                    };
                });

            const results: { from: number; to: number; referenceId: string }[] = [];

            doc.descendants((node: any, pos: number) => {
                if (!node.isText || !node.text) return;

                // Skip text nodes that already carry a reference mark
                const alreadyMarked = node.marks.some((m: any) => m.type.name === 'reference');
                if (alreadyMarked) return;

                for (const { id, regex } of compiled) {
                    regex.lastIndex = 0;
                    let match: RegExpExecArray | null;

                    while ((match = regex.exec(node.text)) !== null) {
                        if (match[0].length === 0) { regex.lastIndex++; continue; }
                        results.push({
                            from: pos + match.index,
                            to: pos + match.index + match[0].length,
                            referenceId: id,
                        });
                    }
                }
            });

            return results;
        };

        return [
            new Plugin({
                key: pluginKey,

                /**
                 * appendTransaction is the safe place to inject document mutations.
                 * PM handles them atomically — no recursive view.update() calls.
                 *
                 * We skip execution when:
                 *   1. We just applied our own marks (`justApplied` flag)
                 *   2. The delta transaction was itself our own ref-mark transaction
                 *   3. No pending marks exist (debounce hasn't fired yet)
                 */
                appendTransaction(transactions, _oldState, newState) {
                    // If we just applied marks ourselves, skip this cycle to avoid recursion
                    if (justApplied) {
                        justApplied = false;
                        return null;
                    }

                    // Only act on transactions that actually changed the document
                    const docChanged = transactions.some(tr => tr.docChanged);
                    if (!docChanged) return null;

                    // Avoid re-scanning if text content didn't change
                    const currentText = newState.doc.textContent;
                    if (currentText === lastScannedText) return null;

                    // We don't run the scan here synchronously — let the debounce handle it
                    // to avoid blocking the UI on every keystroke. Instead signal the view.
                    return null;
                },

                view(view) {
                    return {
                        update(view, prevState) {
                            // Only react to document content changes
                            if (view.state.doc.eq(prevState.doc)) return;

                            // Cancel any pending scan and reset the timer
                            if (debounceTimer) clearTimeout(debounceTimer);

                            console.log('[Autopilot] Document changed, queuing reference scan in 2s...');

                            debounceTimer = setTimeout(() => {
                                if (view.isDestroyed) return;

                                // Skip if text hasn't changed since last scan
                                const currentText = view.state.doc.textContent;
                                if (currentText === lastScannedText) {
                                    console.log('[Autopilot] Text unchanged since last scan, skipping.');
                                    return;
                                }

                                const newMarks = scanForNewMarks(view.state.doc);
                                if (newMarks.length === 0) {
                                    lastScannedText = currentText;
                                    console.log('[Autopilot] No new reference marks needed.');
                                    return;
                                }

                                console.log(`[Autopilot] Applying ${newMarks.length} new reference marks to document.`);

                                // Build and dispatch a transaction that adds the marks.
                                // docChanged=true will cause onUpdate to fire in Editor.tsx,
                                // which triggers the auto-save — this is intentional and correct.
                                const { state } = view;
                                const tr = state.tr;
                                let hasChanges = false;
                                for (const { from, to, referenceId } of newMarks) {
                                    try {
                                        tr.addMark(
                                            from,
                                            to,
                                            state.schema.marks.reference.create({ referenceId })
                                        );
                                        hasChanges = true;
                                    } catch (e) {
                                        // Position may be out of bounds if doc changed; skip safely
                                        console.warn('[Autopilot] Skipping out-of-bounds mark at', from, to, e);
                                    }
                                }

                                if (hasChanges) {
                                    // Mark as our own dispatch to prevent appendTransaction loop
                                    justApplied = true;
                                    lastScannedText = currentText;
                                    console.log(`[Autopilot] Applying ${newMarks.length} new reference marks.`);
                                    view.dispatch(tr);
                                }
                            }, 2000);
                        },

                        destroy() {
                            if (debounceTimer) clearTimeout(debounceTimer);
                            justApplied = false;
                            lastScannedText = '';
                        },
                    };
                },
            }),
        ];
    },
});
