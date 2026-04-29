"use client";

import React, { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { Check, Pencil, X } from 'lucide-react';
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

    const renderField = (key: FieldKey, content: React.ReactNode) => {
        const isActive = editing && activeField === key;
        return (
            <button
                disabled={!editing}
                onClick={() => editing && setActiveField(key)}
                style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '2px 6px', margin: '0 1px',
                    borderRadius: 4,
                    background: isActive ? 'rgba(99,102,241,0.25)' : (editing ? 'rgba(99,102,241,0.08)' : 'transparent'),
                    border: isActive ? '1px solid rgba(99,102,241,0.6)' : (editing ? '1px dashed rgba(99,102,241,0.3)' : '1px solid transparent'),
                    color: 'inherit', font: 'inherit',
                    cursor: editing ? 'pointer' : 'default',
                    transition: 'background 0.15s, border-color 0.15s',
                }}
            >
                {content}
            </button>
        );
    };

    return (
        <div className="flex flex-col gap-3 px-4 py-3 text-white">
            <div className="text-[13px] font-medium leading-relaxed">
                Möchtest du am {renderField('date', format(date, 'EEE dd.MM.'))}
                {' um '}{renderField('start', format(start, 'HH:mm'))}
                {' (bis '}{renderField('end', format(end, 'HH:mm'))}{') '}
                den Termin „
                {editing && activeField === 'title' ? (
                    <input
                        ref={inputRef}
                        autoFocus
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={() => setActiveField(null)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
                        className="bg-white/10 border border-white/30 rounded px-1 text-white text-[13px] outline-none"
                        style={{ width: Math.max(80, title.length * 8) }}
                    />
                ) : (
                    renderField('title', <span className="font-bold">{title}</span>)
                )}
                " erstellen?
            </div>

            <div className="flex items-center gap-2 justify-end">
                <button
                    onClick={onDismiss}
                    title="Verwerfen"
                    className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors text-white/70 hover:text-white"
                >
                    <X size={14} />
                </button>
                <button
                    onClick={() => { setEditing(!editing); setActiveField(null); }}
                    title="Bearbeiten"
                    className={`p-1.5 rounded-md transition-colors ${editing ? 'bg-amber-500/30 text-amber-200' : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300'}`}
                >
                    <Pencil size={14} />
                </button>
                <button
                    onClick={handleAccept}
                    title="Termin erstellen"
                    className="p-1.5 rounded-md bg-emerald-500/25 hover:bg-emerald-500/40 transition-colors text-emerald-300 hover:text-emerald-200"
                >
                    <Check size={14} />
                </button>
            </div>

            {editing && activeField !== 'title' && activeField !== null && (
                <div className="text-[10px] text-white/50 italic">
                    ←→ um andere erkannte {activeField === 'date' ? 'Daten' : 'Zeiten'} zu wählen · 0-9 zum Eingeben · Enter zum Bestätigen
                </div>
            )}
        </div>
    );
};

export default EventSuggestionView;
