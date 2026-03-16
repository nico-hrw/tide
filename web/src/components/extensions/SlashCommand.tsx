import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { 
    Heading1, 
    Heading2, 
    List, 
    ListTodo, 
    Table as TableIcon,
    Bold,
    Italic,
    Strikethrough
} from 'lucide-react';

// Command List Component
const CommandList = forwardRef((props: any, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
        const item = props.items[index];
        if (item) {
            props.command(item);
        }
    };

    useEffect(() => setSelectedIndex(0), [props.items]);

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (event.key === 'ArrowUp') {
                setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
                return true;
            }
            if (event.key === 'ArrowDown') {
                setSelectedIndex((selectedIndex + 1) % props.items.length);
                return true;
            }
            if (event.key === 'Enter') {
                selectItem(selectedIndex);
                return true;
            }
            return false;
        },
    }));

    return (
        <div className="flex flex-col p-1 w-[220px] bg-white/90 dark:bg-black/90 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-2xl rounded-xl overflow-hidden text-sm z-50">
            {props.items.length ? (
                props.items.map((item: any, index: number) => (
                    <button
                        className={`flex items-center gap-2 px-2 py-1.5 text-left rounded-lg transition-colors ${index === selectedIndex ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5'}`}
                        key={index}
                        onClick={() => selectItem(index)}
                    >
                        <div className="flex items-center justify-center w-5 h-5 opacity-70">
                            {item.icon}
                        </div>
                        <div className="font-medium">{item.title}</div>
                    </button>
                ))
            ) : (
                <div className="px-2 py-2 text-gray-500 text-xs">No results</div>
            )}
        </div>
    );
});

CommandList.displayName = 'CommandList';

// Command Items Definition
const getSuggestionItems = ({ query }: { query: string }) => {
    return [
        {
            title: 'Heading 1',
            icon: <Heading1 size={16} />,
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
            },
        },
        {
            title: 'Heading 2',
            icon: <Heading2 size={16} />,
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
            },
        },
        {
            title: 'Task List',
            aliases: ['todo'],
            icon: <ListTodo size={16} />,
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleTaskList().run();
            },
        },
        {
            title: 'Bullet List',
            icon: <List size={16} />,
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleBulletList().run();
            },
        },
        {
            title: 'Table',
            icon: <TableIcon size={16} />,
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
            },
        },
        {
            title: 'Bold',
            icon: <Bold size={16} />,
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setBold().run();
            },
        },
        {
            title: 'Italic',
            icon: <Italic size={16} />,
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setItalic().run();
            },
        },
        {
            title: 'Strikethrough',
            icon: <Strikethrough size={16} />,
            command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleStrike().run();
            },
        },
    ].filter(item =>
        item.title.toLowerCase().startsWith(query.toLowerCase()) ||
        (item.aliases && item.aliases.some(alias => alias.startsWith(query.toLowerCase())))
    );
};

// Render Logic
const renderItems = () => {
    let component: ReactRenderer | null = null;
    let popup: any | null = null;

    return {
        onStart: (props: any) => {
            component = new ReactRenderer(CommandList, {
                props,
                editor: props.editor,
            });

            if (!props.clientRect) {
                return;
            }

            // Create a virtual element for positioning that accounts for scroll
            const getReferenceClientRect = () => {
                 const rect = props.clientRect();
                 return rect;
            };

            popup = tippy('body', {
                getReferenceClientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
                theme: 'light',
                zIndex: 9999, // Ensure it's above everything
            });
        },
        onUpdate: (props: any) => {
            component?.updateProps(props);

            if (!props.clientRect) {
                return;
            }

            popup?.[0]?.setProps({
                getReferenceClientRect: props.clientRect,
            });
        },
        onKeyDown: (props: any) => {
            if (props.event.key === 'Escape') {
                popup?.[0]?.hide();
                return true;
            }
            if (props.event.key === 'Enter') {
                return (component?.ref as any)?.onKeyDown(props) || false;
            }
            return (component?.ref as any)?.onKeyDown?.(props) || false;
        },
        onExit: () => {
            popup?.[0]?.destroy();
            component?.destroy();
        },
    };
};

export const SlashCommand = Extension.create({
    name: 'slashCommand',

    addOptions() {
        return {
            suggestion: {
                char: '/',
                command: ({ editor, range, props }: any) => {
                    props.command({ editor, range });
                },
            },
        };
    },

    addProseMirrorPlugins() {
        return [
            Suggestion({
                editor: this.editor,
                ...this.options.suggestion,
            }),
        ];
    },
});

export const slashCommandSuggestion = {
    items: getSuggestionItems,
    render: renderItems,
};
