"use client";

import React, { useState, useEffect } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/core';
import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Eraser,
    Type,
    Highlighter,
    Sigma,
    Bookmark,
    Clock,
    PinIcon,
    Link2,
} from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { useReferenceStore } from '@/store/useReferenceStore';
import { extractTimeFromText } from '@/lib/timeParser';

import { COLORS, REFERENCE_COLORS, REFERENCE_QUICK_EMOJIS } from './editorConstants';

export { COLORS, REFERENCE_COLORS, REFERENCE_QUICK_EMOJIS };

export interface EditorBubbleMenuProps {
    editor: Editor | null;
    activeTabId?: string;
    onPopOut?: (text: string, anchorId: string) => void;
    onConnectImage?: (blockId: string) => void;
    currentBlockIdRef?: React.MutableRefObject<string | null>;
}

export function EditorBubbleMenu({
    editor,
    activeTabId,
    onPopOut,
    onConnectImage,
    currentBlockIdRef,
}: EditorBubbleMenuProps) {
    const enabledExtensions = useDataStore((s) => s.enabledExtensions);
    const [showColorPicker, setShowColorPicker] = useState<'text' | 'highlight' | null>(null);
    const [showReferencePicker, setShowReferencePicker] = useState(false);
    const [selectedRefColor, setSelectedRefColor] = useState<string>('#3b82f6');
    const [selectedRefEmoji, setSelectedRefEmoji] = useState<string>('🔖');
    const [pendingRefRange, setPendingRefRange] = useState<{ from: number; to: number } | null>(null);
    const [fontSizeInput, setFontSizeInput] = useState<string>("");

    useEffect(() => {
        if (!editor) return;
        const handleSelectionUpdate = () => {
            const size = editor.getAttributes('textStyle').fontSize;
            setFontSizeInput(size ? size.replace('px', '') : "");
        };
        editor.on('selectionUpdate', handleSelectionUpdate);
        editor.on('transaction', handleSelectionUpdate);
        return () => {
            editor.off('selectionUpdate', handleSelectionUpdate);
            editor.off('transaction', handleSelectionUpdate);
        };
    }, [editor]);

    if (!editor) return null;

    const handleCreateReference = (color?: string | null, emoji?: string | null) => {
        let from = editor.state.selection.from;
        let to = editor.state.selection.to;
        if (editor.state.selection.empty && pendingRefRange) {
            from = pendingRefRange.from;
            to = pendingRefRange.to;
        }
        if (from >= to) return;

        const term = editor.state.doc.textBetween(from, to, ' ').trim();
        if (!term) return;

        const activeNoteId = activeTabId || useDataStore.getState().activeNoteId;
        const refId = crypto.randomUUID();

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

        console.log("[References] Creating reference mark:", term, { color, emoji });
        editor.chain().focus().setTextSelection({ from, to }).setMark('reference', {
            referenceId: refId,
            isSource: true,
            color: color || undefined,
            emoji: emoji || undefined,
        }).run();

        useReferenceStore.getState().addReference({
            id: refId,
            term,
            previewText: previewText,
            sourceNoteId: activeNoteId || 'unknown',
            color: color || undefined,
            emoji: emoji || undefined,
        });

        setShowReferencePicker(false);
        setPendingRefRange(null);
    };

    const handlePopOut = () => {
        if (!onPopOut) return;
        const { from, to, empty } = editor.state.selection;
        if (empty) return;
        const selectedText = editor.state.doc.textBetween(from, to, ' ');
        let anchorBlockId: string | null = null;
        editor.state.doc.nodesBetween(from, to, (node) => {
            if (node.isBlock && node.attrs?.blockId && !anchorBlockId) {
                anchorBlockId = node.attrs.blockId as string;
            }
        });
        if (!anchorBlockId && currentBlockIdRef?.current) {
            anchorBlockId = currentBlockIdRef.current;
        }
        if (!anchorBlockId) {
            const { $to } = editor.state.selection;
            for (let d = $to.depth; d >= 0; d--) {
                const node = $to.node(d);
                if (node.isBlock) {
                    const newId = crypto.randomUUID();
                    const pos = $to.before(d);
                    const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: newId });
                    editor.view.dispatch(tr);
                    anchorBlockId = newId;
                    if (currentBlockIdRef) currentBlockIdRef.current = newId;
                    break;
                }
            }
        }
        if (!anchorBlockId) anchorBlockId = crypto.randomUUID();
        if (selectedText) {
            const anchorId = crypto.randomUUID();
            editor.chain().focus().deleteSelection().insertContent({ type: 'anchor', attrs: { anchorId } }).run();
            onPopOut(selectedText, anchorId);
        }
    };

    const handleConnectImage = () => {
        if (!onConnectImage) return;
        let blockId = currentBlockIdRef?.current;
        if (!blockId) {
            const { $to } = editor.state.selection;
            for (let d = $to.depth; d >= 0; d--) {
                const node = $to.node(d);
                if (node.isBlock) {
                    if (node.attrs?.blockId) {
                        blockId = node.attrs.blockId as string;
                    } else {
                        const newId = crypto.randomUUID();
                        const pos = $to.before(d);
                        const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: newId });
                        editor.view.dispatch(tr);
                        blockId = newId;
                    }
                    break;
                }
            }
        }
        if (!blockId) blockId = crypto.randomUUID();
        if (currentBlockIdRef) currentBlockIdRef.current = blockId;
        onConnectImage(blockId);
    };

    const applyFontSize = () => {
        if (fontSizeInput) editor.chain().setFontSize(`${fontSizeInput}px`).run();
        else editor.chain().unsetFontSize().run();
    };

    const btnBase = "p-1.5 rounded-lg transition-colors";
    const btnActive = "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400";
    const btnInactive = "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300";

    return (
        <BubbleMenu
            editor={editor}
            className="flex bg-white dark:bg-gray-800 border border-[var(--border-ui)] rounded-[var(--radius)] overflow-visible p-1 gap-1 items-center"
            style={{ boxShadow: 'var(--shadow-float)' }}
        >
            <button onClick={() => editor.chain().focus().toggleBold().run()} className={`${btnBase} ${editor.isActive('bold') ? btnActive : btnInactive}`} title="Bold">
                <Bold size={16} />
            </button>
            <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`${btnBase} ${editor.isActive('italic') ? btnActive : btnInactive}`} title="Italic">
                <Italic size={16} />
            </button>
            <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`${btnBase} ${editor.isActive('underline') ? btnActive : btnInactive}`} title="Underline">
                <UnderlineIcon size={16} />
            </button>
            <button onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className={`${btnBase} ${btnInactive} flex items-center justify-center`} title="Clear Formatting" onMouseDown={(e) => e.preventDefault()}>
                <Eraser size={16} />
            </button>

            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

            <input
                type="number" min="8" max="72"
                className="w-12 px-1 text-center bg-transparent border border-gray-200 dark:border-gray-700 rounded-md text-sm outline-none dark:text-white"
                placeholder="16" value={fontSizeInput}
                onChange={(e) => setFontSizeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyFontSize(); } }}
                onBlur={applyFontSize}
            />
            <span className="text-xs text-gray-400 dark:text-slate-500 pr-1">px</span>

            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

            {/* Text Color */}
            <div className="relative">
                <button
                    onClick={() => { setShowColorPicker(showColorPicker === 'text' ? null : 'text'); setShowReferencePicker(false); }}
                    className={`${btnBase} ${btnInactive} flex items-center justify-center`} title="Text Color"
                >
                    <Type size={16} />
                </button>
                {showColorPicker === 'text' && (
                    <div className="absolute top-full mt-2 left-0 bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 rounded-xl p-2 flex gap-1 z-50">
                        {COLORS.map(c => (
                            <button key={c} onClick={() => { editor.chain().focus().setColor(c).run(); setShowColorPicker(null); }}
                                className="w-6 h-6 rounded-full border border-black/10 dark:border-white/10" style={{ backgroundColor: c }} />
                        ))}
                    </div>
                )}
            </div>

            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

            {/* Highlight Color */}
            <div className="relative">
                <button
                    onClick={() => { setShowColorPicker(showColorPicker === 'highlight' ? null : 'highlight'); setShowReferencePicker(false); }}
                    className={`${btnBase} flex items-center justify-center ${editor.isActive('highlight') ? 'bg-yellow-100 text-yellow-600' : btnInactive}`}
                    title="Highlight"
                >
                    <Highlighter size={16} />
                </button>
                {showColorPicker === 'highlight' && (
                    <div className="absolute top-full mt-2 left-0 bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 rounded-xl p-2 flex gap-1 z-50">
                        {COLORS.map(c => (
                            <button key={c} onClick={() => { editor.chain().focus().setHighlight({ color: c }).run(); setShowColorPicker(null); }}
                                className="w-6 h-6 rounded-full border border-black/10 dark:border-white/10" style={{ backgroundColor: c }} />
                        ))}
                    </div>
                )}
            </div>

            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

            {/* Insert Math Button */}
            <button
                onClick={() => editor.chain().focus().insertContent('<math-block></math-block>').run()}
                className={`${btnBase} ${btnInactive}`} title="Insert Math/KaTeX equation" onMouseDown={(e) => e.preventDefault()}
            >
                <Sigma size={16} />
            </button>

            {/* Reference Creation Popover */}
            {enabledExtensions.includes('references') && (
                <>
                    <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
                    <div className="relative">
                        <button
                            title="Als Referenz speichern" onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                const { from, to, empty } = editor.state.selection;
                                if (!empty) setPendingRefRange({ from, to });
                                setShowReferencePicker((prev) => !prev);
                                setShowColorPicker(null);
                            }}
                            className={`${btnBase} flex items-center justify-center ${showReferencePicker ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400' : 'hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400'}`}
                        >
                            <Bookmark size={15} style={selectedRefColor ? { color: selectedRefColor } : undefined} />
                        </button>

                        {showReferencePicker && (
                            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 rounded-xl p-3 z-50 flex flex-col gap-2.5 min-w-[210px]" onMouseDown={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Referenz erstellen</span>
                                    <div className="flex items-center gap-1 text-xs">
                                        <span>{selectedRefEmoji || '🔖'}</span>
                                        <span className="w-2.5 h-2.5 rounded-full inline-block border border-black/10 dark:border-white/20" style={{ backgroundColor: selectedRefColor }} />
                                    </div>
                                </div>

                                <div>
                                    <span className="text-[10px] text-gray-400 dark:text-gray-400 block mb-1">Farbe</span>
                                    <div className="flex items-center gap-1.5">
                                        {REFERENCE_COLORS.map(c => (
                                            <button key={c.value} type="button" title={c.label} onMouseDown={(e) => e.preventDefault()} onClick={() => setSelectedRefColor(c.value)}
                                                className={`w-5 h-5 rounded-full border transition-all ${selectedRefColor === c.value ? 'scale-125 ring-2 ring-offset-1 ring-blue-500 border-white dark:ring-offset-gray-800' : 'border-black/10 dark:border-white/10 hover:scale-110'}`}
                                                style={{ backgroundColor: c.value }} />
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <span className="text-[10px] text-gray-400 block mb-1">Icon / Emoji</span>
                                    <div className="flex items-center gap-1">
                                        {REFERENCE_QUICK_EMOJIS.map(emoji => (
                                            <button key={emoji} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setSelectedRefEmoji(emoji)}
                                                className={`w-6 h-6 text-sm flex items-center justify-center rounded-md transition-colors ${selectedRefEmoji === emoji ? 'bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-500' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                                                {emoji}
                                            </button>
                                        ))}
                                        <input
                                            type="text" value={selectedRefEmoji} onChange={(e) => setSelectedRefEmoji(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateReference(selectedRefColor, selectedRefEmoji); } }}
                                            placeholder="✨" maxLength={4}
                                            className="w-7 h-6 text-xs text-center border border-gray-200 dark:border-gray-700 rounded bg-transparent text-gray-700 dark:text-gray-200 focus:outline-none focus:border-blue-500"
                                            title="Eigenes Emoji eingeben"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-gray-100 dark:border-gray-700">
                                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setShowReferencePicker(false); setPendingRefRange(null); }}
                                        className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
                                        Abbrechen
                                    </button>
                                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleCreateReference(selectedRefColor, selectedRefEmoji)}
                                        className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors flex items-center gap-1">
                                        <Bookmark size={12} /><span>Erstellen</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {onPopOut && (
                <>
                    {enabledExtensions.includes('smart_island') && (
                        <>
                            <button
                                title="Quick Capture (Calendar)" onMouseDown={(e) => e.preventDefault()}
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
                                        anchorElement: btn,
                                    });
                                }}
                                className="p-1.5 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/50 text-gray-700 dark:text-gray-300 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                            >
                                <Clock size={14} />
                            </button>
                            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
                        </>
                    )}

                    <button
                        title="Pop out to canvas" onMouseDown={(e) => e.preventDefault()} onClick={handlePopOut}
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
                        title="Connect Image to this text block" onMouseDown={(e) => e.preventDefault()} onClick={handleConnectImage}
                        className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 text-gray-700 dark:text-gray-300 hover:text-[#000080] transition-colors"
                    >
                        <Link2 size={14} />
                    </button>
                </>
            )}
        </BubbleMenu>
    );
}
export default EditorBubbleMenu;
