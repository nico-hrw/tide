'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button, IconButton, Toggle } from '../ui/Controls';
import { useT } from '../useT';
import { useDataStore } from '@/store/useDataStore';
import { useCalendarShareStore } from '@/store/useCalendarShareStore';
import { notify, notifyError } from '@/lib/feedback';
import { summarizeGroupShares, type CalendarSharePermission, type CalendarShareRecipient, type CalendarShareRule, type PlanEvent } from '@/lib/calendarShare';
import { loadGroupEvents, syncGroupShares } from '@/lib/calendarShareActions';

export interface CalendarShareDialogProps {
    group: { id: string; title: string };
    /** The stored rule, if the calendar is already shared. */
    rule?: CalendarShareRule;
    onClose: () => void;
}

type Progress = { phase: 'check' | 'apply'; done: number; total: number } | null;
type SyncArgs = { rule: CalendarShareRule; removed: string[]; permissionChanged: string[] };

const initials = (name: string): string =>
    name.split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Mockup 4: share a whole calendar. Nothing is shared or revoked before the user confirms; then the rule is
 * stored and the shares of every own event of the group are brought in line, one after another with progress.
 */
export function CalendarShareDialog({ group, rule, onClose }: CalendarShareDialogProps) {
    const t = useT();
    const titleId = useId();
    const listId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const mounted = useRef(true);
    const storeContacts = useDataStore((s) => s.contacts);
    const contacts = useMemo(() => storeContacts ?? [], [storeContacts]);
    const saveRule = useCalendarShareStore((s) => s.saveRule);

    const [recipients, setRecipients] = useState<CalendarShareRecipient[]>(rule?.recipients ?? []);
    const [autoShareNew, setAutoShareNew] = useState(rule?.autoShareNew ?? true);
    const [query, setQuery] = useState('');
    const [events, setEvents] = useState<PlanEvent[] | null>(null);
    const [progress, setProgress] = useState<Progress>(null);
    const [result, setResult] = useState<{ failed: number; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [lastSync, setLastSync] = useState<SyncArgs | null>(null);
    const busy = progress !== null;

    // Focus: into the dialog on open, back to the opener on close.
    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null;
        inputRef.current?.focus();
        return () => { mounted.current = false; opener?.focus?.(); };
    }, []);

    // An existing share: read the current state of the group's events for the status line.
    useEffect(() => {
        if (!rule) return;
        let alive = true;
        setProgress({ phase: 'check', done: 0, total: 0 });
        loadGroupEvents(group.id, (done, total) => alive && setProgress({ phase: 'check', done, total }))
            .then((ev) => { if (alive) setEvents(ev); })
            .catch(() => { if (alive) setError(t('calShare.loadFailed')); })
            .finally(() => { if (alive) setProgress(null); });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [group.id]);

    const nameOf = (userId: string): string => contacts.find((c) => c.id === userId)?.username || userId.slice(0, 8);
    const suggestions = useMemo(() => {
        const q = query.replace(/^@/, '').trim().toLowerCase();
        if (!q) return [];
        return contacts
            .filter((c) => c.status === 'accepted' && !!c.public_key && !recipients.some((r) => r.userId === c.id))
            .filter((c) => (c.username || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q))
            .slice(0, 6);
    }, [contacts, query, recipients]);

    const removed = (rule?.recipients ?? []).filter((r) => !recipients.some((x) => x.userId === r.userId)).map((r) => r.userId);
    const permissionChanged = recipients
        .filter((r) => rule?.recipients.some((x) => x.userId === r.userId && x.permission !== r.permission))
        .map((r) => r.userId);
    const dirty = !rule
        ? recipients.length > 0
        : removed.length > 0 || permissionChanged.length > 0 || autoShareNew !== rule.autoShareNew
            || recipients.some((r) => !rule.recipients.some((x) => x.userId === r.userId));

    const add = (userId: string) => {
        setRecipients((list) => [...list, { userId, permission: 'view' }]);
        setQuery('');
        inputRef.current?.focus();
    };
    const setPermission = (userId: string, permission: CalendarSharePermission) =>
        setRecipients((list) => list.map((r) => (r.userId === userId ? { ...r, permission } : r)));
    const remove = (userId: string) => setRecipients((list) => list.filter((r) => r.userId !== userId));

    const runSync = async (args: SyncArgs) => {
        setLastSync(args);
        setResult(null);
        setError(null);
        setProgress({ phase: 'check', done: 0, total: 0 });
        try {
            const res = await syncGroupShares({ ...args, onProgress: (p) => mounted.current && setProgress(p) });
            if (!mounted.current) {
                // The dialog was closed meanwhile: the outcome must still reach the user.
                if (res.failed > 0) notifyError(t('calShare.failed', { failed: res.failed, total: res.total }));
                else notify(t('calShare.status', { shared: summarizeGroupShares({ events: res.events, rule: args.rule }).shared, total: res.events.length }), { tone: 'success' });
                return;
            }
            setEvents(res.events);
            setResult({ failed: res.failed, total: res.total });
        } catch {
            if (mounted.current) setError(t('calShare.loadFailed'));
            else notifyError(t('calShare.loadFailed'));
        } finally {
            if (mounted.current) setProgress(null);
        }
    };

    const confirm = async () => {
        const next: CalendarShareRule = { groupId: group.id, recipients, autoShareNew };
        const args = { rule: next, removed, permissionChanged };
        setError(null);
        try {
            await saveRule(next); // the rule exists only after this explicit confirmation
        } catch {
            setError(t('calShare.saveFailed'));
            return;
        }
        await runSync(args);
    };

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

    const statusRule: CalendarShareRule = { groupId: group.id, recipients: rule?.recipients ?? [], autoShareNew };
    const summary = events && statusRule.recipients.length > 0 ? summarizeGroupShares({ events, rule: statusRule }) : null;
    const statusParts = summary ? [
        t('calShare.status', { shared: summary.shared, total: summary.total }),
        summary.privateCount === 1 ? t('calShare.statusPrivateOne') : summary.privateCount > 1 ? t('calShare.statusPrivateMany', { count: summary.privateCount }) : '',
        summary.notOwned > 0 ? t('calShare.statusForeign', { count: summary.notOwned }) : '',
        summary.unchecked > 0 ? t('calShare.statusUnchecked', { count: summary.unchecked }) : '',
    ].filter(Boolean) : [];

    if (typeof document === 'undefined') return null;
    return createPortal(
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onKeyDown={onKeyDown}
                className="flex max-h-[calc(100vh-32px)] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border border-t2-line bg-t2-surface p-5 text-t2-ink shadow-2xl"
            >
                <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <h2 id={titleId} className="text-base font-semibold">{t('calShare.title', { name: group.title })}</h2>
                        <p className="mt-1 text-[13px] text-t2-ink-2">{t('calShare.intro')}</p>
                    </div>
                    <IconButton label={t('calShare.close')} onClick={onClose}><X className="h-[15px] w-[15px]" /></IconButton>
                </div>

                <div>
                    <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-t2-ink-3">{t('calShare.people')}</div>
                    {recipients.length === 0 && <p className="text-[13px] text-t2-ink-3">{t('calShare.noPeople')}</p>}
                    <ul className="flex flex-col gap-1">
                        {recipients.map((r) => {
                            const name = nameOf(r.userId);
                            return (
                                <li key={r.userId} className="flex items-center gap-2.5 rounded-xl px-1 py-1">
                                    <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-t2-sub text-[11px] font-semibold text-t2-ink-2">{initials(name)}</span>
                                    <span className="min-w-0 flex-1 truncate text-[14px]">{name}</span>
                                    <select
                                        value={r.permission}
                                        disabled={busy}
                                        aria-label={t('calShare.permissionOf', { name })}
                                        onChange={(e) => setPermission(r.userId, e.target.value as CalendarSharePermission)}
                                        className="rounded-lg bg-t2-sub px-2 py-1 text-[13px] text-t2-ink-2 outline-none focus:ring-1 focus:ring-t2-accent"
                                    >
                                        <option value="view">{t('mention.permView')} ▾</option>
                                        <option value="edit">{t('mention.permEdit')} ▾</option>
                                    </select>
                                    <IconButton label={t('calShare.remove', { name })} tone="danger" disabled={busy} onClick={() => remove(r.userId)}>
                                        <X className="h-[14px] w-[14px]" />
                                    </IconButton>
                                </li>
                            );
                        })}
                    </ul>
                    {removed.length > 0 && <p className="mt-1 text-[12px] text-t2-ink-3">{t('calShare.removeHint')}</p>}
                    <div className="relative mt-2">
                        <input
                            ref={inputRef}
                            value={query}
                            disabled={busy}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && suggestions[0]) { e.preventDefault(); add(suggestions[0].id); } }}
                            placeholder={t('calShare.addPlaceholder')}
                            aria-label={t('calShare.addLabel')}
                            aria-controls={listId}
                            aria-expanded={query.trim().length > 0}
                            role="combobox"
                            aria-autocomplete="list"
                            className="w-full rounded-xl bg-t2-sub px-3 py-2 text-[14px] text-t2-ink outline-none placeholder:text-t2-ink-3 focus:ring-1 focus:ring-t2-accent"
                        />
                        {query.trim() && (
                            <ul id={listId} role="listbox" aria-label={t('calShare.addLabel')} className="mt-1 flex flex-col rounded-xl border border-t2-line bg-t2-surface p-1">
                                {suggestions.length === 0 && <li className="px-2 py-1.5 text-[13px] text-t2-ink-3">{t('calShare.noMatches')}</li>}
                                {suggestions.map((c) => (
                                    <li key={c.id} role="option" aria-selected={false}>
                                        <button type="button" onClick={() => add(c.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-t2-hover">
                                            <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-t2-sub text-[11px] font-semibold text-t2-ink-2">{initials(c.username || '')}</span>
                                            <span className="truncate">{c.username}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl bg-t2-sub px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-medium">{t('calShare.autoNew')}</div>
                        <div className="text-[12px] text-t2-ink-3">{t('calShare.autoNewHint')}</div>
                    </div>
                    <Toggle checked={autoShareNew} onChange={setAutoShareNew} label={t('calShare.autoNew')} disabled={busy} />
                </div>

                <div role="status" aria-live="polite" className="min-h-[18px] text-[12.5px] text-t2-ink-2">
                    {progress
                        ? t(progress.phase === 'check' ? 'calShare.checking' : 'calShare.applying', { done: progress.done, total: progress.total })
                        : statusParts.join(' · ')}
                </div>
                {result && result.failed > 0 && !busy && (
                    <p role="alert" className="flex flex-wrap items-center gap-1 text-[12.5px] text-t2-late">
                        {t('calShare.failed', { failed: result.failed, total: result.total })} ·
                        <button type="button" className="font-semibold underline" onClick={() => lastSync && void runSync(lastSync)}>{t('calShare.retry')}</button>
                    </p>
                )}
                {error && <p role="alert" className="text-[12.5px] text-t2-late">{error}</p>}

                <div className="flex justify-end gap-2">
                    <Button onClick={onClose}>{result ? t('calShare.close') : t('calShare.cancel')}</Button>
                    <Button variant="primary" disabled={busy || !dirty} onClick={() => void confirm()}>
                        {rule ? t('calShare.save') : t('calShare.confirm')}
                    </Button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
