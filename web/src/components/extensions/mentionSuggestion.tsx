import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import { useDataStore } from '@/store/useDataStore';
import { useLinkStore } from '@/store/useLinkStore';
import { forwardRef, useEffect, useImperativeHandle, useState, useRef } from 'react';
import { FileText, Calendar as CalendarIcon, CheckSquare, Plus } from 'lucide-react';

const MentionList = forwardRef((props: any, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const isCreatingRef = useRef(false);

    const selectItem = async (index: number) => {
        const item = props.items[index];
        if (!item) return;

        if (item.id === 'NEW') {
            if (isCreatingRef.current) return;
            isCreatingRef.current = true;
            try {
                // Sanitize title - strip any leading ! prefix, explicitly using props.query
                const cleanTitle = (props.query || item.query || item.label || 'Untitled')
                    .replace(/^!+/, '').trim() || 'Untitled';

                // We immediately get the UUID so Tiptap can insert the node.
                const newId = await useDataStore.getState().createNote(cleanTitle);

                // Insert as a real (non-ghost) link immediately with correct title.
                props.command({ ...item, id: newId, label: cleanTitle, isGhost: false });
            } finally {
                isCreatingRef.current = false;
            }
        } else if (item.id === 'NEW_TASK') {
            if (isCreatingRef.current) return;
            isCreatingRef.current = true;
            try {
                const cleanTitle = (props.query || item.query || item.label || 'New Task').replace(/^!+/, '').trim() || 'New Task';
                const newId = await useDataStore.getState().addTask({ title: cleanTitle, isCompleted: false });
                props.command({ ...item, id: newId, label: cleanTitle, type: 'task', isGhost: false });
            } finally {
                isCreatingRef.current = false;
            }
        } else {
            props.command({ ...item, label: item.title || item.label });
        }
        useLinkStore.getState().setPendingLinkSource(null);
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
        <div className="flex flex-col p-1 w-[250px] bg-white/90 dark:bg-[#1a1a1a]/90 backdrop-blur-md border border-gray-200 dark:border-white/10 shadow-lg rounded-xl overflow-hidden text-sm z-[9999]">
            {props.items.length ? (
                props.items.map((item: any, index: number) => (
                    <button
                        className={`flex items-center gap-2 px-2 py-1.5 text-left rounded-lg transition-colors ${index === selectedIndex ? 'bg-black/5 dark:bg-white/10 text-black dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'}`}
                        key={index}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            selectItem(index);
                        }}
                    >
                        <div className="font-medium truncate flex-1">{item.label || item.title}</div>
                        {(item.type) && (
                            <div className="flex-shrink-0 text-gray-400 dark:text-gray-500">
                                {item.type === 'note' && <FileText size={14} />}
                                {item.type === 'event' && <CalendarIcon size={14} />}
                                {item.type === 'task' && <CheckSquare size={14} />}
                                {item.type === 'action' && <Plus size={14} />}
                            </div>
                        )}
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
            return [{ id: 'GHOST', label: cleanQuery, query: cleanQuery, isGhost: true }];
        }

        // 2. Strict Aggressive Filtering
        const filteredFiles = files.filter((f: any) => {
            if (!f || !f.title) return false;
            if (f.isGroup || f.type === 'folder') return false; // Exclude folders and groups
            const titleLower = String(f.title).toLowerCase();

            // AGGRESSIVE BLOCKLIST:
            if (titleLower.includes('_style') || titleLower.includes('canva') || titleLower.startsWith('.')) {
                return false;
            }
            // [FIX] Exclude locked/ghost notes — these are corrupted, deleted, or still decrypting.
            // They would cause a 404 or decryption error when opened via mention link.
            if (f.isLocked || titleLower.startsWith('locked note')) return false;
            return true;
        });

        // 3. Search Matching
        const lowQuery = query.toLowerCase();
        let matched = filteredFiles.filter((f: any) => (f.title || f.id).toLowerCase().includes(lowQuery));
        
        // 4. Search Matching for Events
        const events = state.events || [];
        let matchedEvents = events.filter((e: any) => {
            if (!e || !e.title) return false;
            return e.title.toLowerCase().includes(lowQuery);
        });

        // 4.5 Search Matching for Tasks — only show UNSCHEDULED tasks here.
        const tasks = state.tasks || [];
        const matchedTasks = tasks.filter((t: any) => {
            if (!t || !t.title) return false;
            if (!t.title.toLowerCase().includes(lowQuery)) return false;
            if (t.scheduledDate) return false;
            return true;
        });

        const taskIdSet = new Set(tasks.map((t: any) => t.id));

        // OPTIMIZATION: Sort empty queries (recent notes, upcoming events)
        if (!lowQuery) {
            matched = matched.sort((a: any, b: any) => (new Date(b.updated_at).getTime() || 0) - (new Date(a.updated_at).getTime() || 0)).slice(0, 3);
            const now = Date.now();
            matchedEvents = matchedEvents
                .filter((e: any) => new Date(e.start).getTime() >= now - 86400000) // from today onwards
                .sort((a: any, b: any) => new Date(a.start).getTime() - new Date(b.start).getTime())
                .slice(0, 2);
        }

        // 5. Return formatted
        return [
            ...matched
                .filter((f: any) => !taskIdSet.has(f.id)) // exclude tasks from note results
                .map((f: any) => ({ id: f.id, label: f.title || f.id, type: 'note', isGhost: false })),
            ...matchedEvents.map((e: any) => ({ 
                id: e.id, 
                label: e.title || e.id, 
                type: 'event', 
                start: e.start,
                isGhost: false 
            })),
            ...matchedTasks.map((t: any) => ({
                id: t.id,
                label: t.title || t.id,
                type: 'task',
                isGhost: false
            })),
            { id: 'NEW', label: `Create File '${query}'`, query: query, type: 'action', isGhost: false },
            { id: 'NEW_TASK', label: `Create Task '${query}'`, query: query, type: 'action', isGhost: false }
        ].slice(0, 4);
    },

    command: ({ editor, range, props }: any) => {
        useLinkStore.getState().setIsLinkingMode(false);
        useLinkStore.getState().setPendingLinkSource(null);
        if ((window as any).cancelLinkSelection) (window as any).cancelLinkSelection();

        if (props.isGhost || props.id === 'GHOST') {
            editor.chain().focus().deleteRange(range).insertContent({
                type: 'mention',
                attrs: { id: `ghost-${props.query || props.label}`, label: props.label, isGhost: true }
            }).run();
            return;
        } else if (props.id === 'NEW') {
            const label = props.label || props.query || 'Untitled';
            editor.chain().focus().deleteRange(range).insertContent({
                type: 'mention',
                attrs: { id: props.id, label: label, isGhost: false }
            }).run();
        } else if (props.type === 'task' || props.id === 'NEW_TASK') {
            editor.chain().focus().deleteRange(range).insertContent({
                type: 'taskMention',
                attrs: { id: props.id, label: props.label || props.query || 'New Task' }
            }).run();
        } else {
            editor.chain().focus().deleteRange(range).insertContent({
                type: 'mention',
                attrs: { 
                    id: props.id, 
                    label: props.label, 
                    isGhost: false,
                    type: props.type,
                    start: props.start 
                }
            }).run();
        }
    },

    render: () => {
        let component: ReactRenderer | null = null;
        let popup: any | null = null;

        return {
            onStart: (props: any) => {
                // 1. Fetch all metadata for comprehensive discovery (Task 3)
                useDataStore.getState().loadAllMetadata().catch(console.error);

                // 2. TRIGGER VISUAL MODE INSTANTLY (Task 4)
                const startId = useDataStore.getState().activeNoteId;
                useLinkStore.getState().setPendingLinkSource(startId);
                useLinkStore.getState().setIsLinkingMode(true);

                // Start Visual Highlight with SVG line support
                const rect = props.clientRect?.();
                if (rect && (window as any).startLinkSelection) {
                    (window as any).startLinkSelection((target: any) => {
                        // User clicked something in Sidebar or Calendar
                        props.editor.chain().focus().deleteRange(props.range).insertContent({
                            type: 'mention',
                            attrs: { 
                                id: target.id, 
                                label: target.title || target.label, 
                                isGhost: false,
                                type: target.type,
                                start: target.start 
                            }
                        }).run();
                        useLinkStore.getState().setIsLinkingMode(false);
                    }, { x: rect.left, y: rect.top });
                }

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
                    theme: 'headless',
                });
                
                if (props.items && props.items.length > 0) {
                    const topItem = props.items[0];
                    const label = topItem.label || topItem.title || '';
                    const q = props.query || '';
                    if (q && label.toLowerCase().startsWith(q.toLowerCase())) {
                        document.documentElement.style.setProperty('--suggestion-remainder', `"${label.slice(q.length)}"`);
                    } else {
                        document.documentElement.style.setProperty('--suggestion-remainder', '""');
                    }
                } else {
                    document.documentElement.style.setProperty('--suggestion-remainder', '""');
                }
            },

            onUpdate(props: any) {
                component?.updateProps(props);

                if (!props.clientRect) {
                    return;
                }

                popup?.[0]?.setProps({
                    getReferenceClientRect: props.clientRect,
                });
                
                if (props.items && props.items.length > 0) {
                    const topItem = props.items[0];
                    const label = topItem.label || topItem.title || '';
                    const q = props.query || '';
                    if (q && label.toLowerCase().startsWith(q.toLowerCase())) {
                        document.documentElement.style.setProperty('--suggestion-remainder', `"${label.slice(q.length)}"`);
                    } else {
                        document.documentElement.style.setProperty('--suggestion-remainder', '""');
                    }
                } else {
                    document.documentElement.style.setProperty('--suggestion-remainder', '""');
                }
            },

            onKeyDown(props: any) {
                if (props.event.key === 'Escape') {
                    useLinkStore.getState().setPendingLinkSource(null);
                    useLinkStore.getState().setIsLinkingMode(false);
                    if ((window as any).cancelLinkSelection) (window as any).cancelLinkSelection();
                    if (popup) popup[0].destroy();
                    popup = null;
                    // Ensure focus returns to the editor
                    props.editor?.commands?.focus?.();
                    return true;
                }

                const handled = (component?.ref as any)?.onKeyDown(props);
                if (handled && props.event.key === 'Enter') {
                    if (popup) {
                      popup[0].destroy();
                      popup = null;
                    }
                }
                return handled;
            },

            onExit() {
                useLinkStore.getState().setPendingLinkSource(null);
                useLinkStore.getState().setIsLinkingMode(false);
                if ((window as any).cancelLinkSelection) (window as any).cancelLinkSelection();
                if (popup) {
                    popup[0].destroy();
                    popup = null;
                }
                component?.destroy();
                component = null;
                document.documentElement.style.setProperty('--suggestion-remainder', '""');
            },
        };
    },
};
