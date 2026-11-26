"use client";

import React, { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { X } from 'lucide-react';
import { useT } from '@/components/Settings/useT';
import { notifyError } from '@/lib/feedback';
import { startContactMentionShare, undoMentionShare, updateMentionSharePermission } from '@/lib/mentionShare';
import { useMentionShareStore, type MentionSharePermission } from '@/store/useMentionShareStore';

const HIDE_AFTER_MS = 8000;

function initialsOf(name: string): string {
    const parts = name.replace(/^@/, '').trim().split(/[\s._-]+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * Hint after an @-contact mention: "Mit Anna geteilt · Ansehen ▾ · Rückgängig",
 * "Teilen fehlgeschlagen · Erneut versuchen" or the reason it was not shared.
 * Shown next to the chip of the editor whose file it belongs to.
 */
export function MentionShareToast({ editor, fileId, onUndo, onRetry, zIndex }: {
    editor: Editor | null;
    fileId?: string;
    /** Above the host's own layer (popovers and sheets sit above the default z-90) */
    zIndex?: number;
    /** Non-editor hosts (event descriptions): revoke and remove the mention themselves; resolves true when done. */
    onUndo?: (hint: { fileId: string; contactId: string }) => Promise<boolean>;
    onRetry?: (hint: { fileId: string; contactId: string; name: string }) => Promise<void>;
}) {
    const t = useT();
    const hint = useMentionShareStore((s) => s.hint);
    const dismiss = useMentionShareStore((s) => s.dismissHint);
    const [busy, setBusy] = useState(false);
    const [hovered, setHovered] = useState(false);
    const visible = !!hint && !!fileId && hint.fileId === fileId;
    const chipPos = visible ? hint?.chipPos : undefined;

    // Anchor below the chip; fall back to the bottom of the screen.
    const pos = useMemo(() => {
        if (!editor || editor.isDestroyed || typeof chipPos !== 'number') return null;
        try {
            const c = editor.view.coordsAtPos(Math.min(chipPos, editor.state.doc.content.size));
            return { top: c.bottom + 6, left: Math.max(8, Math.min(c.left, window.innerWidth - 340)) };
        } catch {
            return null;
        }
    }, [editor, chipPos]);

    useEffect(() => {
        if (!visible || hovered || busy) return;
        const seq = hint?.seq;
        const id = window.setTimeout(() => { if (useMentionShareStore.getState().hint?.seq === seq) dismiss(); }, HIDE_AFTER_MS);
        return () => window.clearTimeout(id);
    }, [visible, hovered, busy, hint?.seq, dismiss]);

    if (!visible || !hint) return null;

    const doUndo = async () => {
        setBusy(true);
        const ok = onUndo ? await onUndo(hint) : await undoMentionShare(editor, hint.fileId, hint.contactId, hint.chipPos);
        setBusy(false);
        if (ok) dismiss();
    };

    const doRetry = async () => {
        setBusy(true);
        dismiss();
        if (onRetry) await onRetry(hint);
        else await startContactMentionShare({ fileId: hint.fileId, contactId: hint.contactId, label: hint.name, shareable: true, chipPos: hint.chipPos });
        setBusy(false);
    };

    const onPermission = async (next: MentionSharePermission) => {
        const prev = hint.permission;
        useMentionShareStore.getState().updateHint({ permission: next });
        try {
            await updateMentionSharePermission(hint.fileId, hint.contactId, next);
        } catch {
            useMentionShareStore.getState().updateHint({ permission: prev });
            notifyError(t('mention.permFailed'));
        }
    };

    const message = hint.status === 'shared'
        ? t('mention.shared', { name: hint.name })
        : hint.status === 'failed'
            ? t('mention.shareFailed')
            : hint.reason === 'not-shareable' ? t('mention.blockedUnconfirmed')
                : hint.reason === 'no-key' ? t('mention.blockedNoKey')
                    : hint.reason === 'private' ? t('mention.blockedPrivate') : t('mention.blockedNotAllowed');

    const placement = pos
        ? { position: 'fixed' as const, top: pos.top, left: pos.left, zIndex }
        : { position: 'fixed' as const, bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex };

    return (
        <div
            role="status"
            aria-live="polite"
            style={placement}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setHovered(true)}
            onBlur={() => setHovered(false)}
            className="z-[90] flex items-center gap-2 rounded-full bg-t2-accent text-t2-accent-ink shadow-lg pl-1.5 pr-2 py-1 text-xs font-medium max-w-[calc(100vw-16px)]"
        >
            <span aria-hidden className="w-6 h-6 shrink-0 rounded-full bg-t2-accent-ink text-t2-accent flex items-center justify-center text-[11px] font-semibold">
                {initialsOf(hint.name)}
            </span>
            <span className="truncate">{message}</span>
            {hint.status === 'shared' && (
                <>
                    <span aria-hidden className="opacity-60">·</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <span className="sr-only">{t('mention.permission')}</span>
                        <select
                            value={hint.permission}
                            disabled={busy}
                            onChange={(e) => void onPermission(e.target.value === 'edit' ? 'edit' : 'view')}
                            className="appearance-none bg-transparent text-t2-accent-ink font-medium pr-3 cursor-pointer focus:outline-none focus-visible:underline"
                        >
                            <option value="view" className="bg-t2-surface text-t2-ink">{t('mention.permView')}</option>
                            <option value="edit" className="bg-t2-surface text-t2-ink">{t('mention.permEdit')}</option>
                        </select>
                        <span aria-hidden className="pointer-events-none absolute right-0">▾</span>
                    </label>
                    <span aria-hidden className="opacity-60">·</span>
                    <button type="button" disabled={busy} onClick={() => void doUndo()} className="font-semibold underline-offset-2 hover:underline disabled:opacity-60">
                        {t('mention.undo')}
                    </button>
                </>
            )}
            {hint.status === 'failed' && (
                <>
                    <span aria-hidden className="opacity-60">·</span>
                    <button type="button" disabled={busy} onClick={() => void doRetry()} className="font-semibold underline-offset-2 hover:underline disabled:opacity-60">
                        {t('mention.retry')}
                    </button>
                </>
            )}
            <button type="button" onClick={dismiss} aria-label={t('mention.dismiss')} className="ml-0.5 p-0.5 rounded-full opacity-70 hover:opacity-100">
                <X size={12} />
            </button>
        </div>
    );
}

export default MentionShareToast;
