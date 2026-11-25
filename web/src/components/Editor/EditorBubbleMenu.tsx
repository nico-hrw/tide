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
    HelpCircle,
    Clock,
    PinIcon,
    Link2,
  Search,
} from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { useReferenceStore } from '@/store/useReferenceStore';
import { extractTimeFromText } from '@/lib/timeParser';

import { COLORS, REFERENCE_COLORS, REFERENCE_QUICK_EMOJIS } from './editorConstants';
import TextStyleButtons from './TextStyleButtons';
import ReferenceForm from './ReferenceForm';

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

    const handleCreateReference = (definition: string, color?: string | null, emoji?: string | null) => {
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

        editor.chain().focus().setTextSelection({ from, to }).setMark('reference', {
            referenceId: refId,
            isSource: true,
            color: color || undefined,
            emoji: emoji || undefined,
        }).run();

        useReferenceStore.getState().addReference({
            id: refId,
            term,
            previewText: definition,
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
    const btnActive = "bg-t2-sub text-t2-accent  ";
    const btnInactive = "hover:bg-t2-hover  text-t2-ink ";

    return (
        <BubbleMenu
            editor={editor}
            className="flex flex-col items-start gap-1.5"
            style={{ overflow: 'visible' }}
        >
          {/* Blase 1: Textstil und Auszeichnung */}
          <div className="flex items-center gap-0.5 rounded-[12px] bg-t2-surface p-1 shadow-[0_0_0_1px_var(--t2-line),0_10px_30px_rgba(0,0,0,0.10)]">
            <TextStyleButtons editor={editor} />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => window.dispatchEvent(new CustomEvent('tide:format-search'))} className={`${btnBase} ${btnInactive}`} title="Formatierung suchen (Strg+Shift+F)" aria-label="Formatierung suchen">
                <Search size={16} />
            </button>
            <div className="w-px h-5 bg-t2-line mx-1" />

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
          </div>

          {/* Blase 2: Schrift, Farbe, Einfügen */}
          <div className="flex items-center gap-0.5 rounded-[12px] bg-t2-surface p-1 shadow-[0_0_0_1px_var(--t2-line),0_10px_30px_rgba(0,0,0,0.10)]">

            <div className="w-px h-5 bg-t2-line  mx-1" />

            <input
                type="number" min="8" max="72"
                className="w-12 px-1 text-center bg-transparent border border-t2-line  rounded-md text-sm outline-none text-t2-ink"
                placeholder="16" value={fontSizeInput}
                onChange={(e) => setFontSizeInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyFontSize(); } }}
                onBlur={applyFontSize}
            />
            <span className="text-xs text-t2-ink-3  pr-1">px</span>

            <div className="w-px h-5 bg-t2-line  mx-1" />

            {/* Text Color */}
            <div className="relative">
                <button
                    onClick={() => { setShowColorPicker(showColorPicker === 'text' ? null : 'text'); setShowReferencePicker(false); }}
                    className={`${btnBase} ${btnInactive} flex items-center justify-center`} title="Text Color"
                >
                    <Type size={16} />
                </button>
                {showColorPicker === 'text' && (
                    <div className="absolute top-full mt-2 left-0 bg-t2-surface  shadow-lg border border-t2-line  rounded-xl p-2 flex gap-1 z-50">
                        {COLORS.map(c => (
                            <button key={c} onClick={() => { editor.chain().focus().setColor(c).run(); setShowColorPicker(null); }}
                                className="w-6 h-6 rounded-full border border-t2-line " style={{ backgroundColor: c }} />
                        ))}
                    </div>
                )}
            </div>

            <div className="w-px h-5 bg-t2-line  mx-1" />

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
                    <div className="absolute top-full mt-2 left-0 bg-t2-surface  shadow-lg border border-t2-line  rounded-xl p-2 flex gap-1 z-50">
                        {COLORS.map(c => (
                            <button key={c} onClick={() => { editor.chain().focus().setHighlight({ color: c }).run(); setShowColorPicker(null); }}
                                className="w-6 h-6 rounded-full border border-t2-line " style={{ backgroundColor: c }} />
                        ))}
                    </div>
                )}
            </div>

            <div className="w-px h-5 bg-t2-line  mx-1" />

            {/* Insert Math Button */}
            <button
                onClick={() => editor.chain().focus().insertContent('<math-block></math-block>').run()}
                className={`${btnBase} ${btnInactive}`} title="Insert Math/KaTeX equation" onMouseDown={(e) => e.preventDefault()}
            >
                <Sigma size={16} />
            </button>

            {/* Definition ("?") popup: type what the selected word or sentence means */}
            {enabledExtensions.includes('references') && (
                <>
                    <div className="w-px h-5 bg-t2-line  mx-1" />
                    <div className="relative">
                        <button
                            title="Definition hinzufügen" aria-label="Definition hinzufügen" onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                const { from, to, empty } = editor.state.selection;
                                if (!empty) setPendingRefRange({ from, to });
                                setShowReferencePicker((prev) => !prev);
                                setShowColorPicker(null);
                            }}
                            className={`${btnBase} flex items-center justify-center ${showReferencePicker ? 'bg-t2-sub text-t2-accent  ' : 'hover:bg-t2-sub  text-t2-ink  hover:text-t2-accent '}`}
                        >
                            <HelpCircle size={15} />
                        </button>

                        {showReferencePicker && (
                            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50">
                                <ReferenceForm
                                    mode="create"
                                    term={pendingRefRange ? editor.state.doc.textBetween(pendingRefRange.from, pendingRefRange.to, ' ').trim() : ''}
                                    onSave={(v) => handleCreateReference(v.definition, v.color, v.emoji)}
                                    onCancel={() => { setShowReferencePicker(false); setPendingRefRange(null); }}
                                />
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
                                className="p-1.5 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/50 text-t2-ink  hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                            >
                                <Clock size={14} />
                            </button>
                            <div className="w-px h-5 bg-t2-line  mx-1" />
                        </>
                    )}

                    <button
                        title="Pop out to canvas" onMouseDown={(e) => e.preventDefault()} onClick={handlePopOut}
                        className="p-1.5 rounded-lg hover:bg-t2-sub  text-t2-ink  hover:text-t2-accent  transition-colors"
                    >
                        <PinIcon size={14} />
                    </button>
                </>
            )}

            {onConnectImage && (
                <>
                    <div className="w-px h-5 bg-t2-line  mx-1" />
                    <button
                        title="Connect Image to this text block" onMouseDown={(e) => e.preventDefault()} onClick={handleConnectImage}
                        className="p-1.5 rounded-lg hover:bg-t2-sub  text-t2-ink  hover:text-t2-accent transition-colors"
                    >
                        <Link2 size={14} />
                    </button>
                </>
            )}
          </div>
        </BubbleMenu>
    );
}
export default EditorBubbleMenu;
