import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import { useDataStore } from '@/store/useDataStore';
import { useLinkStore } from '@/store/useLinkStore';
import { forwardRef, useEffect, useImperativeHandle, useState, useRef } from 'react';
import { FileText, Calendar as CalendarIcon, CheckSquare, Plus, ChevronRight, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';

interface EventItem {
    id: string;
    title: string;
    label: string;
    type: 'event';
    start?: string;
    color: string;
    formattedDate: string;
    isGhost: boolean;
}

interface EventGroupItem {
    id: string;
    title: string;
    label: string;
    isGroup: true;
    count: number;
    events: EventItem[];
    color: string;
    type: 'event';
}

type MentionSuggestionItem =
    | EventItem
    | EventGroupItem
    | {
          id: string;
          label: string;
          title?: string;
          type?: string;
          query?: string;
          isGhost?: boolean;
          isGroup?: boolean;
          count?: number;
          start?: string;
          color?: string;
          formattedDate?: string;
          isCompleted?: boolean;
      };

const MentionList = forwardRef((props: any, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [activeGroup, setActiveGroup] = useState<EventGroupItem | null>(null);
    const prevGroupIndexRef = useRef(0);
    const isCreatingRef = useRef(false);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const currentList = activeGroup ? activeGroup.events : (props.items || []);

    useEffect(() => {
        setSelectedIndex(0);
        setActiveGroup(null);
        prevGroupIndexRef.current = 0;
    }, [props.items]);

    useEffect(() => {
        itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex, activeGroup]);

    const selectItem = async (item: MentionSuggestionItem, index?: number) => {
        if (!item) return;

        if ('isGroup' in item && item.isGroup) {
            prevGroupIndexRef.current = index !== undefined ? index : selectedIndex;
            setActiveGroup(item as EventGroupItem);
            setSelectedIndex(0);
            return;
        }

        if (item.id === 'NEW') {
            if (isCreatingRef.current) return;
            isCreatingRef.current = true;
            try {
                // Sanitize title - strip any leading ! prefix, explicitly using props.query
                const itemQuery = 'query' in item ? item.query : undefined;
                const cleanTitle = (props.query || itemQuery || item.label || 'Untitled')
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
                const itemQuery = 'query' in item ? item.query : undefined;
                const rawTitle = props.query || itemQuery || (item.label && !item.label.startsWith('Create ') ? item.label : '') || 'New Todo';
                const cleanTitle = rawTitle.replace(/^!+/, '').trim() || 'New Todo';
                const newId = await useDataStore.getState().addTask({ title: cleanTitle, isCompleted: false });
                props.command({ ...item, id: newId, label: cleanTitle, type: 'task', isGhost: false });
            } finally {
                isCreatingRef.current = false;
            }
        } else {
            const title = 'title' in item ? item.title : undefined;
            props.command({ ...item, label: title || item.label });
        }
        useLinkStore.getState().setPendingLinkSource(null);
    };

    useImperativeHandle(ref, () => ({
        handleEscape: () => {
            if (activeGroup) {
                setActiveGroup(null);
                setSelectedIndex(prevGroupIndexRef.current);
                return true;
            }
            return false;
        },
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (!currentList || currentList.length === 0) return false;

            if (event.key === 'ArrowUp') {
                setSelectedIndex((selectedIndex + currentList.length - 1) % currentList.length);
                return true;
            }
            if (event.key === 'ArrowDown') {
                setSelectedIndex((selectedIndex + 1) % currentList.length);
                return true;
            }
            if (event.key === 'ArrowRight') {
                if (!activeGroup) {
                    const item = currentList[selectedIndex];
                    if (item && 'isGroup' in item && item.isGroup) {
                        selectItem(item, selectedIndex);
                        return 'prevent_close';
                    }
                }
                return false;
            }
            if (event.key === 'ArrowLeft') {
                if (activeGroup) {
                    setActiveGroup(null);
                    setSelectedIndex(prevGroupIndexRef.current);
                    return true;
                }
                return false;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
                const item = currentList[selectedIndex];
                if (item) {
                    if ('isGroup' in item && item.isGroup) {
                        selectItem(item, selectedIndex);
                        return 'prevent_close';
                    }
                    selectItem(item);
                    return true;
                }
                return false;
            }
            return false;
        },
    }));

    return (
        <div className="flex flex-col p-1 w-[290px] max-h-[340px] overflow-y-auto bg-white/90 dark:bg-[#1a1a1a]/90 backdrop-blur-md border border-gray-200 dark:border-white/10 shadow-lg rounded-xl text-sm z-[9999]">
            {activeGroup ? (
                <>
                    <div className="p-1 border-b border-gray-100 dark:border-white/10 mb-1">
                        <button
                            type="button"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setActiveGroup(null);
                                setSelectedIndex(prevGroupIndexRef.current);
                            }}
                            className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium w-full px-1.5 py-1 rounded cursor-pointer"
                        >
                            <ArrowLeft size={13} />
                            <span className="truncate">Zurück zu allen Ergebnissen</span>
                        </button>
                        <div className="flex items-center gap-1.5 px-1.5 py-0.5 text-[11px] text-gray-500 dark:text-gray-400 font-semibold truncate">
                            <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: activeGroup.color || '#3b82f6' }}
                            />
                            <span className="truncate">{activeGroup.title} ({activeGroup.events.length})</span>
                        </div>
                    </div>
                    {activeGroup.events.length ? (
                        activeGroup.events.map((eventItem: EventItem, index: number) => (
                            <button
                                key={eventItem.id || index}
                                ref={(el) => { itemRefs.current[index] = el; }}
                                className={`flex items-center gap-2 px-2 py-1.5 text-left rounded-lg transition-colors w-full ${
                                    index === selectedIndex
                                        ? 'bg-black/5 dark:bg-white/10 text-black dark:text-white'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    selectItem(eventItem);
                                }}
                            >
                                <span
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: eventItem.color || '#3b82f6' }}
                                />
                                <div className="flex-1 font-medium text-xs truncate">
                                    {eventItem.formattedDate || 'Kein Datum'}
                                </div>
                                <CalendarIcon size={13} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                            </button>
                        ))
                    ) : (
                        <div className="px-2 py-2 text-gray-500 text-xs">Keine Termine</div>
                    )}
                </>
            ) : (
                <>
                    {props.items.length ? (
                        props.items.map((item: any, index: number) => (
                            <button
                                key={item.id || index}
                                ref={(el) => { itemRefs.current[index] = el; }}
                                className={`flex items-center gap-2 px-2 py-1.5 text-left rounded-lg transition-colors w-full ${
                                    index === selectedIndex
                                        ? 'bg-black/5 dark:bg-white/10 text-black dark:text-white'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    selectItem(item, index);
                                }}
                            >
                                {item.isGroup ? (
                                    <>
                                        <span
                                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: item.color || '#3b82f6' }}
                                        />
                                        <div className="flex items-center justify-between min-w-0 flex-1 gap-1.5">
                                            <span className="font-medium truncate">{item.title || item.label}</span>
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium flex-shrink-0">
                                                {item.count} Termine
                                            </span>
                                        </div>
                                        <ChevronRight size={15} className="text-gray-500 dark:text-gray-400 flex-shrink-0 ml-0.5" />
                                    </>
                                ) : item.type === 'event' ? (
                                    <>
                                        <span
                                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: item.color || '#3b82f6' }}
                                        />
                                        <div className="flex items-center justify-between min-w-0 flex-1 gap-1.5">
                                            <span className="font-medium truncate">{item.label || item.title}</span>
                                            {item.formattedDate && (
                                                <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0 font-normal">
                                                    {item.formattedDate}
                                                </span>
                                            )}
                                        </div>
                                        <CalendarIcon size={14} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                    </>
                                ) : item.type === 'task' ? (
                                    <>
                                        <CheckSquare size={14} className="text-blue-500 dark:text-blue-400 flex-shrink-0" />
                                        <div className="flex items-center justify-between min-w-0 flex-1 gap-1.5">
                                            <span className={`font-medium truncate ${item.isCompleted ? 'line-through text-gray-400 dark:text-gray-500' : ''}`}>
                                                <span className="text-xs text-gray-400 dark:text-gray-500 font-normal mr-1.5 no-underline">Todo:</span>
                                                {item.label || item.title}
                                            </span>
                                            {item.isCompleted && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 font-medium flex-shrink-0">
                                                    Erledigt
                                                </span>
                                            )}
                                        </div>
                                    </>
                                ) : item.id === 'NEW_TASK' ? (
                                    <>
                                        <CheckSquare size={14} className="text-blue-500 dark:text-blue-400 flex-shrink-0" />
                                        <div className="font-medium truncate flex-1">{item.label || item.title}</div>
                                        <Plus size={14} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                    </>
                                ) : (
                                    <>
                                        <div className="font-medium truncate flex-1">{item.label || item.title}</div>
                                        {item.type && (
                                            <div className="flex-shrink-0 text-gray-400 dark:text-gray-500">
                                                {item.type === 'note' && <FileText size={14} />}
                                                {item.type === 'action' && <Plus size={14} />}
                                            </div>
                                        )}
                                    </>
                                )}
                            </button>
                        ))
                    ) : (
                        <div className="px-2 py-2 text-gray-500 text-xs">No results</div>
                    )}
                </>
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

        // Format event date helper
        const formatEventDate = (startIso: string, allDay?: boolean) => {
            try {
                if (!startIso) return '';
                const d = new Date(startIso);
                if (isNaN(d.getTime())) return '';
                if (allDay) {
                    return format(d, 'dd.MM.yyyy');
                }
                return format(d, 'dd.MM.yyyy HH:mm');
            } catch {
                return '';
            }
        };

        // Sort matchedEvents descending by start date
        matchedEvents.sort((a: any, b: any) => {
            const timeA = a.start ? new Date(a.start).getTime() : 0;
            const timeB = b.start ? new Date(b.start).getTime() : 0;
            return timeB - timeA;
        });

        // OPTIMIZATION: Filter empty queries (recent notes, upcoming/recent events)
        if (!lowQuery) {
            matched = matched
                .sort((a: any, b: any) => (new Date(b.updated_at).getTime() || 0) - (new Date(a.updated_at).getTime() || 0))
                .slice(0, 4);
            const now = Date.now();
            const upcomingOrRecent = matchedEvents.filter((e: any) => {
                const t = e.start ? new Date(e.start).getTime() : 0;
                return t >= now - 86400000;
            });
            if (upcomingOrRecent.length > 0) {
                upcomingOrRecent.sort((a: any, b: any) => {
                    const timeA = a.start ? new Date(a.start).getTime() : 0;
                    const timeB = b.start ? new Date(b.start).getTime() : 0;
                    return timeA - timeB;
                });
                matchedEvents = upcomingOrRecent;
            }
        }

        // Group events by title
        const groupsMap = new Map<string, EventItem[]>();
        for (const e of matchedEvents) {
            const title = (e.title || 'Untitled').trim();
            if (!groupsMap.has(title)) {
                groupsMap.set(title, []);
            }
            groupsMap.get(title)!.push({
                id: e.id,
                title,
                label: title,
                type: 'event',
                start: e.start,
                color: e.color || '#3b82f6',
                formattedDate: formatEventDate(e.start, e.all_day || e.allDay),
                isGhost: false,
            });
        }

        // Sort events inside each group chronologically (earliest first)
        for (const groupList of groupsMap.values()) {
            groupList.sort((a, b) => {
                const timeA = a.start ? new Date(a.start).getTime() : 0;
                const timeB = b.start ? new Date(b.start).getTime() : 0;
                return timeA - timeB;
            });
        }

        const formattedEventItems: (EventItem | EventGroupItem)[] = [];
        for (const [title, groupList] of groupsMap.entries()) {
            if (groupList.length > 1) {
                formattedEventItems.push({
                    id: 'group-' + title,
                    title,
                    label: title,
                    isGroup: true,
                    count: groupList.length,
                    events: groupList,
                    color: groupList[0].color || '#3b82f6',
                    type: 'event',
                });
            } else {
                formattedEventItems.push(groupList[0]);
            }
        }

        const noteItems = matched
            .filter((f: any) => !taskIdSet.has(f.id))
            .slice(0, 5)
            .map((f: any) => ({ id: f.id, label: f.title || f.id, type: 'note', isGhost: false }));

        const eventItems = formattedEventItems.slice(0, 6);

        const taskItems = matchedTasks.slice(0, 3).map((t: any) => ({
            id: t.id,
            label: t.title || t.id,
            type: 'task',
            isGhost: false,
            isCompleted: !!t.isCompleted,
        }));

        // 5. Return formatted
        return [
            ...noteItems,
            ...eventItems,
            ...taskItems,
            { id: 'NEW', label: `Create File '${query}'`, query: query, type: 'action', isGhost: false },
            { id: 'NEW_TASK', label: `Create Todo '${query}'`, query: query, type: 'action', isGhost: false }
        ].slice(0, 10);
    },

    command: ({ editor, range, props }: any) => {
        useLinkStore.getState().setIsLinkingMode(false);
        useLinkStore.getState().setPendingLinkSource(null);
        if ((window as any).cancelLinkSelection) (window as any).cancelLinkSelection();

        if (props.isGroup) {
            return;
        }

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
                attrs: { id: props.id, label: props.label || props.query || 'New Todo' }
            }).run();
        } else if (props.type === 'event') {
            editor.chain().focus().deleteRange(range).insertContent({
                type: 'mention',
                attrs: { 
                    id: props.id, 
                    label: props.title || props.label, 
                    isGhost: false,
                    type: 'event',
                    start: props.start 
                }
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
                    if ((component?.ref as any)?.handleEscape?.()) {
                        return true;
                    }
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
                if (handled === true && (props.event.key === 'Enter' || props.event.key === 'Tab')) {
                    if (popup) {
                        popup[0].destroy();
                        popup = null;
                    }
                }
                return !!handled;
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
