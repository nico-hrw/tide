"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";

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

/**
 * Standalone event-edit popover. MUST be a stable top-level component (not defined
 * inside another component's render) — otherwise React unmounts/remounts it on every
 * parent re-render, losing local state and corrupting field values mid-edit.
 */
export default function EventPopover({
    event,
    rect,
    themes,
    onEventSave,
    onEventDelete,
    onClose,
}: EventPopoverProps) {
    // Local state — initialized from props on mount and on event ID change.
    const [title, setTitle] = useState(event.title || '');
    const [description, setDescription] = useState(event.description || '');
    const [isTask, setIsTask] = useState(!!event.is_task);
    const [isCompleted, setIsCompleted] = useState(!!event.is_completed);
    const [color, setColor] = useState(event.color || '#6366f1');
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [shading, setShading] = useState<number>(event.shading ?? 0);
    const [tags, setTags] = useState<string[]>([
        event.tags?.[0] ?? '', event.tags?.[1] ?? '', event.tags?.[2] ?? ''
    ]);

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

    const occurrenceDateKey = format(new Date(event.start), "yyyy-MM-dd");
    const isThisOccCancelledOrig = event.exdates?.includes(occurrenceDateKey) || !!event.is_cancelled;
    const [isCancelled, setIsCancelled] = useState(isThisOccCancelledOrig);

    const isThisOccCancelledRef = useRef(isThisOccCancelledOrig);
    useEffect(() => {
        isThisOccCancelledRef.current = isThisOccCancelledOrig;
    }, [isThisOccCancelledOrig]);

    // Reset on ID change
    useEffect(() => {
        setTitle(event.title || '');
        setDescription(event.description || '');
        setIsTask(!!event.is_task);
        setIsCompleted(!!event.is_completed);
        setColor(event.color || '#6366f1');
        setIsCancelled(isThisOccCancelledOrig);
        setShading(event.shading ?? 0);
        setTags([event.tags?.[0] ?? '', event.tags?.[1] ?? '', event.tags?.[2] ?? '']);
        const parts = getRRuleParts(event);
        setFreq(parts.freq);
        setIntervalVal(parts.interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [event.id]);

    const handleSave = useCallback((overrideUpdates?: Partial<EventPopoverEvent>) => {
        const updates: Partial<EventPopoverEvent> = { ...overrideUpdates };

        // Always coerce title to a string. Defensive against numeric 0 or undefined leaking in.
        const safeTitle = typeof title === 'string' ? title : String(title ?? '');
        if (safeTitle !== (event.title || '') && updates.title === undefined) updates.title = safeTitle;

        if (description !== (event.description || '') && updates.description === undefined) updates.description = description;
        if (isTask !== !!event.is_task && updates.is_task === undefined) updates.is_task = isTask;
        if (isCompleted !== !!event.is_completed && updates.is_completed === undefined) updates.is_completed = isCompleted;
        if (isCancelled !== isThisOccCancelledRef.current && updates.is_cancelled === undefined) updates.is_cancelled = isCancelled;
        if (color !== event.color && updates.color === undefined) updates.color = color;
        if (shading !== (event.shading ?? 0) && updates.shading === undefined) updates.shading = shading;
        const activeTags = tags.filter(t => t.trim() !== '');
        const currentTags = event.tags ?? [];
        if (JSON.stringify(activeTags) !== JSON.stringify(currentTags) && updates.tags === undefined) updates.tags = activeTags;

        const newRecurrenceRule = freq === 'none' ? 'NONE' : `FREQ=${freq.toUpperCase()};INTERVAL=${interval}`;
        const currentRecurrenceRule = event.recurrence_rule || `FREQ=${(event.recurrence && event.recurrence !== 'none') ? event.recurrence.toUpperCase() : 'NONE'};INTERVAL=1`;
        if (newRecurrenceRule !== currentRecurrenceRule && (updates as any).recurrence_rule === undefined) (updates as any).recurrence_rule = newRecurrenceRule;

        if (Object.keys(updates).length > 0) {
            onEventSave(event.id, updates);
        }
    }, [event, title, description, isTask, isCompleted, isCancelled, color, shading, tags, freq, interval, onEventSave]);

    useEffect(() => {
        const timer = setTimeout(() => {
            handleSave();
        }, 800);
        return () => clearTimeout(timer);
    }, [title, description, isTask, isCompleted, isCancelled, color, shading, tags, freq, interval, handleSave]);

    // Cleanup save on unmount/close
    useEffect(() => {
        return () => {
            handleSave();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleTitleBlur = () => { handleSave(); };
    const handleDescBlur = () => { handleSave(); };

    const handleTaskToggle = (newIsTask: boolean) => {
        setIsTask(newIsTask);
        if (!newIsTask) setIsCompleted(false);
    };

    const updateRecurrence = (newFreq: string, newInterval: number) => {
        setFreq(newFreq);
        setIntervalVal(newInterval);
    };

    const handleClose = () => {
        handleSave();
        onClose();
    };

    // Smart Positioning
    const width = 340;
    const height = isTask ? 480 : 440;
    let left = rect.right + 12;
    let top = rect.top;

    if (left + width > window.innerWidth) {
        left = rect.left - width - 12;
    }
    if (left < 10) left = 10;

    if (top + height > window.innerHeight) {
        top = window.innerHeight - height - 12;
    }
    if (top < 60) top = 60;

    return (
        <div
            id="active-event-popover"
            className="fixed z-[100] w-[340px] bg-white dark:bg-[#1C1C1C] rounded-3xl shadow-float border border-gray-100 dark:border-white/10 p-5 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200"
            style={{ top: `${top}px`, left: `${left}px` }}
        >
            {/* Header Row */}
            <div className="flex items-center gap-3">
                <div
                    className="w-4 h-4 rounded-full shrink-0 cursor-pointer hover:scale-110 transition-transform shadow-sm"
                    style={{ backgroundColor: color }}
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    title="Pick Individual Color"
                />
                <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={handleTitleBlur}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            e.currentTarget.blur();
                        }
                    }}
                    className="flex-1 text-base font-bold text-gray-900 dark:text-gray-100 bg-transparent border-none focus:ring-0 p-0 outline-none placeholder:text-gray-400"
                    placeholder="What's happening?"
                />
                <button onClick={handleClose} className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-all">
                    <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            {showColorPicker && (
                <div className="bg-gray-50 dark:bg-black/20 p-3 rounded-2xl flex flex-wrap gap-2.5 animate-in slide-in-from-top-2 duration-200">
                    {[
                        '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#64748b'
                    ].map(c => (
                        <button
                            key={c}
                            onClick={() => setColor(c)}
                            className={`w-6 h-6 rounded-full transition-all ${color === c ? 'ring-2 ring-violet-500 ring-offset-2 dark:ring-offset-[#1C1C1C] scale-110 shadow-sm' : 'hover:scale-110 shadow-xs'}`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>
            )}

            {/* Time & Date Info */}
            <div className="flex flex-col gap-0.5 bg-gray-50/50 dark:bg-white/5 rounded-xl p-3 border border-gray-100/50 dark:border-white/5 shadow-sm">
                <div className="font-semibold text-sm flex items-center justify-between text-gray-800 dark:text-gray-200">
                    <span>{format(new Date(event.start), "MMM d, yyyy")}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-200 dark:bg-white/10 px-2 py-0.5 rounded-full">
                        {event.allDay ? 'All Day' : (() => {
                            const m = Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000);
                            return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 > 0 ? m % 60 + 'm' : ''}` : `${m}m`;
                        })()}
                    </span>
                </div>
                {!event.allDay && (
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        <span>{format(new Date(event.start), "h:mm a")}</span>
                        <span className="text-gray-300 dark:text-gray-600 px-0.5">→</span>
                        <span>{format(new Date(event.end), "h:mm a")}</span>
                    </div>
                )}
            </div>

            {/* Settings Grid */}
            <div className="grid grid-cols-2 gap-3 pb-1">
                <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Theme</span>
                    <div className="relative group">
                        <select
                            value={event.parent_id || 'general-theme'}
                            onChange={(e) => {
                                const val = e.target.value === 'general-theme' ? null : e.target.value;
                                if (onEventSave) onEventSave(event.id, { parent_id: val });
                            }}
                            className="w-full bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 outline-none cursor-pointer appearance-none transition-all hover:bg-gray-100 dark:hover:bg-white/10"
                        >
                            <option value="general-theme">No Theme</option>
                            {themes.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-gray-600 transition-colors">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Repeat</span>
                    <div className="flex items-center bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 rounded-xl pr-2 transition-all hover:bg-gray-100 dark:hover:bg-white/10">
                        <select
                            value={freq}
                            onChange={(e) => updateRecurrence(e.target.value, interval)}
                            className="flex-1 bg-transparent border-none text-xs font-bold text-gray-700 dark:text-gray-300 outline-none cursor-pointer appearance-none px-3 py-2"
                        >
                            <option value="none">None</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="yearly">Yearly</option>
                        </select>
                        {freq !== 'none' && (
                            <input
                                type="number"
                                min="1"
                                max="99"
                                value={interval}
                                onChange={(e) => {
                                    let val = parseInt(e.target.value, 10);
                                    if (isNaN(val) || val < 1) val = 1;
                                    updateRecurrence(freq, val);
                                }}
                                className="w-5 text-center bg-transparent border-none p-0 text-[10px] font-bold text-violet-500 font-mono outline-none"
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Description */}
            <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={handleDescBlur}
                placeholder="Add notes..."
                rows={2}
                className="w-full bg-transparent border border-gray-100 dark:border-white/5 rounded-2xl p-3 text-xs leading-relaxed text-gray-600 dark:text-gray-400 focus:ring-1 focus:ring-violet-500/20 outline-none resize-none transition-all placeholder:text-gray-300 dark:placeholder:text-gray-700"
            />

            {/* Shading overlay */}
            <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest shrink-0">Shading</span>
                <div className="flex items-center gap-2">
                    {[0, 1, 2, 3, 4].map(level => (
                        <button
                            key={level}
                            onClick={() => setShading(level)}
                            title={level === 0 ? 'None' : `Level ${level}`}
                            className={`w-5 h-5 rounded border transition-all ${shading === level ? 'ring-2 ring-violet-500 ring-offset-1 dark:ring-offset-[#1C1C1C] scale-110' : 'hover:scale-105 opacity-70 hover:opacity-100'}`}
                            style={{
                                background: level === 0 ? 'transparent' : `rgba(90,90,90,${level * 0.22})`,
                                borderColor: level === 0 ? 'rgba(150,150,150,0.3)' : `rgba(90,90,90,${0.3 + level * 0.15})`
                            }}
                        >
                            {level === 0 && <span className="text-[7px] text-gray-400 leading-none flex items-center justify-center w-full h-full">✕</span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* Hints / Tags */}
            <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Hinweise</span>
                {[0, 1, 2].map(idx => (
                    <input
                        key={idx}
                        type="text"
                        value={tags[idx] ?? ''}
                        onChange={(e) => {
                            const next = [...tags];
                            next[idx] = e.target.value;
                            setTags(next);
                        }}
                        onBlur={() => handleSave()}
                        placeholder={`Hinweis ${idx + 1}...`}
                        className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/5 rounded-xl px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 focus:ring-1 focus:ring-violet-500/20 outline-none placeholder:text-gray-300 dark:placeholder:text-gray-700"
                    />
                ))}
            </div>

            {/* Task / Cancel toggles */}
            <div className="flex flex-col gap-1 pt-1 border-t border-gray-50 dark:border-white/5">
                <div
                    onClick={() => handleTaskToggle(!isTask)}
                    className="flex items-center justify-between py-1.5 px-0.5 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group/row"
                >
                    <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-lg transition-colors ${isTask ? 'bg-violet-100 text-violet-600 dark:bg-violet-500/10' : 'bg-gray-100 text-gray-400 dark:bg-white/5 group-hover/row:bg-gray-200'}`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                        </div>
                        <span className="text-[13px] font-bold text-gray-700 dark:text-gray-300 tracking-tight">Convert to Task</span>
                    </div>
                    <div className={`relative w-10 h-6 rounded-full transition-all duration-300 ${isTask ? 'bg-violet-500 shadow-sm shadow-violet-500/20' : 'bg-gray-200 dark:bg-white/10'}`}>
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${isTask ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                </div>

                {isTask && (
                    <div
                        onClick={() => setIsCompleted(!isCompleted)}
                        className="flex items-center justify-between py-1.5 px-0.5 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group/row animate-in slide-in-from-bottom-2 duration-200"
                    >
                        <div className="flex items-center gap-2.5">
                            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isCompleted ? 'bg-green-500' : 'bg-violet-400'}`} />
                            <span className="text-[13px] font-bold text-gray-700 dark:text-gray-300 tracking-tight">Task Completed</span>
                        </div>
                        <div className={`relative w-10 h-6 rounded-full transition-all duration-300 ${isCompleted ? 'bg-green-500 shadow-sm shadow-green-500/20' : 'bg-gray-200 dark:bg-white/10'}`}>
                            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${isCompleted ? 'translate-x-4' : 'translate-x-0'}`} />
                        </div>
                    </div>
                )}

                <div
                    onClick={() => setIsCancelled(!isCancelled)}
                    className="flex items-center justify-between py-1.5 px-0.5 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group/row"
                >
                    <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-lg transition-colors ${isCancelled ? 'bg-gray-200 text-gray-600 dark:bg-white/20' : 'bg-gray-100 text-gray-400 dark:bg-white/5 group-hover/row:bg-gray-200'}`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                        </div>
                        <span className="text-[13px] font-bold text-gray-700 dark:text-gray-300 tracking-tight">Cancel Event</span>
                    </div>
                    <div className={`relative w-10 h-6 rounded-full transition-all duration-300 ${isCancelled ? 'bg-gray-500 shadow-sm shadow-gray-500/20' : 'bg-gray-200 dark:bg-white/10'}`}>
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${isCancelled ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                </div>
            </div>

            {/* Footer Controls */}
            <div className="flex items-center justify-end pt-2 border-t border-gray-50 dark:border-white/5">
                <button
                    onClick={() => onEventDelete && onEventDelete(event.id)}
                    className="p-2 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-all"
                    title="Delete Event"
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            </div>
        </div>
    );
}
