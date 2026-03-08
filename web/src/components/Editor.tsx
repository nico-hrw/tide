"use client";

import { useEditor, EditorContent } from '@tiptap/react';
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
import { Highlighter, Type, Sigma, Eraser, Bold, Italic, Underline as UnderlineIcon, PinIcon, Link2, Table as TableIcon } from 'lucide-react';
import { FontSize } from './extensions/FontSize';
import { MathBlock } from './extensions/MathBlock';
import { MagicLink } from './extensions/MagicLink';
import { BlockId } from './extensions/BlockId';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Anchor } from './extensions/Anchor';
import { useHighlight, LinkTarget } from './HighlightContext';
import { useLinkStore } from '@/store/useLinkStore';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';

// Module-level store for a pending magic link insertion.
// This survives editor unmount/remount (e.g., switching to Calendar tab and back).
let pendingLink: { target: LinkTarget; from: number } | null = null;


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

export default function Editor({ initialContent, editable = true, onChange, onLinkClick, onForceSave, onPopOut, onBlocksDeleted, onConnectImage, onEditorReady, onBlockHover, onAbortLinking, activeTabId, onReturnToTab, onFileClick, onEventClick }: EditorProps & { onFileClick?: (id: string, title?: string) => void, onEventClick?: (id: string) => void }) {
    const { highlight, startLinkSelection, cancelLinkSelection } = useHighlight();

    const onChangeRef = useRef(onChange);
    const onLinkClickRef = useRef(onLinkClick);

    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
        onLinkClickRef.current = onLinkClick;
    }, [onLinkClick]);

    const isSelectingLinkRef = useRef(highlight.isSelectingLink);
    useEffect(() => {
        isSelectingLinkRef.current = highlight.isSelectingLink;
    }, [highlight.isSelectingLink]);

    const onBlocksDeletedRef = useRef(onBlocksDeleted);
    useEffect(() => { onBlocksDeletedRef.current = onBlocksDeleted; }, [onBlocksDeleted]);

    // Track the block ID at the cursor ($head = visual cursor position, not selection start)
    // Updated on every selection change so the Connect button always gets the right block.
    const currentBlockIdRef = useRef<string | null>(null);

    // MagicLink specific state for explicit triggering
    const [isMagicLinkTriggered, setIsMagicLinkTriggered] = useState(false);
    const [magicLinkTriggerRange, setMagicLinkTriggerRange] = useState<{ from: number, to: number } | null>(null);
    const [magicLinkTriggerCoords, setMagicLinkTriggerCoords] = useState<{ x: number, y: number } | null>(null);

    const editor = useEditor({
        extensions: [
            TaskList.configure({ HTMLAttributes: { class: 'not-prose pl-0' } }),
            TaskItem.configure({ nested: true }),
            StarterKit.configure({
                italic: false,
                bold: false,
                strike: false,
            }),
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
            MathBlock,
            MagicLink.configure({
                onLinkClick: (target: any) => {
                    const isNote = target.type === 'file' || target.type === 'folder';
                    if (isNote) {
                        if (onFileClick) onFileClick(target.id, target.title);
                        else console.warn("onFileClick not provided");
                    } else if (target.type === 'event') {
                        if (onEventClick) onEventClick(target.id);
                        else console.warn("onEventClick not provided");
                    }
                },
                // Removed the buggy onMagicLinkTrigger options
            }),
            BlockId.configure({
                onBlocksDeleted: (ids) => onBlocksDeletedRef.current?.(ids),
            }),
            Anchor,
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
        ],
        content: initialContent,
        editable: editable,
        immediatelyRender: false,
        onUpdate: ({ editor, transaction }) => {
            if (onChangeRef.current) {
                onChangeRef.current(editor.getJSON());
            }

            // MAGIC LINK TRIGGER CHECK
            if (transaction.docChanged && editable && !isMagicLinkTriggered) {
                const { from } = editor.state.selection;
                // Safety check: ensure we have at least 2 characters to check
                if (from >= 2) {
                    const textBeforeCursor = editor.state.doc.textBetween(from - 2, from, '\n');
                    if (textBeforeCursor === '--') {
                        const range = { from: from - 2, to: from };
                        const coords = editor.view.coordsAtPos(from);
                        setIsMagicLinkTriggered(true);
                        setMagicLinkTriggerRange(range);
                        setMagicLinkTriggerCoords({ x: coords.left, y: coords.top });
                    }
                }
            }
        },
        editorProps: {
            attributes: {
                class: 'prose max-w-none w-full focus:outline-none min-h-[500px] pb-32 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mt-1 [&_ul[data-type="taskList"]]:list-none [&_ul[data-type="taskList"]]:pl-0 [&_li[data-type="taskItem"]]:flex [&_li[data-type="taskItem"]]:items-start [&_li[data-type="taskItem"]>label]:mr-2 [&_li[data-type="taskItem"]>label]:mt-1 [&_table]:border-collapse [&_table]:table-fixed [&_table]:w-full [&_table]:my-4 [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_td]:relative [&_td]:min-w-[100px] [&_th]:border [&_th]:border-gray-300 [&_th]:p-2 [&_th]:bg-gray-50 [&_th]:relative [&_th]:min-w-[100px] [&_th]:font-semibold [&_.column-resize-handle]:absolute [&_.column-resize-handle]:-right-1.5 [&_.column-resize-handle]:top-0 [&_.column-resize-handle]:bottom-[calc(-1px)] [&_.column-resize-handle]:w-3 [&_.column-resize-handle]:bg-blue-500/20 [&_.column-resize-handle]:cursor-col-resize hover:[&_.column-resize-handle]:bg-blue-500',
            },
        },
    });

    // Handle magic link trigger
    useEffect(() => {
        if (isMagicLinkTriggered && magicLinkTriggerRange && magicLinkTriggerCoords && editor) {
            startLinkSelection((target) => {
                setIsMagicLinkTriggered(false);
                setMagicLinkTriggerRange(null);
                setMagicLinkTriggerCoords(null);

                if (!target) return;

                const { pendingRange, sourceTabId } = useLinkStore.getState();
                const targetRange = pendingRange || magicLinkTriggerRange;

                if (!sourceTabId || !onReturnToTab) {
                    try {
                        const insertPos = editor.state.selection.from;
                        editor.chain().focus()
                            .insertContentAt(insertPos, { type: 'magicLink', attrs: { targetId: target.id, targetType: target.type, title: target.title } })
                            .insertContentAt(insertPos + 1, " ")
                            .run();

                        editor.commands.deleteRange(targetRange);

                        useLinkStore.getState().clearPendingLink();
                        if (onForceSave) onForceSave(editor.getJSON());
                    } catch (e) {
                        console.error("[MagicLink] Sync insert error:", e);
                    }
                    return;
                }

                // Cross-tab handling
                useLinkStore.getState().setPendingLink({
                    range: targetRange,
                    targetId: target.id,
                    targetType: target.type as any,
                    title: target.title,
                    sourceTabId,
                });
                onReturnToTab(sourceTabId);
            }, magicLinkTriggerCoords);
        }
    }, [isMagicLinkTriggered, magicLinkTriggerRange, magicLinkTriggerCoords, editor, startLinkSelection, onForceSave, onReturnToTab]);

    useEffect(() => {
        if (!editor) return;
        if (onEditorReady) onEditorReady(editor);

        // Cross-tab pendingLink: if the user typed --, switched to Calendar, clicked an event,
        // and was returned here — flush the pending link using the FRESH editor instance.
        const stored = useLinkStore.getState().pendingLink;
        if (stored) {
            useLinkStore.getState().clearPendingLink(); // clear first to avoid double-apply
            try {
                // Small delay to let the editor fully mount before running chain
                setTimeout(() => {
                    // Always insert at the current cursor position, don't trust the old range which might be 0,0 now
                    const insertPos = editor.state.selection.from;
                    editor.chain()
                        .focus()
                        .insertContentAt(insertPos, {
                            type: 'magicLink',
                            attrs: { targetId: stored.targetId, targetType: stored.targetType, title: stored.title }
                        })
                        .insertContentAt(insertPos + 1, ' ')
                        .run();

                    // Cleanup the original '--'
                    if (stored.range && stored.range.from > 0) {
                        try { editor.commands.deleteRange(stored.range); } catch (e) { }
                    }

                    editor.view.dispatch(editor.state.tr);
                    if (onForceSave) onForceSave(editor.getJSON());
                    console.log('[MagicLink] Cross-tab pendingLink flushed on mount at pos:', insertPos);
                }, 50);
            } catch (e) {
                console.error('[MagicLink] Cross-tab pendingLink insert error:', e);
            }
        }
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

    // Pin System Abort Logic
    useEffect(() => {
        if (!editor?.view.dom || !onAbortLinking) return;
        const dom = editor.view.dom;
        const handleClick = () => onAbortLinking();
        dom.addEventListener('click', handleClick);
        return () => dom.removeEventListener('click', handleClick);
    }, [editor, onAbortLinking]);

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

                    {/* Table Creation */}
                    <button
                        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                        className={`p-1.5 rounded-lg transition-colors flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 ${editor.isActive('table') ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400' : ''}`}
                        title="Insert Table"
                    >
                        <TableIcon size={16} />
                    </button>

                    {/* Active Table Controls */}
                    {editor.isActive('table') && (
                        <>
                            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
                            <button
                                onClick={() => editor.chain().focus().addRowAfter().run()}
                                className="p-1 px-2 text-xs font-semibold rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                            >
                                +Row
                            </button>
                            <button
                                onClick={() => editor.chain().focus().addColumnAfter().run()}
                                className="p-1 px-2 text-xs font-semibold rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                            >
                                +Col
                            </button>
                            <div className="w-px h-3 bg-gray-300 dark:bg-gray-600 mx-1" />
                            <button
                                onClick={() => editor.chain().focus().deleteRow().run()}
                                className="p-1 px-2 text-xs font-semibold rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                            >
                                -Row
                            </button>
                            <button
                                onClick={() => editor.chain().focus().deleteColumn().run()}
                                className="p-1 px-2 text-xs font-semibold rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                            >
                                -Col
                            </button>
                        </>
                    )}  {/* Highlight Color */}
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
                                                attrs: { anchorId },
                                                content: [{ type: 'text', text: '⚓' }]
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
            <EditorContent editor={editor} />
        </div>
    );
}
