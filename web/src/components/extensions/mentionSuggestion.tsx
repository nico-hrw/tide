import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import { useDataStore } from '@/store/useDataStore';
import { useLinkStore } from '@/store/useLinkStore';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

const MentionList = forwardRef((props: any, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = async (index: number) => {
        const item = props.items[index];
        if (item) {
            if (item.id === 'NEW') {
                const newId = useDataStore.getState().createNote(item.query);
                props.command({ id: newId, label: item.query });
            } else {
                props.command({ id: item.id, label: item.title || item.label });
            }
            // Clear pendingLinkSource on successful selection
            useLinkStore.getState().setPendingLinkSource(null);
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
        <div className="flex flex-col p-1 w-[250px] bg-white/90 dark:bg-black/90 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-2xl rounded-xl overflow-hidden text-sm z-[9999]">
            {props.items.length ? (
                props.items.map((item: any, index: number) => (
                    <button
                        className={`flex flex-col items-start px-2 py-1.5 text-left rounded-lg transition-colors ${index === selectedIndex ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5'}`}
                        key={index}
                        onClick={() => selectItem(index)}
                    >
                        <div className="font-medium">{item.label || item.title}</div>
                        {item.type && <div className="text-[10px] opacity-50 uppercase tracking-wider">{item.type}</div>}
                    </button>
                ))
            ) : (
                <div className="px-2 py-2 text-gray-500 text-xs">No results</div>
            )}
        </div>
    );
});

MentionList.displayName = 'MentionList';

export default {
    items: ({ query }: { query: string }) => {
        const state = useDataStore.getState();
        const files = state.notes || []; // App uses 'notes' for files

        // 1. Ghost Link Logic
        if (query.startsWith('!')) {
            const cleanQuery = query.substring(1);
            return [{ id: 'GHOST', label: cleanQuery, rawQuery: cleanQuery, isGhost: true }];
        }

        // 2. Strict Aggressive Filtering
        const filteredFiles = files.filter((f: any) => {
            if (!f || !f.title) return false;
            const titleLower = String(f.title).toLowerCase();

            // AGGRESSIVE BLOCKLIST:
            if (titleLower.includes('_style') || titleLower.includes('canva') || titleLower.startsWith('.')) {
                return false;
            }
            return true;
        });

        // 3. Search Matching
        const lowQuery = query.toLowerCase();
        const matched = filteredFiles.filter((f: any) => (f.title || f.id).toLowerCase().includes(lowQuery));

        // 4. Return formatted
        return [
            ...matched.map((f: any) => ({ id: f.id, label: f.title || f.id, isGhost: false })),
            { id: 'NEW', label: `Create File '${query}'`, rawQuery: query, isGhost: false }
        ].slice(0, 10);
    },

    command: ({ editor, range, props }: any) => {
        if (props.isGhost || props.id === 'GHOST') {
            editor.chain().focus().insertContentAt(range, {
                type: 'mention',
                attrs: { id: `ghost-${props.rawQuery}`, label: props.rawQuery, isGhost: true }
            }).run();
            return;
        } else if (props.id === 'NEW') {
            const newId = useDataStore.getState().createNote(props.rawQuery);
            editor.chain().focus().insertContentAt(range, {
                type: 'mention',
                attrs: { id: newId, label: props.rawQuery, isGhost: true }
            }).run();
        } else {
            editor.chain().focus().insertContentAt(range, {
                type: 'mention',
                attrs: { id: props.id, label: props.label, isGhost: false }
            }).run();
        }
    },

    render: () => {
        let component: ReactRenderer | null = null;
        let popup: any | null = null;

        return {
            onStart: (props: any) => {
                // TRIGGER VISUAL MODE INSTANTLY
                useLinkStore.getState().setPendingLinkSource(useDataStore.getState().activeNoteId);

                component = new ReactRenderer(MentionList, {
                    props,
                    editor: props.editor,
                });

                if (!props.clientRect) {
                    return;
                }

                popup = tippy('body', {
                    getReferenceClientRect: props.clientRect,
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'bottom-start',
                });
            },

            onUpdate(props: any) {
                component?.updateProps(props);

                if (!props.clientRect) {
                    return;
                }

                popup?.[0]?.setProps({
                    getReferenceClientRect: props.clientRect,
                });
            },

            onKeyDown(props: any) {
                if (props.event.key === 'Escape') {
                    useLinkStore.getState().setPendingLinkSource(null);
                    if (popup) popup[0].destroy();
                    return true;
                }

                return component?.ref?.onKeyDown(props);
            },

            onExit() {
                useLinkStore.getState().setPendingLinkSource(null);
                if (popup) {
                    popup[0].destroy();
                    popup = null;
                }
                component?.destroy();
                component = null;
            },
        };
    },
};
