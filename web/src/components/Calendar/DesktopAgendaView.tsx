import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    format,
    addDays,
    subDays,
    isToday,
    isTomorrow,
    isYesterday,
    differenceInMinutes,
    startOfWeek,
} from "date-fns";
import { de } from "date-fns/locale";
import { Check, Plus } from "lucide-react";
import { getHolidayForDate } from "@/lib/holidays";
import { getEventGroupIds } from "@/lib/calendarUtils";
import { useDataStore } from "@/store/useDataStore";
import { getEventTheme } from "./CalendarEventItem";
import CalendarDetailPanel from "./CalendarDetailPanel";
import type { CalendarEvent } from "./types";

interface DesktopAgendaViewProps {
    currentDate: Date;
    eventsByDay: { timedMap: Map<string, CalendarEvent[]>; allDayMap: Map<string, CalendarEvent[]> };
    onEventClick: (event: CalendarEvent, rect: DOMRect) => void;
    onEventCreate?: (start: Date, end: Date, isAllDay?: boolean, extraMeta?: Record<string, unknown>) => Promise<string | null>;
    onEventDelete?: (id: string) => Promise<void>;
    onEventSave?: (id: string, updates: Record<string, unknown>) => void | Promise<void>;
    onTaskToggle?: (id: string, currentIsCompleted: boolean) => void;
    themes?: { id: string; title: string; effect?: string; color?: string }[];
}

/** Feines, schräg gestricheltes Muster für Todo-Blobs (siehe Mockup). */
const HATCH =
    "repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in srgb, var(--t2-ink) 7%, transparent) 7px 8px)";
/** Gestrichelte Schiene für Pausen zwischen Terminen. */
const DASHED_RAIL =
    "repeating-linear-gradient(to bottom, var(--t2-ink-3) 0 3px, transparent 3px 7px)";

const formatDuration = (minutes: number) =>
    minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} Min` : ""}` : `${minutes} Min`;

function TodoPill({
    event,
    block,
    onToggle,
}: {
    event: CalendarEvent;
    block?: boolean;
    onToggle?: (id: string, completed: boolean) => void;
}) {
    const done = !!event.is_completed;
    return (
        <span
            className={`inline-flex items-center rounded-full bg-t2-surface text-t2-ink shadow-[0_0_0_1px_var(--t2-line)] ${
                block ? "min-h-[46px] w-full gap-2.5 rounded-[10px] px-3 text-[14.5px] font-medium" : "gap-2 py-1 pl-[7px] pr-[11px] text-[13px]"
            } ${done ? "text-t2-ink-3 line-through" : ""}`}
            style={{ backgroundImage: HATCH }}
        >
            <button
                type="button"
                aria-label={done ? "Als offen markieren" : "Als erledigt markieren"}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggle?.(event.id, done);
                }}
                className={`grid shrink-0 place-items-center rounded-full ${block ? "h-[19px] w-[19px]" : "h-[15px] w-[15px]"} ${
                    done ? "bg-t2-ink text-t2-bg" : "shadow-[inset_0_0_0_1.5px_var(--t2-ink-3)]"
                }`}
            >
                {done && <Check size={10} strokeWidth={3} />}
            </button>
            <span className="truncate">{event.title || "Ohne Titel"}</span>
        </span>
    );
}

export default function DesktopAgendaView({
    currentDate,
    eventsByDay,
    onEventClick,
    onEventCreate,
    onEventDelete,
    onEventSave,
    onTaskToggle,
    themes = [],
}: DesktopAgendaViewProps) {
    const todayRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const calendarColorPalette = useDataStore((s) => s.calendarColorPalette || "balsam");
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // Render 42 days (6 weeks) starting from 3 days in the past
    const days = Array.from({ length: 42 }).map((_, i) => addDays(subDays(currentDate, 3), i));

    // Scroll smoothly to today on mount
    useEffect(() => {
        const timer = setTimeout(() => {
            if (todayRef.current && scrollContainerRef.current) {
                todayRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }, 100);
        return () => clearTimeout(timer);
    }, [currentDate]);

    const handleCreateOnDay = (day: Date) => {
        if (!onEventCreate) return;
        const start = new Date(day);
        start.setHours(9, 0, 0, 0);
        const end = new Date(day);
        end.setHours(10, 0, 0, 0);
        onEventCreate(start, end, false);
    };

    const selectedEvent = useMemo(() => {
        if (!selectedId) return null;
        for (const list of [...eventsByDay.timedMap.values(), ...eventsByDay.allDayMap.values()]) {
            const hit = list.find((e) => e.id === selectedId);
            if (hit) return hit;
        }
        return null;
    }, [selectedId, eventsByDay]);

    const selectedTheme = selectedEvent
        ? themes.find((t) => getEventGroupIds(selectedEvent).includes(t.id))
        : undefined;

    // Kennzahlen der aktuellen Woche für den Ruhezustand der Detailspalte
    const week = useMemo(() => {
        const first = startOfWeek(currentDate, { weekStartsOn: 1 });
        let count = 0;
        let minutes = 0;
        let openTodos = 0;
        for (let i = 0; i < 7; i++) {
            const key = format(addDays(first, i), "yyyy-MM-dd");
            const list = [...(eventsByDay.allDayMap.get(key) || []), ...(eventsByDay.timedMap.get(key) || [])];
            for (const e of list) {
                if (e.is_cancelled) continue;
                if (e.is_task) {
                    if (!e.is_completed) openTodos++;
                    continue;
                }
                count++;
                if (!e.allDay) minutes += Math.max(0, differenceInMinutes(new Date(e.end), new Date(e.start)));
            }
        }
        return { count, minutes, openTodos };
    }, [currentDate, eventsByDay]);

    return (
        <div className="flex h-full min-h-0 flex-1 gap-10 px-4 py-4 sm:px-6 lg:px-10">
            <div ref={scrollContainerRef} className="w-full shrink-0 select-none overflow-y-auto pb-10 md:w-[520px]">
                {days.map((day) => {
                    const dayKey = format(day, "yyyy-MM-dd");
                    const isTod = isToday(day);
                    const holiday = getHolidayForDate(dayKey);

                    const timed = (eventsByDay.timedMap.get(dayKey) || []).filter((e) => !e.is_cancelled);
                    const allDay = (eventsByDay.allDayMap.get(dayKey) || []).filter((e) => !e.is_cancelled);
                    const allDayTodos = allDay.filter((e) => e.is_task);
                    const allDayEvents = allDay.filter((e) => !e.is_task);
                    const items = [...timed].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

                    const prefix = isTod ? "Heute" : isTomorrow(day) ? "Morgen" : isYesterday(day) ? "Gestern" : null;
                    const weekday = format(day, "EEEE", { locale: de });
                    const dateText = format(day, "d. MMMM", { locale: de });
                    let prevEnd: number | null = null;

                    return (
                        <div key={day.toISOString()} ref={isTod ? todayRef : undefined} className="scroll-mt-0">
                            {/* Tageskopf */}
                            <div className="sticky top-0 z-10 flex items-baseline gap-2.5 bg-t2-bg pb-1.5 pt-4">
                                {prefix ? (
                                    isTod ? (
                                        <b className="rounded-full bg-t2-ink px-2.5 py-0.5 text-[13px] font-bold text-t2-bg">{prefix}</b>
                                    ) : (
                                        <b className="text-[15px] font-bold text-t2-ink">{prefix}</b>
                                    )
                                ) : (
                                    <b className="text-[15px] font-bold text-t2-ink">{weekday}</b>
                                )}
                                <span className="text-[13px] text-t2-ink-3">
                                    {prefix ? `${weekday}, ${dateText}` : dateText}
                                </span>
                                {holiday && (
                                    <span className="rounded-full bg-t2-sub px-2 py-0.5 text-[11.5px] text-t2-ink-2">{holiday.name}</span>
                                )}
                                <button
                                    onClick={() => handleCreateOnDay(day)}
                                    className="ml-auto flex items-center gap-1 rounded-[8px] px-2 py-1 text-[12px] text-t2-ink-3 transition-colors hover:bg-t2-hover hover:text-t2-ink"
                                    title="Termin erstellen"
                                >
                                    <Plus size={13} />
                                    <span>Termin</span>
                                </button>
                            </div>

                            {/* Ganztägige Todos als Pillen */}
                            {allDayTodos.length > 0 && (
                                <div className="my-1 mb-1.5 flex flex-wrap gap-1.5">
                                    {allDayTodos.map((t) => (
                                        <span key={t.id} onClick={() => setSelectedId(t.id)} className="cursor-pointer">
                                            <TodoPill event={t} onToggle={onTaskToggle} />
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Ganztägige Termine */}
                            {allDayEvents.map((ev) => {
                                const theme = getEventTheme(ev, calendarColorPalette);
                                return (
                                    <div
                                        key={ev.id}
                                        onClick={() => setSelectedId(ev.id)}
                                        className="my-1.5 flex cursor-pointer items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 text-[13.5px] font-semibold transition-[filter] hover:brightness-[0.97]"
                                        style={{ background: theme.bg, color: theme.text }}
                                    >
                                        <i className="h-2.5 w-2.5 rounded-full bg-current opacity-85" />
                                        {ev.title || "Ohne Titel"}
                                    </div>
                                );
                            })}

                            {allDay.length === 0 && items.length === 0 && (
                                <div
                                    onClick={() => handleCreateOnDay(day)}
                                    className="my-1.5 flex cursor-pointer items-center justify-between rounded-[10px] border border-dashed border-t2-line px-4 py-3 text-[12.5px] text-t2-ink-3 transition-colors hover:text-t2-ink-2"
                                >
                                    <span>Keine Termine</span>
                                    <Plus size={13} />
                                </div>
                            )}

                            {/* Zeitgebundene Termine und Todos in zeitlicher Reihenfolge, mit Pausen */}
                            {items.map((ev) => {
                                const start = new Date(ev.start);
                                const end = new Date(ev.end);
                                const gapMin = prevEnd === null ? 0 : Math.round((start.getTime() - prevEnd) / 60000);
                                prevEnd = Math.max(prevEnd ?? 0, ev.is_task ? start.getTime() : end.getTime());

                                const gap =
                                    gapMin >= 15 ? (
                                        <div key={`${ev.id}-gap`} className="flex h-[34px] text-[12.5px] text-t2-ink-3">
                                            <div className="w-16 shrink-0" />
                                            <div className="flex w-[22px] shrink-0 justify-center">
                                                <i className="h-full w-[1.5px] opacity-55" style={{ backgroundImage: DASHED_RAIL }} />
                                            </div>
                                            <span className="self-center pl-1.5">{formatDuration(gapMin)} frei</span>
                                        </div>
                                    ) : null;

                                const isSel = selectedId === ev.id;
                                const timeCol = (
                                    <div className={`w-16 shrink-0 pr-2 text-right ${ev.is_task ? "pt-[15px]" : "pt-3"}`}>
                                        <b className="block text-[12.5px] font-bold leading-none">{format(start, "HH:mm")}</b>
                                        {isSel && !ev.is_task && (
                                            <small className="mt-1 block text-[11px] opacity-85">{format(end, "HH:mm")}</small>
                                        )}
                                    </div>
                                );

                                if (ev.is_task) {
                                    return (
                                        <React.Fragment key={ev.id}>
                                            {gap}
                                            <div className="my-1 flex cursor-pointer text-t2-ink" onClick={() => setSelectedId(ev.id)}>
                                                {timeCol}
                                                <div className="flex w-[22px] shrink-0 flex-col items-center pt-[19px]">
                                                    <i className="h-2.5 w-2.5 rounded-full shadow-[inset_0_0_0_1.5px_currentColor]" />
                                                </div>
                                                <div className="min-w-0 flex-1 py-[3px] pl-1.5">
                                                    <TodoPill event={ev} block onToggle={onTaskToggle} />
                                                </div>
                                            </div>
                                        </React.Fragment>
                                    );
                                }

                                const theme = getEventTheme(ev, calendarColorPalette);
                                const matchedTheme = themes.find((t) => getEventGroupIds(ev).includes(t.id));
                                const durationMin = Math.max(15, differenceInMinutes(end, start));
                                return (
                                    <React.Fragment key={ev.id}>
                                        {gap}
                                        <div
                                            data-agenda-id={ev.id}
                                            onClick={() => setSelectedId(ev.id)}
                                            className={`my-1.5 flex cursor-pointer rounded-[14px] transition-[filter] hover:brightness-[0.97] ${
                                                isSel ? "shadow-[0_0_0_2px_var(--t2-bg),0_0_0_4px_var(--t2-ink)]" : ""
                                            } ${ev.is_completed ? "opacity-60" : ""}`}
                                            style={{ background: theme.bg, color: theme.text }}
                                        >
                                            {timeCol}
                                            <div className="flex w-[22px] shrink-0 flex-col items-center pb-3 pt-[13px]">
                                                <i className="h-2.5 w-2.5 shrink-0 rounded-full bg-current opacity-85" />
                                                <i className="mt-1.5 min-h-[6px] w-[2px] flex-1 rounded-sm bg-current opacity-15" />
                                            </div>
                                            <div className="min-w-0 flex-1 py-2.5 pl-1.5 pr-3.5">
                                                <div className="flex items-center gap-2">
                                                    <b className="min-w-0 flex-1 truncate text-[14px] font-bold">{ev.title || "Ohne Titel"}</b>
                                                    <span
                                                        className="rounded-[6px] px-[7px] py-px text-[11.5px] font-semibold"
                                                        style={{ backgroundColor: "color-mix(in srgb, currentColor 18%, transparent)" }}
                                                    >
                                                        {formatDuration(durationMin)}
                                                    </span>
                                                </div>
                                                {matchedTheme && <div className="mt-px text-[12.5px] opacity-90">{matchedTheme.title}</div>}
                                            </div>
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    );
                })}
            </div>

            {/* Rechte Spalte: immer offen (Wochenkennzahlen oder Termindetails) */}
            <div className="hidden min-w-0 flex-1 md:flex">
                <CalendarDetailPanel
                    idleTitle="Diese Woche"
                    idleMessage={
                        week.count > 0
                            ? `${week.count} ${week.count === 1 ? "Termin" : "Termine"}, ${formatDuration(week.minutes)} verplant.`
                            : "Diese Woche ist noch leer."
                    }
                    stats={[
                        { value: String(week.count), label: "Termine" },
                        { value: week.count ? formatDuration(week.minutes) : "–", label: "Geplant" },
                        { value: String(week.openTodos), label: "Todos offen" },
                    ]}
                    event={selectedEvent}
                    themeTitle={selectedTheme?.title}
                    themes={themes}
                    onClose={() => setSelectedId(null)}
                    onUpdate={selectedEvent && onEventSave ? (updates) => { void onEventSave(selectedEvent.id, updates); } : undefined}
                    onEdit={
                        selectedEvent
                            ? () =>
                                  onEventClick(
                                      selectedEvent,
                                      document.querySelector(`[data-agenda-id="${selectedEvent.id}"]`)?.getBoundingClientRect() ??
                                          new DOMRect()
                                  )
                            : undefined
                    }
                    onDelete={
                        selectedEvent && onEventDelete
                            ? () => {
                                  void onEventDelete(selectedEvent.id);
                                  setSelectedId(null);
                              }
                            : undefined
                    }
                    onToggleDone={
                        selectedEvent && selectedEvent.is_task
                            ? () => onTaskToggle?.(selectedEvent.id, !!selectedEvent.is_completed)
                            : undefined
                    }
                />
            </div>
        </div>
    );
}
