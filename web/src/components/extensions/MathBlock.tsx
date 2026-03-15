import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useState } from 'react';

const MathNodeView = ({ node, updateAttributes }: any) => {
    return (
        <NodeViewWrapper
            className="math-block relative group my-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-black/50 overflow-hidden"
            onMouseDown={(e: any) => {
                // Prevent BubbleMenu from stealing focus if clicked
                if (node.attrs.editing) e.stopPropagation();
            }}
        >
            <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                    onClick={() => updateAttributes({ editing: !node.attrs.editing })}
                    className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                    {node.attrs.editing ? 'View' : 'Edit Equation'}
                </button>
            </div>
            {node.attrs.editing ? (
                <div className="p-4 bg-[#1e1e1e] font-mono text-sm text-gray-300">
                    <textarea
                        className="w-full bg-transparent outline-none resize-none"
                        rows={Math.max(3, node.attrs.code.split('\n').length + 1)}
                        value={node.attrs.code}
                        onChange={(e) => updateAttributes({ code: e.target.value })}
                        spellCheck={false}
                        placeholder="f(x) = c x^2"
                    />
                </div>
            ) : (
                <div className="p-6 flex justify-center bg-white dark:bg-gray-900/50 min-h-[100px] items-center overflow-x-auto text-black dark:text-white">
                    <div
                        className="text-lg"
                        dangerouslySetInnerHTML={{
                            __html: (() => {
                                try {
                                    return katex.renderToString(node.attrs.code || ' ', { displayMode: true, throwOnError: false });
                                } catch (e) {
                                    return `<span class="text-red-500">${e}</span>`;
                                }
                            })()
                        }}
                    />
                    {(!node.attrs.code || node.attrs.code.trim() === '') && (
                        <div className="text-gray-400 italic text-sm absolute">Empty Equation</div>
                    )}
                </div>
            )}
        </NodeViewWrapper>
    );
};

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        mathBlock: {
            insertMath: () => ReturnType,
        }
    }
}

export const MathBlock = Node.create({
    name: 'mathBlock',
    group: 'block',
    atom: true,

    addAttributes() {
        return {
            code: { default: 'f_x(x,y) = A \\times \\frac{x}{y}' },
            editing: { default: true },
        };
    },

    parseHTML() {
        return [{ tag: 'math-block' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['math-block', mergeAttributes(HTMLAttributes)];
    },

    addNodeView() {
        return ReactNodeViewRenderer(MathNodeView);
    },

    addCommands() {
        return {
            insertMath: () => ({ commands }) => {
                return commands.insertContent({ type: this.name });
            },
        };
    },

    addInputRules() {
        // Typing $$ on a new line triggers block math
        return [
            new InputRule({
                find: /(?:^|\n)\$\$\s*$/,
                handler: ({ state, range, chain }) => {
                    chain()
                        .deleteRange(range)
                        .insertContent({ type: this.name, attrs: { code: '', editing: true } })
                        .run();
                },
            }),
        ];
    },
});

// ----- Inline Math: $E=mc^2$ -----
const InlineMathView = ({ node, updateAttributes, selected }: any) => {
    const [editing, setEditing] = useState(false);
    const rendered = (() => {
        try {
            return katex.renderToString(node.attrs.code || ' ', { throwOnError: false });
        } catch {
            return '<span class="text-red-500">Invalid LaTeX</span>';
        }
    })();

    if (editing || selected) {
        return (
            <NodeViewWrapper as="span" className="inline-block align-baseline">
                <input
                    autoFocus
                    className="font-mono text-sm bg-gray-100 dark:bg-gray-800 border border-indigo-400 rounded px-1 outline-none w-32"
                    value={node.attrs.code}
                    onChange={(e) => updateAttributes({ code: e.target.value })}
                    onBlur={() => setEditing(false)}
                    onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); setEditing(false); } }}
                />
            </NodeViewWrapper>
        );
    }

    return (
        <NodeViewWrapper as="span" className="inline-block align-baseline cursor-pointer" onClick={() => setEditing(true)}>
            <span dangerouslySetInnerHTML={{ __html: rendered }} />
        </NodeViewWrapper>
    );
};

export const InlineMath = Node.create({
    name: 'inlineMath',
    group: 'inline',
    inline: true,
    atom: true,

    addAttributes() {
        return {
            code: { default: '' },
        };
    },

    parseHTML() {
        return [{ tag: 'inline-math' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['inline-math', mergeAttributes(HTMLAttributes)];
    },

    addNodeView() {
        return ReactNodeViewRenderer(InlineMathView);
    },

    addInputRules() {
        // Typing $...$ triggers inline math: matches $content$ where content is non-empty
        return [
            new InputRule({
                find: /\$([^$\n]+)\$$/,
                handler: ({ state, range, match, chain }) => {
                    const code = match[1];
                    chain()
                        .deleteRange(range)
                        .insertContent({ type: this.name, attrs: { code } })
                        .insertContent(' ')
                        .run();
                },
            }),
        ];
    },
});
