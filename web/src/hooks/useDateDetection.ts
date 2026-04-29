"use client";

import { useEffect, useRef, useCallback } from 'react';
import { parseGermanDate, ParseResult } from '@/lib/dateParser';
import { useIslandStore } from '@/components/extensions/smart_island/useIslandStore';
import type { EventSuggestionPayload } from '@/components/extensions/smart_island/EventSuggestionView';

export type DateDetectionMode = 'auto' | 'manual';

export interface UseDateDetectionOptions {
    editor: any | null;                                 // TipTap Editor instance
    enabled: boolean;                                   // Master switch
    mode: DateDetectionMode;                            // auto = debounced, manual = /date only
    onAcceptSuggestion: (data: { title: string; start: Date; end: Date; blockId: string }) => void;
}

const DEBOUNCE_MS = 600;

/**
 * Detects German date/time phrases in the editor's currently focused paragraph
 * and pushes an `event_suggestion` SmartIsland card.
 *
 * Per-block dedup prevents the same suggestion from re-appearing after the
 * user accepted or dismissed it. The dedup key is `<blockId>:<spanText>`, so
 * editing inside the span produces a new key and re-detection is allowed.
 */
export function useDateDetection({ editor, enabled, mode, onAcceptSuggestion }: UseDateDetectionOptions) {
    const island = useIslandStore();
    const handledSpans = useRef<Map<string, Set<string>>>(new Map()); // blockId → Set<spanKey>
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const runDetection = useCallback(() => {
        if (!editor || !enabled) return;

        const { state } = editor;
        const { selection } = state;
        const $from = selection.$from;

        // Find the parent block (paragraph / heading) at the cursor.
        let blockNode: any = null;
        let blockPos = 0;
        let blockId: string | null = null;
        for (let depth = $from.depth; depth >= 0; depth--) {
            const node = $from.node(depth);
            if (node.isBlock && node.attrs && (node.attrs.blockId || node.type.name === 'paragraph')) {
                blockNode = node;
                blockPos = $from.before(depth);
                blockId = (node.attrs as any)?.blockId || `pos:${blockPos}`;
                break;
            }
        }
        if (!blockNode || !blockId) return;

        const text = blockNode.textContent || '';
        if (text.trim().length < 4) return;

        const results: ParseResult[] = parseGermanDate(text, new Date());
        if (results.length === 0) return;

        const handled = handledSpans.current.get(blockId) ?? new Set<string>();
        // Take first not-yet-handled result
        const first = results.find(r => {
            const key = makeSpanKey(text, r);
            return !handled.has(key);
        });
        if (!first) return;

        const spanKey = makeSpanKey(text, first);

        const payload: EventSuggestionPayload = {
            parseResult: first,
            blockId,
            onAccept: ({ title, start, end }) => {
                // mark handled
                const set = handledSpans.current.get(blockId!) ?? new Set();
                set.add(spanKey);
                handledSpans.current.set(blockId!, set);
                onAcceptSuggestion({ title, start, end, blockId: blockId! });
                island.dismiss();
            },
            onDismiss: () => {
                const set = handledSpans.current.get(blockId!) ?? new Set();
                set.add(spanKey);
                handledSpans.current.set(blockId!, set);
                island.dismiss();

                // On dismiss, convert the date portion to an inline dateMention node
                if (editor) {
                    const absStart = blockPos + 1 + first.span[0];
                    const absEnd = blockPos + 1 + first.span[1];
                    const isoDate = first.proposedDate.toISOString();
                    // Just use the typed text as label for inline feeling
                    const label = text.slice(first.span[0], first.span[1]);
                    
                    editor.chain().deleteRange({ from: absStart, to: absEnd })
                          .insertContentAt(absStart, {
                              type: 'dateMention',
                              attrs: { isoDate, label }
                          }).run();
                }
            },
        };

        island.push({
            type: 'event_suggestion',
            priority: 'DEFAULT',
            payload: { ...payload, duration: 60_000 } as any, // 60s display window
        });
    }, [editor, enabled, island, onAcceptSuggestion]);

    // ── Auto mode: debounced editor.onUpdate ─────────────────────────────────
    useEffect(() => {
        if (!editor || !enabled || mode !== 'auto') return;

        const handler = () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            debounceTimer.current = setTimeout(runDetection, DEBOUNCE_MS);
        };

        editor.on('update', handler);
        return () => {
            editor.off('update', handler);
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [editor, enabled, mode, runDetection]);

    // ── Manual mode: /date slash command via window event ────────────────────
    useEffect(() => {
        if (!enabled) return;
        const handler = () => runDetection();
        window.addEventListener('tide:scan-dates', handler);
        return () => window.removeEventListener('tide:scan-dates', handler);
    }, [enabled, runDetection]);
}

/**
 * Stable key for a parse result within a given block. The key changes if the
 * detected substring changes — that's the intended behavior so edits unlock
 * re-detection.
 */
function makeSpanKey(blockText: string, r: ParseResult): string {
    const sub = blockText.slice(r.span[0], r.span[1]);
    return `${r.span[0]}-${r.span[1]}::${sub}`;
}
