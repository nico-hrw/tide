"use client";

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { usePopupAutoClose } from '@/hooks/usePopupAutoClose';
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { Star, Ban, Trash2, Share2, X, ChevronDown, Check, Clock, CalendarDays, Tag as TagIcon, Repeat } from "lucide-react";
import { getEventGroupIds } from "../../lib/calendarUtils";
import { TagPicker } from "@/components/Tags/TagPicker";
import { WorkspacePicker } from "@/components/Todo/TodoWorkspacePicker";
import { NoTagConfirm } from "@/components/Tags/NoTagConfirm";
import { useTagCreate } from "@/components/Tags/useTagCreate";
import { CALENDAR_CATEGORIES, categoryVar, resolveCategory } from "@/lib/calendarColors";
import { EventPrivateToggle } from "./EventPrivateToggle";
import { EventMentionField } from "./EventMentionField";

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
                className="w-full flex items-center justify-between bg-[color-mix(in_srgb,var(--ev)_16%,var(--t2-surface))]  border border-[color-mix(in_srgb,var(--ev)_32%,transparent)]  rounded-xl px-2.5 py-1.5 text-xs font-bold text-t2-ink  hover:bg-t2-hover  transition-all text-left"
            >
                <div className="flex items-center gap-1.5 truncate">
                    {selectedOption?.color && (
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: selectedOption.color }} />
                    )}
                    <span className="truncate">{selectedOption?.label || placeholder}</span>
                </div>
                <ChevronDown size={11} className={`text-t2-ink-3 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute top-full mt-1 left-0 right-0 z-[1050] bg-t2-surface  border border-t2-line-soft  rounded-xl shadow-xl p-1 flex flex-col gap-0.5 max-h-48 overflow-y-auto animate-in fade-in-50 zoom-in-95 duration-100">
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
                                        ? 'bg-t2-sub  text-t2-accent '
                                        : 'text-t2-ink  hover:bg-t2-sub '
                                }`}
                            >
                                <div className="flex items-center gap-1.5 truncate">
                                    {opt.color && (
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                                    )}
                                    <span className="truncate">{opt.label}</span>
                                </div>
                                {isSelected && <Check size={11} className="text-t2-accent  shrink-0" />}
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
    groupIds?: string[];
    safe?: string;
    linkedSafes?: string[];
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
    /** Event lock: excluded from calendar share rules. */
    private?: boolean;
}

export interface EventPopoverProps {
    event: EventPopoverEvent;
    rect: DOMRect;
    themes: Array<{ id: string; title: string; effect?: string; color?: string }>;
    onEventSave: (id: string, updates: Partial<EventPopoverEvent>, options?: { strict?: boolean }) => void | Promise<void>;
    onEventDelete?: (id: string) => void;
    /** Opens the share dialog for this event. */
    onEventShare?: (e: React.MouseEvent, id: string) => void;
    onClose: () => void;
    enabledExtensions: string[];
    /** Ask "Ohne Tag speichern?" in place of closing (set by the host for untagged new events). */
    showNoTagConfirm?: boolean;
    onNoTagConfirm?: () => void;
    onNoTagChoose?: () => void;
}

export default function EventPopover({
    event,
    rect,
    themes,
    onEventSave,
    onEventDelete,
    onEventShare,
    onClose,
    showNoTagConfirm,
    onNoTagConfirm,
    onNoTagChoose,
}: EventPopoverProps) {
    const createTag = useTagCreate();
    const popoverRef = useRef<HTMLDivElement>(null);

    const [title, setTitle] = useState(event.title || '');
    const [description, setDescription] = useState(event.description || '');
    const [isImportant, setIsImportant] = useState(!!(event as any).is_important);
    const [isTask, setIsTask] = useState(!!event.is_task);
    const [isCompleted, setIsCompleted] = useState(!!event.is_completed);
    const [color, setColor] = useState(event.color || CALENDAR_CATEGORIES[0].key);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(getEventGroupIds(event));
    const [workspace, setWorkspace] = useState({ safe: event.safe || 'main', linkedSafes: event.linkedSafes ?? [] });
    const [isExpanded, setIsExpanded] = useState(false);

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

    const isOccurrence = event.id.includes('_');
    const occurrenceDateKey = (() => {
        try {
            return format(new Date(event.start), "yyyy-MM-dd");
        } catch {
            return "";
        }
    })();
    const isThisOccCancelledOrig = (occurrenceDateKey ? event.exdates?.includes(occurrenceDateKey) : false) || !!event.is_cancelled;
    const [isCancelled, setIsCancelled] = useState(isThisOccCancelledOrig);
    const isThisOccCancelledRef = useRef(isThisOccCancelledOrig);
    useEffect(() => {
        isThisOccCancelledRef.current = isThisOccCancelledOrig;
        setIsCancelled(isThisOccCancelledOrig);
    }, [isThisOccCancelledOrig]);

    useEffect(() => {
        setTitle(event.title || '');
        setDescription(event.description || '');
        setIsImportant(!!(event as any).is_important);
        setIsTask(!!event.is_task);
        setIsCompleted(!!event.is_completed);
        setColor(event.color || CALENDAR_CATEGORIES[0].key);
        setIsCancelled(isThisOccCancelledOrig);
        setSelectedGroupIds(getEventGroupIds(event));
        const parts = getRRuleParts(event);
        setFreq(parts.freq);
        setIntervalVal(parts.interval);
        setRecurrenceEnd(event.recurrence_end || '');
        setIsExpanded(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [event.id, event.start]);

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
        if (isImportant !== !!(event as any).is_important && (updates as any).is_important === undefined) (updates as any).is_important = isImportant;
        const newRecurrenceRule = freq === 'none' ? 'NONE' : `FREQ=${freq.toUpperCase()};INTERVAL=${interval}`;
        const currentRecurrenceRule = event.recurrence_rule || `FREQ=${(event.recurrence && event.recurrence !== 'none') ? event.recurrence.toUpperCase() : 'NONE'};INTERVAL=1`;
        if (newRecurrenceRule !== currentRecurrenceRule && (updates as any).recurrence_rule === undefined) (updates as any).recurrence_rule = newRecurrenceRule;
        if (recurrenceEnd !== (event.recurrence_end || '') && updates.recurrence_end === undefined) updates.recurrence_end = recurrenceEnd;

        const currentGroupIds = getEventGroupIds(event);
        if (JSON.stringify(selectedGroupIds) !== JSON.stringify(currentGroupIds) && updates.groupIds === undefined) {
            updates.groupIds = selectedGroupIds;
            if (updates.parent_id === undefined) {
                updates.parent_id = selectedGroupIds[0] || null;
            }
        } else if (updates.groupIds !== undefined && updates.parent_id === undefined) {
            updates.parent_id = updates.groupIds[0] || null;
        }

        if (updates.is_cancelled !== undefined) {
            isThisOccCancelledRef.current = updates.is_cancelled;
        }

        // Guard: on recurring instances (occurrences), start/end should not overwrite the base series start/end
        if (event.id.includes('_')) {
            delete updates.start;
            delete updates.end;
        }

        if (Object.keys(updates).length > 0) onEventSave(event.id, updates);
    }, [event, title, description, isImportant, isTask, isCompleted, isCancelled, color, freq, interval, recurrenceEnd, selectedGroupIds, onEventSave]);

    // Keep ref current so the unmount cleanup always calls the latest version
    useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

    useEffect(() => {
        const timer = setTimeout(() => handleSave(), 300);
        return () => clearTimeout(timer);
    }, [title, description, isImportant, isTask, isCompleted, isCancelled, color, freq, interval, recurrenceEnd, selectedGroupIds, handleSave]);

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
    }, [rect, isExpanded, showColorPicker, selectedGroupIds]);

    // Tell the event block it is the open one (black outline) while this popover exists
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('tide:event-popover', { detail: { id: event.id } }));
        return () => { window.dispatchEvent(new CustomEvent('tide:event-popover', { detail: { id: null } })); };
    }, [event.id]);

    // A blocked close (no-tag prompt) keeps the popover open, so the unmount save must stay armed.
    useEffect(() => { if (showNoTagConfirm) savedOnCloseRef.current = false; }, [showNoTagConfirm]);
    const handleClose = () => { savedOnCloseRef.current = true; handleSave(); onClose(); };
    usePopupAutoClose(popoverRef, handleClose);
    const handleTaskToggle = (v: boolean) => { setIsTask(v); if (!v) setIsCompleted(false); };
    const handleToggleCancel = () => {
        const next = !isCancelled;
        setIsCancelled(next);
        isThisOccCancelledRef.current = next;
        handleSave({ is_cancelled: next });
    };
    const updateRecurrence = (newFreq: string, newInterval: number) => { setFreq(newFreq); setIntervalVal(newInterval); };
    const updateGroupIds = (next: string[]) => {
        setSelectedGroupIds(next);
        handleSave({ groupIds: next, parent_id: next[0] || null });
    };

    // Deleted/unknown tag ids are never shown in the picker (they are dropped on the next change).
    const pickerValue = selectedGroupIds.filter(id => themes.some(t => t.id === id));

    if (typeof document === 'undefined') return null;
    const accent = categoryVar(resolveCategory(color).key);

    return createPortal(
        <div
            id="active-event-popover"
            ref={popoverRef}
            className="fixed z-[1000] w-[344px] max-w-[calc(100vw-24px)] bg-t2-surface rounded-[20px] shadow-[0_0_0_1px_var(--t2-line),0_18px_44px_rgba(0,0,0,0.16)] p-4 flex flex-col gap-3.5 animate-in fade-in zoom-in-95 duration-150"
            style={{ top: `${pos.top}px`, left: `${pos.left}px`, '--ev': accent } as React.CSSProperties}
        >
            {/* ── Header ── */}
            <div className="flex items-center gap-2.5">
                <button
                    type="button"
                    className="w-5 h-5 rounded-full shrink-0 cursor-pointer hover:scale-110 transition-transform ring-2 ring-offset-2 ring-offset-t2-surface ring-t2-line-soft"
                    style={{ backgroundColor: accent }}
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    title="Farbe wählen"
                    aria-label="Farbe wählen"
                />
                {/* Wraps instead of scrolling, so the whole title is readable here (cards show one line only). */}
                <textarea
                    autoFocus
                    rows={1}
                    value={title}
                    onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
                    onBlur={() => handleSave()}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                    className={`flex-1 min-w-0 max-h-24 resize-none [field-sizing:content] break-words text-[15px] leading-snug font-bold bg-transparent border-none focus:ring-0 p-0 outline-none placeholder:text-t2-ink-3 transition-all ${isCancelled ? 'line-through text-t2-ink-3 ' : 'text-t2-ink '}`}
                    placeholder="Was passiert?"
                />
                {/* Actions stay inside the card: fixed-size icon buttons that never shrink or wrap */}
                <div className="flex items-center shrink-0 -mr-1.5">
                    <button
                        type="button"
                        onClick={() => setIsImportant(!isImportant)}
                        className={`w-8 h-8 grid place-items-center rounded-full transition-all ${
                            isImportant
                                ? 'text-t2-accent bg-t2-sub'
                                : 'text-t2-ink-3 hover:text-t2-ink-2 hover:bg-t2-hover'
                        }`}
                        title={isImportant ? 'Wichtig entfernen' : 'Als wichtig markieren'}
                    >
                        <Star size={15} className={isImportant ? 'fill-current' : ''} />
                    </button>
                    <button
                        type="button"
                        onClick={handleToggleCancel}
                        className={`w-8 h-8 grid place-items-center rounded-full transition-all ${
                            isCancelled
                                ? 'text-t2-now bg-t2-sub font-bold'
                                : 'text-t2-ink-3 hover:text-t2-ink-2 hover:bg-t2-hover'
                        }`}
                        title={isCancelled ? (isOccurrence ? 'Absage für diesen Tag aufheben' : 'Absage rückgängig') : (isOccurrence ? 'Diesen Termin absagen' : 'Termin absagen')}
                    >
                        <Ban size={15} className={isCancelled ? 'stroke-[2.5]' : ''} />
                    </button>
                    {onEventShare && (
                        <button
                            type="button"
                            onClick={(e) => onEventShare(e, event.id)}
                            className="w-8 h-8 grid place-items-center rounded-full text-t2-ink-3 hover:text-t2-ink-2 hover:bg-t2-hover transition-all"
                            title="Teilen"
                        >
                            <Share2 size={15} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => { onEventDelete?.(event.id); }}
                        className="w-8 h-8 grid place-items-center rounded-full text-t2-ink-3 hover:text-t2-now hover:bg-t2-hover transition-all"
                        title="Löschen"
                    >
                        <Trash2 size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="w-8 h-8 grid place-items-center rounded-full text-t2-ink-3 hover:text-t2-ink-2 hover:bg-t2-hover transition-all"
                        title="Schließen"
                    >
                        <X size={15} />
                    </button>
                </div>
            </div>

            {/* Color picker */}
            {showColorPicker && (
                <div className="bg-[color-mix(in_srgb,var(--ev)_16%,var(--t2-surface))]  p-3 rounded-2xl flex flex-wrap gap-2 animate-in slide-in-from-top-2 duration-150">
                    {CALENDAR_CATEGORIES.map(cat => cat.key).map(c => (
                        <button
                            key={c}
                            onClick={() => setColor(c)}
                            className={`w-5 h-5 rounded-full transition-all ${color === c ? 'ring-2 ring-t2-accent ring-offset-1 ring-offset-t2-surface scale-110' : 'hover:scale-110'}`}
                            style={{ backgroundColor: categoryVar(c) }}
                            title={CALENDAR_CATEGORIES.find(cat => cat.key === c)?.name}
                        />
                    ))}
                    {/* TEMP: Remove legacy shading effect. Next dev can remove this once old data is migrated. */}
                    {event.shading !== undefined && event.shading > 0 && (
                        <button 
                            onClick={() => onEventSave(event.id, { shading: 0 })}
                            className="ml-auto text-[11px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded-lg font-bold uppercase tracking-wider"
                            title="Graustufe entfernen (Legacy)"
                        >
                            Graustufe entfernen
                        </button>
                    )}
                </div>
            )}

            {/* Time & Date */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-[color-mix(in_srgb,var(--ev)_16%,var(--t2-surface))] rounded-2xl px-3.5 py-2.5 border border-[color-mix(in_srgb,var(--ev)_32%,transparent)] ">
                <div className="flex items-center gap-2 min-w-0">
                    <CalendarDays size={14} className="text-t2-ink-3 shrink-0" />
                    <span className="text-[13px] font-semibold text-t2-ink whitespace-nowrap">
                        {(() => {
                            try {
                                return event.start ? format(new Date(event.start), "d. MMM yyyy") : "";
                            } catch {
                                return "";
                            }
                        })()}
                    </span>
                    {isCancelled && (
                        <span className="text-[11px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 bg-red-100/80 dark:bg-red-500/20 px-1.5 py-0.5 rounded">
                            Abgesagt
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-t2-ink-2 shrink-0">
                    {event.allDay ? (
                        <span className="font-bold uppercase tracking-wider text-[11px] bg-t2-stage  px-2 py-0.5 rounded-full">Ganztägig</span>
                    ) : (
                        <>
                            <Clock size={12} className="text-t2-ink-3 shrink-0" />
                            <span className="font-medium">{format(new Date(event.start), "HH:mm")}</span>
                            <span className="text-t2-ink-3 ">→</span>
                            <span className="font-medium">{format(new Date(event.end), "HH:mm")}</span>
                            <span className="text-[11px] text-t2-ink-2  bg-t2-stage  px-1.5 py-0.5 rounded-full font-bold ml-0.5">
                                {(() => { const m = Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000); return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}m` : ''}` : `${m}m`; })()}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Groups / Tags & Repeat */}
            <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-1.5">
                    <span className="px-1 text-[11px] font-bold text-t2-ink-3 uppercase tracking-widest">Workspace</span>
                    <WorkspacePicker
                        safe={workspace.safe}
                        linkedSafes={workspace.linkedSafes}
                        onChange={(next) => { setWorkspace(next); handleSave(next); }}
                    />
                </div>
                {/* Tags: first selected tag sets the style/color */}
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between px-1">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-t2-ink-3 uppercase tracking-widest"><TagIcon size={11} />Tags</span>
                        {pickerValue.length > 0 && (
                            <span className="text-[11px] text-t2-ink-3 font-medium">Der erste Tag bestimmt die Farbe</span>
                        )}
                    </div>
                    <TagPicker tags={themes} value={pickerValue} onChange={updateGroupIds} onCreate={createTag} compact />
                    {showNoTagConfirm && pickerValue.length === 0 && (
                        <NoTagConfirm onConfirm={() => onNoTagConfirm?.()} onChoose={() => onNoTagChoose?.()} />
                    )}
                </div>

                {/* Wiederholen */}
                <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-t2-ink-3 uppercase tracking-widest px-1"><Repeat size={11} />Wiederholen</span>
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
                <div className="flex items-center justify-between px-1 -mt-1 text-[11px] text-t2-ink-2  font-medium">
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
                            className="w-8 text-center bg-[color-mix(in_srgb,var(--ev)_16%,var(--t2-surface))]  border border-[color-mix(in_srgb,var(--ev)_32%,transparent)]  rounded-md py-0.5 text-xs font-bold text-t2-accent font-mono outline-none focus:ring-1 focus:ring-t2-accent" 
                        />
                        <span>{freq === 'daily' ? 'Tag(e)' : freq === 'weekly' ? 'Woche(n)' : freq === 'monthly' ? 'Monat(e)' : 'Jahr(e)'}</span>
                    </div>
                </div>
            )}
            {freq !== 'none' && (
                <div className="flex flex-col gap-1 -mt-0.5">
                    <span className="text-[11px] font-bold text-t2-ink-3 uppercase tracking-widest px-1">Endet am (Optional)</span>
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
                            className="bg-[color-mix(in_srgb,var(--ev)_16%,var(--t2-surface))]  border border-[color-mix(in_srgb,var(--ev)_32%,transparent)]  rounded-xl px-2.5 py-1.5 text-xs font-bold text-t2-ink  outline-none w-full [color-scheme:light_dark] cursor-pointer hover:bg-t2-hover  transition-colors"
                        />
                        {recurrenceEnd && (
                            <button
                                type="button"
                                onClick={() => { setRecurrenceEnd(''); handleSave(); }}
                                className="absolute right-9 text-t2-ink-3 hover:text-t2-ink-2  p-0.5 rounded-full"
                                title="Datum löschen"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Description */}
            <EventMentionField
                key={event.id}
                eventId={event.id}
                value={description}
                onChange={setDescription}
                onBlur={() => handleSave()}
                isPrivate={!!event.private}
                placeholder="Notizen hinzufügen…"
                rows={2}
                toastZIndex={1100}
                className="w-full bg-[color-mix(in_srgb,var(--ev)_16%,var(--t2-surface))] border border-[color-mix(in_srgb,var(--ev)_32%,transparent)]  rounded-2xl p-3 text-xs leading-relaxed text-t2-ink-2  focus:ring-1 focus:ring-t2-accent outline-none resize-none transition-all placeholder:text-t2-ink-3 "
            />

            {/* ── Expand toggle ── */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center justify-center gap-2 py-1.5 text-[11px] font-bold uppercase tracking-widest text-t2-ink-3  hover:text-t2-ink-2  transition-colors group"
            >
                <div className="flex-1 h-px bg-t2-hover " />
                <span className="flex items-center gap-1.5">
                    <svg
                        width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    >
                        <path d="m6 9 6 6 6-6"/>
                    </svg>
                    {isExpanded ? 'Weniger' : 'Mehr'}
                </span>
                <div className="flex-1 h-px bg-t2-hover " />
            </button>

            {/* ── Expanded section ── */}
            {isExpanded && (
                <div className="flex flex-col gap-3 animate-in slide-in-from-top-2 duration-150">
                    {/* Convert to Task */}
                    <div className="flex flex-col gap-1 border-t border-t2-line-soft  pt-2">
                        <div
                            onClick={() => handleTaskToggle(!isTask)}
                            className="flex items-center justify-between py-1.5 px-1 rounded-xl cursor-pointer hover:bg-t2-sub  transition-colors group/row"
                        >
                            <div className="flex items-center gap-2">
                                <div className={`p-1.5 rounded-lg transition-colors ${isTask ? 'bg-t2-sub text-t2-accent ' : 'bg-t2-hover text-t2-ink-3  group-hover/row:bg-t2-stage'}`}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                                </div>
                                <span className="text-xs font-bold text-t2-ink ">Als Aufgabe</span>
                            </div>
                            <div className={`relative w-8 h-5 rounded-full transition-all duration-300 ${isTask ? 'bg-t2-accent' : 'bg-t2-stage '}`}>
                                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-t2-surface shadow-sm transition-transform duration-300 ${isTask ? 'translate-x-3' : 'translate-x-0'}`} />
                            </div>
                        </div>
                        {isTask && (
                            <div
                                onClick={() => setIsCompleted(!isCompleted)}
                                className="flex items-center justify-between py-1.5 px-1 rounded-xl cursor-pointer hover:bg-t2-sub  transition-colors group/row animate-in slide-in-from-top-1 duration-150"
                            >
                                <div className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${isCompleted ? 'bg-green-500' : 'bg-t2-accent animate-pulse'}`} />
                                    <span className="text-xs font-bold text-t2-ink ">Abgeschlossen</span>
                                </div>
                                <div className={`relative w-8 h-5 rounded-full transition-all duration-300 ${isCompleted ? 'bg-green-500' : 'bg-t2-stage '}`}>
                                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-t2-surface shadow-sm transition-transform duration-300 ${isCompleted ? 'translate-x-3' : 'translate-x-0'}`} />
                                </div>
                            </div>
                        )}
                    </div>
                    <EventPrivateToggle eventId={event.id} isPrivate={!!event.private} onChange={(next) => onEventSave(event.id, { private: next }, { strict: true })} />
                </div>
            )}
        </div>,
        document.body
    );
}
