
"use client";

import React from "react";
import EventPreview from "./EventPreview";

interface DecryptedFile {
    id: string;
    title: string;
    type: string;
    color?: string;
    parent_id?: string | null;
}

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    description?: string;
    color?: string;
    share_status?: string;
}

interface EventDockProps {
    activeEventId: string | null;
    pinnedEventIds: string[];
    minimizedEventIds: string[];
    events: CalendarEvent[];
    themes: DecryptedFile[];
    files: DecryptedFile[]; // To lookup parent_id/theme
    onClose: (id: string) => void;
    onMinimize: (id: string) => void;
    onMaximize: (id: string) => void;
    onPin: (id: string) => void;
    onSave: (id: string, updates: Partial<CalendarEvent> & { parent_id?: string | null }) => Promise<void>;
    onLinkClick: (target: { id: string, type: string, title?: string }) => void;
}

export default function EventDock({
    activeEventId,
    pinnedEventIds,
    minimizedEventIds,
    events,
    themes,
    files,
    onClose,
    onMinimize,
    onMaximize,
    onPin,
    onSave,
    onLinkClick
}: EventDockProps) {
    // Combine pinned and active events to determine what to show
    // We want to show all pinned events, plus the active event if it's not already pinned

    const visibleEventIds = [...pinnedEventIds];
    if (activeEventId && !pinnedEventIds.includes(activeEventId)) {
        visibleEventIds.push(activeEventId);
    }

    if (visibleEventIds.length === 0) return null;

    return (
        <div className={`fixed bottom-0 left-0 right-0 z-[50] flex items-end justify-center gap-4 px-4 pointer-events-none transition-transform duration-300 ease-out transform ${visibleEventIds.length > 0 ? 'translate-y-0' : 'translate-y-full'}`}>
            {visibleEventIds.map(id => {
                const event = events.find(e => e.id === id);
                if (!event) return null;

                // Lookup theme
                const file = files.find(f => f.id === id);
                const currentThemeId = file?.parent_id || null;

                return (
                    <div key={id} className={`pointer-events-auto transition-all duration-300 ease-out origin-bottom animate-fly-in ${id === activeEventId ? 'scale-[1.02] z-[55]' : 'scale-95 opacity-80 hover:opacity-100'}`}>
                        <EventPreview
                            event={event}
                            themes={themes}
                            currentThemeId={currentThemeId}
                            isPinned={pinnedEventIds.includes(id)}
                            isMinimized={minimizedEventIds.includes(id)}
                            onClose={() => onClose(id)}
                            onMinimize={() => onMinimize(id)}
                            onMaximize={() => onMaximize(id)}
                            onPin={() => onPin(id)}
                            onSave={onSave}
                            onLinkClick={onLinkClick}
                        />
                    </div>
                );
            })}
        </div>
    );
}
