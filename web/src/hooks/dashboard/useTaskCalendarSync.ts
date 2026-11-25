"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { format } from "date-fns";
import { apiFetch } from "@/lib/api";
import { getFolderColor, isTaskVisibleInCalendar, loadTodoFoldersMeta } from "@/lib/folderColors";
import { useDataStore, type DataItem, type TaskItem } from "@/store/useDataStore";
import { eventContentSignature, isNoneLikeRecurrenceRule, normalizeRecurrenceRule } from "@/lib/eventWriteGuard";
import type { CalendarEventExtraMeta, CalendarEventUpdates } from "./useCalendarActions";

interface LinkedCalendarEvent extends DataItem {
    start?: string;
    end?: string;
    allDay?: boolean;
    isAllDay?: boolean;
    is_completed?: boolean;
    completed_dates?: string[];
    linkedTaskId?: string;
    recurrence_rule?: string;
    recurrence_end?: string;
}

/**
 * Completion as the calendar shows it: the flag, or the entry's own date in completed_dates
 * (repeating entries store the tick there, and so did older "NONE" entries).
 */
export function isLinkedEventCompleted(event: { start?: string; is_completed?: boolean; completed_dates?: string[] }): boolean {
    if (event.is_completed) return true;
    if (!event.start || !Array.isArray(event.completed_dates)) return false;
    const start = new Date(event.start);
    return !isNaN(start.getTime()) && event.completed_dates.includes(format(start, "yyyy-MM-dd"));
}

/**
 * Whether the entry's completion disagrees with the todo. A done todo accepts the calendar's own notion of
 * "done"; an open todo only clears the flag (a ticked occurrence in completed_dates stays the user's choice).
 */
export function isLinkedCompletionDiff(event: { start?: string; is_completed?: boolean; completed_dates?: string[] }, taskCompleted?: boolean): boolean {
    return taskCompleted ? !isLinkedEventCompleted(event) : Boolean(event.is_completed);
}

/** Whether the entry's repetition differs from the todo's (or still carries a stored "NONE" to clean up). */
export function isLinkedRecurrenceDiff(eventRule?: string, taskRule?: string): boolean {
    if (normalizeRecurrenceRule(eventRule) !== normalizeRecurrenceRule(taskRule)) return true;
    return isNoneLikeRecurrenceRule(eventRule) && !isNoneLikeRecurrenceRule(taskRule);
}

interface EventTaskToggleDetail {
    id?: string;
    is_completed?: boolean;
}

export interface UseTaskCalendarSyncOptions {
    tasks: TaskItem[];
    events: DataItem[];
    privateKey: CryptoKey | null;
    publicKey: CryptoKey | null;
    loadedDirectories: Set<string>;
    syncingTaskIdsRef: MutableRefObject<Set<string>>;
    handleEventCreate: (
        start: Date,
        end: Date,
        isAllDay?: boolean,
        extraMeta?: CalendarEventExtraMeta
    ) => Promise<string | null>;
    handleEventSave: (id: string, updates: CalendarEventUpdates) => Promise<void>;
}

function useLatestRef<T>(value: T) {
    const ref = useRef<T>(value);
    ref.current = value;
    return ref;
}

const isSameTime = (d1?: string, d2?: string): boolean => {
    if (!d1 && !d2) return true;
    if (!d1 || !d2) return false;
    const isD1DateOnly = /^\d{4}-\d{2}-\d{2}$/.test(d1.trim());
    const isD2DateOnly = /^\d{4}-\d{2}-\d{2}$/.test(d2.trim());
    if (isD1DateOnly || isD2DateOnly) {
        const k1 = isD1DateOnly ? d1.trim() : format(new Date(d1), "yyyy-MM-dd");
        const k2 = isD2DateOnly ? d2.trim() : format(new Date(d2), "yyyy-MM-dd");
        return k1 === k2;
    }
    const t1 = new Date(d1).getTime();
    const t2 = new Date(d2).getTime();
    return !isNaN(t1) && !isNaN(t2) && Math.abs(t1 - t2) < 60000;
};

const hasExplicitTime = (dateStr?: string): boolean => {
    if (!dateStr) return false;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return false;
    if (dateStr.includes("T")) {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        // If minutes and hours in local time are 0:00, treat as all-day date
        return !(d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0);
    }
    return false;
};

/**
 * Synchronizes Todo tasks with linked calendar events and handles `event-task:toggle` window events.
 */
export function useTaskCalendarSync({
    tasks,
    events,
    privateKey,
    publicKey,
    loadedDirectories,
    syncingTaskIdsRef,
    handleEventCreate,
    handleEventSave,
}: UseTaskCalendarSyncOptions): void {
    const handleEventSaveRef = useLatestRef(handleEventSave);
    const handleEventCreateRef = useLatestRef(handleEventCreate);
    /** Entry id -> signature of the todo-derived content last sent for it (this session). */
    const attemptedRef = useRef(new Map<string, string>());

    useEffect(() => {
        const handleEventTaskToggle = (e: Event) => {
            const detail = (e as CustomEvent<EventTaskToggleDetail | undefined>).detail;
            if (detail?.id) {
                void handleEventSaveRef.current(detail.id, { is_completed: detail.is_completed });
            }
        };
        window.addEventListener("event-task:toggle", handleEventTaskToggle);
        return () => window.removeEventListener("event-task:toggle", handleEventTaskToggle);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally empty — ref always has the latest version

    useEffect(() => {
        if (!privateKey || !publicKey || !loadedDirectories.has("root") || !tasks || tasks.length === 0) {
            return;
        }

        const foldersMeta = loadTodoFoldersMeta();
        const tasksWithDueDate = tasks.filter((t) => t.dueDate && isTaskVisibleInCalendar(t, foldersMeta));
        const typedEvents = events as LinkedCalendarEvent[];

        // Remove calendar events whose linkedTaskId either does not exist in tasks at all (orphaned),
        // has no dueDate, or has showInCalendar explicitly disabled.
        const taskMap = new Map(tasks.map((t) => [t.id, t]));
        const eventsToRemove = typedEvents.filter((e) => {
            const linkedId = e.linkedTaskId;
            if (!linkedId) return false;
            const t = taskMap.get(linkedId);
            if (!t) return true; // orphaned task
            if (!t.dueDate) return true; // task has no dueDate
            if (!isTaskVisibleInCalendar(t, foldersMeta)) return true; // hidden
            return false;
        });

        if (eventsToRemove.length > 0) {
            const removeIds = new Set(eventsToRemove.map((e) => e.id));
            useDataStore.getState().setEvents(
                useDataStore.getState().events.filter((ev) => !removeIds.has(ev.id))
            );
            eventsToRemove.forEach(async (e) => {
                const linkedId = e.linkedTaskId;
                if (linkedId) syncingTaskIdsRef.current.add(linkedId);
                try {
                    await apiFetch(`/api/v1/files/${e.id}`, { method: "DELETE" });
                } catch (err) {
                    console.error("Failed to delete orphaned or hidden task event", err);
                } finally {
                    if (linkedId) {
                        setTimeout(() => {
                            syncingTaskIdsRef.current.delete(linkedId);
                        }, 500);
                    }
                }
            });
        }

        let cancelled = false;

        const syncTasks = async () => {
            for (const t of tasksWithDueDate) {
                if (cancelled) break;
                if (syncingTaskIdsRef.current.has(t.id)) continue;

                const currentEvents = useDataStore.getState().events as LinkedCalendarEvent[];
                const existingEvent =
                    currentEvents.find((e) => e.linkedTaskId === t.id) ||
                    typedEvents.find((e) => e.linkedTaskId === t.id);

                let start: Date;
                let end: Date;
                let isAllDay: boolean;

                if (!hasExplicitTime(t.dueDate)) {
                    const [y, m, d] = t.dueDate!.slice(0, 10).split("-").map(Number);
                    start = new Date(y, m - 1, d, 0, 0, 0);
                    end = new Date(y, m - 1, d, 23, 59, 59);
                    isAllDay = true;
                } else {
                    let dateStr = t.dueDate!;
                    if (dateStr.includes("T") && dateStr.split("T")[1].length === 5) {
                        dateStr += ":00";
                    }
                    start = new Date(dateStr);
                    if (isNaN(start.getTime())) {
                        start = new Date(t.dueDate!);
                    }
                    end = new Date(start.getTime() + 30 * 60 * 1000);
                    isAllDay = false;
                }

                if (isNaN(start.getTime())) continue;

                if (!existingEvent) {
                    syncingTaskIdsRef.current.add(t.id);
                    try {
                        await handleEventCreateRef.current(start, end, isAllDay, {
                            title: t.title,
                            is_task: true,
                            linkedTaskId: t.id,
                            color:
                                t.color ||
                                (t.folder && foldersMeta[t.folder]?.color
                                    ? getFolderColor(foldersMeta[t.folder]?.color).hex
                                    : undefined),
                            recurrence_rule: t.recurrence_rule,
                            recurrence_end: t.recurrence_end,
                            is_completed: t.isCompleted,
                            allDay: isAllDay,
                            isAllDay,
                        });
                    } finally {
                        setTimeout(() => {
                            syncingTaskIdsRef.current.delete(t.id);
                        }, 500);
                    }
                } else {
                    const isTitleDiff = existingEvent.title !== t.title;
                    const isStartDiff = isAllDay
                        ? !isSameTime(existingEvent.start, start.toISOString())
                        : !isSameTime(existingEvent.start, t.dueDate);
                    const isAllDayDiff = Boolean(existingEvent.allDay) !== isAllDay;
                    const isCompletedDiff = isLinkedCompletionDiff(existingEvent, t.isCompleted);
                    const isRecurrenceDiff = isLinkedRecurrenceDiff(existingEvent.recurrence_rule, t.recurrence_rule);

                    if (isTitleDiff || isStartDiff || isAllDayDiff || isCompletedDiff || isRecurrenceDiff) {
                        const updates: CalendarEventUpdates = {
                            title: t.title,
                            start: start.toISOString(),
                            end: end.toISOString(),
                            allDay: isAllDay,
                            isAllDay,
                            is_completed: t.isCompleted,
                            // "" (not undefined): a todo without repetition also clears the entry's rule.
                            recurrence_rule: t.recurrence_rule ?? "",
                            recurrence_end: t.recurrence_end,
                        };
                        // One attempt per todo state and entry: if the entry still differs afterwards (another
                        // client, another time zone, a rejected write), only a new todo state writes again.
                        const desired = eventContentSignature({ ...updates });
                        if (attemptedRef.current.get(existingEvent.id) === desired) continue;
                        attemptedRef.current.set(existingEvent.id, desired);
                        syncingTaskIdsRef.current.add(t.id);
                        try {
                            await handleEventSaveRef.current(existingEvent.id, updates);
                        } finally {
                            setTimeout(() => {
                                syncingTaskIdsRef.current.delete(t.id);
                            }, 500);
                        }
                    }
                }
            }
        };

        void syncTasks();

        return () => {
            cancelled = true;
        };
    }, [tasks, events, privateKey, publicKey, loadedDirectories, syncingTaskIdsRef, handleEventCreateRef, handleEventSaveRef]);
}
