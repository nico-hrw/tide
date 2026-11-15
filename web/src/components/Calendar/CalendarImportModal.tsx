import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    X, UploadCloud, Calendar, Clock, MapPin, CheckCircle2,
    AlertCircle, ChevronDown, ChevronUp, HelpCircle, ArrowLeft, Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { parseIcsString, type ParsedIcsEvent } from '@/lib/icsParser';
import { importCalendarEvents } from '@/lib/calendarImporter';

export interface CalendarImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    themes?: { id: string; title: string; effect?: string; color?: string }[];
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'done';

interface ImportProgress {
    current: number;
    total: number;
}

interface ImportResult {
    total: number;
    imported: number;
    failed: number;
}

export function CalendarImportModal({ isOpen, onClose, themes = [] }: CalendarImportModalProps) {
    const [step, setStep] = useState<ImportStep>('upload');
    const [parsedEvents, setParsedEvents] = useState<ParsedIcsEvent[]>([]);
    const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
    const [selectedGroupId, setSelectedGroupId] = useState<string>('');
    const [importProgress, setImportProgress] = useState<ImportProgress>({ current: 0, total: 0 });
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const resetState = useCallback(() => {
        setStep('upload');
        setParsedEvents([]);
        setSelectedUids(new Set());
        setSelectedGroupId('');
        setImportProgress({ current: 0, total: 0 });
        setImportResult(null);
        setError(null);
        setIsHelpOpen(false);
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (!isOpen) resetState();
    }, [isOpen, resetState]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen && step !== 'importing') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, step, onClose]);

    if (!isOpen) return null;

    const getEventId = (ev: ParsedIcsEvent, idx: number): string =>
        ev.uid || `event-${idx}-${ev.title}-${new Date(ev.start).getTime()}`;

    const handleFileProcess = (file: File) => {
        if (!file.name.toLowerCase().endsWith('.ics')) {
            setError('Bitte wähle eine gültige iCalendar-Datei (.ics) aus.');
            return;
        }
        setError(null);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                if (!text || !text.trim()) {
                    setError('Die Datei ist leer oder konnte nicht gelesen werden.');
                    return;
                }
                const events = parseIcsString(text);
                if (!events || events.length === 0) {
                    setError('Keine Termine in der .ics-Datei gefunden.');
                    return;
                }
                setParsedEvents(events);
                setSelectedUids(new Set(events.map((ev, idx) => getEventId(ev, idx))));
                setStep('preview');
            } catch (err) {
                console.error('ICS Parsing error:', err);
                setError(err instanceof Error ? err.message : 'Fehler beim Parsen der Kalenderdatei.');
            }
        };
        reader.onerror = () => setError('Fehler beim Einlesen der Datei.');
        reader.readAsText(file, 'utf-8');
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileProcess(file);
        if (e.target) e.target.value = '';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileProcess(file);
    };

    const toggleSelectAll = () => {
        if (selectedUids.size === parsedEvents.length) {
            setSelectedUids(new Set());
        } else {
            setSelectedUids(new Set(parsedEvents.map((ev, idx) => getEventId(ev, idx))));
        }
    };

    const toggleEventSelection = (id: string) => {
        const next = new Set(selectedUids);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedUids(next);
    };

    const handleStartImport = async () => {
        const eventsToImport = parsedEvents.filter((ev, idx) => selectedUids.has(getEventId(ev, idx)));
        if (eventsToImport.length === 0) {
            setError('Bitte wähle mindestens ein Ereignis zum Importieren aus.');
            return;
        }
        setStep('importing');
        setError(null);
        setImportProgress({ current: 0, total: eventsToImport.length });
        try {
            const result = await importCalendarEvents(eventsToImport, {
                groupId: selectedGroupId || undefined,
                onProgress: (progress) => {
                    setImportProgress({ current: progress.current, total: progress.total });
                },
            });
            setImportResult(result);
            setStep('done');
        } catch (err) {
            console.error('Import error:', err);
            setError(err instanceof Error ? err.message : 'Fehler beim Importieren der Termine.');
            setStep('preview');
        }
    };

    const formatEventDate = (startVal: Date | string, endVal: Date | string, allDay?: boolean) => {
        const start = new Date(startVal);
        const end = new Date(endVal);
        if (isNaN(start.getTime())) return 'Ungültiges Datum';
        if (allDay) return format(start, 'dd.MM.yyyy', { locale: de });
        const sameDay =
            start.getFullYear() === end.getFullYear() &&
            start.getMonth() === end.getMonth() &&
            start.getDate() === end.getDate();
        if (sameDay && !isNaN(end.getTime())) {
            return `${format(start, 'dd.MM.yyyy HH:mm', { locale: de })} - ${format(end, 'HH:mm', { locale: de })}`;
        }
        if (!isNaN(end.getTime())) {
            return `${format(start, 'dd.MM.yyyy HH:mm', { locale: de })} - ${format(end, 'dd.MM.yyyy HH:mm', { locale: de })}`;
        }
        return format(start, 'dd.MM.yyyy HH:mm', { locale: de });
    };

    return (
        <div
            className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={() => { if (step !== 'importing') onClose(); }}
        >
            <div
                className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-[#1A1A1A] text-gray-900 dark:text-white shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800/80">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                            <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold leading-tight">Kalender importieren</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {step === 'upload' && 'Google Kalender oder .ics Datei hochladen'}
                                {step === 'preview' && 'Termine überprüfen und auswählen'}
                                {step === 'importing' && 'Termine werden übertragen'}
                                {step === 'done' && 'Import abgeschlossen'}
                            </p>
                        </div>
                    </div>
                    {step !== 'importing' && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                            aria-label="Schließen"
                        ><X className="w-5 h-5" /></button>
                    )}
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="mx-6 mt-4 p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 flex items-start space-x-2 text-sm text-red-600 dark:text-red-400">
                        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">{error}</div>
                    </div>
                )}

                {/* Content Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* STEP 1: UPLOAD */}
                    {step === 'upload' && (
                        <div className="space-y-4">
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={`cursor-pointer border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-colors ${
                                    isDragging
                                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                                        : 'border-gray-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600 bg-gray-50/50 dark:bg-slate-900/40'
                                }`}
                            >
                                <input type="file" ref={fileInputRef} onChange={handleFileInputChange} accept=".ics,text/calendar" className="hidden" />
                                <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mb-3">
                                    <UploadCloud className="w-8 h-8" />
                                </div>
                                <h3 className="font-semibold text-base mb-1">.ics-Datei hier ablegen oder klicken</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
                                    Unterstützt iCalendar-Dateien von Google Kalender, Apple Kalender, Outlook und weiteren Diensten.
                                </p>
                            </div>

                            {/* Google Calendar Help Box */}
                            <div className="rounded-2xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/40 overflow-hidden transition-all">
                                <button
                                    type="button"
                                    onClick={() => setIsHelpOpen((prev) => !prev)}
                                    className="w-full flex items-center justify-between p-4 text-left font-medium text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                                >
                                    <span className="flex items-center space-x-2">
                                        <HelpCircle className="w-4 h-4 text-blue-500" />
                                        <span>Wie exportiere ich meinen Google-Kalender?</span>
                                    </span>
                                    {isHelpOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                </button>
                                {isHelpOpen && (
                                    <div className="px-4 pb-4 text-xs text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-slate-800/80 pt-3 space-y-2">
                                        <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                                            <li>
                                                In Google Kalender (<a href="https://calendar.google.com" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">calendar.google.com</a>) rechts oben auf das Zahnrad &gt; Einstellungen klicken.
                                            </li>
                                            <li>Im Menü links &apos;Importieren &amp; Exportieren&apos; wählen.</li>
                                            <li>Auf &apos;Exportieren&apos; klicken und die heruntergeladene .zip-Datei entpacken (oder die .ics-Datei auswählen).</li>
                                            <li>Die .ics-Datei hier ablegen.</li>
                                        </ol>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* STEP 2: PREVIEW & SELECTION */}
                    {step === 'preview' && (
                        <div className="space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-gray-100 dark:border-slate-800">
                                <div>
                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {selectedUids.size} von {parsedEvents.length} Ereignissen ausgewählt
                                    </span>
                                </div>
                                <div className="flex items-center space-x-3">
                                    <button
                                        type="button"
                                        onClick={toggleSelectAll}
                                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        {selectedUids.size === parsedEvents.length ? 'Alle abwählen' : 'Alle auswählen'}
                                    </button>
                                    {themes.length > 0 && (
                                        <select
                                            value={selectedGroupId}
                                            onChange={(e) => setSelectedGroupId(e.target.value)}
                                            className="text-xs rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        >
                                            <option value="">Standard-Kategorie</option>
                                            {themes.map((th) => (
                                                <option key={th.id} value={th.id}>
                                                    {th.title}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            </div>

                            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                                {parsedEvents.map((ev, index) => {
                                    const id = getEventId(ev, index);
                                    const isSelected = selectedUids.has(id);
                                    return (
                                        <div
                                            key={id}
                                            onClick={() => toggleEventSelection(id)}
                                            className={`flex items-start space-x-3 p-3 rounded-2xl border cursor-pointer transition-colors ${
                                                isSelected
                                                    ? 'border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20'
                                                    : 'border-gray-200/80 dark:border-slate-800/80 hover:bg-gray-50/60 dark:hover:bg-slate-900/40 opacity-70'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => {}}
                                                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center space-x-2">
                                                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                                        {ev.title || 'Ohne Titel'}
                                                    </h4>
                                                    {ev.allDay && (
                                                        <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                                                            Ganztägig
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                    <span className="flex items-center space-x-1">
                                                        <Clock className="w-3.5 h-3.5" />
                                                        <span>{formatEventDate(ev.start, ev.end, ev.allDay)}</span>
                                                    </span>
                                                    {ev.location && (
                                                        <span className="flex items-center space-x-1 truncate max-w-xs">
                                                            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                                                            <span className="truncate">{ev.location}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* STEP 3: IMPORTING */}
                    {step === 'importing' && (
                        <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                            <div>
                                <h3 className="text-base font-semibold">Termine werden importiert...</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Importiere {importProgress.current} von {importProgress.total}...
                                </p>
                            </div>
                            <div className="w-full max-w-md bg-gray-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                                <div
                                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-200"
                                    style={{
                                        width: `${importProgress.total > 0 ? Math.min(100, Math.round((importProgress.current / importProgress.total) * 100)) : 0}%`,
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {/* STEP 4: DONE */}
                    {step === 'done' && (
                        <div className="py-10 flex flex-col items-center justify-center text-center space-y-4">
                            <div className="p-3 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="w-12 h-12" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Import erfolgreich abgeschlossen!</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{importResult?.imported ?? 0} Termine erfolgreich importiert.</p>
                                {importResult && importResult.failed > 0 && (
                                    <p className="text-xs text-red-500 dark:text-red-400 mt-1">{importResult.failed} Termine konnten nicht importiert werden.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-800/80 flex items-center justify-between">
                    {step === 'preview' ? (
                        <>
                            <button
                                type="button"
                                onClick={() => { setStep('upload'); setParsedEvents([]); setSelectedUids(new Set()); }}
                                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                <span>Zurück</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleStartImport}
                                disabled={selectedUids.size === 0}
                                className="px-5 py-2 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none shadow-sm transition-colors"
                            >
                                Importieren ({selectedUids.size})
                            </button>
                        </>
                    ) : step === 'done' ? (
                        <div className="w-full flex justify-end">
                            <button type="button" onClick={onClose} className="px-6 py-2 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors">
                                Fertig
                            </button>
                        </div>
                    ) : (
                        <div className="w-full flex justify-end">
                            <button type="button" onClick={onClose} disabled={step === 'importing'} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
                                Abbrechen
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default CalendarImportModal;
