"use client";

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { format } from "date-fns";
import { Star, Ban, Trash2, X, ChevronDown, Check, Clock } from "lucide-react";

interface CustomDropdownOption {
    value: string;
    label: string;
    color?: string;
}

function ModernDropdown({
    value,
    options,
    onChange,
    placeholder = "Auswählen"
}: {
    value: string;
    options: CustomDropdownOption[];
    onChange: (val: string) => void;
    placeholder?: string;
}) {
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const selectedOption = options.find(o => o.value === value);

    return (
        <div ref={dropdownRef} className="relative w-full">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between bg-gray-50/80 dark:bg-white/5 border border-gray-100 dark:border-white/5 rounded-xl px-2.5 py-1.5 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-all text-left"
            >
                <div className="flex items-center gap-1.5 truncate">
                    {selectedOption?.color && (
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selectedOption.color }} />
                    )}
                    <span className="truncate">{selectedOption?.label || placeholder}</span>
                </div>
                <ChevronDown size={11} className={`text-gray-400 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute top-full mt-1 left-0 right-0 z-[120] bg-white dark:bg-[#222222] border border-gray-100 dark:border-white/10 rounded-xl shadow-xl p-1 flex flex-col gap-0.5 max-h-48 overflow-y-auto animate-in fade-in-50 zoom-in-95 duration-100">
                    {options.map(opt => {
                        const isSelected = opt.value === value;
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                    onChange(opt.value);
                                    setOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors text-left ${
                                    isSelected
                                        ? 'bg-violet-50 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300'
                                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
                                }`}
                            >
                                <div className="flex items-center gap-1.5 truncate">
                                    {opt.color && (
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                                    )}
                                    <span className="truncate">{opt.label}</span>
                                </div>
                                {isSelected && <Check size={11} className="text-violet-600 dark:text-violet-300 shrink-0" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export interface EventPopoverEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    description?: string;
    parent_id?: string | null;
    color?: string;
    effect?: string;
    allDay?: boolean;
    recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
    recurrence_rule?: string;
    recurrence_end?: string;
    exdates?: string[];
    completed_dates?: string[];
    is_task?: boolean;
    is_completed?: boolean;
    is_cancelled?: boolean;
    shading?: number;
    tags?: string[];
}

export interface EventPopoverProps {
    event: EventPopoverEvent;
    rect: DOMRect;
    themes: Array<{ id: string; title: string; effect?: string; color?: string }>;
    onEventSave: (id: string, updates: Partial<EventPopoverEvent>) => void;
    onEventDelete?: (id: string) => void;
    onClose: () => void;
    enabledExtensions: string[];
}

export default function EventPopover({
    event,
    rect,
    themes,
    onEventSave,
    onEventDelete,
    onClose,
}: EventPopoverProps) {
    const popoverRef = useRef<HTMLDivElement>(null);

    const [title, setTitle] = useState(event.title || '');
    const [description, setDescription] = useState(event.description || '');
    const [isImportant, setIsImportant] = useState(!!(event as any).is_important);
    const [isTask, setIsTask] = useState(!!event.is_task);
    const [isCompleted, setIsCompleted] = useState(!!event.is_completed);
    const [color, setColor] = useState(event.color || '#6366f1');
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [tags, setTags] = useState<string[]>([
        event.tags?.[0] ?? '', event.tags?.[1] ?? '', event.tags?.[2] ?? ''
    ]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showHints, setShowHints] = useState(false);

    // Computed position — adjusted after render via layoutEffect
    const [pos, setPos] = useState({ top: rect.top, left: rect.right + 12 });

    const getRRuleParts = (evt: EventPopoverEvent) => {
        const rule = evt.recurrence_rule || '';
        const match = String(rule || `FREQ=${(evt.recurrence && evt.recurrence !== 'none') ? evt.recurrence.toUpperCase() : 'NONE'};INTERVAL=1`).match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY|NONE)(?:;INTERVAL=(\d+))?/i);
        return {
            freq: match ? match[1].toLowerCase() : 'none',
            interval: match && match[2] ? parseInt(match[2], 10) : 1
        };
    };

    const initialRRule = getRRuleParts(event);
    const [freq, setFreq] = useState(initialRRule.freq);
    const [interval, setIntervalVal] = useState(initialRRule.interval);
    const [recurrenceEnd, setRecurrenceEnd] = useState(event.recurrence_end || '');

    const occurrenceDateKey = format(new Date(event.start), "yyyy-MM-dd");
    const isThisOccCancelledOrig = event.exdates?.includes(occurrenceDateKey) || !!event.is_cancelled;
    const [isCancelled, setIsCancelled] = useState(isThisOccCancelledOrig);
    const isThisOccCancelledRef = useRef(isThisOccCancelledOrig);
    useEffect(() => { isThisOccCancelledRef.current = isThisOccCancelledOrig; }, [isThisOccCancelledOrig]);

    useEffect(() => {
        setTitle(event.title || '');
        setDescription(event.description || '');
        setIsImportant(!!(event as any).is_important);
        setIsTask(!!event.is_task);
        setIsCompleted(!!event.is_completed);
        setColor(event.color || '#6366f1');
        setIsCancelled(isThisOccCancelledOrig);
        setTags([event.tags?.[0] ?? '', event.tags?.[1] ?? '', event.tags?.[2] ?? '']);
        const parts = getRRuleParts(event);
        setFreq(parts.freq);
        setIntervalVal(parts.interval);
        setRecurrenceEnd(event.recurrence_end || '');
        setIsExpanded(false);
        setShowHints(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [event.id]);

    // Always holds the latest handleSave so the unmount cleanup doesn't use a stale closure
    const handleSaveRef = useRef<(overrides?: Partial<EventPopoverEvent>) => void>(() => {});
    // Track whether handleClose already saved, to avoid a redundant save on unmount
    const savedOnCloseRef = useRef(false);

    const handleSave = useCallback((overrideUpdates?: Partial<EventPopoverEvent>) => {
        const updates: Partial<EventPopoverEvent> = { ...overrideUpdates };
        const safeTitle = typeof title === 'string' ? title : String(title ?? '');
        if (safeTitle !== (event.title || '') && updates.title === undefined) updates.title = safeTitle;
        if (description !== (event.description || '') && updates.description === undefined) updates.description = description;
        if (isTask !== !!event.is_task && updates.is_task === undefined) updates.is_task = isTask;
        if (isCompleted !== !!event.is_completed && updates.is_completed === undefined) updates.is_completed = isCompleted;
        if (isCancelled !== isThisOccCancelledRef.current && updates.is_cancelled === undefined) updates.is_cancelled = isCancelled;
        if (color !== event.color && updates.color === undefined) updates.color = color;
        const activeTags = tags.filter(t => t.trim() !== '');
        const currentTags = event.tags ?? [];
        if (JSON.stringify(activeTags) !== JSON.stringify(currentTags) && updates.tags === undefined) updates.tags = activeTags;
        if (isImportant !== !!(event as any).is_important && (updates as any).is_important === undefined) (updates as any).is_important = isImportant;
        const newRecurrenceRule = freq === 'none' ? 'NONE' : `FREQ=${freq.toUpperCase()};INTERVAL=${interval}`;
        const currentRecurrenceRule = event.recurrence_rule || `FREQ=${(event.recurrence && event.recurrence !== 'none') ? event.recurrence.toUpperCase() : 'NONE'};INTERVAL=1`;
        if (newRecurrenceRule !== currentRecurrenceRule && (updates as any).recurrence_rule === undefined) (updates as any).recurrence_rule = newRecurrenceRule;
        if (recurrenceEnd !== (event.recurrence_end || '') && updates.recurrence_end === undefined) updates.recurrence_end = recurrenceEnd;
        if (Object.keys(updates).length > 0) onEventSave(event.id, updates);
    }, [event, title, description, isImportant, isTask, isCompleted, isCancelled, color, tags, freq, interval, recurrenceEnd, onEventSave]);

    // Keep ref current so the unmount cleanup always calls the latest version
    useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

    useEffect(() => {
        const timer = setTimeout(() => handleSave(), 300);
        return () => clearTimeout(timer);
    }, [title, description, isImportant, isTask, isCompleted, isCancelled, color, tags, freq, interval, recurrenceEnd, handleSave]);

    // Save on unmount only when the popup was dismissed without the explicit close button
    // (scroll-away, click-outside). handleClose sets savedOnCloseRef to avoid a double-save.
    useEffect(() => { return () => { if (!savedOnCloseRef.current) handleSaveRef.current(); }; }, []);

    // Adjust position after render so the popover never goes off-screen
    useLayoutEffect(() => {
        if (!popoverRef.current) return;
        const el = popoverRef.current;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const margin = 12;

        let left = rect.right + margin;
        let top = rect.top;

        if (left + w > window.innerWidth - margin) left = rect.left - w - margin;
        if (left < margin) left = margin;
        if (top + h > window.innerHeight - margin) top = window.innerHeight - h - margin;
        if (top < 60) top = 60;

        setPos({ top, left });
    }, [rect, isExpanded, showColorPicker, showHints]);

    const handleClose = () => { savedOnCloseRef.current = true; handleSave(); onClose(); };
    const handleTaskToggle = (v: boolean) => { setIsTask(v); if (!v) setIsCompleted(false); };
    const updateRecurrence = (newFreq: string, newInterval: number) => { setFreq(newFreq); setIntervalVal(newInterval); };

    const existingTags = tags.filter(t => t.trim() !== '');

    return (
        <div
            id="active-event-popover"
            ref={popoverRef}
            className="fixed z-[100] w-[320px] bg-white dark:bg-[#1C1C1C] rounded-3xl shadow-2xl border border-gray-100 dark:border-white/10 p-4 flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-150"
            style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
        >
            {/* ── Header ── */}
            <div className="flex items-center gap-2">
                <div
                    className="w-3.5 h-3.5 rounded-full shrink-0 cursor-pointer hover:scale-110 transition-transform shadow-sm"
                    style={{ backgroundColor: color }}
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    title="Farbe wählen"
                />
                <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => handleSave()}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                    className={`flex-1 text-sm font-bold bg-transparent border-none focus:ring-0 p-0 outline-none placeholder:text-gray-400 transition-all ${isCancelled ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}
                    placeholder="Was passiert?"
                />
                {/* Wichtig Toggle (Icon only) */}
                <button
                    type="button"
                    onClick={() => setIsImportant(!isImportant)}
                    className={`p-1.5 rounded-full transition-all ${
                        isImportant
                            ? 'text-amber-500 bg-amber-50 dark:bg-amber-500/20 ring-1 ring-amber-400/40 shadow-xs'
                            : 'text-gray-300 hover:text-amber-500 hover:bg-gray-100 dark:hover:bg-white/10'
                    }`}
                    title={isImportant ? 'Wichtig entfernen' : 'Als wichtig markieren'}
                >
                    <Star size={14} className={isImportant ? 'fill-amber-500 stroke-amber-500' : ''} />
                </button>
                {/* Cancel icon - clearly visually highlighted when active */}
                <button
                    type="button"
                    onClick={() => setIsCancelled(!isCancelled)}
                    className={`p-1.5 rounded-full transition-all ${
                        isCancelled
                            ? 'text-red-600 bg-red-100 dark:bg-red-500/25 ring-1 ring-red-400/50 shadow-xs font-bold'
                            : 'text-gray-300 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-white/10'
                    }`}
                    title={isCancelled ? 'Absage rückgängig' : 'Termin absagen'}
                >
                    <Ban size={14} />
                </button>
                {/* Delete icon */}
                <button
                    type="button"
                    onClick={() => { onEventDelete?.(event.id); }}
                    className="p-1.5 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                    title="Löschen"
                >
                    <Trash2 size={14} />
                </button>
                {/* Close icon */}
                <button 
                    type="button"
                    onClick={handleClose} 
                    className="p-1.5 rounded-full text-gray-300 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-all"
                    title="Schließen"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Color picker */}
            {showColorPicker && (
                <div className="bg-gray-50 dark:bg-black/20 p-3 rounded-2xl flex flex-wrap gap-2 animate-in slide-in-from-top-2 duration-150">
                    {['#ef4444','#f97316','#f59e0b','#10b981','#06b6d4','#3b82f6','#6366f1','#8b5cf6','#d946ef','#ec4899','#64748b'].map(c => (
                        <button
                            key={c}
                            onClick={() => setColor(c)}
                            className={`w-5 h-5 rounded-full transition-all ${color === c ? 'ring-2 ring-violet-500 ring-offset-1 dark:ring-offset-[#1C1C1C] scale-110' : 'hover:scale-110'}`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                    {/* TEMP: Remove legacy shading effect. Next dev can remove this once old data is migrated. */}
                    {event.shading !== undefined && event.shading > 0 && (
                        <button 
                            onClick={() => onEventSave(event.id, { shading: 0 })}
                            className="ml-auto text-[10px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded-lg font-bold uppercase tracking-wider"
                            title="Graustufe entfernen (Legacy)"
                        >
                            Graustufe entfernen
                        </button>
                    )}
                </div>
            )}

            {/* Time & Date */}
            <div className="flex items-center justify-between bg-gray-50/70 dark:bg-white/5 rounded-xl px-3 py-2 border border-gray-100/50 dark:border-white/5">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {format(new Date(event.start), "d. MMM yyyy")}
                </span>
                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {event.allDay ? (
                        <span className="font-bold uppercase tracking-wider text-[10px] bg-gray-200/80 dark:bg-white/10 px-2 py-0.5 rounded-full">Ganztägig</span>
                    ) : (
                        <>
                            <Clock size={12} className="text-gray-400 dark:text-gray-500" />
                            <span className="font-medium">{format(new Date(event.start), "HH:mm")}</span>
                            <span className="text-gray-300 dark:text-gray-600">→</span>
                            <span className="font-medium">{format(new Date(event.end), "HH:mm")}</span>
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-200/70 dark:bg-white/10 px-1.5 py-0.5 rounded-full font-bold ml-0.5">
                                {(() => { const m = Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000); return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}m` : ''}` : `${m}m`; })()}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Theme + Repeat */}
            <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest px-1">Theme</span>
                    <ModernDropdown
                        value={event.parent_id || 'general-theme'}
                        options={[
                            { value: 'general-theme', label: 'Kein Theme' },
                            ...themes.map(t => ({ value: t.id, label: t.title, color: t.color }))
                        ]}
                        onChange={(val) => {
                            const nextParent = val === 'general-theme' ? null : val;
                            onEventSave(event.id, { parent_id: nextParent });
                        }}
                        placeholder="Kein Theme"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest px-1">Wiederholen</span>
                    <ModernDropdown
                        value={freq}
                        options={[
                            { value: 'none', label: 'Nie' },
                            { value: 'daily', label: 'Täglich' },
                            { value: 'weekly', label: 'Wöchentlich' },
                            { value: 'monthly', label: 'Monatlich' },
                            { value: 'yearly', label: 'Jährlich' }
                        ]}
                        onChange={(val) => updateRecurrence(val, interval)}
                        placeholder="Nie"
                    />
                </div>
            </div>
            {freq !== 'none' && (
                <div className="flex items-center justify-between px-1 -mt-1 text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                    <span>Intervall:</span>
                    <div className="flex items-center gap-1.5">
                        <span>Alle</span>
                        <input 
                            type="number" 
                            min="1" 
                            max="99" 
                            value={interval} 
                            onChange={(e) => { 
                                let v = parseInt(e.target.value, 10); 
                                if (isNaN(v) || v < 1) v = 1; 
                                updateRecurrence(freq, v); 
                            }}
                            className="w-8 text-center bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-md py-0.5 text-xs font-bold text-violet-500 font-mono outline-none focus:ring-1 focus:ring-violet-500" 
                        />
                        <span>{freq === 'daily' ? 'Tag(e)' : freq === 'weekly' ? 'Woche(n)' : freq === 'monthly' ? 'Monat(e)' : 'Jahr(e)'}</span>
                    </div>
                </div>
            )}
            {freq !== 'none' && (
                <div className="flex flex-col gap-1 -mt-0.5">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest px-1">Endet am (Optional)</span>
                    <div className="relative flex items-center">
                        <input 
                            type="date"
                            value={recurrenceEnd ? format(new Date(recurrenceEnd), 'yyyy-MM-dd') : ''}
                            onChange={(e) => {
                                if (e.target.value) {
                                    const d = new Date(e.target.value);
                                    d.setHours(23, 59, 59, 999);
                                    setRecurrenceEnd(d.toISOString());
                                } else {
                                    setRecurrenceEnd('');
                                }
                            }}
                            onBlur={() => handleSave()}
                            className="bg-gray-50/80 dark:bg-white/5 border border-gray-100 dark:border-white/5 rounded-xl px-2.5 py-1.5 text-xs font-bold text-gray-700 dark:text-gray-300 outline-none w-full [color-scheme:light_dark] cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                        />
                        {recurrenceEnd && (
                            <button
                                type="button"
                                onClick={() => { setRecurrenceEnd(''); handleSave(); }}
                                className="absolute right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5 rounded-full"
                                title="Datum löschen"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Description */}
            <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => handleSave()}
                placeholder="Notizen hinzufügen…"
                rows={2}
                className="w-full bg-transparent border border-gray-100 dark:border-white/5 rounded-2xl p-3 text-xs leading-relaxed text-gray-600 dark:text-gray-400 focus:ring-1 focus:ring-violet-500/20 outline-none resize-none transition-all placeholder:text-gray-300 dark:placeholder:text-gray-700"
            />

            {/* ── Expand toggle ── */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center justify-center gap-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors group"
            >
                <div className="flex-1 h-px bg-gray-100 dark:bg-white/5" />
                <span className="flex items-center gap-1.5">
                    <svg
                        width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    >
                        <path d="m6 9 6 6 6-6"/>
                    </svg>
                    {isExpanded ? 'Weniger' : 'Mehr'}
                </span>
                <div className="flex-1 h-px bg-gray-100 dark:bg-white/5" />
            </button>

            {/* ── Expanded section ── */}
            {isExpanded && (
                <div className="flex flex-col gap-3 animate-in slide-in-from-top-2 duration-150">
                    {/* Hints / Tags */}
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Hinweise</span>
                            <button
                                onClick={() => setShowHints(!showHints)}
                                className="w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 hover:bg-gray-200 dark:hover:bg-white/20 transition-all"
                                title="Hinweise"
                            >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    {showHints ? <><line x1="5" y1="12" x2="19" y2="12"/></> : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}
                                </svg>
                            </button>
                        </div>
                        {/* Show existing tags as chips when hints are collapsed */}
                        {!showHints && existingTags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {existingTags.map((tag, i) => (
                                    <span key={i} className="text-[10px] bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full font-medium">{tag}</span>
                                ))}
                            </div>
                        )}
                        {showHints && (
                            <div className="flex flex-col gap-1.5 animate-in slide-in-from-top-1 duration-150">
                                {[0, 1, 2].map(idx => (
                                    <input
                                        key={idx}
                                        type="text"
                                        value={tags[idx] ?? ''}
                                        onChange={(e) => { const next = [...tags]; next[idx] = e.target.value; setTags(next); }}
                                        onBlur={() => handleSave()}
                                        placeholder={`Hinweis ${idx + 1}…`}
                                        className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/5 rounded-xl px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 focus:ring-1 focus:ring-violet-500/20 outline-none placeholder:text-gray-300 dark:placeholder:text-gray-700"
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Convert to Task */}
                    <div className="flex flex-col gap-1 border-t border-gray-50 dark:border-white/5 pt-2">
                        <div
                            onClick={() => handleTaskToggle(!isTask)}
                            className="flex items-center justify-between py-1.5 px-1 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group/row"
                        >
                            <div className="flex items-center gap-2">
                                <div className={`p-1.5 rounded-lg transition-colors ${isTask ? 'bg-violet-100 text-violet-600 dark:bg-violet-500/10' : 'bg-gray-100 text-gray-400 dark:bg-white/5 group-hover/row:bg-gray-200'}`}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                                </div>
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Als Aufgabe</span>
                            </div>
                            <div className={`relative w-8 h-5 rounded-full transition-all duration-300 ${isTask ? 'bg-violet-500' : 'bg-gray-200 dark:bg-white/10'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${isTask ? 'translate-x-3' : 'translate-x-0'}`} />
                            </div>
                        </div>
                        {isTask && (
                            <div
                                onClick={() => setIsCompleted(!isCompleted)}
                                className="flex items-center justify-between py-1.5 px-1 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group/row animate-in slide-in-from-top-1 duration-150"
                            >
                                <div className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${isCompleted ? 'bg-green-500' : 'bg-violet-400 animate-pulse'}`} />
                                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Abgeschlossen</span>
                                </div>
                                <div className={`relative w-8 h-5 rounded-full transition-all duration-300 ${isCompleted ? 'bg-green-500' : 'bg-gray-200 dark:bg-white/10'}`}>
                                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${isCompleted ? 'translate-x-3' : 'translate-x-0'}`} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
