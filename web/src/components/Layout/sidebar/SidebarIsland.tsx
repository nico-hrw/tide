"use client";

import { useMemo } from "react";
import MiniCalendar from "@/components/Calendar/MiniCalendar";
import { useCalendarEvents } from "@/store/useDataStore";

interface SidebarIslandProps {
    selectedDate?: Date;
    onSelect?: (date: Date) => void;
}

/**
 * Smart Island der Seitenleiste (Desktop): dauerhaft der Mini-Kalender.
 */
export default function SidebarIsland({ selectedDate, onSelect }: SidebarIslandProps) {
    const { events: storeEvents } = useCalendarEvents();
    // Store-Einträge sind generisch (DataItem); MiniCalendar braucht nur Start und Farbe.
    const events = useMemo(
        () => storeEvents as unknown as { start: string; color?: string; allDay?: boolean }[],
        [storeEvents]
    );

    return (
        <div className="mt-auto flex-none rounded-[18px] bg-t2-surface p-3 shadow-[0_0_0_1px_var(--t2-line)]">
            <MiniCalendar selectedDate={selectedDate} onSelect={onSelect} events={events} />
        </div>
    );
}
