"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePopupAutoClose } from '@/hooks/usePopupAutoClose';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { useReferenceStore, getReferenceById } from '@/store/useReferenceStore';
import { useDataStore } from '@/store/useDataStore';
import { notifyUndo } from '@/lib/feedback';
import ReferenceForm, { type ReferenceFormValue } from './ReferenceForm';

interface Target {
    id: string;
    rect: { left: number; top: number; bottom: number };
}

const WIDTH = 300;

/** Click on a marked term opens this popup: change the definition, the look, or remove the reference. */
export default function ReferenceEditPopover({ editor }: { editor: Editor | null }) {
    const [target, setTarget] = useState<Target | null>(null);

    useEffect(() => {
        const onEdit = (e: Event) => {
            const detail = (e as CustomEvent<Target>).detail;
            if (detail?.id) setTarget(detail);
        };
        window.addEventListener('tide:reference-edit', onEdit);
        return () => window.removeEventListener('tide:reference-edit', onEdit);
    }, []);

    const close = useCallback(() => setTarget(null), []);
    const popupRef = useRef<HTMLDivElement>(null);
    usePopupAutoClose(popupRef, close, { enabled: !!target });

    useEffect(() => {
        if (!target) return;
        const onDown = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest('[data-reference-popover]')) close();
        };
        // The mark itself is clicked to open this popup: ignore the very click that opened it
        const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
        return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); };
    }, [target, close]);

    if (!target || !editor || typeof document === 'undefined') return null;
    const reference = getReferenceById(target.id);
    if (!reference) return null;

    const left = Math.max(12, Math.min(target.rect.left, window.innerWidth - WIDTH - 12));
    const placeAbove = target.rect.bottom + 330 > window.innerHeight && target.rect.top > 330;
    const style: React.CSSProperties = placeAbove
        ? { left, bottom: window.innerHeight - target.rect.top + 8 }
        : { left, top: target.rect.bottom + 8 };

    const save = (v: ReferenceFormValue) => {
        useReferenceStore.getState().updateReference(reference.id, { previewText: v.definition, color: v.color, emoji: v.emoji });
        // This occurrence shows the new look right away (other occurrences follow when the autopilot refreshes them)
        editor.chain().setTextSelection(editor.state.selection.from).extendMarkRange('reference')
            .updateAttributes('reference', { color: v.color, emoji: v.emoji }).run();
        close();
    };

    const remove = () => {
        const removed = reference;
        const { from, to } = (() => {
            editor.chain().extendMarkRange('reference').run();
            return editor.state.selection;
        })();
        editor.chain().focus().setTextSelection({ from, to }).unsetMark('reference').run();
        useReferenceStore.getState().removeReference(removed.id);
        close();
        notifyUndo('Referenz entfernt', () => {
            useReferenceStore.getState().addReference(removed);
            editor.chain().focus().setTextSelection({ from, to })
                .setMark('reference', { referenceId: removed.id, isSource: true, color: removed.color, emoji: removed.emoji }).run();
        });
    };

    const activeNoteId = useDataStore.getState().activeNoteId;
    const openSource = reference.sourceNoteId && reference.sourceNoteId !== activeNoteId
        ? () => {
            window.dispatchEvent(new CustomEvent('tide:navigate', { detail: { noteId: reference.sourceNoteId } }));
            window.dispatchEvent(new CustomEvent('tide:navigate-note', { detail: { noteId: reference.sourceNoteId } }));
            close();
        }
        : undefined;

    return createPortal(
        <div ref={popupRef} data-reference-popover className="fixed z-[1100]" style={style}>
            <ReferenceForm
                mode="edit"
                term={reference.term}
                initial={{ definition: reference.previewText, color: reference.color, emoji: reference.emoji }}
                onSave={save}
                onCancel={close}
                onRemove={remove}
                onOpenSource={openSource}
            />
        </div>,
        document.body,
    );
}
