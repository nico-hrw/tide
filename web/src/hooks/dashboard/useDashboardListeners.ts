"use client";

import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import { isSameDay } from "date-fns";
import type { Editor } from "@tiptap/react";
import type { Tab } from "@/components/Layout/TabList";
import { useDataStore, type NoteLayout } from "@/store/useDataStore";
import { useDragGhost } from "@/store/useDragGhost";
import type { IslandView } from "@/components/extensions/smart_island/useIslandStore";
import { CALENDAR_DATE_STORAGE_KEY, serializeCalendarDate } from "@/lib/calendarWeeks";
import { serializeTabsForStorage } from "@/lib/tabStorage";
import { isFileListComplete, isTabStale, serializePersistedSession, sessionStateKey } from "@/lib/sessionState";
import type { SearchIndexEntry } from "@/lib/searchIndex";
import { handleViewMentionClick, type ViewMentionClickDetail } from "./viewMentionClick";
import { selectTags } from "@/lib/tags";
import type { CalendarViewMode } from "@/components/Calendar/types";

export interface DashboardListenerFile {
    id: string;
    title: string;
}

export interface DashboardListenerEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    description?: string;
    allDay?: boolean;
    isAllDay?: boolean;
    is_all_day?: boolean;
    is_completed?: boolean;
    isCompleted?: boolean;
    completed_dates?: unknown[];
    is_task?: boolean;
}

export interface DashboardListenerTask {
    id: string;
    title: string;
}

export type DashboardSwitchTabFn = (
    newId: string,
    type: string,
    forcedTitle?: string,
    fallbackData?: unknown,
    currentOverride?: unknown
) => Promise<void> | void;

export interface UseDashboardListenersOptions {
    privateKey: CryptoKey | null;
    publicKey: CryptoKey | null;
    myId: string;
    isRestored: boolean;
    activeNoteId: string | null;
    fileName: string;
    setFileName: React.Dispatch<React.SetStateAction<string>>;
    openTabs: Tab[];
    setOpenTabs: React.Dispatch<React.SetStateAction<Tab[]>>;
    activeTabId: string;
    setActiveTabId: React.Dispatch<React.SetStateAction<string>>;
    noteLayout: NoteLayout;
    calendarDate: Date;
    setCalendarDate: React.Dispatch<React.SetStateAction<Date>>;
    calendarViewMode: CalendarViewMode;
    setCalendarViewMode: (mode: CalendarViewMode) => void;
    setActiveEventId: React.Dispatch<React.SetStateAction<string | null>>;
    storeFiles: readonly DashboardListenerFile[];
    files: readonly DashboardListenerFile[];
    events: readonly DashboardListenerEvent[];
    tasks: readonly DashboardListenerTask[];
    enabledExtensions: readonly string[];
    editorInstance: Editor | null;
    setDraggedText: React.Dispatch<React.SetStateAction<string | null>>;
    setCalendarDropActive: React.Dispatch<React.SetStateAction<boolean>>;
    setDeletedBlockIds: React.Dispatch<React.SetStateAction<string[]>>;
    setPendingBindBlockId: React.Dispatch<React.SetStateAction<string | null>>;
    setKeys: (privateKey: CryptoKey, publicKey: CryptoKey, myId: string) => void;
    fetchDirectory: (parentId: string | null, forceRefresh?: boolean) => Promise<void>;
    loadNoteContent: (fileId: string, titleFn: string, passedFile?: unknown) => Promise<void> | void;
    handleFileSelect: (fileId: string, title: string, fileData?: unknown) => Promise<void> | void;
    switchTab: DashboardSwitchTabFn;
    switchTabRef?: React.MutableRefObject<DashboardSwitchTabFn | null>;
    handleNewNote: (parentIdOverride?: string | null) => Promise<void> | void;
    islandPush: (view: Omit<IslandView, "id">) => void;
    setIdlePayload: (payload: Record<string, unknown>) => void;
}

export interface UseDashboardListenersReturn {
    handleBlocksDeleted: (ids: string[]) => void;
}

function buildSearchIndexItems(): SearchIndexEntry[] {
    const s = useDataStore.getState();
    return [
        ...s.events.map((e) => ({
            id: e.id,
            title: e.title,
            date: typeof e.start === "string" && e.start ? e.start : new Date().toISOString(),
            type: "event" as const,
        })),
        ...s.notes.map((n) => ({
            id: n.id,
            title: n.title,
            date: new Date().toISOString(),
            type: "note" as const,
        })),
        ...s.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            date: new Date().toISOString(),
            type: "task" as const,
        })),
    ];
}

export function useDashboardListeners({
    privateKey,
    publicKey,
    myId,
    isRestored,
    activeNoteId,
    fileName,
    setFileName,
    openTabs,
    setOpenTabs,
    activeTabId,
    setActiveTabId,
    noteLayout,
    calendarDate,
    setCalendarDate,
    calendarViewMode, setCalendarViewMode,
    setActiveEventId,
    storeFiles,
    files,
    events,
    tasks,
    enabledExtensions,
    editorInstance,
    setDraggedText,
    setCalendarDropActive,
    setDeletedBlockIds,
    setPendingBindBlockId,
    setKeys,
    fetchDirectory,
    loadNoteContent,
    handleFileSelect,
    switchTab,
    switchTabRef,
    handleNewNote,
    islandPush,
    setIdlePayload,
}: UseDashboardListenersOptions): UseDashboardListenersReturn {
    const loadedDirectories = useDataStore((s) => s.loadedDirectories);
    const remindedEventsRef = useRef<Set<string>>(new Set());
    const deletedBlocksTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const activeNoteIdRef = useRef(activeNoteId);
    activeNoteIdRef.current = activeNoteId;
    const fileNameRef = useRef(fileName);
    fileNameRef.current = fileName;
    const eventsRef = useRef(events);
    eventsRef.current = events;
    const loadNoteContentRef = useRef(loadNoteContent);
    loadNoteContentRef.current = loadNoteContent;
    const handleFileSelectRef = useRef(handleFileSelect);
    handleFileSelectRef.current = handleFileSelect;
    const latestSwitchTabRef = useRef(switchTab);
    latestSwitchTabRef.current = switchTab;
    const handleNewNoteRef = useRef(handleNewNote);
    handleNewNoteRef.current = handleNewNote;

    // 1. Note/Event selection & reload window events
    useEffect(() => {
        if (typeof window === "undefined") return;

        const handleSelectNote = (e: Event) => {
            const detail = (e as CustomEvent<{ id?: string; title?: string }>).detail;
            if (!detail?.id) return;
            handleFileSelectRef.current(detail.id, detail.title ?? "");
        };

        const handleSelectEvent = (e: Event) => {
            const { id, start } = (e as CustomEvent<{ id?: string; start?: string }>).detail || {};
            setActiveTabId("calendar");
            setOpenTabs((prev) =>
                prev.some((t) => t.id === "calendar")
                    ? prev
                    : [...prev, { id: "calendar", title: "Calendar", type: "calendar" }]
            );
            const ev = eventsRef.current.find((item) => item.id === id);
            const eventStart = start || ev?.start;
            if (eventStart) {
                setCalendarDate(new Date(eventStart));
            }
            if (id) {
                setActiveEventId(id);
                setTimeout(() => {
                    window.dispatchEvent(
                        new CustomEvent("calendar:scroll-to", { detail: { id, start: eventStart } })
                    );
                }, 150);
            }
        };

        const handleReloadNote = (e: Event) => {
            const { fileId } = (e as CustomEvent<{ fileId?: string }>).detail || {};
            if (fileId && fileId === activeNoteIdRef.current) {
                const liveFile = useDataStore.getState().notes.find((f) => f.id === fileId);
                const title = liveFile?.title || fileNameRef.current || "Untitled";
                loadNoteContentRef.current(fileId, title);
            }
        };

        window.addEventListener("tide:select-note", handleSelectNote);
        window.addEventListener("tide:select-event", handleSelectEvent);
        window.addEventListener("tide:reload_note", handleReloadNote);

        return () => {
            window.removeEventListener("tide:select-note", handleSelectNote);
            window.removeEventListener("tide:select-event", handleSelectEvent);
            window.removeEventListener("tide:reload_note", handleReloadNote);
        };
    }, [setActiveTabId, setOpenTabs, setCalendarDate, setActiveEventId]);

    // 2. Reactive title-sync for currently open note
    useEffect(() => {
        if (!activeNoteId) return;
        const freshNote = storeFiles.find((f) => f.id === activeNoteId);
        if (!freshNote) return;
        const realTitle = freshNote.title;
        if (!realTitle || realTitle.includes("Locked Note")) return;

        setFileName((prev) =>
            prev === "" || prev.includes("Locked") || prev !== realTitle ? realTitle : prev
        );
        setOpenTabs((prev) =>
            prev.map((tab) =>
                tab.id === activeNoteId && tab.title !== realTitle
                    ? { ...tab, title: realTitle }
                    : tab
            )
        );
    }, [storeFiles, activeNoteId, setFileName, setOpenTabs]);

    // 3. Initial directory load & search index initialization
    useEffect(() => {
        if (!privateKey || !publicKey || !myId) return;

        setKeys(privateKey, publicKey, myId);
        fetchDirectory(null, true);
        useDataStore.getState().loadAllMetadata().catch(console.error);
        void useDataStore.getState().loadViews();

        import("@/lib/searchIndex").then(({ loadSearchIndex, rebuildIndex }) => {
            loadSearchIndex(privateKey, myId).then(async (idx) => {
                if (!idx || idx.length === 0) {
                    try {
                        await useDataStore.getState().loadAllMetadata();
                        const items = buildSearchIndexItems();
                        if (items.length > 0) {
                            await rebuildIndex(items, privateKey, publicKey, myId);
                        }
                    } catch (e) {
                        console.error("Index initialization failed", e);
                    }
                }
            });
        });
    }, [privateKey, publicKey, myId, setKeys, fetchDirectory]);

    // 4. Debounced search index sync
    useEffect(() => {
        if (!privateKey || !publicKey || !myId || !isRestored) return;

        const timer = setTimeout(() => {
            const items = buildSearchIndexItems();
            if (items.length > 0) {
                import("@/lib/searchIndex").then(({ rebuildIndex }) => {
                    rebuildIndex(items, privateKey, publicKey, myId).catch((err) => {
                        console.error("[SearchIndexSync] Rebuild failed", err);
                    });
                });
            }
        }, 2000);

        return () => clearTimeout(timer);
    }, [files, events, tasks, privateKey, publicKey, myId, isRestored]);

    // 5. Cleanup orphaned tabs when access is revoked or file is deleted
    useEffect(() => {
        if (!isRestored || !files || files.length === 0) return;
        // Folders and shared files load lazily: only prune once the list is known complete.
        const complete = isFileListComplete(useDataStore.getState().notes, loadedDirectories);
        const knownFileIds = complete ? new Set(files.map((f) => f.id)) : null;
        setOpenTabs((prev) => {
            const next = prev.filter((tab) => {
                if (
                    tab.id === "calendar" ||
                    tab.id === "folders" ||
                    tab.id === "todos" ||
                    tab.id === "messages" ||
                    tab.id.startsWith("ext_") ||
                    tab.id.startsWith("chat-") ||
                    tab.id.startsWith("profile:")
                ) {
                    return true;
                }
                return !isTabStale(tab, knownFileIds);
            });
            return next.length !== prev.length ? next : prev;
        });
    }, [files, isRestored, setOpenTabs, loadedDirectories]);

    // 5b. Restored file tabs carry no title: fill it in once the note is known.
    useEffect(() => {
        if (!isRestored || !files || files.length === 0) return;
        setOpenTabs((prev) => {
            if (!prev.some((t) => t.type === "file" && !t.title)) return prev;
            return prev.map((t) => {
                if (t.type !== "file" || t.title) return t;
                const f = files.find((x) => x.id === t.id);
                return f?.title ? { ...t, title: f.title } : t;
            });
        });
    }, [files, isRestored, setOpenTabs]);

    // 6. Tab & layout storage persistence
    useEffect(() => {
        if (!isRestored) return;
        sessionStorage.setItem(
            "tide_open_tabs",
            serializeTabsForStorage(openTabs as unknown as Record<string, unknown>[])
        );
        sessionStorage.setItem("tide_active_tab_id", activeTabId);
        localStorage.setItem("tide_note_layout", noteLayout);
    }, [openTabs, activeTabId, noteLayout, isRestored]);

    // 6b. Durable session record (survives app restart): ids/types/order/active tab/calendar view mode.
    const persistSession = useCallback(() => {
        const key = sessionStateKey(myId);
        if (!key) return;
        try {
            localStorage.setItem(
                key,
                serializePersistedSession({ tabs: openTabs, activeTabId, calendarViewMode })
            );
        } catch {
            // Ignore quota or private-browsing errors
        }
    }, [openTabs, activeTabId, calendarViewMode, myId]);
    useEffect(() => {
        if (!isRestored) return;
        const timer = window.setTimeout(persistSession, 250);
        window.addEventListener("pagehide", persistSession);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener("pagehide", persistSession);
        };
    }, [isRestored, persistSession]);

    // 7. Calendar date persistence
    useEffect(() => {
        if (!isRestored) return;
        try {
            localStorage.setItem(CALENDAR_DATE_STORAGE_KEY, serializeCalendarDate(calendarDate));
        } catch {
            // Ignore quota or private-browsing errors
        }
    }, [calendarDate, isRestored]);

    // 8. Smart Island idle payload (today's events)
    useEffect(() => {
        const today = new Date();
        const todayEvents = events.filter((e) => {
            try {
                return isSameDay(new Date(e.start), today);
            } catch {
                return false;
            }
        });
        setIdlePayload({ events: todayEvents.map((e) => ({ title: e.title, start: e.start })) });
    }, [events, setIdlePayload]);

    // 9. Text -> Calendar global drag listeners
    useEffect(() => {
        const handleDragStart = (e: DragEvent) => {
            const text = e.dataTransfer?.getData("text/plain") || window.getSelection()?.toString() || "";
            if (text && text.trim().length > 0 && !e.dataTransfer?.types.includes("tide/calendar-event")) {
                const trimmed = text.trim();
                setDraggedText(trimmed);
                setCalendarDropActive(true);
                try {
                    e.dataTransfer?.setData("tide/text-to-calendar", trimmed);
                } catch {
                    // Ignore restricted dataTransfer access
                }
            }
        };
        const handleDragEnd = () => {
            setCalendarDropActive(false);
        };
        window.addEventListener("dragstart", handleDragStart, true);
        window.addEventListener("dragend", handleDragEnd, true);
        return () => {
            window.removeEventListener("dragstart", handleDragStart, true);
            window.removeEventListener("dragend", handleDragEnd, true);
        };
    }, [setDraggedText, setCalendarDropActive]);

    // 10. Smart Island reminder interval (10 min before event)
    useEffect(() => {
        if (!enabledExtensions.includes("smart_island")) return;
        const check = () => {
            const now = new Date();
            for (const ev of events) {
                try {
                    const start = new Date(ev.start);
                    const diffMins = (start.getTime() - now.getTime()) / 60_000;
                    if (ev.is_completed || ev.isCompleted || ev.completed_dates?.length) continue;
                    if (ev.is_all_day || ev.isAllDay || ev.allDay || ev.is_task) continue;
                    if (diffMins > 0 && diffMins <= 10 && !remindedEventsRef.current.has(ev.id)) {
                        remindedEventsRef.current.add(ev.id);
                        islandPush({
                            type: "reminder",
                            priority: "CRITICAL",
                            payload: {
                                event: {
                                    title: ev.title,
                                    start: ev.start,
                                    end: ev.end,
                                    description: ev.description || "",
                                },
                                duration: 7_000,
                            },
                        });
                    }
                } catch {
                    // Skip invalid dates
                }
            }
        };
        check();
        const interval = setInterval(check, 60_000);
        return () => clearInterval(interval);
    }, [events, enabledExtensions, islandPush]);

    // 11. Store createNote listener
    useEffect(() => {
        const handleCreateNote = () => handleNewNoteRef.current();
        window.addEventListener("dataStore:createNote", handleCreateNote);
        return () => window.removeEventListener("dataStore:createNote", handleCreateNote);
    }, []);

    // 12. DateMention calendar navigation
    useEffect(() => {
        const handler = (e: Event) => {
            const { isoDate } = (e as CustomEvent<{ isoDate?: string }>).detail || {};
            if (!isoDate) return;
            const date = new Date(isoDate);
            if (isNaN(date.getTime())) return;
            (switchTabRef?.current ?? latestSwitchTabRef.current)("calendar", "calendar");
            setCalendarDate(date);
        };
        window.addEventListener("dateMention:click", handler);
        return () => window.removeEventListener("dateMention:click", handler);
    }, [switchTabRef, setCalendarDate]);

    // 12b. ViewMention: open a saved view in the calendar or the todo list (same tag filter)
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<ViewMentionClickDetail>).detail || {};
            const state = useDataStore.getState();
            handleViewMentionClick(detail, {
                getView: (id) => state.views.find((v) => v.id === id),
                knownTagIds: new Set(selectTags(state.notes).map((t) => t.id)),
                setCalendarTagFilter: state.setCalendarTagFilter,
                setTodoTagFilter: state.setTodoTagFilter,
                switchTab: (id, type) => (switchTabRef?.current ?? latestSwitchTabRef.current)(id, type),
                navigateTodos: () => window.dispatchEvent(new CustomEvent("tide:navigate", { detail: { tab: "todos" } })),
                setCalendarViewMode,
                // Mobile keeps its own tab and mode state; it reacts to these events.
                dispatchMobile: (name, d) => window.dispatchEvent(new CustomEvent(name, { detail: d })),
            });
        };
        window.addEventListener("viewMention:click", handler);
        return () => window.removeEventListener("viewMention:click", handler);
    }, [switchTabRef, setCalendarViewMode]);

    // 13. Note navigation listener
    useEffect(() => {
        const handleNavigate = (e: Event) => {
            const { noteId, tab } = (e as CustomEvent<{ noteId?: string; tab?: string }>).detail || {};
            if (tab === "todos") {
                (switchTabRef?.current ?? latestSwitchTabRef.current)("todos", "todos", "Todos");
            } else if (noteId) {
                (switchTabRef?.current ?? latestSwitchTabRef.current)(noteId, "file");
            }
        };
        window.addEventListener("tide:navigate", handleNavigate);
        return () => window.removeEventListener("tide:navigate", handleNavigate);
    }, [switchTabRef]);

    // 13b. Contact mention chip: open the person's profile tab
    useEffect(() => {
        const handleOpenProfile = (e: Event) => {
            const { userId, username } = (e as CustomEvent<{ userId?: string; username?: string }>).detail || {};
            if (!userId) return;
            (switchTabRef?.current ?? latestSwitchTabRef.current)(`profile:${userId}`, "profile", username);
        };
        window.addEventListener("tide:open-profile", handleOpenProfile);
        return () => window.removeEventListener("tide:open-profile", handleOpenProfile);
    }, [switchTabRef]);

    // 14. Calendar drag-ghost click consumer
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const { active, snapshot, cancel } = useDragGhost.getState();
            if (!active || !snapshot) return;

            const editorEl = (e.target as HTMLElement | null)?.closest?.(".ProseMirror");
            if (!editorEl || !editorInstance) {
                cancel();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const posInfo = editorInstance.view.posAtCoords({ left: e.clientX, top: e.clientY });
            if (!posInfo) {
                cancel();
                return;
            }
            try {
                editorInstance
                    .chain()
                    .focus()
                    .insertContentAt(posInfo.pos, {
                        type: "calendarEvent",
                        attrs: { eventId: snapshot.eventId },
                    })
                    .run();
            } catch (err) {
                console.error("[DragGhost] Failed to insert mention", err);
            }
            cancel();
        };
        window.addEventListener("click", handleClick, true);
        return () => window.removeEventListener("click", handleClick, true);
    }, [editorInstance]);

    // 15. Canvas block deletion & rebind
    useEffect(() => {
        setDeletedBlockIds([]);
    }, [activeNoteId, setDeletedBlockIds]);

    useEffect(() => {
        return () => {
            if (deletedBlocksTimerRef.current) {
                clearTimeout(deletedBlocksTimerRef.current);
            }
        };
    }, []);

    const handleBlocksDeleted = useCallback(
        (ids: string[]) => {
            setDeletedBlockIds(ids);
            if (deletedBlocksTimerRef.current) {
                clearTimeout(deletedBlocksTimerRef.current);
            }
            deletedBlocksTimerRef.current = setTimeout(() => {
                setDeletedBlockIds([]);
                deletedBlocksTimerRef.current = null;
            }, 1000);
        },
        [setDeletedBlockIds]
    );

    useEffect(() => {
        const handleRequestRebind = () => {
            setPendingBindBlockId("__pending_rebind__");
        };
        window.addEventListener("canvas:requestRebind", handleRequestRebind);
        return () => window.removeEventListener("canvas:requestRebind", handleRequestRebind);
    }, [setPendingBindBlockId]);

    return { handleBlocksDeleted };
}
