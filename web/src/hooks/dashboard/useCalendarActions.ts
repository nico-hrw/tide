"use client";

import { useCallback, type MutableRefObject } from "react";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import * as cryptoLib from "@/lib/crypto";
import { apiFetch } from "@/lib/api";
import { useDataStore, type DataItem, type TaskItem } from "@/store/useDataStore";
import type { ScheduleEventData } from "@/components/Calendar/ScheduleModal";
import {
    changesOccurrenceTime, isRecurringEvent, occurrenceKey, occurrenceTimestamp, shiftSeriesForMove, type RecurrenceScope,
} from "@/lib/recurrence";
import { askRecurrenceScope } from "@/lib/recurrenceScopePrompt";
import { buildSecuredEventMeta } from "@/lib/securedEventMeta";

export interface CalendarEventExtraMeta {
    title?: string;
    description?: string;
    color?: string;
    effect?: string;
    parent_id?: string | null;
    groupIds?: string[];
    is_task?: boolean;
    is_completed?: boolean;
    is_cancelled?: boolean;
    isAllDay?: boolean;
    isGroup?: boolean;
    is_important?: boolean;
    linkedTaskId?: string;
    recurrence?: "none" | "daily" | "weekly" | "monthly" | "yearly";
    recurrence_rule?: string;
    recurrence_end?: string;
    shading?: number;
    tags?: string[];
    [key: string]: unknown;
}

export interface CalendarEventUpdates extends Partial<CalendarEventExtraMeta> {
    start?: string;
    end?: string;
    allDay?: boolean;
    exdates?: string[];
    removed_dates?: string[];
    completed_dates?: string[];
}

export interface UseCalendarActionsOptions {
    publicKey: CryptoKey | null;
    privateKey: CryptoKey | null;
    myId: string;
    events?: DataItem[];
    setEvents?: (events: DataItem[]) => void;
    setActiveEventId?: (id: string | null) => void;
    scheduleInitialStart?: Date | null;
    syncingTaskIdsRef?: MutableRefObject<Set<string>>;
    updateTask?: (id: string, updates: Partial<TaskItem>) => Promise<void>;
    handleCreateEventGroup?: (forcedTitle?: string, forcedColor?: string, forcedEffect?: string) => Promise<string | undefined>;
}

export interface UseCalendarActionsReturn {
    handleEventCreate: (start: Date, end: Date, isAllDay?: boolean, extraMeta?: CalendarEventExtraMeta) => Promise<string | null>;
    handleScheduleApply: (schedEvents: ScheduleEventData[], themeIdOrName: string, options?: { color?: string; effect?: string }) => Promise<void>;
    handleEventUpdate: (id: string, start: Date, end: Date) => Promise<void>;
    handleEventRename: (id: string, newTitle: string) => Promise<void>;
    /** `strict`: Fehler werden geworfen statt verschluckt (Standard: unveraendert, still). */
    handleEventSave: (id: string, updates: CalendarEventUpdates, options?: { strict?: boolean; scope?: RecurrenceScope }) => Promise<void>;
    handleDeleteEvent: (id: string) => Promise<void>;
}

type CalendarEventRecord = DataItem & CalendarEventUpdates & {
    metadata?: Record<string, unknown>;
    version?: number;
};

interface WindowWithTideSave {
    __tideSaveTimestamp?: () => void;
}

const FALLBACK_META_KEYS = [
    "title", "description", "allDay", "isGroup", "effect", "is_cancelled", "exdates", "removed_dates",
    "is_completed", "completed_dates", "is_task", "shading", "linkedTaskId", "tags", "is_important", "groupIds",
] as const;

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

function toggleDateInList(dates: string[] | undefined, dateKey: string, include: boolean): string[] {
    const list = [...(dates || [])];
    if (include) {
        if (!list.includes(dateKey)) list.push(dateKey);
        return list;
    }
    return list.filter((d) => d !== dateKey);
}

function buildEventMeta(event: CalendarEventRecord, updates: CalendarEventUpdates): Record<string, unknown> {
    const meta: Record<string, unknown> = {
        start: updates.start || event.start,
        end: updates.end || event.end,
        color: updates.color || event.color,
    };
    for (const key of FALLBACK_META_KEYS) {
        meta[key] = updates[key] !== undefined ? updates[key] : event[key];
    }
    if (updates.recurrence_rule !== undefined) meta.recurrence_rule = updates.recurrence_rule;
    else if (event.recurrence_rule) meta.recurrence_rule = event.recurrence_rule;
    if (updates.recurrence_end !== undefined) meta.recurrence_end = updates.recurrence_end;
    else if (event.recurrence_end) meta.recurrence_end = event.recurrence_end;
    return meta;
}

function syncVersionInStore(baseId: string, version: number): void {
    useDataStore.setState((s) => ({
        events: s.events.map((e) => (e.id === baseId ? { ...e, version } : e)),
        notes: s.notes.map((n) => (n.id === baseId ? { ...n, version } : n)),
    }));
}

async function putEventWithConflictRetry(baseId: string, event: CalendarEventRecord, body: Record<string, unknown>, strict = false): Promise<void> {
    const res = await apiFetch(`/api/v1/files/${baseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (res.status === 409) {
        try {
            const conflictData = (await res.json()) as { current_version?: number };
            if (typeof conflictData?.current_version === "number") {
                event.version = conflictData.current_version;
                syncVersionInStore(baseId, conflictData.current_version);
                body.version = conflictData.current_version;
                const retryRes = await apiFetch(`/api/v1/files/${baseId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                if (strict && !retryRes.ok) throw new Error(`Event save failed (${retryRes.status})`);
                if (retryRes.ok) {
                    const retryData = (await retryRes.json().catch(() => null)) as { version?: number } | null;
                    if (typeof retryData?.version === "number") {
                        event.version = retryData.version;
                        syncVersionInStore(baseId, retryData.version);
                    }
                }
            } else if (strict) {
                throw new Error("Event save conflict without current version");
            }
        } catch (e) {
            if (strict) throw e;
            /* Silently ignore conflict resolution errors */
        }
    } else if (strict && !res.ok) {
        throw new Error(`Event save failed (${res.status})`);
    } else if (res.ok) {
        const data = (await res.json().catch(() => null)) as { version?: number } | null;
        if (typeof data?.version === "number") {
            event.version = data.version;
            syncVersionInStore(baseId, data.version);
        }
    }
}

/**
 * Provides CRUD and scheduling handlers for calendar events, including E2EE metadata encryption,
 * optimistic Zustand updates, recurring-occurrence tracking, and linked-task synchronization.
 */
export function useCalendarActions({
    publicKey, privateKey, myId, events, setEvents, setActiveEventId,
    scheduleInitialStart, syncingTaskIdsRef, updateTask, handleCreateEventGroup,
}: UseCalendarActionsOptions): UseCalendarActionsReturn {
    const handleEventCreate = useCallback(
        async (start: Date, end: Date, isAllDay: boolean = false, extraMeta: CalendarEventExtraMeta = {}): Promise<string | null> => {
            if (!privateKey || !publicKey) return null;
            const linkedTaskId = extraMeta.linkedTaskId;
            if (linkedTaskId) syncingTaskIdsRef?.current.add(linkedTaskId);

            const title = extraMeta.title || "New Event";
            try {
                const meta: Record<string, unknown> = { ...extraMeta, title, start: start.toISOString(), end: end.toISOString(), allDay: isAllDay };
                // RSA-OAEP only fits ~190 bytes: keep secured_meta small, the rest goes to `metadata` / the AES blob.
                const securedMeta = await cryptoLib.encryptMetadata(buildSecuredEventMeta({ title, start: meta.start as string, end: meta.end as string, allDay: isAllDay }), publicKey);
                const bodyPayload: Record<string, unknown> = { type: "event", parent_id: null, public_meta: {} };

                try {
                    const { encryptFileV2 } = await import("@/lib/cryptoV2");
                    const v2Result = await encryptFileV2(JSON.stringify({ title, description: extraMeta.description || "" }), publicKey);
                    bodyPayload.version = 2;
                    bodyPayload.metadata = { ...v2Result.metadata, ...meta };
                    bodyPayload.access_keys = { [myId]: v2Result.encrypted_dek };
                    bodyPayload.content_ciphertext = v2Result.content_ciphertext;
                    bodyPayload.secured_meta = securedMeta;
                } catch (e) {
                    console.error("V2 encryption failed for create", e);
                    bodyPayload.secured_meta = securedMeta;
                }

                const res = await apiFetch("/api/v1/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyPayload) });
                if (res.ok) {
                    const newFile = (await res.json().catch(() => null)) as { id?: string } | null;
                    if (newFile?.id) {
                        const storeState = useDataStore.getState();
                        const applySetEvents = setEvents ?? storeState.setEvents;
                        const createdEvent: DataItem = {
                            ...extraMeta, id: newFile.id, type: "event", title,
                            start: meta.start as string, end: meta.end as string, allDay: isAllDay,
                            is_task: extraMeta.is_task, linkedTaskId: extraMeta.linkedTaskId,
                        };
                        applySetEvents([...storeState.events, createdEvent]);
                        setActiveEventId?.(newFile.id);
                        return newFile.id;
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                if (linkedTaskId) setTimeout(() => syncingTaskIdsRef?.current.delete(linkedTaskId), 500);
            }
            return null;
        },
        [privateKey, publicKey, myId, syncingTaskIdsRef, setEvents, setActiveEventId]
    );

    const handleScheduleApply = useCallback(
        async (schedEvents: ScheduleEventData[], themeIdOrName: string, options?: { color?: string; effect?: string }): Promise<void> => {
            let targetThemeId = themeIdOrName;
            if (options && handleCreateEventGroup) {
                targetThemeId = (await handleCreateEventGroup(themeIdOrName, options.color, options.effect)) || "none";
            }
            for (const ev of schedEvents) {
                const baseDate = ev.dateOverride ? new Date(ev.dateOverride) : scheduleInitialStart || new Date();
                const [hStart, mStart] = ev.startTime.split(":").map(Number);
                const [hEnd, mEnd] = ev.endTime.split(":").map(Number);
                const start = new Date(baseDate);
                start.setHours(hStart || 9, mStart || 0, 0, 0);
                const end = new Date(baseDate);
                end.setHours(hEnd || 10, mEnd || 0, 0, 0);

                await handleEventCreate(start, end, ev.allDay, {
                    title: ev.title || "New Event",
                    description: ev.description,
                    parent_id: targetThemeId === "none" ? null : targetThemeId,
                    recurrence_rule: ev.recurrence !== "none" ? `FREQ=${ev.recurrence.toUpperCase()};INTERVAL=1` : undefined,
                    recurrence_end: ev.recurrenceEnd ? new Date(ev.recurrenceEnd).toISOString() : undefined,
                });
            }
        },
        [handleCreateEventGroup, scheduleInitialStart, handleEventCreate]
    );

    const handleEventRename = useCallback(
        async (id: string, newTitle: string): Promise<void> => {
            if (!privateKey || !publicKey) return;
            try {
                const storeState = useDataStore.getState();
                (setEvents ?? storeState.setEvents)(storeState.events.map((e) => (e.id === id ? { ...e, title: newTitle } : e)));
                storeState.updateSpecificMetadataCache(id, { title: newTitle });

                const event = ((events ?? storeState.events).find((e) => e.id === id) ?? storeState.events.find((e) => e.id === id)) as CalendarEventRecord | undefined;
                if (!event) return;

                const meta: Record<string, unknown> = {
                    title: newTitle, start: event.start, end: event.end, color: event.color,
                    description: event.description, allDay: event.allDay, isGroup: event.isGroup,
                    effect: event.effect, recurrence_rule: event.recurrence_rule,
                    recurrence_end: event.recurrence_end, tags: event.tags, is_important: event.is_important,
                };
                const securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);
                await apiFetch(`/api/v1/files/${id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ secured_meta: securedMeta, metadata: { ...(event.metadata || {}), title: newTitle } }),
                });
            } catch (e) {
                console.error(e);
            }
        },
        [privateKey, publicKey, events, setEvents]
    );

    const handleEventSave = useCallback(
        async (id: string, updates: CalendarEventUpdates, options?: { strict?: boolean; scope?: RecurrenceScope }): Promise<void> => {
            const strict = options?.strict === true;
            if (!privateKey || !publicKey) {
                if (strict) throw new Error("Event save failed: keys unavailable");
                return;
            }
            try {
                const isOccurrence = id.includes("_");
                const baseId = isOccurrence ? id.split("_")[0] : id;
                const storeState = useDataStore.getState();
                const currentEvents = storeState.events;
                const event = currentEvents.find((e) => e.id === baseId) as CalendarEventRecord | undefined;
                if (!event) {
                    if (strict) throw new Error(`Event save failed: event ${baseId} not found`);
                    return;
                }

                let occurrenceDateKey: string | null = null;
                if (isOccurrence) {
                    const timestamp = parseInt(id.split("_")[1], 10);
                    if (!isNaN(timestamp)) occurrenceDateKey = format(new Date(timestamp), "yyyy-MM-dd");
                } else if (event.recurrence_rule && event.recurrence_rule !== "none") {
                    occurrenceDateKey = format(new Date(event.start || Date.now()), "yyyy-MM-dd");
                }

                let effectiveUpdates = updates;

                // Moving one occurrence of a recurring event: ask whether only it or the whole series moves.
                if (isRecurringEvent(event) && (updates.start !== undefined || updates.end !== undefined)) {
                    const masterStart = new Date(event.start || Date.now());
                    const duration = new Date(event.end || event.start || Date.now()).getTime() - masterStart.getTime();
                    const ts = occurrenceTimestamp(id);
                    const occStart = ts !== null ? new Date(ts) : masterStart;
                    const occEnd = new Date(occStart.getTime() + duration);
                    if (changesOccurrenceTime({ start: occStart.toISOString(), end: occEnd.toISOString() }, updates)) {
                        const scope = options?.scope ?? (await askRecurrenceScope("move", event.title || ""));
                        if (scope === null) return; // cancelled: nothing changes
                        const newStart = new Date(updates.start ?? occStart.toISOString());
                        const newEnd = new Date(updates.end ?? new Date(newStart.getTime() + duration).toISOString());
                        if (scope === "all") {
                            const shifted = shiftSeriesForMove({ start: event.start || masterStart.toISOString() }, occStart, newStart, newEnd);
                            const dayShift = differenceInCalendarDays(newStart, occStart);
                            const shiftKeys = (keys?: string[]) =>
                                keys && dayShift !== 0 ? keys.map((k) => format(addDays(new Date(`${k}T12:00:00`), dayShift), "yyyy-MM-dd")) : undefined;
                            effectiveUpdates = {
                                ...updates, ...shifted,
                                ...(shiftKeys(event.exdates) ? { exdates: shiftKeys(event.exdates) } : {}),
                                ...(shiftKeys(event.completed_dates) ? { completed_dates: shiftKeys(event.completed_dates) } : {}),
                            };
                            if (event.recurrence_end && updates.recurrence_end === undefined) {
                                effectiveUpdates.recurrence_end = new Date(
                                    new Date(event.recurrence_end).getTime() + (newStart.getTime() - occStart.getTime())
                                ).toISOString();
                            }
                        } else {
                            // Only this occurrence: it becomes its own event, and the series skips that date.
                            const { start: _s, end: _e, recurrence_rule: _r, recurrence_end: _re, recurrence: _rc, exdates: _x, removed_dates: _rd, completed_dates: _c, is_cancelled: _ic, ...rest } = updates;
                            void [_s, _e, _r, _re, _rc, _x, _rd, _c, _ic];
                            const createdId = await handleEventCreate(newStart, newEnd, !!(updates.allDay ?? event.allDay), {
                                title: event.title, description: event.description, color: event.color, effect: event.effect,
                                groupIds: event.groupIds, parent_id: event.parent_id ?? null, is_important: event.is_important, tags: event.tags,
                                ...rest,
                            });
                            if (!createdId) throw new Error("Could not create the moved occurrence");
                            effectiveUpdates = { removed_dates: toggleDateInList(event.removed_dates, occurrenceKey(occStart), true) };
                        }
                    }
                }

                if (occurrenceDateKey !== null) {
                    if (effectiveUpdates.is_cancelled !== undefined) {
                        effectiveUpdates = {
                            ...effectiveUpdates,
                            exdates: toggleDateInList(event.exdates, occurrenceDateKey, effectiveUpdates.is_cancelled),
                            is_cancelled: event.is_cancelled || false,
                        };
                    }
                    if (effectiveUpdates.is_completed !== undefined) {
                        effectiveUpdates = {
                            ...effectiveUpdates,
                            completed_dates: toggleDateInList(event.completed_dates, occurrenceDateKey, effectiveUpdates.is_completed),
                            is_completed: event.is_completed || false,
                        };
                    }
                }

                const meta = buildEventMeta(event, effectiveUpdates);
                (setEvents ?? storeState.setEvents)(
                    currentEvents.map((e) => {
                        if (e.id !== baseId) return e;
                        const evt: CalendarEventRecord = { ...e, ...meta };
                        if (effectiveUpdates.is_task !== undefined) evt.is_task = effectiveUpdates.is_task;
                        if (effectiveUpdates.is_completed !== undefined) evt.is_completed = effectiveUpdates.is_completed;
                        if (effectiveUpdates.groupIds !== undefined) {
                            evt.groupIds = effectiveUpdates.groupIds;
                            evt.parent_id = effectiveUpdates.groupIds.length > 0 ? effectiveUpdates.groupIds[0] : null;
                        } else if (effectiveUpdates.parent_id !== undefined) {
                            evt.parent_id = effectiveUpdates.parent_id;
                        }
                        return evt;
                    })
                );
                storeState.updateSpecificMetadataCache(baseId, meta);

                const targetLinkedTaskId = meta.linkedTaskId as string | undefined;
                if (targetLinkedTaskId) {
                    const linkedTask = storeState.tasks.find((t) => t.id === targetLinkedTaskId);
                    if (linkedTask) {
                        const taskUpdates: Partial<TaskItem> = {};
                        if (effectiveUpdates.start !== undefined && !isSameTime(linkedTask.dueDate, effectiveUpdates.start)) {
                            const newDueDate = (effectiveUpdates.isAllDay || event.isAllDay)
                                ? format(new Date(effectiveUpdates.start || event.start || ""), "yyyy-MM-dd")
                                : (effectiveUpdates.start || event.start);
                            taskUpdates.dueDate = newDueDate;
                            taskUpdates.scheduledDate = newDueDate;
                        }
                        if (effectiveUpdates.is_completed !== undefined && linkedTask.isCompleted !== effectiveUpdates.is_completed) {
                            taskUpdates.isCompleted = effectiveUpdates.is_completed;
                        }
                        if (Object.keys(taskUpdates).length > 0 && !syncingTaskIdsRef?.current.has(targetLinkedTaskId)) {
                            void (updateTask ?? storeState.updateTask)(targetLinkedTaskId, taskUpdates);
                        }
                    }
                }

                if (effectiveUpdates.groupIds !== undefined || effectiveUpdates.parent_id !== undefined) {
                    const nextParentId = effectiveUpdates.groupIds !== undefined
                        ? (effectiveUpdates.groupIds.length > 0 ? effectiveUpdates.groupIds[0] : null)
                        : effectiveUpdates.parent_id;
                    const currentFiles = useDataStore.getState().notes;
                    useDataStore.getState().setNotes(currentFiles.map((n) => (n.id === baseId ? { ...n, parent_id: nextParentId } : n)));
                }

                // Only encrypt title in secured_meta (RSA-OAEP ~446B limit); full metadata goes into V2 AES body.
                const securedMeta = await cryptoLib.encryptMetadata({ title: meta.title }, publicKey);
                const body: Record<string, unknown> = { secured_meta: securedMeta };

                try {
                    const { encryptFileV2 } = await import("@/lib/cryptoV2");
                    const v2Result = await encryptFileV2(
                        JSON.stringify({ title: meta.title, description: (meta.description as string | undefined) || "" }),
                        publicKey
                    );
                    const freshState = useDataStore.getState();
                    const freshItem = (freshState.events.find((e) => e.id === baseId) || freshState.notes.find((n) => n.id === baseId) || event) as CalendarEventRecord;
                    if (typeof freshItem?.version === "number") body.version = freshItem.version;
                    body.metadata = { ...v2Result.metadata, ...meta };
                    body.access_keys = { [sessionStorage.getItem("tide_user_id") || ""]: v2Result.encrypted_dek };
                    body.content_ciphertext = v2Result.content_ciphertext;
                } catch (e) {
                    console.error("V2 encryption failed for save", e);
                    body.metadata = meta;
                }

                if (effectiveUpdates.groupIds !== undefined) {
                    event.groupIds = effectiveUpdates.groupIds;
                    const primaryId = effectiveUpdates.groupIds.length > 0 ? effectiveUpdates.groupIds[0] : null;
                    event.parent_id = primaryId;
                    body.parent_id = primaryId === null ? "__none__" : primaryId;
                    meta.groupIds = effectiveUpdates.groupIds;
                } else if (effectiveUpdates.parent_id !== undefined) {
                    body.parent_id = effectiveUpdates.parent_id === null ? "__none__" : effectiveUpdates.parent_id;
                }

                if (effectiveUpdates.is_task !== undefined) body.is_task = effectiveUpdates.is_task;
                if (effectiveUpdates.is_completed !== undefined) body.is_completed = effectiveUpdates.is_completed;
                if (effectiveUpdates.exdates !== undefined) body.exdates = effectiveUpdates.exdates;
                if (effectiveUpdates.completed_dates !== undefined) body.completed_dates = effectiveUpdates.completed_dates;

                const freshBeforeSend = useDataStore.getState();
                const freshItemBeforeSend = (freshBeforeSend.events.find((e) => e.id === baseId) || freshBeforeSend.notes.find((n) => n.id === baseId) || event) as CalendarEventRecord;
                if (typeof freshItemBeforeSend?.version === "number") body.version = freshItemBeforeSend.version;

                await putEventWithConflictRetry(baseId, event, body, strict);
                (window as unknown as WindowWithTideSave).__tideSaveTimestamp?.();
            } catch (e) {
                console.error(e);
                if (strict) throw e;
            }
        },
        [privateKey, publicKey, setEvents, syncingTaskIdsRef, updateTask, handleEventCreate]
    );

    const handleEventUpdate = useCallback(
        async (id: string, start: Date, end: Date): Promise<void> => {
            // Keep the occurrence id: `handleEventSave` needs it to know which repetition was moved.
            await handleEventSave(id, { start: start.toISOString(), end: end.toISOString() });
        },
        [handleEventSave]
    );

    const handleDeleteEvent = useCallback(
        async (id: string): Promise<void> => {
            if (!myId) return;
            const baseId = id.includes("_") ? id.split("_")[0] : id;
            const seriesEvt = useDataStore.getState().events.find((e) => e.id === baseId) as CalendarEventRecord | undefined;
            let targetId = id;
            if (seriesEvt && isRecurringEvent(seriesEvt)) {
                // Deleting a repeating event: only this occurrence (it disappears, unlike "absagen") or the whole series.
                const scope = await askRecurrenceScope("delete", seriesEvt.title || "");
                if (scope === null) return;
                if (scope === "this") {
                    const ts = occurrenceTimestamp(id);
                    const key = occurrenceKey(ts !== null ? ts : (seriesEvt.start || Date.now()));
                    await handleEventSave(id, { removed_dates: toggleDateInList(seriesEvt.removed_dates, key, true) });
                    return;
                }
                targetId = baseId; // the whole series; the dialog already was the confirmation
            } else if (!confirm("Are you sure you want to delete this event?")) return;
            try {
                const storeState = useDataStore.getState();
                const currentEvents = storeState.events;
                const targetEvt = currentEvents.find((e) => e.id === targetId) as CalendarEventRecord | undefined;
                if (targetEvt?.linkedTaskId) {
                    const remainingLinkedEvents = currentEvents.filter(
                        (e) => e.id !== targetId && (e as CalendarEventRecord).linkedTaskId === targetEvt.linkedTaskId
                    );
                    if (remainingLinkedEvents.length === 0) {
                        void (updateTask ?? storeState.updateTask)(targetEvt.linkedTaskId, { dueDate: undefined, scheduledDate: undefined });
                    }
                }
                const res = await apiFetch(`/api/v1/files/${targetId}`, { method: "DELETE" });
                if (res.ok) {
                    const latestState = useDataStore.getState();
                    (setEvents ?? latestState.setEvents)(latestState.events.filter((e) => e.id !== targetId));
                }
            } catch (e) {
                console.error(e);
            }
        },
        [myId, handleEventSave, updateTask, setEvents]
    );

    return { handleEventCreate, handleScheduleApply, handleEventUpdate, handleEventRename, handleEventSave, handleDeleteEvent };
}
