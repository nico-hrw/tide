import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import {
    FormulaSuggestionMenu,
    type FormulaSuggestionCategory,
} from '@/components/extensions/FormulaSuggestionMenu';
import { locateCell } from '@/components/extensions/tableFormulaUtils';
import {
    getVariableSuggestions,
    type VariableSuggestionItem,
} from '@/lib/formula/variableSuggestions';

export interface FormulaSuggestionOptions {
    getActiveNoteId?: () => string | null;
}

export const formulaSuggestionKey = new PluginKey('formulaSuggestion');

const SKIP_TEXTBLOCKS = new Set(['codeBlock', 'mathBlock', 'variablesBlock']);
const TRAILING_TOKEN_RE = /([@A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß0-9_]*)$/;
const INLINE_EQ_CLOSED_RE = /==[^=\n]*==/g;
const INLINE_EQ_OPEN_RE = /==([^=\n]*)$/;

interface FormulaContext {
    query: string;
    tokenStart: number;
}

function detectFormulaContext(view: EditorView): FormulaContext | null {
    if (!view.editable) return null;
    const sel = view.state.selection;
    if (!sel.empty) return null;

    const cellLoc = locateCell(view.state.doc, sel.from);
    if (cellLoc) {
        if (!cellLoc.cell.textContent.trimStart().startsWith('=')) return null;
        const textBeforeCaret = view.state.doc.textBetween(
            cellLoc.cellPos + 1,
            sel.from,
            '\n',
            '\0',
        );
        const eqIdx = textBeforeCaret.indexOf('=');
        if (eqIdx === -1) return null;
        const exprBeforeCaret = textBeforeCaret.slice(eqIdx + 1);
        const tokenMatch = TRAILING_TOKEN_RE.exec(exprBeforeCaret);
        const query = tokenMatch ? tokenMatch[1] : '';
        return { query, tokenStart: sel.from - query.length };
    }

    const { $from } = sel;
    if (!$from.parent.isTextblock || SKIP_TEXTBLOCKS.has($from.parent.type.name)) {
        return null;
    }

    const textBeforeCaret = $from.parent.textBetween(0, $from.parentOffset, undefined, '\0');
    const openTail = textBeforeCaret.replace(INLINE_EQ_CLOSED_RE, '');
    const eqMatch = INLINE_EQ_OPEN_RE.exec(openTail);
    if (!eqMatch) return null;

    const tokenMatch = TRAILING_TOKEN_RE.exec(eqMatch[1]);
    const query = tokenMatch ? tokenMatch[1] : '';
    return { query, tokenStart: sel.from - query.length };
}

function getCaretRect(view: EditorView): DOMRect {
    if (view.isDestroyed) return new DOMRect(0, 0, 0, 0);
    try {
        const coords = view.coordsAtPos(view.state.selection.from);
        return new DOMRect(
            coords.left,
            coords.top,
            Math.max(0, coords.right - coords.left),
            Math.max(0, coords.bottom - coords.top),
        );
    } catch {
        return new DOMRect(0, 0, 0, 0);
    }
}

/**
 * Provides autocomplete suggestions for local/global variables and stdlib functions
 * inside table formulas (`=...`) and inline prose formulas (`==...`).
 */
export const FormulaSuggestion = Extension.create<FormulaSuggestionOptions>({
    name: 'formulaSuggestion',

    // Run ahead of Table / StarterKit keymaps so Enter, Tab, Arrows, and Escape control the popup when open.
    priority: 200,

    addOptions() {
        return {
            getActiveNoteId: undefined,
        };
    },

    addProseMirrorPlugins() {
        const getActiveNoteId = this.options.getActiveNoteId;

        let container: HTMLDivElement | null = null;
        let root: Root | null = null;
        let popup: TippyInstance | null = null;
        let currentView: EditorView | null = null;

        let isVisible = false;
        let suppressNextUpdate = false;
        let allItems: VariableSuggestionItem[] = [];
        let filteredItems: VariableSuggestionItem[] = [];
        let selectedIndex = 0;
        let activeCategory: FormulaSuggestionCategory = 'all';
        let tokenStart = 0;
        let lastQuery: string | null = null;

        const computeFilteredItems = (): VariableSuggestionItem[] => {
            if (activeCategory === 'all') return allItems;
            return allItems.filter((item) => item.category === activeCategory);
        };

        const hide = () => {
            if (popup && isVisible) {
                popup.hide();
            }
            isVisible = false;
            allItems = [];
            filteredItems = [];
            selectedIndex = 0;
            activeCategory = 'all';
            lastQuery = null;
        };

        const insertItem = (item: VariableSuggestionItem) => {
            const view = currentView;
            if (!view || view.isDestroyed) return;
            const { state } = view;
            const sel = state.selection;
            const from = Math.max(0, Math.min(tokenStart, sel.from));
            const text = item.isFunction ? `${item.name}(` : item.name;

            suppressNextUpdate = true;
            hide();
            view.dispatch(state.tr.insertText(text, from, sel.from));
            view.focus();
        };

        const renderMenu = () => {
            if (!root) return;
            root.render(
                createElement(FormulaSuggestionMenu, {
                    items: filteredItems,
                    selectedIndex,
                    onSelect: insertItem,
                    activeCategory,
                    onCategoryChange: (cat: FormulaSuggestionCategory) => {
                        activeCategory = cat;
                        filteredItems = computeFilteredItems();
                        selectedIndex = 0;
                        renderMenu();
                    },
                }),
            );
        };

        const ensurePopup = (): TippyInstance => {
            if (popup && container && root) return popup;
            container = document.createElement('div');
            root = createRoot(container);
            popup = tippy(document.body, {
                getReferenceClientRect: () =>
                    currentView ? getCaretRect(currentView) : new DOMRect(0, 0, 0, 0),
                appendTo: () => document.body,
                content: container,
                showOnCreate: false,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
                theme: 'headless',
            });
            return popup;
        };

        const showAtCaret = (view: EditorView) => {
            const instance = ensurePopup();
            renderMenu();
            instance.setProps({
                getReferenceClientRect: () => getCaretRect(view),
            });
            instance.show();
            isVisible = true;
        };

        return [
            new Plugin({
                key: formulaSuggestionKey,
                view(editorView) {
                    currentView = editorView;

                    return {
                        update(view) {
                            currentView = view;
                            if (suppressNextUpdate) {
                                suppressNextUpdate = false;
                                hide();
                                return;
                            }

                            const ctx = detectFormulaContext(view);
                            if (!ctx) {
                                hide();
                                return;
                            }

                            const activeNoteId = getActiveNoteId?.() ?? null;
                            const suggestions = getVariableSuggestions(
                                view.state.doc,
                                ctx.query,
                                activeNoteId,
                            );

                            if (suggestions.length === 0) {
                                hide();
                                return;
                            }

                            tokenStart = ctx.tokenStart;
                            allItems = suggestions;
                            filteredItems = computeFilteredItems();

                            if (ctx.query !== lastQuery) {
                                selectedIndex = 0;
                                lastQuery = ctx.query;
                            } else if (filteredItems.length === 0) {
                                selectedIndex = 0;
                            } else if (selectedIndex >= filteredItems.length) {
                                selectedIndex = filteredItems.length - 1;
                            }

                            showAtCaret(view);
                        },

                        destroy() {
                            isVisible = false;
                            currentView = null;
                            if (popup) {
                                popup.destroy();
                                popup = null;
                            }
                            if (root) {
                                const oldRoot = root;
                                root = null;
                                queueMicrotask(() => oldRoot.unmount());
                            }
                            container = null;
                        },
                    };
                },

                props: {
                    handleKeyDown(view, event) {
                        if (!isVisible) return false;

                        if (event.key === 'Escape') {
                            event.preventDefault();
                            hide();
                            return true;
                        }

                        if (event.key === 'ArrowDown') {
                            event.preventDefault();
                            if (filteredItems.length > 0) {
                                selectedIndex = (selectedIndex + 1) % filteredItems.length;
                                renderMenu();
                            }
                            return true;
                        }

                        if (event.key === 'ArrowUp') {
                            event.preventDefault();
                            if (filteredItems.length > 0) {
                                selectedIndex =
                                    (selectedIndex - 1 + filteredItems.length) %
                                    filteredItems.length;
                                renderMenu();
                            }
                            return true;
                        }

                        if (event.key === 'Enter' || event.key === 'Tab') {
                            const item = filteredItems[selectedIndex];
                            if (!item) return false;
                            event.preventDefault();
                            currentView = view;
                            insertItem(item);
                            return true;
                        }

                        return false;
                    },

                    handleDOMEvents: {
                        blur(_view, event) {
                            if (!isVisible) return false;
                            const nextTarget = event.relatedTarget as Node | null;
                            if (nextTarget && container?.contains(nextTarget)) {
                                return false;
                            }
                            hide();
                            return false;
                        },
                    },
                },
            }),
        ];
    },
});

export default FormulaSuggestion;
