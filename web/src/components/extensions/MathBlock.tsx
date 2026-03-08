import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

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
});
