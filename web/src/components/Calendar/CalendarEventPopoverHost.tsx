import React from "react";
import { format } from "date-fns";
import EventPopover from "./EventPopover";
import type { ActivePopover, CalendarEvent, CalendarViewProps } from "./types";

interface CalendarEventPopoverHostProps {
    activePopover: ActivePopover;
    events: CalendarEvent[];
    themes?: CalendarViewProps["themes"];
    onEventSave: CalendarViewProps["onEventSave"];
    onEventDelete: CalendarViewProps["onEventDelete"];
    onClose: () => void;
    enabledExtensions: string[];
}

/** Global floating event popover; resolves recurring occurrences from the master event. */
export function CalendarEventPopoverHost({
    activePopover,
    events,
    themes,
    onEventSave,
    onEventDelete,
    onClose,
    enabledExtensions,
}: CalendarEventPopoverHostProps) {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return null;

                    let event: CalendarEvent | undefined;

                    if (activePopover.id.includes('_')) {
                        const lastUnderscore = activePopover.id.lastIndexOf('_');
                        const baseId = activePopover.id.substring(0, lastUnderscore);
                        const timestamp = parseInt(activePopover.id.substring(lastUnderscore + 1), 10);
                        const masterEvent = events.find(e => e.id === baseId) || events.find(e => e.id === activePopover.id.split('_')[0]);
                        if (!masterEvent) return null;

                        const occDateKey = format(new Date(timestamp), "yyyy-MM-dd");
                        const isCancelled = (Array.isArray((masterEvent as any)?.exdates) && (masterEvent as any).exdates.includes(occDateKey)) || !!(masterEvent as any)?.is_cancelled;
                        const isCompleted = (Array.isArray((masterEvent as any)?.completed_dates) && (masterEvent as any).completed_dates.includes(occDateKey)) || !!(masterEvent as any)?.is_completed;
                        const duration = new Date(masterEvent.end).getTime() - new Date(masterEvent.start).getTime();
                        const occStart = new Date(timestamp);
                        const occEnd = new Date(timestamp + duration);

                        event = {
                            ...masterEvent,
                            id: activePopover.id,
                            start: occStart.toISOString(),
                            end: occEnd.toISOString(),
                            is_cancelled: isCancelled,
                            is_completed: isCompleted,
                        };
                    } else {
                        const rawEvent = events.find(e => e.id === activePopover.id);
                        if (!rawEvent) return null;
                        const occDateKey = format(new Date(rawEvent.start), "yyyy-MM-dd");
                        const isCancelled = (Array.isArray((rawEvent as any)?.exdates) && (rawEvent as any).exdates.includes(occDateKey)) || !!(rawEvent as any)?.is_cancelled;
                        const isCompleted = (Array.isArray((rawEvent as any)?.completed_dates) && (rawEvent as any).completed_dates.includes(occDateKey)) || !!(rawEvent as any)?.is_completed;
                        event = {
                            ...rawEvent,
                            is_cancelled: isCancelled,
                            is_completed: isCompleted,
                        };
                    }

                    if (!event) return null;
    return (
        <EventPopover
            event={event as any}
            rect={activePopover.rect}
            themes={themes || []}
            onEventSave={onEventSave || (() => { })}
            onEventDelete={onEventDelete}
            onClose={onClose}
            enabledExtensions={enabledExtensions}
        />
    );
}
