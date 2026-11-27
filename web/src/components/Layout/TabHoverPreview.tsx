"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDataStore } from '@/store/useDataStore';
import { getNotePreview, isProtectedFile, preloadNotePreviews, subscribeNotePreviews } from '@/lib/notePreview';
import DT from '@/lib/designTokens';
import NotePagePreview from '@/components/Editor/NotePagePreview';
import { docToPlainText } from '@/lib/notePreview';

const WIDTH = 300;
const GAP = 8;

export interface TabPreviewTarget {
    id: string;
    title: string;
    isNote: boolean;
    /** The tab is the open note: its live editor content is the freshest source. */
    isActive: boolean;
    /** Content cached on the tab when it was left. */
    content?: unknown;
    rect: DOMRect;
    /** One line under the title for tabs that are not notes (Todos, plugins, ...). */
    detail?: string;
}

/** Small card under a tab: the title and, for notes, the first lines. Decrypted text only lives in memory (see notePreview). */
export default function TabHoverPreview({ target }: { target: TabPreviewTarget }) {
    const [, tick] = useState(0);
    const [waited, setWaited] = useState(false);
    useEffect(() => { const t = setTimeout(() => setWaited(true), 1200); return () => clearTimeout(t); }, []);
    const note = useDataStore((s) => (target.isNote ? s.notes.find((n) => n.id === target.id) : undefined));
    const protectedNote = note ? isProtectedFile(note as unknown as Record<string, unknown>) : false;

    useEffect(() => subscribeNotePreviews(() => tick((t) => t + 1)), []);
    useEffect(() => {
        if (note && !protectedNote) void preloadNotePreviews([{ ...note } as unknown as Record<string, unknown>]);
    }, [note, protectedNote]);

    // Freshest content first: the live editor for the open note, else what the tab cached when it was left.
    const doc = useMemo(() => {
        if (!target.isNote) return null;
        let raw: unknown = target.content;
        if (target.isActive) {
            const ed = (window as unknown as { __tideEditor?: { isDestroyed?: boolean; getJSON?: () => unknown } }).__tideEditor;
            if (ed && !ed.isDestroyed && ed.getJSON) raw = ed.getJSON();
        }
        if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return null; } }
        if (!raw || typeof raw !== 'object') return null;
        const d = raw as { content?: unknown[] };
        return docToPlainText(JSON.stringify(d)) ? (d as Parameters<typeof NotePagePreview>[0]['doc']) : null;
    }, [target]);

    const excerpt = target.isNote && !protectedNote ? getNotePreview(target.id) : undefined;
    const left = Math.max(GAP, Math.min(target.rect.left, window.innerWidth - WIDTH - GAP));

    return createPortal(
        <div
            role="tooltip"
            style={{ left, top: target.rect.bottom + GAP, width: WIDTH, borderRadius: DT.radiusLg, boxShadow: DT.shadowFloat }}
            className="fixed z-[200] pointer-events-none bg-t2-surface border border-t2-line px-3.5 py-3 animate-in fade-in zoom-in-95 duration-150"
        >
            <div className="truncate text-[13px] font-semibold text-t2-ink">{target.title}</div>
            {!target.isNote && target.detail && (
                <div className="mt-1 text-[12px] leading-snug text-t2-ink-3">{target.detail}</div>
            )}
            {target.isNote && (
                <div className="mt-2">
                    {protectedNote ? (
                        <div className="text-[12px] text-t2-ink-3">Geschützte Notiz</div>
                    ) : doc ? (
                        <NotePagePreview doc={doc} />
                    ) : excerpt ? (
                        <div className="text-[12px] leading-snug text-t2-ink-2 line-clamp-6 whitespace-pre-line break-words">{excerpt.slice(0, 360)}</div>
                    ) : (
                        <div className="text-[12px] text-t2-ink-3">{waited ? 'Leere Notiz' : 'Lädt …'}</div>
                    )}
                </div>
            )}
        </div>,
        document.body,
    );
}
