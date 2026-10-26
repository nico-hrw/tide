import type React from "react";
import type { ScheduleEventData } from "./ScheduleModal";

export interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    description?: string;
    parent_id?: string | null;
    groupIds?: string[];
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

export interface CalendarViewProps {
    events: CalendarEvent[];
    onEventCreate: (start: Date, end: Date, isAllDay?: boolean, extraMeta?: any) => Promise<string | null>;
    onEventUpdate: (id: string, start: Date, end: Date) => Promise<void>;
    onEventRename: (id: string, title: string) => Promise<void>;
    onEventDelete?: (id: string) => Promise<void>;
    onEventSave?: (id: string, updates: Partial<CalendarEvent> & { parent_id?: string | null; is_task?: boolean; is_completed?: boolean }) => void;
    onEventClick?: (id: string, rect?: DOMRect) => void;
    onEventShare?: (e: React.MouseEvent, id: string) => void;
    editingEventId?: string | null;
    date: Date; // Initial View Date
    onDateChange: (date: Date) => void;
    themes?: { id: string; title: string; effect?: string; color?: string }[];
    onScheduleApply?: (events: ScheduleEventData[], theme: string, options?: { color?: string, effect?: string }) => Promise<void>;
    onCreateEventGroup?: (title: string, color?: string, effect?: string) => Promise<string | undefined>;
    enabledExtensions?: string[];
    onOpenScheduleThemes?: () => void;
}

/** Drag state for moving an existing event (mouse or touch). */
export interface DragState {
    startY: number;
    startX: number;
    originalTop: number;
    currentTop: number;
    currentLeft: number;
    originalDayIndex: number;
    initialX: number;
    initialWidth: number;
    initialScrollTop: number;
    grabOffsetY?: number;
    grabOffsetX?: number;
}

export interface TouchDragState {
    id: string;
    state: DragState;
}

/** Mouse-down on an event that has not yet crossed the >3px drag threshold. */
export interface PendingDrag {
    id: string;
    startX: number;
    startY: number;
    startMinutes: number;
    initialX: number;
    initialWidth: number;
    initialScrollTop: number;
    grabOffsetY?: number;
    grabOffsetX?: number;
}

export interface CreationDrag {
    startDay: Date;
    startY: number;
    currentY: number;
    startX: number;
    currentX: number;
}

export interface ResizeDragState {
    startY: number;
    originalTop: number;
    originalHeight: number;
    currentHeight: number;
    initialScrollTop: number;
}

export interface ActivePopover {
    id: string;
    rect: DOMRect;
}
