"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as cryptoLib from "@/lib/crypto";
import { apiFetch } from "@/lib/api";
import { format } from "date-fns";
import CalendarView from "@/components/Calendar/CalendarView";
import "./calendar.css";

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    description?: string;
    color?: string;
    recurrence_rule?: string;
    exdates?: string[];
    completed_dates?: string[];
    is_task?: boolean;
    is_completed?: boolean;
    is_cancelled?: boolean;
    shading?: number;
    parent_id?: string | null;
}

interface DecryptedFile {
    id: string;
    title: string;
    type: string;
    color?: string;
}

export default function CalendarPage() {
    const router = useRouter();
    const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [folders, setFolders] = useState<DecryptedFile[]>([]);
    const [status, setStatus] = useState("loading");
    const [myId, setMyId] = useState("");
    const [editingEventId, setEditingEventId] = useState<string | null>(null);
    const [currentViewDate, setCurrentViewDate] = useState(new Date());

    // 1. Restore Session
    useEffect(() => {
        const restoreSession = async () => {
            try {
                const email = sessionStorage.getItem("tide_user_email");
                const keyJwkStr = sessionStorage.getItem("tide_session_key");

                if (!email || !keyJwkStr) {
                    router.push("/auth");
                    return;
                }

                const keyJwk = JSON.parse(keyJwkStr);
                const importedPrivateKey = await window.crypto.subtle.importKey(
                    "jwk", keyJwk,
                    { name: "RSA-OAEP", hash: "SHA-256" },
                    true, ["decrypt"]
                );
                setPrivateKey(importedPrivateKey);
                const storedId = sessionStorage.getItem("tide_user_id");
                if (storedId) setMyId(storedId);
                setStatus("ready");
            } catch (err) {
                console.error("Session restore failed:", err);
                router.push("/auth");
            }
        };
        restoreSession();
    }, [router]);

    const loadData = async () => {
        if (!privateKey) return;
        try {
            // Fetch Events AND Folders
            // We can fetch all files or make parallel requests. Parallel is cleaner.
            const urlEvents = myId ? `/api/v1/files?type=event&user_id=${myId}` : "/api/v1/files?type=event";
            const urlFolders = myId ? `/api/v1/files?type=folder&user_id=${myId}` : "/api/v1/files?type=folder";

            const [resEvents, resFolders] = await Promise.all([
                apiFetch(urlEvents),
                apiFetch(urlFolders)
            ]);

            if (!resEvents.ok || !resFolders.ok) throw new Error("Failed to fetch data");

            const eventFiles = await resEvents.json().catch(() => []);
            const folderFiles = await resFolders.json().catch(() => []);

            // Decrypt Events
            const decryptedEvents: CalendarEvent[] = [];
            for (const f of eventFiles) {
                try {
                    const meta = await cryptoLib.decryptMetadata(f.secured_meta, privateKey);
                    decryptedEvents.push({
                        id: f.id,
                        title: (meta.title as string) || "Untitled Event",
                        start: (meta.start as string),
                        end: (meta.end as string),
                        description: (meta.description as string),
                        color: (meta.color as string),
                        recurrence_rule: meta.recurrence_rule as string,
                        exdates: meta.exdates as string[],
                        completed_dates: meta.completed_dates as string[],
                        is_task: !!meta.is_task,
                        is_completed: !!meta.is_completed,
                        is_cancelled: !!meta.is_cancelled,
                        parent_id: f.parent_id
                    });
                } catch (e) {
                    console.error("Failed to decrypt event:", f.id);
                }
            }
            setEvents(decryptedEvents);

            // Decrypt Folders
            const decryptedFolders: DecryptedFile[] = [];
            for (const f of folderFiles) {
                try {
                    const meta = await cryptoLib.decryptMetadata(f.secured_meta, privateKey);
                    decryptedFolders.push({
                        id: f.id,
                        title: (meta.title as string) || "Untitled Folder",
                        type: "folder",
                        color: (meta.color as string)
                    });
                } catch (e) {
                    console.error("Failed to decrypt folder:", f.id);
                }
            }
            setFolders(decryptedFolders);


        } catch (err) {
            console.error(err);
        }
    };

    // 2. Load Events on Init
    useEffect(() => {
        loadData();
    }, [privateKey, myId]);

    // 3. Create Event
    const handleEventCreate = async (start: Date, end: Date) => {
        if (!privateKey) return;

        const title = "New Event";
        try {
            const publicKeyStr = sessionStorage.getItem("tide_user_public_key");
            if (!publicKeyStr) { alert("Public Key missing."); return; }
            const publicKey = await window.crypto.subtle.importKey(
                "spki", cryptoLib.base64ToArrayBuffer(publicKeyStr),
                { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]
            );

            const meta = {
                title,
                start: start.toISOString(),
                end: end.toISOString(),
                color: "#3b82f6"
            };

            const securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);

            const res = await apiFetch("/api/v1/files", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "event",
                    parent_id: null,
                    public_meta: {},
                secured_meta: Array.from(new Uint8Array(cryptoLib.base64ToArrayBuffer(securedMeta)))
                })
            });

            if (!res.ok) throw new Error("Failed to create event");
            const newFile = await res.json();

            // Optimistic Update
            setEvents(prev => [...prev, {
                id: newFile.id,
                title,
                start: meta.start,
                end: meta.end,
                color: meta.color
            }]);

            // Open Modal immediately
            setEditingEventId(newFile.id);
            // Background reload
            loadData();
        } catch (err) {
            console.error("Create event failed:", err);
            alert("Failed to create event");
        }
    };

    // 4. Update Event (DnD)
    const handleEventUpdate = async (id: string, newStart: Date, newEnd: Date) => {
        const baseId = id.includes('_') ? id.split('_')[0] : id;
        await handleSaveEvent(baseId, { start: newStart.toISOString(), end: newEnd.toISOString() });
    };

    // 5. Rename (or full save)
    const handleEventRename = async (id: string, newTitle: string) => {
        await handleSaveEvent(id, { title: newTitle });
    };

    const handleSaveEvent = async (id: string, updates: Partial<CalendarEvent> & { parent_id?: string | null }) => {
        if (!privateKey) return;
        try {
            const publicKeyStr = sessionStorage.getItem("tide_user_public_key");
            if (!publicKeyStr) return;
            const publicKey = await window.crypto.subtle.importKey(
                "spki", cryptoLib.base64ToArrayBuffer(publicKeyStr),
                { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]
            );

            const isOccurrence = id.includes('_');
            const baseId = isOccurrence ? id.split('_')[0] : id;
            const event = events.find(e => e.id === baseId);
            if (!event) return;

            // Determine specific date key for this instance
            let occurrenceDateKey: string | null = null;
            if (isOccurrence) {
                const timestamp = parseInt(id.split('_')[1], 10);
                if (!isNaN(timestamp)) occurrenceDateKey = format(new Date(timestamp), "yyyy-MM-dd");
            } else if ((event as any).recurrence_rule && (event as any).recurrence_rule !== 'none') {
                occurrenceDateKey = format(new Date(event.start), "yyyy-MM-dd");
            }

            const isInstanceSpecific = occurrenceDateKey !== null;

            // Handle recurring cancellation & completion
            if (isInstanceSpecific) {
                if (updates.is_cancelled !== undefined) {
                    let exdates = [...((event as any).exdates || [])];
                    if (updates.is_cancelled) {
                        if (occurrenceDateKey && !exdates.includes(occurrenceDateKey)) exdates.push(occurrenceDateKey);
                    } else {
                        exdates = exdates.filter(d => d !== occurrenceDateKey);
                    }
                    (updates as any).exdates = exdates;
                    (updates as any).is_cancelled = (event as any).is_cancelled || false; // Keep series flag
                }
                if (updates.is_completed !== undefined) {
                    let completed = [...((event as any).completed_dates || [])];
                    if (updates.is_completed) {
                        if (occurrenceDateKey && !completed.includes(occurrenceDateKey)) completed.push(occurrenceDateKey);
                    } else {
                        completed = completed.filter(d => d !== occurrenceDateKey);
                    }
                    (updates as any).completed_dates = completed;
                    (updates as any).is_completed = (event as any).is_completed || false; // Keep series flag
                }
            }

            // Merge updates
            const updatedEvent = { ...event, ...updates };

            // Optimistic Update
            setEvents(prev => prev.map(e => e.id === baseId ? { ...e, ...updates } : e));

            const meta = {
                title: updatedEvent.title,
                start: updatedEvent.start,
                end: updatedEvent.end,
                color: updatedEvent.color,
                description: updatedEvent.description,
                recurrence_rule: (updatedEvent as any).recurrence_rule,
                exdates: (updatedEvent as any).exdates || [],
                completed_dates: (updatedEvent as any).completed_dates || [],
                is_task: !!(updatedEvent as any).is_task,
                is_completed: !!(updatedEvent as any).is_completed,
                is_cancelled: !!(updatedEvent as any).is_cancelled
            };

            const securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);

            const payload: any = {
                secured_meta: Array.from(new Uint8Array(cryptoLib.base64ToArrayBuffer(securedMeta))),
                is_task: !!meta.is_task,
                is_completed: !!meta.is_completed,
                exdates: meta.exdates || [],
                completed_dates: meta.completed_dates || []
            };
            if (updates.parent_id !== undefined) payload.parent_id = updates.parent_id;

            const res = await apiFetch(`/api/v1/files/${baseId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                // Revert on error
                loadData();
                throw new Error("Failed to update event");
            }
        } catch (err) {
            console.error("Update event failed:", err);
        }
    };

    const handleEventDelete = async (id: string, allInstances: boolean = false) => {
        const isOccurrence = id.includes('_');
        const baseId = isOccurrence ? id.split('_')[0] : id;

        // If it's a specific occurrence and we don't want to delete the whole series
        if (isOccurrence && !allInstances) {
            const occurrenceTimestamp = parseInt(id.split('_')[1], 10);
            if (isNaN(occurrenceTimestamp)) return;

            const occurrenceDate = new Date(occurrenceTimestamp);
            const occurrenceDateKey = format(occurrenceDate, "yyyy-MM-dd");

            const event = events.find(e => e.id === baseId);
            if (!event || (event as any).recurrence_rule === 'none') {
                // Not a recurring event, proceed with normal delete
                if (!confirm("Delete this event?")) return;
                try {
                    const res = await apiFetch(`/api/v1/files/${baseId}`, { method: "DELETE" });
                    if (!res.ok) throw new Error("Failed to delete");
                    setEvents(prev => prev.filter(e => e.id !== baseId));
                } catch (err) { console.error(err); }
                return;
            }

            // It's a recurring event, add to exdates
            const exdates = [...((event as any).exdates || []), occurrenceDateKey];
            await handleSaveEvent(baseId, { exdates: exdates } as any);
            return;
        }

        // Deleting the whole series
        if (!confirm("Delete this event and all its future occurrences?")) return;
        try {
            const res = await apiFetch(`/api/v1/files/${baseId}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete");
            setEvents(prev => prev.filter(e => e.id !== baseId));
            setEditingEventId(null);
        } catch (err) {
            console.error(err);
        }
    };

    const handleBack = () => {
        router.push("/");
    };

    if (status === "loading") return <div className="p-8">Loading...</div>;

    const editingEvent = editingEventId ? events.find(e => e.id === editingEventId) : null;

    return (
        <div className="calendar-page">
            <header className="calendar-header">
                <div className="calendar-header-left">
                    <button onClick={handleBack} className="calendar-btn calendar-btn-nav">
                        &larr; Back to Files
                    </button>
                    <h1 className="calendar-title">Calendar</h1>
                </div>
                <div>
                    <button
                        className="calendar-btn calendar-btn-primary"
                        onClick={() => handleEventCreate(new Date(), new Date(Date.now() + 3600000))}
                    >
                        + New Event
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-hidden">
                <CalendarView
                    events={events}
                    onEventCreate={handleEventCreate}
                    onEventUpdate={handleEventUpdate}
                    onEventRename={handleEventRename}
                    onEventDelete={handleEventDelete}
                    onEventSave={handleSaveEvent}
                    onEventClick={(id) => setEditingEventId(id || null)}
                    editingEventId={editingEventId}
                    date={currentViewDate}
                    onDateChange={setCurrentViewDate}
                    themes={folders}
                />
            </div>
        </div>
    );
}
