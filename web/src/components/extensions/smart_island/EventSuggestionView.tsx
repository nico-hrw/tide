"use client";

import React, { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Check, Pencil, X, Calendar, Clock, Type } from 'lucide-react';
import type { ParseResult, DetectedToken } from '@/lib/dateParser';

export interface EventSuggestionPayload {
    parseResult: ParseResult;
    blockId: string;
    onAccept: (final: { title: string; start: Date; end: Date }) => void;
    onDismiss: () => void;
}

type FieldKey = 'date' | 'start' | 'end' | 'title';

export const EventSuggestionView: React.FC<{ payload: EventSuggestionPayload }> = ({ payload }) => {
    const { parseResult, onAccept, onDismiss } = payload;
    const [editing, setEditing] = useState(false);
    const [activeField, setActiveField] = useState<FieldKey | null>(null);

    const [title, setTitle] = useState(parseResult.titleHint || 'Neuer Termin');
    const [date, setDate] = useState<Date>(parseResult.proposedDate);
    const [start, setStart] = useState<Date>(parseResult.proposedStart);
    const [end, setEnd] = useState<Date>(parseResult.proposedEnd);

    // Per-field flash: when an incoming payload changes only some fields
    // (e.g. user edited the time), light up the changed fields blue for ~700ms.
    const [flashFields, setFlashFields] = useState<Set<FieldKey>>(new Set());
    const isFirstPayload = useRef(true);

    useEffect(() => {
        const newTitle = payload.parseResult.titleHint || 'Neuer Termin';
        const newDate = payload.parseResult.proposedDate;
        const newStart = payload.parseResult.proposedStart;
        const newEnd = payload.parseResult.proposedEnd;

        const changed = new Set<FieldKey>();
        if (!isFirstPayload.current) {
            if (newTitle !== title) changed.add('title');
            if (newDate.getTime() !== date.getTime()) changed.add('date');
            if (newStart.getTime() !== start.getTime()) changed.add('start');
            if (newEnd.getTime() !== end.getTime()) changed.add('end');
        }

        setTitle(newTitle);
        setDate(newDate);
        setStart(newStart);
        setEnd(newEnd);

        if (changed.size > 0) {
            setFlashFields(changed);
            const timer = setTimeout(() => setFlashFields(new Set()), 700);
            isFirstPayload.current = false;
            return () => clearTimeout(timer);
        }
        isFirstPayload.current = false;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payload.parseResult]);

    const [numberBuffer, setNumberBuffer] = useState<string>('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Tokens of each type for Smart Cycling
    const dateTokens = parseResult.allTokens.filter(t => t.type === 'date') as Extract<DetectedToken, { type: 'date' }>[];
    const timeTokens = parseResult.allTokens.filter(t => t.type === 'time') as Extract<DetectedToken, { type: 'time' }>[];

    // Helpers to find the current cycle index of a value
    const findDateIdx = () => dateTokens.findIndex(t => t.date.getTime() === date.getTime());
    const findStartIdx = () => timeTokens.findIndex(t => t.hour === start.getHours() && t.minute === start.getMinutes());
    const findEndIdx = () => timeTokens.findIndex(t => t.hour === end.getHours() && t.minute === end.getMinutes());

    const cycleDate = (dir: 1 | -1) => {
        if (dateTokens.length === 0) return;
        const idx = findDateIdx();
        const nextIdx = idx === -1 ? 0 : (idx + dir + dateTokens.length) % dateTokens.length;
        const newDate = dateTokens[nextIdx].date;
        setDate(newDate);
        // Re-anchor start/end times onto new date
        const s = new Date(newDate); s.setHours(start.getHours(), start.getMinutes(), 0, 0);
        const e = new Date(newDate); e.setHours(end.getHours(), end.getMinutes(), 0, 0);
        setStart(s);
        setEnd(e);
    };

    const cycleTime = (which: 'start' | 'end', dir: 1 | -1) => {
        if (timeTokens.length === 0) return;
        const idx = which === 'start' ? findStartIdx() : findEndIdx();
        const nextIdx = idx === -1 ? 0 : (idx + dir + timeTokens.length) % timeTokens.length;
        const tok = timeTokens[nextIdx];
        const base = new Date(date);
        base.setHours(tok.hour, tok.minute, 0, 0);
        if (which === 'start') {
            setStart(base);
            // If end now ≤ start, force end = start + 5min for visibility
            if (end.getTime() <= base.getTime()) setEnd(new Date(base.getTime() + 5 * 60_000));
        } else {
            // If end ≤ start, clamp
            if (base.getTime() <= start.getTime()) {
                setEnd(new Date(start.getTime() + 5 * 60_000));
            } else {
                setEnd(base);
            }
        }
    };

    // Smart Cycling: keyboard handler when a time field is active
    useEffect(() => {
        if (!editing || activeField === null || activeField === 'title') return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (activeField === 'date') cycleDate(1);
                else cycleTime(activeField, 1);
                setNumberBuffer('');
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (activeField === 'date') cycleDate(-1);
                else cycleTime(activeField, -1);
                setNumberBuffer('');
            } else if (e.key === 'Enter') {
                e.preventDefault();
                setActiveField(null);
                setNumberBuffer('');
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setActiveField(null);
                setNumberBuffer('');
            } else if (/^\d$/.test(e.key)) {
                e.preventDefault();
                const next = (numberBuffer + e.key).slice(-2);
                setNumberBuffer(next);
                if (activeField === 'start' || activeField === 'end') {
                    const h = parseInt(next, 10);
                    if (h >= 0 && h <= 23) {
                        const base = new Date(date);
                        base.setHours(h, 0, 0, 0);
                        if (activeField === 'start') {
                            setStart(base);
                            if (end.getTime() <= base.getTime()) setEnd(new Date(base.getTime() + 60 * 60_000));
                        } else {
                            if (base.getTime() <= start.getTime()) setEnd(new Date(start.getTime() + 5 * 60_000));
                            else setEnd(base);
                        }
                    }
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [editing, activeField, dateTokens, timeTokens, date, start, end, numberBuffer]);

    const handleAccept = () => {
        onAccept({ title: title.trim() || 'Neuer Termin', start, end });
    };

    const durationMins = Math.round((end.getTime() - start.getTime()) / 60_000);
    const durationLabel = durationMins >= 60
        ? `${Math.floor(durationMins / 60)}h${durationMins % 60 ? ` ${durationMins % 60}m` : ''}`
        : `${durationMins}m`;

    const chipBase = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-semibold transition-all duration-200 cursor-default select-none";

    const chipStyle = (key: FieldKey) => {
        const isActive = editing && activeField === key;
        const isFlashing = flashFields.has(key);
        if (isFlashing) return `${chipBase} bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 ring-2 ring-blue-400/50 dark:ring-blue-500/40`;
        if (isActive) return `${chipBase} bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-400/50 dark:ring-indigo-500/40`;
        if (editing) return `${chipBase} bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/15 cursor-pointer border border-dashed border-gray-300 dark:border-white/20`;
        return `${chipBase} bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300`;
    };

    return (
        <div className="flex flex-col gap-0 w-[22rem] overflow-hidden select-none">
            {/* Header */}
            <div className="px-4 pt-4 pb-3 bg-gradient-to-r from-indigo-500/10 via-violet-500/8 to-purple-500/6 dark:from-indigo-500/15 dark:via-violet-500/10 dark:to-purple-500/8">
                <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-sm">
                        <Calendar size={14} className="text-white" />
                    </div>
                    <div>
                        <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Termin erkannt</div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">{durationLabel} Dauer</div>
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="px-4 py-3 flex flex-col gap-3">
                {/* Title field */}
                <div className="flex flex-col gap-1">
                    {editing && activeField === 'title' ? (
                        <input
                            ref={inputRef}
                            autoFocus
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onBlur={() => setActiveField(null)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
                            className="w-full px-3 py-1.5 text-[15px] font-bold bg-white dark:bg-white/10 border border-indigo-300 dark:border-indigo-600 rounded-lg text-gray-900 dark:text-gray-100 outline-none ring-2 ring-indigo-400/30 dark:ring-indigo-500/30"
                        />
                    ) : (
                        <button
                            disabled={!editing}
                            onClick={() => editing && setActiveField('title')}
                            className="w-full text-left flex items-center gap-2 group"
                        >
                            <Type size={13} className="text-gray-400 dark:text-gray-500 shrink-0" />
                            <span className={`text-[15px] font-bold text-gray-900 dark:text-gray-100 leading-tight truncate ${editing ? 'group-hover:text-indigo-600 dark:group-hover:text-indigo-400 cursor-pointer' : ''} ${flashFields.has('title') ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                                {title}
                            </span>
                        </button>
                    )}
                </div>

                {/* Date & Time chips */}
                <div className="flex flex-wrap gap-1.5">
                    <button
                        disabled={!editing}
                        onClick={() => editing && setActiveField('date')}
                        className={chipStyle('date')}
                    >
                        <Calendar size={12} />
                        {format(date, 'EEE, dd. MMM', { locale: de })}
                    </button>
                    <button
                        disabled={!editing}
                        onClick={() => editing && setActiveField('start')}
                        className={chipStyle('start')}
                    >
                        <Clock size={12} />
                        {format(start, 'HH:mm')}
                    </button>
                    <span className="self-center text-[11px] text-gray-400 dark:text-gray-500 font-medium">–</span>
                    <button
                        disabled={!editing}
                        onClick={() => editing && setActiveField('end')}
                        className={chipStyle('end')}
                    >
                        {format(end, 'HH:mm')}
                    </button>
                </div>

                {/* Keyboard hint when editing date/time fields */}
                {editing && activeField !== 'title' && activeField !== null && (
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                        <span className="px-1 py-0.5 rounded bg-gray-100 dark:bg-white/10 font-mono text-[9px]">←→</span>
                        <span>{activeField === 'date' ? 'Datum wechseln' : 'Zeit wechseln'}</span>
                        <span className="mx-0.5">·</span>
                        <span className="px-1 py-0.5 rounded bg-gray-100 dark:bg-white/10 font-mono text-[9px]">0-9</span>
                        <span>Eingeben</span>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="px-4 pb-4 pt-1 flex items-center gap-2">
                <button
                    onClick={onDismiss}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                >
                    <X size={13} />
                    Nein
                </button>
                <button
                    onClick={() => { setEditing(!editing); setActiveField(null); }}
                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${editing
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10'
                        }`}
                >
                    <Pencil size={13} />
                    {editing ? 'Fertig' : 'Ändern'}
                </button>
                <div className="flex-1" />
                <button
                    onClick={handleAccept}
                    className="flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-bold bg-indigo-500 hover:bg-indigo-600 text-white shadow-sm shadow-indigo-300/30 dark:shadow-indigo-900/30 transition-all active:scale-[0.97]"
                >
                    <Check size={14} />
                    Erstellen
                </button>
            </div>
        </div>
    );
};

export default EventSuggestionView;
