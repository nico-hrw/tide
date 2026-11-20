import { Node, mergeAttributes } from '@tiptap/core';
import { isDefinition, type Definition } from '@/lib/formula/scope';
import { VARIABLES_NODE } from './variablesScope';

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

/** Block with variable and function definitions, one per line (`zins = 3,9 %`, `@kurs = 0,92`, `f(x) = x*2`). Plain node; the view is added in VariablesBlock.tsx. */
export const VariablesBlockNode = Node.create({
    name: VARIABLES_NODE,
    group: 'block',
    atom: true,

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
