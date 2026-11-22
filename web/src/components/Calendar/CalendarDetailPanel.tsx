"use client";

import React from "react";
import { format, differenceInMinutes } from "date-fns";
import { CheckSquare, Clock, Square, X } from "lucide-react";
import type { CalendarEvent } from "./types";
import { getEventGroupIds, resolveTagTitles } from "../../lib/calendarUtils";
import CalendarEventEditor from "./CalendarEventEditor";

export interface DetailStat {
    value: string;
    label: string;
}

interface CalendarDetailPanelProps {
    /** Überschrift im Ruhezustand, z. B. "Heute" oder "Diese Woche". */
    idleTitle: string;
    /** Kurzer Satz im Ruhezustand. */
    idleMessage: string;
    /** Kennzahlen im Ruhezustand (bis zu drei). */
    stats: DetailStat[];
    /** Ausgewählter Termin; ohne Auswahl zeigt das Panel den Ruhezustand. */
    event: CalendarEvent | null;
    /** Name des Bereichs/Themes, falls vorhanden. */
    themeTitle?: string;
    /** Verfügbare Tags (Gruppen), um die Tag-Ids des Termins in Titel aufzulösen. */
    themes?: { id: string; title: string }[];
    onClose: () => void;
    onEdit?: () => void;
    /** When given, the selected event is edited right here (fields save on change) instead of through a popup. */
    onUpdate?: (updates: Record<string, unknown>) => void;
    onDelete?: () => void;
    onToggleDone?: () => void;
}

const formatDuration = (minutes: number) =>
    minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} Min` : ""}` : `${minutes} Min`;

/**
 * Immer sichtbare Detailspalte des Desktop-Kalenders (Tag und Fortlaufend).
 * Ohne Auswahl: Kennzahlen und ein kurzer Satz. Mit Auswahl: Eigenschaften des Termins.
 */
export default function CalendarDetailPanel({
    idleTitle,
    idleMessage,
    stats,
    event,
    themeTitle,
    themes = [],
    onClose,
    onEdit,
    onUpdate,
    onDelete,
    onToggleDone,
}: CalendarDetailPanelProps) {
    const base = "relative flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto border-l border-t2-line py-1 pl-10 pr-2";

    if (!event) {
        return (
            <aside className={base} aria-live="polite">
                <h2 className="text-[28px] font-bold leading-tight tracking-tight text-t2-ink">{idleTitle}</h2>
                <p className="text-[19px] font-semibold leading-snug tracking-tight text-t2-ink">{idleMessage}</p>
                {stats.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                        {stats.map((s) => (
                            <div key={s.label} className="rounded-[10px] bg-t2-sub p-3">
                                <div className="text-[22px] font-bold text-t2-ink">{s.value}</div>
                                <div className="text-[12.5px] text-t2-ink-3">{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}
            </aside>
        );
    }

    if (onUpdate) {
        return (
            <aside className={base} aria-live="polite">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Schließen"
                    className="absolute right-3 top-1 rounded-[8px] p-1.5 text-t2-ink-3 transition-colors hover:bg-t2-hover"
                >
                    <X size={16} />
                </button>
                <CalendarEventEditor key={event.id} event={event} themes={themes} onUpdate={onUpdate} onDelete={onDelete} />
                {event.is_task && onToggleDone && (
                    <button type="button" onClick={onToggleDone} className="inline-flex items-center gap-2 text-[14px] text-t2-ink">
                        {event.is_completed ? <CheckSquare size={16} /> : <Square size={16} />}
                        <span>{event.is_completed ? "Erledigt" : "Als erledigt markieren"}</span>
                    </button>
                )}
            </aside>
        );
    }

    const start = new Date(event.start);
    const end = new Date(event.end);
    const minutes = Math.max(0, differenceInMinutes(end, start));
    const tags = resolveTagTitles(getEventGroupIds(event), themes);

    return (
        <aside className={base} aria-live="polite">
            <button
                type="button"
                onClick={onClose}
                aria-label="Schließen"
                className="absolute right-3 top-1 rounded-[8px] p-1.5 text-t2-ink-3 transition-colors hover:bg-t2-hover"
            >
                <X size={16} />
            </button>
            <div>
                {themeTitle && <div className="text-[13px] text-t2-ink-3">{themeTitle}</div>}
                <h2
                    className={`text-[28px] font-bold leading-tight tracking-tight text-t2-ink ${
                        event.is_completed ? "line-through opacity-60" : ""
                    }`}
                >
                    {event.title || "Ohne Titel"}
                </h2>
            </div>

            <div className="flex flex-col text-[14px] text-t2-ink">
                <div className="flex items-center gap-2.5 py-1.5">
                    <span className="w-[92px] shrink-0 text-[13px] text-t2-ink-3">Zeit</span>
                    <Clock size={15} className="shrink-0 text-t2-ink-2" />
                    {event.allDay ? (
                        <span>Ganztägig</span>
                    ) : (
                        <span>
                            {format(start, "HH:mm")} – {format(end, "HH:mm")}
                            {minutes > 0 ? ` · ${formatDuration(minutes)}` : ""}
                        </span>
                    )}
                </div>
                {event.is_task && onToggleDone && (
                    <div className="flex items-center gap-2.5 py-1.5">
                        <span className="w-[92px] shrink-0 text-[13px] text-t2-ink-3">Aufgabe</span>
                        <button type="button" onClick={onToggleDone} className="inline-flex items-center gap-2">
                            {event.is_completed ? <CheckSquare size={16} /> : <Square size={16} />}
                            <span>{event.is_completed ? "Erledigt" : "Offen"}</span>
                        </button>
                    </div>
                )}
            </div>

            {event.description && (
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-t2-ink-2">{event.description}</p>
            )}

            {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                        <span key={tag.id} className="rounded-full bg-t2-sub px-2.5 py-0.5 text-[12.5px] font-medium text-t2-ink">
                            {tag.title}
                        </span>
                    ))}
                </div>
            )}

            {(onEdit || onDelete) && (
                <div className="flex gap-2">
                    {onEdit && (
                        <button
                            type="button"
                            onClick={onEdit}
                            className="rounded-[10px] bg-t2-ink px-3.5 py-1.5 text-[13.5px] font-semibold text-t2-bg"
                        >
                            Bearbeiten
                        </button>
                    )}
                    {onDelete && (
                        <button
                            type="button"
                            onClick={onDelete}
                            className="rounded-[10px] px-3.5 py-1.5 text-[13.5px] text-t2-ink-2 shadow-[0_0_0_1px_var(--t2-line)] transition-colors hover:bg-t2-hover"
                        >
                            Löschen
                        </button>
                    )}
                </div>
            )}
        </aside>
    );
}
