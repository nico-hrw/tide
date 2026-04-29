"use client";

import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { mergeAttributes } from '@tiptap/core';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Bold as TiptapBold } from '@tiptap/extension-bold';
import { Strike as TiptapStrike } from '@tiptap/extension-strike';
import { Italic as TiptapItalic } from '@tiptap/extension-italic';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { Highlight } from './extensions/Highlight';
import { useEffect, useState, useRef } from 'react';
import { Highlighter, Type, Sigma, Eraser, Bold, Italic, Underline as UnderlineIcon, PinIcon, Link2, Table as TableIcon, ArrowUpToLine, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, Trash2, Bookmark, Clock } from 'lucide-react';
import { FontSize } from './extensions/FontSize';
import { MathBlock, InlineMath } from './extensions/MathBlock';
import { ResizableImage } from './extensions/ResizableImage';

import { InlineCommentNode } from './extensions/InlineCommentNode';
import Mention from '@tiptap/extension-mention';
import mentionSuggestion from './extensions/mentionSuggestion';
import { BlockId } from './extensions/BlockId';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import ListItem from '@tiptap/extension-list-item';
import { Anchor } from './extensions/Anchor';
import { useHighlight, LinkTarget } from './HighlightContext';
import { useDataStore } from '@/store/useDataStore';
import BackupHistory from './BackupHistory';
import { useLinkStore } from '@/store/useLinkStore';
import { useReferenceStore } from '@/store/useReferenceStore';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { SlashCommand, slashCommandSuggestion } from './extensions/SlashCommand';
import { DateMentionExtension } from './extensions/DateMentionExtension';
import { TaskMentionExtension } from './extensions/TaskMentionExtension';
import { CalendarEventMentionExtension } from './extensions/CalendarEventMentionExtension';
import { ReferenceMark } from './extensions/ReferenceMark';
import { ReferenceScannerMode, ReferenceAutopilotMode } from './extensions/ReferenceModes';
import { useMemo } from 'react';
import { extractTimeFromText } from '@/lib/timeParser';

// Module-level store for a pending magic link insertion.
// This survives editor unmount/remount (e.g., switching to Calendar tab and back).
let pendingLink: { target: LinkTarget; from: number } | null = null;

const TableActionItem = ({ icon, label, onClick, isDanger = false }: { icon: React.ReactNode, label: string, onClick: () => void, isDanger?: boolean }) => (
    <button
        onClick={() => { onClick(); }}
        className={`flex items-center gap-2 px-3 py-2 text-xs font-medium w-full text-left rounded-lg transition-colors ${isDanger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
    >
        {icon}
        <span>{label}</span>
    </button>
);

const MentionNodeView = ({ node }: any) => {
    const id = node.attrs.id || '';
    const label = node.attrs.label || 'Unknown';
    const isGhost = node.attrs.isGhost === true || node.attrs.isGhost === 'true' || String(id).startsWith('ghost-');

    // Dynamically look up live title
    const liveFile = useDataStore((s) => s.notes.find(f => f.id === id) || s.events.find(e => e.id === id)) as any;
    const title = liveFile?.title || label;
    const type = node.attrs.type || 'note';
    const start = node.attrs.start;
    const isCompleted = liveFile?.is_completed || false;

    // Moderate rounding (not full-pill), inherit font size, tight horizontal padding
    const baseClass = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium cursor-pointer transition-colors leading-snug align-middle border';

    let colorClass = '';
    let styleObj: any = {
        cursor: 'pointer',
        fontSize: 'inherit',
        border: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
    };

    if (isGhost) {
        colorClass = 'bg-gray-100 text-gray-500 hover:bg-gray-200 border-gray-200';
    } else if (type === 'event') {
        if (liveFile?.color) {
            styleObj = {
                ...styleObj,
                backgroundColor: "rgba(98, 54, 255, 0.14)",
                color: "#7C3AED"
            };
        } else {
            colorClass = 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/40';
        }
    } else {
        colorClass = 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/40';
    }

    return (
        <NodeViewWrapper
            as="span"
            className={`${baseClass} ${colorClass}`}
            data-type="mention"
            data-id={id}
            data-label={label}
            data-is-ghost={isGhost ? 'true' : 'false'}
            onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('editor:mention-click', { detail: { id, title, type, start } }));
            }}
            style={styleObj}
        >
            {type === 'event' && liveFile?.is_task && (
                <input
                    type="checkbox"
                    checked={isCompleted}
                    onChange={(e) => {
                        e.stopPropagation();
                        window.dispatchEvent(new CustomEvent('event-task:toggle', { detail: { id, is_completed: !isCompleted } }));
                    }}
                    className="w-3.5 h-3.5 rounded-sm cursor-pointer border-blue-300 dark:border-blue-600 focus:ring-0 m-0"
                    style={liveFile?.color ? { accentColor: liveFile.color, marginTop: '-1px' } : { marginTop: '-1px' }}
                />
            )}
            <span className={type === 'event' && liveFile?.is_task && isCompleted ? 'line-through opacity-60' : ''}>
                @{title}
            </span>
        </NodeViewWrapper>
    );
};


interface EditorProps {
    initialContent: any; // JSON
    editable?: boolean;
    onChange?: (content: any) => void;
    onLinkClick?: (target: LinkTarget) => void;
    onForceSave?: (content: any) => void;
    /** Called when the user pops selected text out to the canvas layer */
    onPopOut?: (text: string, anchorBlockId: string) => void;
    /** Called by the BlockId plugin when blocks are deleted (for anchor recovery) */
    onBlocksDeleted?: (ids: string[]) => void;
    /** Called when user wants to connect an image to the selection; passes the block ID */
    onConnectImage?: (blockId: string) => void;
    onEditorReady?: (editor: any) => void;
    onBlockHover?: (id: string | null) => void;
    onAbortLinking?: () => void;
    activeTabId?: string;
    onReturnToTab?: (tabId: string) => void;
    onFileClick?: (id: string, title?: string) => void;
    onEventClick?: (id: string) => void;
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#ffffff', '#000000'];

const PLACELHODER_QUOTES = [
    "Das Geheimnis des Könnens liegt im Wollen.",
    "Jeder Tag ist eine neue Chance.",
    "Machen ist wie Wollen, nur krasser.",
    "Wer immer tut, was er schon kann, bleibt immer das, was er schon ist.",
    "Der Weg ist das Ziel.",
    "In der Ruhe liegt die Kraft.",
    "Nichts ist so beständig wie der Wandel."
];

export default function Editor({ initialContent, editable = true, onChange, onLinkClick, onForceSave, onPopOut, onBlocksDeleted, onConnectImage, onEditorReady, onBlockHover, onAbortLinking, activeTabId, onReturnToTab, onFileClick, onEventClick }: EditorProps) {
    const { highlight, startLinkSelection, cancelLinkSelection } = useHighlight();
    const [showBackups, setShowBackups] = useState(false);

    const onChangeRef = useRef(onChange);
    const onLinkClickRef = useRef(onLinkClick);
    const onFileClickRef = useRef(onFileClick);

    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
        onLinkClickRef.current = onLinkClick;
    }, [onLinkClick]);

    useEffect(() => {
        onFileClickRef.current = onFileClick;
    }, [onFileClick]);

    const isSelectingLinkRef = useRef(highlight.isSelectingLink);
    useEffect(() => {
        isSelectingLinkRef.current = highlight.isSelectingLink;
    }, [highlight.isSelectingLink]);

    const onEventClickRef = useRef(onEventClick);
    useEffect(() => {
        onEventClickRef.current = onEventClick;
    }, [onEventClick]);

    const onBlocksDeletedRef = useRef(onBlocksDeleted);
    useEffect(() => { onBlocksDeletedRef.current = onBlocksDeleted; }, [onBlocksDeleted]);

    const activeTabIdRef = useRef(activeTabId);
    useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);

    // Track the block ID at the cursor ($head = visual cursor position, not selection start)
    // Updated on every selection change so the Connect button always gets the right block.
    const currentBlockIdRef = useRef<string | null>(null);
    const referencePreviewTimerRef = useRef<NodeJS.Timeout | null>(null);

    const enabledExtensions = useDataStore((s) => s.enabledExtensions);
    const autoScanEnabled = useReferenceStore((s) => s.autoScanEnabled);

    const extensions = useMemo(() => {
        const baseExtensions = [
            StarterKit.configure({
            italic: false,
            bold: false,
            strike: false,
        }),
        TaskList.configure({ HTMLAttributes: { class: 'not-prose pl-0' } }),
        TaskItem.configure({ nested: true }),
        SlashCommand.configure({ suggestion: slashCommandSuggestion }),
        TiptapItalic.extend({
            addInputRules() { return []; },
            addPasteRules() { return []; },
        }).configure({
            HTMLAttributes: { class: 'italic' },
        }),
        TiptapBold.extend({
            addInputRules() { return []; },
            addPasteRules() { return []; },
        }).configure({
            HTMLAttributes: { class: 'font-bold' },
        }),
        TiptapStrike.extend({
            addInputRules() { return []; },
            addPasteRules() { return []; },
        }).configure({
            HTMLAttributes: { class: 'line-through' },
        }),
        // Underline (Already included in StarterKit v3.20.0),
        TextStyle,
        Color,
        Highlight.configure({
            multicolor: true,
        }),
        FontSize,
        Mention.extend({
            addAttributes() {
                return {
                    id: {
                        default: null,
                        parseHTML: element => element.getAttribute('data-id'),
                    },
                    label: {
                        default: null,
                        parseHTML: element => element.getAttribute('data-label') || element.innerText.replace(/^@/, ''),
                    },
                    isGhost: {
                        default: false,
                        parseHTML: element => element.getAttribute('data-is-ghost') === 'true',
                    },
                    type: {
                        default: 'note',
                        parseHTML: element => element.getAttribute('data-type-link') || 'note',
                    },
                    start: {
                        default: null,
                        parseHTML: element => element.getAttribute('data-start'),
                    }
                };
            },
            parseHTML() {
                return [
                    { tag: 'mark[data-type="mention"]' },
                    { tag: 'mark.mention' },
                    { tag: 'span[data-type="mention"]' }
                ];
            },
            renderHTML({ node, HTMLAttributes }) {
                const id = node.attrs.id || '';
                const label = node.attrs.label || 'Unknown';
                const isGhost = node.attrs.isGhost === true || node.attrs.isGhost === 'true' || String(id).startsWith('ghost-');
                const type = node.attrs.type || 'note';
                const start = node.attrs.start;

                const baseClass = 'px-1.5 py-0.5 rounded-md font-medium cursor-pointer mention transition-colors';
                const colorClass = isGhost ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' :
                    (type === 'event' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-purple-100 text-purple-700 hover:bg-purple-200');

                return [
                    'mark',
                    mergeAttributes(HTMLAttributes, {
                        'data-type': 'mention',
                        'data-id': id,
                        'data-label': label,
                        'data-is-ghost': isGhost ? 'true' : 'false',
                        'data-type-link': type,
                        'data-start': start,
                        class: `${baseClass} ${colorClass}`
                    }),
                    `@${label}`
                ];
            },
            addNodeView() {
                return ReactNodeViewRenderer(MentionNodeView);
            }
        }).configure({
            suggestion: {
                ...mentionSuggestion,
                allowSpaces: true,
            },
        }),
        InlineCommentNode,
        MathBlock,
        InlineMath,

        BlockId.configure({
            onBlocksDeleted: (ids) => onBlocksDeletedRef.current?.(ids),
        }),
        Anchor,
        DateMentionExtension,
        TaskMentionExtension,
        CalendarEventMentionExtension,
        ResizableImage,
        Table.configure({
            resizable: true,
        }),
        TableRow,
        TableHeader,
        TableCell,
            Placeholder.configure({
                placeholder: () => {
                    return PLACELHODER_QUOTES[Math.floor(Math.random() * PLACELHODER_QUOTES.length)];
                },
            }),
            ReferenceMark, // ALWAYS added so documents don't crash and marks parse correctly
        ];

        // Add optional Reference modes
        if (enabledExtensions.includes('references')) {
            baseExtensions.push(ReferenceScannerMode);

            if (autoScanEnabled) {
                baseExtensions.push(ReferenceAutopilotMode);
            }
        }

        return baseExtensions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabledExtensions, autoScanEnabled]); // Only re-create extensions if the enabled set changes

    const editor = useEditor({
        extensions: extensions,
        content: initialContent,
        editable: editable,
        immediatelyRender: false,
        onUpdate: ({ editor, transaction }) => {
            // Skip transactions that only update decorations (e.g. autopilot reference scan).
            // These don't change the document content and should NOT trigger a save or reset the save timer.
            if (!transaction.docChanged) return;

            const content = editor.getJSON();
            if (onChangeRef.current) {
                onChangeRef.current(content);
            }

            // Feature: Dynamically update reference previews (the 'next line')
            if (enabledExtensions.includes('references')) {
                if (referencePreviewTimerRef.current) clearTimeout(referencePreviewTimerRef.current);
                referencePreviewTimerRef.current = setTimeout(() => {
                    const activeId = activeTabIdRef.current;
                    if (!activeId || activeId.startsWith('chat-') || activeId === 'calendar') return;
                    
                    const store = useReferenceStore.getState();
                    const myRefs = store.references.filter(r => r.sourceNoteId === activeId);
                    if (myRefs.length === 0) return;

                    let changed = false;
                    const newRefs = [...store.references];

                    // Get all block-level text content from document
                    const blocks: string[] = [];
                    editor.state.doc.forEach((node) => {
                        if (node.textContent.trim()) {
                            blocks.push(node.textContent.trim());
                        }
                    });

                    newRefs.forEach((r, idx) => {
                        if (r.sourceNoteId !== activeId) return;
                        
                        // Note: We use the *first* block containing the exact term as the definition location.
                        for (let i = 0; i < blocks.length; i++) {
                            if (blocks[i].includes(r.term)) {
                                // "Darauffolgende Zeile" -> next non-empty block
                                let nextBlockStr = blocks[i]; // Fallback to current line if it's the last line
                                for (let j = i + 1; j < blocks.length; j++) {
                                    if (blocks[j]) {
                                        nextBlockStr = blocks[j];
                                        break;
                                    }
                                }
                                // Only update if it actually changed
                                if (newRefs[idx].previewText !== nextBlockStr && nextBlockStr) {
                                    newRefs[idx] = { ...r, previewText: nextBlockStr };
                                    changed = true;
                                }
                                break; // Stop after first match for this term
                            }
                        }
                    });

                    if (changed) {
                        console.log("[References] Auto-updated previews for", myRefs.length, "references based on document updates.");
                        store.setReferences(newRefs);
                    }
                }, 2000);
            }

            // Local Fallback: Synchronous save to localStorage every time the editor content updates
            try {
                const currentId = activeTabIdRef.current;
                if (currentId && !currentId.startsWith('chat-') && currentId !== 'calendar' && currentId !== 'messages') {
                    localStorage.setItem(`tide_backup_${currentId}`, JSON.stringify(content));
                }
            } catch (e) {
                console.warn("[BACKUP] Local storage fallback failed:", e);
            }
        },
        editorProps: {
            attributes: {
                class: 'prose max-w-none w-full focus:outline-none min-h-[500px] pb-32 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mt-1 [&_ul[data-type="taskList"]]:list-none [&_ul[data-type="taskList"]]:pl-0 [&_li[data-type="taskItem"]]:flex [&_li[data-type="taskItem"]]:items-start [&_li[data-type="taskItem"]>label]:mr-2 [&_li[data-type="taskItem"]>label]:mt-1 [&_li[data-type="taskItem"]>div]:mt-[2px] [&_table]:border-collapse [&_table]:table-fixed [&_table]:w-full [&_table]:my-4 [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_td]:relative [&_td]:min-w-[100px] [&_th]:border [&_th]:border-gray-300 [&_th]:p-2 [&_th]:bg-gray-50 [&_th]:relative [&_th]:min-w-[100px] [&_th]:font-semibold [&_.column-resize-handle]:absolute [&_.column-resize-handle]:-right-1.5 [&_.column-resize-handle]:top-0 [&_.column-resize-handle]:bottom-[calc(-1px)] [&_.column-resize-handle]:w-3 [&_.column-resize-handle]:bg-blue-500/20 [&_.column-resize-handle]:cursor-col-resize hover:[&_.column-resize-handle]:bg-blue-500',
            },
            handleClick: (view, pos, event) => {
                const target = event.target as HTMLElement;
                const mentionNode = target.closest('.mention');
                if (mentionNode) {
                    event.preventDefault(); // Prevent default URL navigation
                    const targetId = mentionNode.getAttribute('data-id');
                    const type = mentionNode.getAttribute('data-type-link');
                    const start = mentionNode.getAttribute('data-start');

                    if (targetId) {
                        if (type === 'event') {
                            if (onEventClick) {
                                onEventClick(targetId);
                            }
                            // Custom event for calendar scrolling
                            window.dispatchEvent(new CustomEvent('calendar:scroll-to', {
                                detail: { id: targetId, start }
                            }));
                            return true;
                        }

                        const state = useDataStore.getState();
                        const realFile = state.notes?.find((f: any) => f.id === targetId);

                        if (!realFile) {
                            console.warn("File deleted or not found");
                            // Intercept the click, do not navigate
                            return true;
                        }

                        // Trigger the callback which switches tabs in page.tsx
                        if (onLinkClickRef.current) {
                            const label = realFile.title || mentionNode.textContent?.replace(/^@/, '') || '';
                            onLinkClickRef.current({ id: targetId, type: 'file', title: label });
                        }

                        // Explicitly call the store to ensure tab recovery
                        useDataStore.getState().setActiveNoteId(targetId);

                        return true; // Stop propagation, handle click
                    }
                }

                // Generic Link Intercept (Task 3 complete coverage)
                const linkNode = target.closest('a');
                if (linkNode) {
                    event.preventDefault();
                    // Let default window.open handle it or let Tiptap handle it but don't navigate SPA
                    const href = linkNode.getAttribute('href');
                    if (href) {
                        window.open(href, '_blank', 'noopener,noreferrer');
                        return true;
                    }
                }

                return false;
            },
            handleDrop: (view, event, slice, moved) => {
                // [FEATURE] Calendar Event → Note drag
                const calEventData = event.dataTransfer?.getData('tide/calendar-event');
                if (calEventData) {
                    try {
                        const evData = JSON.parse(calEventData);
                        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
                        const insertPos = coords ? coords.pos : view.state.doc.content.size;
                        view.dispatch(view.state.tr.insert(insertPos, view.state.schema.nodes.calendarEvent.create({
                            eventId: evData.id,
                        })));
                        event.preventDefault();
                        return true;
                    } catch (e) {
                        console.warn('[CalendarEventDrop] Failed to parse event data', e);
                    }
                }

                if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
                    return true; // Inform Tiptap we handled it
                }
                return false;
            },
            handleDOMEvents: {
                dragover: (view, event) => {
                    const e = event as DragEvent;
                    if (e.dataTransfer?.types.includes('tide/calendar-event')) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                        return true;
                    }
                    return false;
                }
            },
            handlePaste: (view, event) => {
                const isFile = event.clipboardData?.files?.length ?? 0 > 0;
                const isImage = Array.from(event.clipboardData?.items || []).some(item => item.type.startsWith('image/'));
                if (isFile || isImage) {
                    return true; // Inform Tiptap we handled it
                }
                return false;
            }
        },
    });





    useEffect(() => {
        if (!editor) return;

        const handleResizeImage = (e: CustomEvent) => {
            const { src, width, height } = e.detail;
            editor.view.state.doc.descendants((node, pos) => {
                if (node.type.name === 'image' && node.attrs.src === src) {
                    editor.chain().setNodeSelection(pos).updateAttributes('image', { width, height }).run();
                }
            });
        };
        window.addEventListener('canvas:resize-tiptap-image', handleResizeImage as EventListener);

        const handleMentionClick = (e: CustomEvent) => {
            const { id, title, type, start } = e.detail;

            if (type === 'event') {
                if (onEventClickRef.current) onEventClickRef.current(id);
                if (onLinkClickRef.current) onLinkClickRef.current({ id, type: 'event', title });
                window.dispatchEvent(new CustomEvent('calendar:scroll-to', { detail: { id, start } }));
                return;
            }

            if (onLinkClickRef.current) {
                onLinkClickRef.current({ id, type: 'file', title });
            }
            useDataStore.getState().setActiveNoteId(id);
        };
        window.addEventListener('editor:mention-click', handleMentionClick as EventListener);

        // [FEATURE] Calendar Event pill click → open event popover
        const handleCalEventMentionClick = (e: CustomEvent) => {
            const { eventId, title, start } = e.detail;
            if (onEventClickRef.current) onEventClickRef.current(eventId);
            window.dispatchEvent(new CustomEvent('calendar:scroll-to', { detail: { id: eventId, start } }));
        };
        window.addEventListener('calendarEventMention:click', handleCalEventMentionClick as EventListener);

        if (onEditorReady) onEditorReady(editor);

        // Cross-tab pendingLink: if the user typed --, switched to Calendar, clicked an event,
        // and was returned here — flush the pending link using the FRESH editor instance.
        const stored = useLinkStore.getState().pendingLink;
        let timer: any = null;
        if (stored) {
            useLinkStore.getState().clearPendingLink();
            timer = setTimeout(() => {
                if (!editor || editor.isDestroyed) return;
                const insertPos = editor.state.selection.from;
                editor.chain()
                    .focus()
                    .insertContentAt(insertPos, {
                        type: 'mention',
                        attrs: { id: stored.targetId, label: stored.title }
                    })
                    .insertContentAt(insertPos + 1, ' ')
                    .run();

                if (stored.range && stored.range.from > 0) {
                    try { editor.commands.deleteRange(stored.range); } catch (e) { }
                }

                editor.view.dispatch(editor.state.tr);
                if (onForceSave) onForceSave(editor.getJSON());
                console.log('[Mention] Cross-tab pendingLink flushed on mount at pos:', insertPos);
            }, 50);
        }
        return () => {
            window.removeEventListener('canvas:resize-tiptap-image', handleResizeImage as EventListener);
            window.removeEventListener('editor:mention-click', handleMentionClick as EventListener);
            window.removeEventListener('calendarEventMention:click', handleCalEventMentionClick as EventListener);
            if (timer) clearTimeout(timer);
        };
    }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

    // Pin System Hover Delegation
    useEffect(() => {
        if (!editor?.view.dom || !onBlockHover) return;
        const dom = editor.view.dom;
        const handleMouseMove = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const block = target.closest('[data-block-id]');
            const id = block?.getAttribute('data-block-id') || null;
            onBlockHover(id);
        };
        const handleMouseLeave = () => onBlockHover(null);

        dom.addEventListener('mousemove', handleMouseMove);
        dom.addEventListener('mouseleave', handleMouseLeave);
        return () => {
            dom.removeEventListener('mousemove', handleMouseMove);
            dom.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, [editor, onBlockHover]);

    const [showColorPicker, setShowColorPicker] = useState<'text' | 'highlight' | null>(null);
    const [fontSizeInput, setFontSizeInput] = useState<string>("");

    // Update the font size input field when selection changes
    useEffect(() => {
        if (editor) {
            const handleSelectionUpdate = () => {
                const size = editor.getAttributes('textStyle').fontSize;
                if (size) {
                    setFontSizeInput(size.replace('px', ''));
                } else {
                    setFontSizeInput("");
                }
            };
            editor.on('selectionUpdate', handleSelectionUpdate);
            editor.on('transaction', handleSelectionUpdate);
            return () => {
                editor.off('selectionUpdate', handleSelectionUpdate);
                editor.off('transaction', handleSelectionUpdate);
            }
        }
    }, [editor]);

    // Track block ID at cursor ($to = the end of the selection, visually where the cursor is)
    useEffect(() => {
        if (!editor) return;
        const updateBlock = () => {
            try {
                // Use ProseMirror native selection to find the containing block
                const { $to } = editor.state.selection;
                let foundId = null;
                // Walk up from current position to find the first node with a blockId attribute
                for (let d = $to.depth; d >= 0; d--) {
                    const node = $to.node(d);
                    if (node.attrs?.blockId) {
                        foundId = node.attrs.blockId as string;
                        break;
                    }
                }
                currentBlockIdRef.current = foundId;
            } catch { currentBlockIdRef.current = null; }
        };
        editor.on('selectionUpdate', updateBlock);
        editor.on('transaction', updateBlock);
        return () => { editor.off('selectionUpdate', updateBlock); editor.off('transaction', updateBlock); };
    }, [editor]);

    const [tableMenuData, setTableMenuData] = useState<{ x: number, y: number } | null>(null);

    // Close context menu on any click
    useEffect(() => {
        const handleGlobalClick = () => setTableMenuData(null);
        window.addEventListener('click', handleGlobalClick);
        return () => window.removeEventListener('click', handleGlobalClick);
    }, []);

    if (!editor) {
        return null;
    }

    return (
        <div className="editor-container w-full relative">
            {editor && (
                <BubbleMenu
                    editor={editor}
                    className="flex bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 rounded-xl overflow-visible p-1 gap-1 items-center"
                >
                    <button
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={`p-1.5 rounded-lg transition-colors ${editor.isActive('bold') ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                        title="Bold"
                    >
                        <Bold size={16} />
                    </button>
                    <button
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={`p-1.5 rounded-lg transition-colors ${editor.isActive('italic') ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                        title="Italic"
                    >
                        <Italic size={16} />
                    </button>
                    <button
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        className={`p-1.5 rounded-lg transition-colors ${editor.isActive('underline') ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                        title="Underline"
                    >
                        <UnderlineIcon size={16} />
                    </button>

                    {/* Clear Formatting */}
                    <button
                        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors flex items-center justify-center"
                        title="Clear Formatting"
                        onMouseDown={(e) => e.preventDefault()}
                    >
                        <Eraser size={16} />
                    </button>

                    <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

                    {/* Font Size */}
                    <input
                        type="number"
                        min="8"
                        max="72"
                        className="w-12 px-1 text-center bg-transparent border border-gray-200 dark:border-gray-700 rounded-md text-sm outline-none dark:text-white"
                        placeholder="16"
                        value={fontSizeInput}
                        onChange={(e) => setFontSizeInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (fontSizeInput) {
                                    editor.chain().setFontSize(`${fontSizeInput}px`).run();
                                } else {
                                    editor.chain().unsetFontSize().run();
                                }
                            }
                        }}
                        onBlur={() => {
                            if (fontSizeInput) {
                                editor.chain().setFontSize(`${fontSizeInput}px`).run();
                            } else {
                                editor.chain().unsetFontSize().run();
                            }
                        }}
                    />
                    <span className="text-xs text-gray-400 pr-1">px</span>

                    <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

                    {/* Text Color */}
                    <div className="relative">
                        <button
                            onClick={() => setShowColorPicker(showColorPicker === 'text' ? null : 'text')}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-center text-gray-700 dark:text-gray-300"
                            title="Text Color"
                        >
                            <Type size={16} />
                        </button>
                        {showColorPicker === 'text' && (
                            <div className="absolute top-full mt-2 left-0 bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 rounded-xl p-2 flex gap-1 z-50">
                                {COLORS.map(c => (
                                    <button
                                        key={c}
                                        onClick={() => {
                                            editor.chain().focus().setColor(c).run();
                                            setShowColorPicker(null);
                                        }}
                                        className="w-6 h-6 rounded-full border border-black/10 dark:border-white/10"
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

                    {/* Highlight Color */}
                    <div className="relative">
                        <button
                            onClick={() => setShowColorPicker(showColorPicker === 'highlight' ? null : 'highlight')}
                            className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${editor.isActive('highlight') ? 'bg-yellow-100 text-yellow-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                            title="Highlight"
                        >
                            <Highlighter size={16} />
                        </button>
                        {showColorPicker === 'highlight' && (
                            <div className="absolute top-full mt-2 left-0 bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 rounded-xl p-2 flex gap-1 z-50">
                                {COLORS.map(c => (
                                    <button
                                        key={c}
                                        onClick={() => {
                                            editor.chain().focus().setHighlight({ color: c }).run();
                                            setShowColorPicker(null);
                                        }}
                                        className="w-6 h-6 rounded-full border border-black/10 dark:border-white/10"
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

                    {/* Insert Math Button – icon only */}
                    <button
                        onClick={() => editor.chain().focus().insertContent('<math-block></math-block>').run()}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                        title="Insert Math/KaTeX equation"
                        onMouseDown={(e) => e.preventDefault()}
                    >
                        <Sigma size={16} />
                    </button>

                    {onPopOut && (
                        <>
                            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
                            {/* Save as Reference Button */}
                            {enabledExtensions.includes('references') && (
                            <>
                                <button
                                    title="Als Referenz speichern"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={(e) => {
                                        const { from, to, empty } = editor.state.selection;
                                        if (empty) return;
                                        const term = editor.state.doc.textBetween(from, to, ' ').trim();
                                        if (!term) return;

                                        const activeNoteId = useDataStore.getState().activeNoteId;
                                        const refId = crypto.randomUUID();
                                        
                                        // Calculate immediate preview layout: find the next block
                                        let previewText = term;
                                        const blocks: string[] = [];
                                        editor.state.doc.forEach((node) => {
                                            if (node.textContent.trim()) blocks.push(node.textContent.trim());
                                        });
                                        for (let i = 0; i < blocks.length; i++) {
                                            if (blocks[i].includes(term)) {
                                                for (let j = i + 1; j < blocks.length; j++) {
                                                    if (blocks[j]) {
                                                        previewText = blocks[j];
                                                        break;
                                                    }
                                                }
                                                break;
                                            }
                                        }

                                        console.log("[References] Saving new reference term:", term);
                                        useReferenceStore.getState().addReference({
                                            id: refId,
                                            term,
                                            previewText: previewText,
                                            sourceNoteId: activeNoteId || 'unknown',
                                        });

                                        // Give instant visual feedback on the button itself
                                        const btn = e.currentTarget;
                                        const originalClass = btn.className;
                                        btn.className = "p-1.5 rounded-lg transition-colors bg-emerald-500 text-white";
                                        setTimeout(() => {
                                            if (btn) btn.className = originalClass;
                                        }, 800);
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                                >
                                    <Bookmark size={14} />
                                </button>
                                <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
                            </>
                            )}

                            {/* Smart Island (Quick Capture) Button */}
                            {enabledExtensions.includes('smart_island') && (
                            <>
                                <button
                                    title="Quick Capture (Calendar)"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={(e) => {
                                        const { from, to, empty } = editor.state.selection;
                                        if (empty) return;
                                        const text = editor.state.doc.textBetween(from, to, ' ').trim();
                                        if (!text) return;

                                        const parsedData = extractTimeFromText(text);
                                        const btn = e.currentTarget;
                                        
                                        useDataStore.getState().setSmartIsland({
                                            show: true,
                                            text,
                                            parsedData,
                                            sourceNodePos: from,
                                            anchorElement: btn
                                        });
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/50 text-gray-700 dark:text-gray-300 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                                >
                                    <Clock size={14} />
                                </button>
                                <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
                            </>
                            )}

                            {/* Pop-out to canvas button */}
                            <button
                                title="Pop out to canvas"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    const { from, to, empty } = editor.state.selection;
                                    if (empty) return;
                                    const selectedText = editor.state.doc.textBetween(from, to, ' ');
                                    let anchorBlockId: string | null = null;
                                    editor.state.doc.nodesBetween(from, to, (node, pos) => {
                                        if (node.isBlock && node.attrs.blockId && !anchorBlockId) {
                                            anchorBlockId = node.attrs.blockId as string;
                                        }
                                    });
                                    if (selectedText && anchorBlockId) {
                                        const anchorId = crypto.randomUUID();
                                        editor.chain()
                                            .focus()
                                            .deleteSelection()
                                            .insertContent({
                                                type: 'anchor',
                                                attrs: { anchorId }
                                            })
                                            .run();
                                        onPopOut(selectedText, anchorId);
                                    }
                                }}
                                className="p-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                            >
                                <PinIcon size={14} />
                            </button>
                        </>
                    )}

                    {onConnectImage && (
                        <>
                            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
                            <button
                                title="Connect Image to this text block"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    // Use the pre-tracked block ID at $head (cursor position, not selection start)
                                    const blockId = currentBlockIdRef.current;
                                    if (blockId) onConnectImage(blockId);
                                }}
                                className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 text-gray-700 dark:text-gray-300 hover:text-[#000080] transition-colors"
                            >
                                <Link2 size={14} />
                            </button>
                        </>
                    )}
                </BubbleMenu>
            )}

            <div
                onContextMenu={(e) => {
                    if (editor?.isActive('table')) {
                        e.preventDefault();
                        setTableMenuData({ x: e.clientX, y: e.clientY });
                    }
                }}
                onDragOver={(e) => e.preventDefault()}
            >
                <EditorContent editor={editor} />
            </div>

            {tableMenuData && (
                <div
                    className="fixed z-[9999] bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden p-1 flex flex-col min-w-[160px]"
                    style={{ top: tableMenuData.y, left: tableMenuData.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <TableActionItem
                        icon={<ArrowLeftToLine size={14} />}
                        label="Add Column Before"
                        onClick={() => editor.chain().focus().addColumnBefore().run()}
                    />
                    <TableActionItem
                        icon={<ArrowRightToLine size={14} />}
                        label="Add Column After"
                        onClick={() => editor.chain().focus().addColumnAfter().run()}
                    />
                    <TableActionItem
                        icon={<Trash2 size={14} className="rotate-90" />}
                        label="Delete Column"
                        onClick={() => editor.chain().focus().deleteColumn().run()}
                        isDanger
                    />
                    <div className="h-px bg-gray-100 dark:bg-gray-700 my-1 mx-1" />
                    <TableActionItem
                        icon={<ArrowUpToLine size={14} />}
                        label="Add Row Before"
                        onClick={() => editor.chain().focus().addRowBefore().run()}
                    />
                    <TableActionItem
                        icon={<ArrowDownToLine size={14} />}
                        label="Add Row After"
                        onClick={() => editor.chain().focus().addRowAfter().run()}
                    />
                    <TableActionItem
                        icon={<Trash2 size={14} />}
                        label="Delete Row"
                        onClick={() => editor.chain().focus().deleteRow().run()}
                        isDanger
                    />
                    <div className="h-px bg-gray-100 dark:bg-gray-700 my-1 mx-1" />
                    <TableActionItem
                        icon={<TableIcon size={14} />}
                        label="Delete Table"
                        onClick={() => editor.chain().focus().deleteTable().run()}
                        isDanger
                    />
                </div>
            )}
        </div>
    );
}
