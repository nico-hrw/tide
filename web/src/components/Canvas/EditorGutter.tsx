"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { CanvasElement } from '@/types/canvas';

interface EditorGutterProps {
    elements: CanvasElement[];
    onPinClick: (blockId: string) => void;
    activeLinkBlockId: string | null;
    hoveredElementId: string | null;
    hoveredBlockId: string | null;
    isLinkingMode: boolean;
    // contentVersion is passed from TipTap's onUpdate to trigger a reposition check
    contentVersion: number;
}

/**
 * EditorGutter renders "Pins" for each text block in the TipTap editor.
 * It lives side-by-side with the editor in a shared scrollable container.
 */
export default function EditorGutter({
    elements, onPinClick, activeLinkBlockId, hoveredElementId, hoveredBlockId, isLinkingMode, contentVersion
}: EditorGutterProps) {
    const [blocks, setBlocks] = useState<{ id: string; top: number; height: number }[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    const refreshPositions = useCallback(() => {
        if (!containerRef.current) return;
        const editorContainer = containerRef.current.closest('.editor-container');
        const editor = editorContainer ? editorContainer.querySelector('.tiptap') : document.querySelector('.tiptap');
        if (!editor || !editorContainer) return;

        const blockNodes = editor.querySelectorAll('[data-block-id]');

        const er = editor.getBoundingClientRect();
        const newBlocks: { id: string; top: number; height: number }[] = [];

        blockNodes.forEach((node) => {
            const id = node.getAttribute('data-block-id');
            if (!id) return;
            const nr = node.getBoundingClientRect();

            newBlocks.push({
                id,
                top: Math.round(nr.top - er.top),
                height: Math.round(nr.height)
            });
        });

        setBlocks(newBlocks);
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;
        const editorContainer = containerRef.current.closest('.editor-container');
        const editor = editorContainer ? editorContainer.querySelector('.tiptap') : document.querySelector('.tiptap');
        if (!editor) return;

        const obs = new ResizeObserver(() => {
            // Use requestAnimationFrame only within the observer to avoid jitter
            // but the user said "No requestAnimationFrame loop". 
            // This is an event-driven update, not a loop.
            refreshPositions();
        });

        obs.observe(editor);
        refreshPositions();

        return () => obs.disconnect();
    }, [refreshPositions]);

    // Effect for content changes
    useEffect(() => {
        refreshPositions();
    }, [contentVersion, elements.length, refreshPositions]);

    return (
        <div ref={containerRef} className="relative w-8 mr-6 select-none opacity-80" style={{ marginTop: '0' }}>
            {blocks.map(block => {
                const boundElements = elements.filter(e => e.anchorBlockId === block.id);
                const isActive = activeLinkBlockId === block.id;
                const isHovered = hoveredBlockId === block.id || boundElements.some(e => e.id === hoveredElementId);

                return (
                    <div
                        key={block.id}
                        className="absolute left-0 right-0 flex items-center justify-end pr-2 transition-all duration-200"
                        style={{ top: block.top, height: block.height, pointerEvents: 'auto' }}
                    >
                        <div className="flex flex-row-reverse gap-1.5 items-center">
                            {/* The Main Pin/Target Area */}
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onPinClick(block.id);
                                }}
                                className={`w-3 h-3 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center ${isActive ? 'border-indigo-600 bg-indigo-600 shadow-[0_0_10px_rgba(99,102,241,0.5)]' :
                                    isLinkingMode ? 'border-indigo-400 hover:bg-indigo-100' :
                                        'border-transparent' // REMOVED HOVER CIRCLE STATE here
                                    }`}
                            >
                                {isActive && (
                                    <div className="absolute w-3 h-3 rounded-full bg-indigo-600 animate-ping opacity-75" />
                                )}
                            </div>

                            {/* Existing Pins for bound elements removed as per user request */}
                            <div className="flex flex-row-reverse gap-1">
                                {/* Circles removed so they only render via hovered SVG lines later */}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
