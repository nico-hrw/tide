import React, { useState, useRef } from 'react';
import { Download, Upload, Plus, Trash2, X, AlertCircle, ListPlus } from 'lucide-react';

export interface ScheduleEventData {
    id: string;
    title: string;
    description: string;
    startTime: string; // HH:mm
    endTime: string;   // HH:mm
    allDay: boolean;
    recurrence: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
    dateOffset: number; // Support multi-day schedules in future implicitly
    dateOverride?: string; // yyyy-MM-dd
}

interface ScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (events: ScheduleEventData[], theme: string) => Promise<void>;
    existingThemes: { id: string; title: string; effect?: string }[];
}

export function ScheduleModal({ isOpen, onClose, onApply, existingThemes }: ScheduleModalProps) {
    const [events, setEvents] = useState<ScheduleEventData[]>([
        { id: '1', title: '', description: '', startTime: '09:00', endTime: '10:00', allDay: false, recurrence: 'none', dateOffset: 0 }
    ]);
    const [theme, setTheme] = useState(existingThemes.length > 0 ? existingThemes[0].id : 'new-theme');
    const [themeName, setThemeName] = useState('New Theme');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeDateSettings, setActiveDateSettings] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const exportToJSON = () => {
        const data = {
            theme: theme === 'new-theme' ? themeName : theme,
            events: events.map(e => ({
                title: e.title,
                description: e.description,
                startTime: e.startTime,
                endTime: e.endTime,
                allDay: e.allDay,
                dateOverride: e.dateOverride
            }))
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `schedule-${data.theme.replace(/\s+/g, '-').toLowerCase()}-${new Date().getTime()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const importFromJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                if (data.events && Array.isArray(data.events)) {
                    const importedEvents: ScheduleEventData[] = data.events.map((ev: any, i: number) => ({
                        id: `imported-${Date.now()}-${i}`,
                        title: ev.title || '',
                        description: ev.description || '',
                        startTime: ev.startTime || '09:00',
                        endTime: ev.endTime || '10:00',
                        allDay: !!ev.allDay,
                        recurrence: ev.recurrence || 'none',
                        dateOffset: 0,
                        dateOverride: ev.dateOverride || ''
                    }));
                    setEvents(importedEvents);

                    const existingMatch = existingThemes.find(t => t.id === data.theme || t.title === data.theme);
                    if (existingMatch) {
                        setTheme(existingMatch.id);
                    } else if (data.theme) {
                        setTheme('new-theme');
                        setThemeName(data.theme);
                    }
                    setError(null);
                } else {
                    setError("Invalid JSON format: missing 'events' array.");
                }
            } catch (err) {
                setError("Failed to parse JSON file.");
            }
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsText(file);
    };

    const addEvent = () => {
        const lastEvent = events[events.length - 1];
        let newStartTime = '09:00';
        let newEndTime = '10:00';
        let newDateOverride = lastEvent?.dateOverride || '';

        if (lastEvent) {
            // Suggest next hour block
            const [lastH, lastM] = lastEvent.endTime.split(':').map(Number);
            if (!isNaN(lastH) && !isNaN(lastM)) {
                newStartTime = lastEvent.endTime;
                const nextH = (lastH + 1) % 24;
                newEndTime = `${nextH.toString().padStart(2, '0')}:${lastM.toString().padStart(2, '0')}`;
            }
        }

        setEvents([
            ...events,
            { id: Date.now().toString(), title: '', description: '', startTime: newStartTime, endTime: newEndTime, allDay: false, recurrence: 'none', dateOffset: 0, dateOverride: newDateOverride }
        ]);
    };

    const removeEvent = (id: string) => {
        if (events.length === 1) return;
        setEvents(events.filter(e => e.id !== id));
    };

    const updateEvent = (id: string, updates: Partial<ScheduleEventData>) => {
        setEvents(events.map(e => e.id === id ? { ...e, ...updates } : e));
    };

    const handleApply = async () => {
        try {
            setIsSaving(true);
            setError(null);
            const appliedTheme = theme === 'new-theme' ? themeName : theme;
            await onApply(events, appliedTheme);
            onClose();
        } catch (e: any) {
            setError(e.message || "Failed to save schedule items.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center pointer-events-auto">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-white dark:bg-[#1A1A1A] w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-float flex flex-col m-4 border border-gray-200 dark:border-slate-800">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800/80">
                    <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <ListPlus size={22} className="text-blue-500" />
                        Schedule Builder
                    </h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="p-6 pb-2 border-b border-gray-100 dark:border-slate-800/50">
                        {/* Meta Settings */}
                        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-end">
                            <div className="flex-1 w-full max-w-sm">
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Group / Theme</label>
                                <select
                                    className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    value={theme}
                                    onChange={(e) => setTheme(e.target.value)}
                                >
                                    <option value="new-theme">+ Create New Theme</option>
                                    <optgroup label="Existing Themes">
                                        {existingThemes.map(t => (
                                            <option key={t.id} value={t.id}>{t.title || 'Untitled'}</option>
                                        ))}
                                    </optgroup>
                                </select>
                                {theme === 'new-theme' && (
                                    <input
                                        type="text"
                                        placeholder="Theme Name..."
                                        maxLength={30}
                                        value={themeName}
                                        onChange={(e) => setThemeName(e.target.value)}
                                        className="w-full mt-2 bg-white dark:bg-[#2A2A2A] border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                    />
                                )}
                            </div>

                            <div className="flex items-center gap-2 w-full md:w-auto">
                                <input
                                    type="file"
                                    accept=".json"
                                    ref={fileInputRef}
                                    onChange={importFromJSON}
                                    className="hidden"
                                    id="schedule-import-input"
                                />
                                <label
                                    htmlFor="schedule-import-input"
                                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                                >
                                    <Upload size={16} /> Import
                                </label>
                                <button
                                    onClick={exportToJSON}
                                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl text-sm font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                                >
                                    <Download size={16} /> Export
                                </button>
                            </div>
                        </div>
                        {error && (
                            <div className="mt-4 flex items-center gap-2 text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-sm font-medium">
                                <AlertCircle size={16} /> {error}
                            </div>
                        )}
                    </div>

                    {/* Events List */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-3 max-h-[50vh]">
                        {events.map((event, index) => (
                            <div key={event.id} className="group relative flex flex-col md:flex-row items-start md:items-center gap-3 bg-gray-50/50 dark:bg-[#151515] border border-gray-200 dark:border-slate-800/80 rounded-2xl p-3 pl-4 transition-all hover:border-gray-300 dark:hover:border-slate-700/80">
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gray-200 dark:bg-slate-800 rounded-l-2xl group-hover:bg-blue-400 dark:group-hover:bg-blue-600 transition-colors"></div>

                                <span className="text-xs font-bold text-gray-400 w-5 shrink-0 select-none">{index + 1}.</span>

                                <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-4 gap-3">
                                    <input
                                        type="text"
                                        placeholder="Event Title..."
                                        value={event.title}
                                        className="col-span-1 md:col-span-1 bg-white dark:bg-black/40 border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50 w-full"
                                        onChange={(e) => updateEvent(event.id, { title: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Description (optional)"
                                        value={event.description}
                                        className="col-span-1 md:col-span-1 bg-transparent border border-dashed border-gray-300 dark:border-slate-700/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white dark:focus:bg-black/40 w-full"
                                        onChange={(e) => updateEvent(event.id, { description: e.target.value })}
                                    />

                                    <div className="col-span-1 md:col-span-2 relative flex flex-col justify-end gap-2">
                                        <button
                                            onClick={() => setActiveDateSettings(activeDateSettings === event.id ? null : event.id)}
                                            className="w-full flex items-center justify-between px-3 py-2 bg-white dark:bg-black/40 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-medium hover:bg-gray-50 focus:outline-none transition-colors border-dashed"
                                        >
                                            <span className="truncate text-gray-600 dark:text-gray-300">
                                                {event.dateOverride ? new Date(event.dateOverride).toLocaleDateString('de-DE', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Kein Datum'}
                                                {!event.allDay ? ` • ${event.startTime} - ${event.endTime}` : ' • Ganztags'}
                                                {event.recurrence !== 'none' && ` • Wiederholt: ${event.recurrence}`}
                                            </span>
                                            <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${activeDateSettings === event.id ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                        </button>

                                        {activeDateSettings === event.id && (
                                            <div className="w-full bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-slate-700 rounded-2xl p-4 flex flex-col gap-3 transition-all">
                                                <div className="flex justify-between items-center pb-2 border-b border-gray-100 dark:border-slate-800">
                                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Zeit & Datum</span>
                                                </div>

                                                <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
                                                    Datum einstellen
                                                    <input
                                                        type="date"
                                                        value={event.dateOverride || ''}
                                                        onChange={(e) => updateEvent(event.id, { dateOverride: e.target.value })}
                                                        className="mt-1 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    />
                                                </label>

                                                <label className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-slate-800 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 accent-blue-500"
                                                        checked={event.allDay}
                                                        onChange={(e) => updateEvent(event.id, { allDay: e.target.checked })}
                                                    />
                                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Ganztägig</span>
                                                </label>

                                                <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
                                                    Wiederholung
                                                    <select
                                                        value={event.recurrence}
                                                        onChange={(e) => updateEvent(event.id, { recurrence: e.target.value as any })}
                                                        className="mt-1 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    >
                                                        <option value="none">Nie</option>
                                                        <option value="daily">Täglich</option>
                                                        <option value="weekly">Wöchentlich</option>
                                                        <option value="monthly">Monatlich</option>
                                                        <option value="yearly">Jährlich</option>
                                                    </select>
                                                </label>

                                                {!event.allDay && (
                                                    <div className="flex items-center gap-2 pt-1">
                                                        <input
                                                            type="time"
                                                            value={event.startTime}
                                                            onChange={(e) => updateEvent(event.id, { startTime: e.target.value })}
                                                            className="flex-1 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-slate-800 rounded-xl px-2 py-2 text-sm font-medium focus:outline-none text-center"
                                                        />
                                                        <span className="text-gray-400 font-bold">-</span>
                                                        <input
                                                            type="time"
                                                            value={event.endTime}
                                                            onChange={(e) => updateEvent(event.id, { endTime: e.target.value })}
                                                            className="flex-1 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-slate-800 rounded-xl px-2 py-2 text-sm font-medium focus:outline-none text-center"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <button
                                    onClick={() => removeEvent(event.id)}
                                    disabled={events.length === 1}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors disabled:opacity-30 disabled:hover:bg-transparent shrink-0"
                                    title="Remove Event"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="px-6 py-3 border-t border-gray-100 dark:border-slate-800/50">
                        <button
                            onClick={addEvent}
                            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 dark:border-slate-800 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 dark:hover:border-blue-500/50 rounded-2xl text-sm font-bold text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-all cursor-pointer"
                        >
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
