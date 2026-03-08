import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlockIdOptions {
    /**
     * Called whenever one or more block IDs disappear from the document
     * during a transaction (i.e. the block was deleted or merged).
     * Use this in CanvasLayer to re-anchor orphaned canvas elements.
     */
    onBlocksDeleted?: (removedIds: string[]) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Collect all `blockId` and `anchorId` attribute values from a ProseMirror document node */
function collectIds(doc: any): Set<string> {
    const ids = new Set<string>();
    doc.descendants((node: any) => {
        const bid = node.attrs?.blockId;
        const aid = node.attrs?.anchorId;
        if (bid) ids.add(bid);
        if (aid) ids.add(aid);
    });
    return ids;
}

// ─── Extension ────────────────────────────────────────────────────────────────

export const BlockId = Extension.create<BlockIdOptions>({
    name: 'blockId',

    addOptions() {
        return { onBlocksDeleted: undefined };
    },

    /**
     * Inject `blockId` into every block-level node type that TipTap has.
     * The attribute is persisted in the JSON document and rendered as
     * `data-block-id` on the DOM element.
     */
    addGlobalAttributes() {
        return [
            {
                // Target all block-level node types
                types: [
                    'paragraph',
                    'heading',
                    'bulletList',
                    'orderedList',
                    'listItem',
                    'blockquote',
                    'codeBlock',
                    'horizontalRule',
                    'image',
                ],
                attributes: {
                    blockId: {
                        default: null,
                        keepOnSplit: false,
                        /**
                         * Parse from existing HTML – picks up `data-block-id` if the
                         * content was serialised by us before.
                         */
                        parseHTML: (element) =>
                            element.getAttribute('data-block-id'),
                        /**
                         * Render to HTML – sets `data-block-id` on the DOM node.
                         */
                        renderHTML: (attrs) => {
                            if (!attrs.blockId) return {};
                            return { 'data-block-id': attrs.blockId };
                        },
                    },
                },
            },
        ];
    },

    /**
     * A ProseMirror Plugin that:
     * 1. Assigns a UUID to any block that doesn't have one yet (on every
     *    transaction), keeping IDs stable across edits.
     * 2. Ensures IDs are globaly unique within the document (fixes duplicates from copy-paste).
     * 3. Detects blocks that were removed and notifies the canvas layer
     *    so orphaned elements can be re-anchored.
     */
    addProseMirrorPlugins() {
        const options = this.options;
        const pluginKey = new PluginKey('blockId');

        return [
            new Plugin({
                key: pluginKey,

                appendTransaction(transactions, oldState, newState) {
                    // Only act when the document actually changed
                    const docChanged = transactions.some((tr) => tr.docChanged);
                    if (!docChanged) return null;

                    const tr = newState.tr;
                    let modified = false;
                    const usedIds = new Set<string>();

                    // ── 1. Assign missing IDs and fix duplicates ──────────────────
                    newState.doc.descendants((node, pos) => {
                        if (!node.isBlock) return;

                        const id = node.attrs.blockId;
                        if (id && !usedIds.has(id)) {
                            usedIds.add(id);
                            return; // ID is fine and unique so far
                        }

                        // Missing or Duplicate ID
                        const newId = crypto.randomUUID();
                        tr.setNodeMarkup(pos, undefined, {
                            ...node.attrs,
                            blockId: newId,
                        });
                        usedIds.add(newId);
                        modified = true;
                    });

                    return modified ? tr : null;
                },

                // ── 2. Detect removed IDs and notify ────────────────────────────
                view() {
                    return {
                        update(view, prevState) {
                            if (!view.state.doc.eq(prevState.doc)) {
                                const before = collectIds(prevState.doc);
                                const after = collectIds(view.state.doc);

                                const removed: string[] = [];
                                before.forEach((id) => {
                                    if (!after.has(id)) removed.push(id);
                                });

                                if (removed.length > 0 && options.onBlocksDeleted) {
                                    // Defer so React state updates don't mix with ProseMirror's
                                    queueMicrotask(() => options.onBlocksDeleted!(removed));
                                }
                            }
                        },
                    };
                },
            }),
        ];
    },
});
