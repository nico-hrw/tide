'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button, IconButton } from '../ui/Controls';
import { useT } from '../useT';
import { DT } from '@/lib/designTokens';
import { useCalendarShareRules, useCalendarShareStore } from '@/store/useCalendarShareStore';
import { CalendarShareForm } from './CalendarShareForm';

export interface CalendarShareDialogProps {
    group: { id: string; title: string };
    onClose: () => void;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * "Kalender „X“ teilen". The form is only shown once the stored rules have been (re-)read: seeding it from a
 * rule that is still loading would make "Speichern" overwrite the stored people without revoking them.
 */
export function CalendarShareDialog({ group, onClose }: CalendarShareDialogProps) {
    const t = useT();
    const titleId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const rules = useCalendarShareRules();
    const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');

    const readRules = () => useCalendarShareStore.getState().load({ force: true }).then((ok) => setPhase(ok ? 'ready' : 'error'));
    const retryLoad = () => {
        setPhase('loading');
        void readRules();
    };

    // Focus: back to the opener on close. Re-read the rules on open (another device may have changed them).
    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null;
        void readRules(); // phase starts as 'loading'
        return () => { opener?.focus?.(); };
    }, [group.id]);
    useEffect(() => {
        if (phase !== 'ready') dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }, [phase]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
            return;
        }
        if (e.key !== 'Tab' || !dialogRef.current) return;
        const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    if (typeof document === 'undefined') return null;
    return createPortal(
        <div
            className="fixed inset-0 z-[1300] flex items-center justify-center p-4"
            style={{ background: DT.modal.scrim }}
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-busy={phase === 'loading'}
                onKeyDown={onKeyDown}
                className="flex max-h-[calc(100vh-32px)] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border border-t2-line bg-t2-surface p-5 text-t2-ink shadow-2xl"
            >
                {phase === 'ready' ? (
                    <CalendarShareForm group={group} rule={rules[group.id]} titleId={titleId} onClose={onClose} />
                ) : (
                    <>
                        <div className="flex items-start gap-3">
                            <h2 id={titleId} className="min-w-0 flex-1 text-base font-semibold">{t('calShare.title', { name: group.title })}</h2>
                            <IconButton label={t('calShare.close')} onClick={onClose}><X className="h-[15px] w-[15px]" /></IconButton>
                        </div>
                        {phase === 'loading' ? (
                            <p role="status" className="text-[13px] text-t2-ink-2">{t('calShare.loadingRules')}</p>
                        ) : (
                            <p role="alert" className="flex flex-wrap items-center gap-1 text-[13px] text-t2-late">
                                {t('calShare.loadFailed')} ·
                                <button type="button" className="font-semibold underline" onClick={retryLoad}>{t('calShare.retry')}</button>
                            </p>
                        )}
                        <div className="flex justify-end gap-2">
                            <Button onClick={onClose}>{t('calShare.cancel')}</Button>
                            <Button variant="primary" disabled>{t('calShare.confirm')}</Button>
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body,
    );
}
