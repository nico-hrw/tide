"use client";

import { useEffect, useMemo, useState } from "react";
import { differenceInMinutes, format } from "date-fns";
import MiniCalendar from "@/components/Calendar/MiniCalendar";
import { useCalendarEvents } from "@/store/useDataStore";
import { getEventsForDate, type CalendarEvent } from "@/lib/calendarUtils";

interface SidebarIslandProps {
    selectedDate?: Date;
    onSelect?: (date: Date) => void;
}

/** Laufender Termin zum Zeitpunkt `now` (ganztägige und abgesagte Termine zählen nicht). */
export function findRunningEvent(events: CalendarEvent[], now: Date): CalendarEvent | null {
    return (
        events.find(
            (e) => !e.allDay && !e.is_cancelled && new Date(e.start) <= now && now < new Date(e.end)
        ) ?? null
    );
}

/**
 * Smart Island der Seitenleiste (Desktop). Zeigt immer nur einen Zustand:
 * den laufenden Termin, sonst den Mini-Kalender. Kein Umschalten per Icon.
 */
export default function SidebarIsland({ selectedDate, onSelect }: SidebarIslandProps) {
    const { events: storeEvents } = useCalendarEvents();
    // Store-Einträge sind generisch (DataItem); für Termine werden sie wie auf der Hauptseite umgewandelt.
    const events = useMemo(() => storeEvents as unknown as CalendarEvent[], [storeEvents]);
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(id);
    }, []);

    // Wiederkehrende Termine sind für den heutigen Tag bereits aufgelöst.
    const todays = useMemo(() => getEventsForDate(now, events), [events, now]);
    const running = useMemo(() => findRunningEvent(todays, now), [todays, now]);

    return (
        <div className="mt-auto flex-none rounded-[18px] bg-t2-surface p-3 shadow-[0_0_0_1px_var(--t2-line)]">
            {running ? (
                <div className="flex items-center gap-3">
                    <span
                        className="h-3 w-3 flex-none rounded-full"
                        style={{ background: running.color || "var(--t2-ink)" }}
                    />
                    <div className="min-w-0">
                        <p className="truncate text-[14.5px] font-bold text-t2-ink">{running.title}</p>
                        <p className="text-[12.5px] text-t2-ink-3">
                            endet in {Math.max(0, differenceInMinutes(new Date(running.end), now))} Min ·{" "}
                            {format(new Date(running.end), "HH:mm")}
                        </p>
                    </div>
                </div>
            ) : (
                <MiniCalendar selectedDate={selectedDate} onSelect={onSelect} events={storeEvents as unknown as { start: string; color?: string; allDay?: boolean }[]} />
            )}
        </div>
    );
}
