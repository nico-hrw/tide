"use client";

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDataStore } from '@/store/useDataStore';
import { getNotePreview, isProtectedFile, preloadNotePreviews, subscribeNotePreviews } from '@/lib/notePreview';
import DT from '@/lib/designTokens';

const WIDTH = 264;
const GAP = 8;

export interface TabPreviewTarget {
    id: string;
    title: string;
    isNote: boolean;
    rect: DOMRect;
}

/** Small card under a tab: the title and, for notes, the first lines. Decrypted text only lives in memory (see notePreview). */
export default function TabHoverPreview({ target }: { target: TabPreviewTarget }) {
    const [, tick] = useState(0);
    const note = useDataStore((s) => (target.isNote ? s.notes.find((n) => n.id === target.id) : undefined));
    const protectedNote = note ? isProtectedFile(note as unknown as Record<string, unknown>) : false;

    useEffect(() => subscribeNotePreviews(() => tick((t) => t + 1)), []);
    useEffect(() => {
        if (note && !protectedNote) void preloadNotePreviews([{ ...note } as unknown as Record<string, unknown>]);
    }, [note, protectedNote]);

    const excerpt = target.isNote && !protectedNote ? getNotePreview(target.id) : undefined;
    const left = Math.max(GAP, Math.min(target.rect.left, window.innerWidth - WIDTH - GAP));

    return createPortal(
        <div
            role="tooltip"
            style={{ left, top: target.rect.bottom + GAP, width: WIDTH, borderRadius: DT.radiusLg, boxShadow: DT.shadowFloat }}
            className="fixed z-[200] pointer-events-none bg-t2-surface border border-t2-line px-3.5 py-3 animate-in fade-in zoom-in-95 duration-150"
        >
            <div className="truncate text-[13px] font-semibold text-t2-ink">{target.title}</div>
            {target.isNote && (
                <div className="mt-1.5 text-[12px] leading-snug text-t2-ink-2 line-clamp-5 whitespace-pre-line break-words">
                    {protectedNote
                        ? <span className="text-t2-ink-3">Geschützte Notiz</span>
                        : excerpt
                            ? excerpt.slice(0, 280)
                            : <span className="text-t2-ink-3">{excerpt === undefined ? 'Lädt …' : 'Leere Notiz'}</span>}
                </div>
            )}
        </div>,
        document.body,
    );
}
