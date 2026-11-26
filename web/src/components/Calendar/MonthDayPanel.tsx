"use client";

import React from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Clock, FileText, Pencil, X } from 'lucide-react';
import { getEventGroupIds } from '@/lib/calendarUtils';
import { resolveCategory } from '@/lib/calendarColors';
import type { CalendarEvent } from './types';

type Theme = { id: string; title: string; effect?: string; color?: string };

/** Fill and text colour of an event: its category colour (or the colour of its first tag). */
export function eventColors(ev: CalendarEvent, themes: Theme[]): { bg: string; ink: string } {
    const matched = themes.find((t) => getEventGroupIds(ev).includes(t.id));
    const cat = resolveCategory(ev.color || matched?.color);
    return { bg: cat.bg, ink: cat.ink };
}

const timeLabel = (ev: CalendarEvent) =>
    ev.allDay ? 'Ganztägig' : `${format(new Date(ev.start), 'HH:mm')} – ${format(new Date(ev.end), 'HH:mm')}`;

/** Day list that slides in next to the month grid on tablets: every event of the tapped day, in time order. */
export function MonthDayPanel({
    day, events, themes, selectedId, onSelect, onOpenDay, onClose,
}: {
    day: Date;
    events: CalendarEvent[];
    themes: Theme[];
    selectedId: string | null;
    onSelect: (ev: CalendarEvent) => void;
    onOpenDay: () => void;
    onClose: () => void;
}) {
    const sorted = [...events].sort((a, b) => Number(!!b.allDay) - Number(!!a.allDay) || new Date(a.start).getTime() - new Date(b.start).getTime());
    return (
        <div className="flex h-full min-w-[300px] flex-col rounded-2xl border border-t2-line bg-t2-surface shadow-md overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-t2-line-soft px-4 py-3">
                <button type="button" onClick={onOpenDay} className="min-w-0 text-left" title="Tagesansicht öffnen">
                    <div className="truncate text-[15px] font-bold text-t2-ink">{format(day, 'EEEE', { locale: de })}</div>
                    <div className="text-xs text-t2-ink-3">{format(day, 'd. MMMM yyyy', { locale: de })}</div>
                </button>
                <button type="button" onClick={onClose} aria-label="Schließen" className="grid h-8 w-8 place-items-center rounded-full text-t2-ink-3 hover:bg-t2-hover hover:text-t2-ink">
                    <X size={16} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                {sorted.length === 0 && <p className="px-1 py-6 text-center text-sm text-t2-ink-3">Keine Termine</p>}
                {sorted.map((ev) => {
                    const c = eventColors(ev, themes);
                    const active = ev.id === selectedId;
                    return (
                        <button
                            key={ev.id}
                            type="button"
                            onClick={() => onSelect(ev)}
                            style={{ background: c.bg, color: c.ink }}
                            className={`w-full shrink-0 rounded-xl px-3.5 py-2.5 text-left transition-all hover:brightness-[0.94] ${active ? 'ring-2 ring-t2-ink' : ''}`}
                        >
                            <div className="truncate text-[13.5px] font-bold leading-tight">{ev.title || 'Ohne Titel'}</div>
                            <div className="mt-0.5 text-[12px] font-medium opacity-80 tabular-nums">{timeLabel(ev)}</div>
                        </button>
                    );
                })}
            </div>
            <button type="button" onClick={onOpenDay} className="border-t border-t2-line-soft px-4 py-2.5 text-xs font-semibold text-t2-ink-2 hover:bg-t2-hover hover:text-t2-ink">
                Tagesansicht öffnen
            </button>
        </div>
    );
}

/** A few details of the selected event, shown under the month grid. */
export function MonthEventInfo({
    event, themes, onEdit, onClose,
}: {
    event: CalendarEvent;
    themes: Theme[];
    onEdit: (rect: DOMRect) => void;
    onClose: () => void;
}) {
    const c = eventColors(event, themes);
    const tags = themes.filter((t) => getEventGroupIds(event).includes(t.id));
    return (
        <div className="mx-3 mb-3 rounded-2xl border border-t2-line bg-t2-surface p-3.5 shadow-md">
            <div className="flex items-start gap-2.5">
                <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: c.bg }} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-bold text-t2-ink">{event.title || 'Ohne Titel'}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-t2-ink-2 tabular-nums">
                        <Clock size={12} />{format(new Date(event.start), 'd. MMM', { locale: de })} · {timeLabel(event)}
                    </div>
                    {event.description && (
                        <div className="mt-1.5 flex items-start gap-1.5 text-xs text-t2-ink-2">
                            <FileText size={12} className="mt-0.5 shrink-0" />
                            <span className="line-clamp-2">{event.description}</span>
                        </div>
                    )}
                    {tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {tags.map((t) => <span key={t.id} className="text-xs font-medium text-t2-ink-2">#{t.title}</span>)}
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={(e) => onEdit(e.currentTarget.getBoundingClientRect())}
                    className="inline-flex items-center gap-1.5 rounded-full bg-t2-ink px-3 py-1.5 text-xs font-semibold text-t2-bg"
                >
                    <Pencil size={12} />Bearbeiten
                </button>
                <button type="button" onClick={onClose} aria-label="Schließen" className="grid h-7 w-7 place-items-center rounded-full text-t2-ink-3 hover:bg-t2-hover">
                    <X size={14} />
                </button>
            </div>
        </div>
    );
}
