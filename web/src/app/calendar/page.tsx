"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as cryptoLib from "@/lib/crypto";
import CalendarView from "@/components/Calendar/CalendarView";
import "./calendar.css";

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    description?: string;
    color?: string;
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
                fetch(urlEvents, { headers: { "X-User-ID": myId } }),
                fetch(urlFolders, { headers: { "X-User-ID": myId } })
            ]);

            if (!resEvents.ok || !resFolders.ok) throw new Error("Failed to fetch data");

            const eventFiles = await resEvents.json() || [];
            const folderFiles = await resFolders.json() || [];

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
                        color: (meta.color as string)
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

            const res = await fetch("/api/v1/files", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-User-ID": myId },
                body: JSON.stringify({
                    type: "event",
                    parent_id: null,
                    public_meta: {},
                    secured_meta: securedMeta
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
        const event = events.find(e => e.id === id);
        if (!event) return;
        await handleSaveEvent(id, { start: newStart.toISOString(), end: newEnd.toISOString() });
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

            const event = events.find(e => e.id === id);
            if (!event) return;

            // Merge updates
            const updatedEvent = { ...event, ...updates };

            // Optimistic Update
            setEvents(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));

            const meta = {
                title: updatedEvent.title,
                start: updatedEvent.start,
                end: updatedEvent.end,
                color: updatedEvent.color,
                description: updatedEvent.description
            };

            const securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);

            const payload: any = {
                secured_meta: Array.from(new Uint8Array(cryptoLib.base64ToArrayBuffer(securedMeta)))
            };
            if (updates.parent_id !== undefined) payload.parent_id = updates.parent_id;

            const res = await fetch(`/api/v1/files/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "X-User-ID": myId },
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

    const handleEventDelete = async (id: string) => {
        if (!confirm("Delete this event?")) return;
        try {
            const res = await fetch(`/api/v1/files/${id}`, {
                method: "DELETE",
                headers: { "X-User-ID": myId }
            });
            if (!res.ok) throw new Error("Failed to delete");
            setEvents(prev => prev.filter(e => e.id !== id));
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
                    <h1 className="calendar-title text-red-500">CALENDAR DEBUG MODE</h1>
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
                    onEventClick={(id) => setEditingEventId(id)}
                    editingEventId={editingEventId}
                    date={currentViewDate}
                    onDateChange={setCurrentViewDate}
                    themes={folders}
                />
            </div>
        </div>
    );
}
