"use client";

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { NodeViewProps } from '@tiptap/react';
import Avatar from '@/components/Profile/Avatar';
import { ContactMentionChip } from '@/components/Editor/ContactMentionChip';
import { MentionShareToast } from '@/components/Editor/MentionShareToast';
import { ensureContactsLoaded, resetContactsRequest } from '@/components/extensions/mentionGroups';
import { useT } from '@/components/Settings/useT';
import { canMentionInEvent, precheckEventMention, recordSessionPick, shareEventViaMention, undoEventMentionShare, type MentionSession } from '@/lib/eventMentionShare';
import {
    applyMentionPick, fromEditText, mentionRows, mentionTrigger, parseEventMentions,
    removeEventMention, removedMentions, toEditText, type EventMention,
} from '@/lib/eventMentions';
import { handleRemovedContactMentions } from '@/lib/mentionShare';
import { useDataStore } from '@/store/useDataStore';
import { useMentionShareStore } from '@/store/useMentionShareStore';

export interface EventMentionFieldProps {
    /** Event (or occurrence) id. Empty for a draft: no menu then, there is no file to share yet. */
    eventId: string;
    /** Stored description (may contain mention tokens, see lib/eventMentions.ts). */
    value: string;
    onChange: (stored: string) => void;
    onBlur?: () => void;
    isPrivate?: boolean;
    placeholder?: string;
    rows?: number;
    className?: string;
    ariaLabel?: string;
    /** Layer of the share hint, above the host popover or sheet */
    toastZIndex?: number;
    /**
     * For hosts that save only on confirm (mobile sheet): collects this session's picks, and blur no
     * longer asks the revoke question (the host decides: kept edits ask on unmount, discarded ones never).
     */
    session?: MentionSession;
}

/** The name comes from the contact list only: a token written by someone else must not fake a name. */
const chipNode = (m: EventMention, known: boolean, shareable: boolean) =>
    ({ node: { attrs: { id: m.id, label: known ? m.label : '', type: 'contact', itemKind: 'event', shareable } } }) as unknown as Pick<NodeViewProps, 'node'>;

/**
 * Description textarea where typing `@` offers contacts. A pick inserts a mention and shares the
 * event ("view", owner only, never when private) with the same hint as in notes. The mentioned
 * people show as chips (avatar + name, click opens the profile) in a "Mit" row below.
 * Mount with `key={eventId}`: the question "revoke access too?" compares against this event only.
 */
export function EventMentionField({ eventId, value, onChange, onBlur, isPrivate, placeholder, rows = 2, className, ariaLabel, toastZIndex, session }: EventMentionFieldProps) {
    const t = useT();
    const listId = useId();
    const contacts = useDataStore((s) => s.contacts);
    const canShare = useDataStore(() => !!eventId && canMentionInEvent(eventId));
    const taRef = useRef<HTMLTextAreaElement>(null);
    const valueRef = useRef(value);
    useLayoutEffect(() => { valueRef.current = value; });
    const committedRef = useRef(value);
    const caretRef = useRef<number | null>(null);
    // People mentioned in this editing session: re-typing a name whose token a half-deleted edit broke restores it.
    const knownRef = useRef<EventMention[]>(parseEventMentions(value));
    const sharedNow = useMentionShareStore((s) => s.entries);
    const [sharedIds, setSharedIds] = useState<string[]>([]);
    const [menu, setMenu] = useState<{ start: number; query: string; active: number } | null>(null);

    const mentions = parseEventMentions(value);
    const editText = toEditText(value);
    const rows_ = menu ? mentionRows(contacts || [], menu.query) : [];
    const baseId = eventId.split('_')[0];
    const knownIds = new Set((contacts || []).map((c) => c.id));
    const isShared = (id: string) => sharedIds.includes(id) || sharedNow[`${baseId}:${id}`] !== undefined;

    useLayoutEffect(() => {
        if (caretRef.current !== null && taRef.current) {
            taRef.current.setSelectionRange(caretRef.current, caretRef.current);
            caretRef.current = null;
        }
    });

    const forget = (id: string) => { knownRef.current = knownRef.current.filter((m) => m.id !== id); };

    /** Ask whether to revoke for people whose last mention is gone (only shares a mention made). */
    const settle = useCallback((next: string) => {
        const gone = removedMentions(committedRef.current, next);
        committedRef.current = next;
        if (gone.length > 0 && eventId) {
            // After a confirmed revoke the name must not silently turn back into a mention.
            void handleRemovedContactMentions(baseId, gone).then(() => {
                for (const g of gone) if (!useMentionShareStore.getState().origin(baseId, g.id)) forget(g.id);
            });
        }
    }, [eventId, baseId]);

    // Closing the host without a blur must not skip the question.
    useEffect(() => () => {
        if (session?.discarded) return; // a thrown-away edit asks nothing
        const gone = removedMentions(committedRef.current, valueRef.current);
        if (gone.length > 0 && eventId) void handleRemovedContactMentions(baseId, gone);
    }, [eventId, baseId, session]);

    const emitText = (text: string, extra: EventMention[] = []) => {
        knownRef.current = [...knownRef.current, ...parseEventMentions(valueRef.current), ...extra];
        onChange(fromEditText(text, knownRef.current));
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.target.value;
        emitText(text);
        const trig = canShare ? mentionTrigger(text, e.target.selectionStart ?? text.length) : null;
        if (trig && !menu) { resetContactsRequest(); ensureContactsLoaded(); }
        setMenu(trig ? { ...trig, active: 0 } : null);
    };

    const pick = (row: { id: string; label: string }) => {
        if (!menu) return;
        const trig = { start: menu.start, query: menu.query };
        const caret = taRef.current?.selectionStart ?? trig.start + 1 + trig.query.length;
        setMenu(null);
        // A blocked pick (private, not yours, no key) shows its hint and changes no text.
        if (!precheckEventMention({ eventId, contactId: row.id, isPrivate }).ok) return;
        const next = applyMentionPick(toEditText(valueRef.current), trig, caret, row.label);
        caretRef.current = next.caret;
        emitText(next.text, [{ id: row.id, label: row.label }]);
        void shareEventViaMention({ eventId, contactId: row.id, label: row.label, isPrivate }).then((res) => {
            if (res.status === 'shared' || res.status === 'already') setSharedIds((ids) => [...ids, row.id]);
            if (res.status === 'shared' && session) recordSessionPick(session, eventId, row.id);
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!menu) return;
        const n = rows_.length;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMenu(null); return; }
        if (e.nativeEvent.isComposing) return; // IME: Enter confirms the composition
        if (n === 0) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setMenu({ ...menu, active: (menu.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n });
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            pick(rows_[menu.active] ?? rows_[0]);
        }
    };

    const removeChip = (m: EventMention) => {
        const next = removeEventMention(valueRef.current, m.id);
        forget(m.id);
        onChange(next);
        settle(next);
    };

    const undo = async (h: { contactId: string }) => {
        const ok = await undoEventMentionShare(eventId, h.contactId);
        if (ok) {
            const next = removeEventMention(valueRef.current, h.contactId);
            forget(h.contactId);
            committedRef.current = next; // the entry is cleared: no revoke question follows
            onChange(next);
        }
        return ok;
    };

    const activeId = menu && rows_[menu.active] ? `${listId}-${rows_[menu.active].id}` : undefined;

    return (
        <div className="relative">
            <textarea
                ref={taRef}
                value={editText}
                onChange={handleChange}
                onFocus={() => { committedRef.current = valueRef.current; }}
                onBlur={() => { setMenu(null); if (!session) settle(valueRef.current); onBlur?.(); }}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                rows={rows}
                aria-label={ariaLabel}
                role={canShare ? 'combobox' : undefined}
                aria-autocomplete={canShare ? 'list' : undefined}
                aria-expanded={canShare ? !!menu : undefined}
                aria-controls={menu ? listId : undefined}
                aria-activedescendant={activeId}
                className={className}
            />
            {menu && (
                <ul
                    id={listId}
                    role="listbox"
                    aria-label={t('mention.pickerLabel')}
                    className="absolute left-0 right-0 top-full mt-1 z-20 max-h-48 overflow-y-auto rounded-xl border border-t2-line bg-t2-surface shadow-float p-1"
                >
                    {rows_.length === 0 && <li role="presentation" className="px-2 py-1.5 text-xs text-t2-ink-3">{t('mention.noContacts')}</li>}
                    {rows_.map((r, i) => (
                        <li
                            key={r.id}
                            id={`${listId}-${r.id}`}
                            role="option"
                            aria-selected={i === menu.active}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pick(r)}
                            onMouseEnter={() => setMenu({ ...menu, active: i })}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs text-t2-ink ${i === menu.active ? 'bg-t2-hover' : ''}`}
                        >
                            <Avatar seed={(r.avatar.avatar_seed || r.id) + (r.avatar.avatar_salt || '')} style={r.avatar.avatar_style === 'openPeeps' ? 'openPeeps' : 'notionists'} size={20} />
                            <span className="font-medium">{r.username}</span>
                        </li>
                    ))}
                </ul>
            )}
            {mentions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-t2-ink-3" data-event-mentions>
                    <span>{t('mention.withLabel')}</span>
                    {mentions.map((m) => (
                        <span key={m.id} className="inline-flex items-center gap-0.5">
                            <ContactMentionChip {...chipNode(m, knownIds.has(m.id), isShared(m.id))} />
                            {canShare && (
                                <button
                                    type="button"
                                    onClick={() => removeChip(m)}
                                    aria-label={t('mention.removeMention', { name: m.label })}
                                    className="p-0.5 rounded-full text-t2-ink-3 hover:text-t2-ink"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </span>
                    ))}
                </div>
            )}
            {eventId && (
                <MentionShareToast
                    editor={null}
                    fileId={baseId}
                    zIndex={toastZIndex}
                    onUndo={undo}
                    onRetry={async (h) => { await shareEventViaMention({ eventId, contactId: h.contactId, label: h.name, isPrivate }); }}
                />
            )}
        </div>
    );
}

export default EventMentionField;
