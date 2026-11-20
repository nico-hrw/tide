import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { isDefinition, type Definition } from '@/lib/formula/scope';
import { VARIABLES_NODE, collectDocDefinitions } from './variablesScope';

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        variablesBlock: {
            insertVariablesBlock: (code?: string) => ReturnType;
        };
    }
}

function parseSnapshot(raw: string | null): Definition[] {
    if (!raw) return [];
    try {
        const v: unknown = JSON.parse(raw);
        return Array.isArray(v) ? v.filter(isDefinition) : [];
    } catch {
        return [];
    }
}

export interface VariablesBlockOptions {
    /** Global definitions (central registry) for showing values in the block view. */
    getGlobals: () => Definition[];
    /**
     * Called on mount and whenever the note's definitions change. `prev` is the previous list (null on the first call),
     * so callers can tell that a global was just removed.
     */
    onDefinitionsChange?: (defs: Definition[], prev: Definition[] | null) => void;
}

const reportKey = new PluginKey('variablesReport');

/** Block with variable and function definitions, one per line (`zins = 3,9 %`, `@kurs = 0,92`, `f(x) = x*2`). Plain node; the view is added in VariablesBlock.tsx. */
export const VariablesBlockNode = Node.create<VariablesBlockOptions>({
    name: VARIABLES_NODE,
    group: 'block',
    atom: true,

    addOptions() {
        return { getGlobals: () => [] };
    },

    addProseMirrorPlugins() {
        const opts = this.options;
        return [
            new Plugin({
                key: reportKey,
                view(view) {
                    let prev: Definition[] | null = null;
                    let prevKey: string | null = null;
                    const run = (doc: typeof view.state.doc) => {
                        const { local } = collectDocDefinitions(doc);
                        const k = JSON.stringify(local);
                        if (k === prevKey) return;
                        const before = prev;
                        prev = local;
                        prevKey = k;
                        opts.onDefinitionsChange?.(local, before);
                    };
                    run(view.state.doc);
                    return { update: (v, old) => { if (v.state.doc !== old.doc) run(v.state.doc); } };
                },
            }),
        ];
    },

    addAttributes() {
        return {
            code: {
                default: '',
                parseHTML: (el: HTMLElement) => el.getAttribute('data-code') ?? '',
                renderHTML: (attrs: Record<string, unknown>) => ({ 'data-code': String(attrs.code ?? '') }),
            },
            /** Copies of used global variables, written when sharing. */
            snapshot: {
                default: [] as Definition[],
                parseHTML: (el: HTMLElement) => parseSnapshot(el.getAttribute('data-snapshot')),
                renderHTML: (attrs: Record<string, unknown>) => ({ 'data-snapshot': JSON.stringify(attrs.snapshot ?? []) }),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'variables-block' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['variables-block', mergeAttributes(HTMLAttributes)];
    },

    addCommands() {
        return {
            insertVariablesBlock: (code = '') => ({ commands }) =>
                commands.insertContent({ type: this.name, attrs: { code } }),
        };
    },
});
