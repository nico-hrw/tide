"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Editor as TipTapEditor, JSONContent } from "@tiptap/react";
import { apiFetch } from "@/lib/api";
import { getEventGroupIds } from "@/lib/calendarUtils";
import { useDataStore } from "@/store/useDataStore";
import { useActiveNoteStore } from "@/store/activeNoteStore";
import { useIslandActionsStore } from "@/store/useIslandActionsStore";
import { useIslandStore } from "@/components/extensions/smart_island/useIslandStore";
import type { TextWidgetElement } from "@/types/canvas";
import { useStyleFile } from "@/components/Canvas/useStyleFile";
import { useDateDetection, type DateDetectionMode } from "@/hooks/useDateDetection";
import { useProductivityStats } from "@/hooks/useProductivityStats";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useTextCollector } from "@/hooks/useTextCollector";
import { useTouchContextMenu } from "@/hooks/useTouchContextMenu";
import { useMobileConnectionSync } from "@/hooks/useMobileConnectionSync";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useSplitViewDrag } from "@/hooks/useSplitViewDrag";
import { useAutoSaveSync } from "@/hooks/useAutoSaveSync";
import Sidebar from "@/components/Layout/Sidebar";
import MobileLayout from "@/components/Layout/MobileLayout";
import SocialHub from "@/components/Social/SocialHub";
import { filterFilesBySafe } from "@/components/Layout/sidebar/SidebarFiles";
import { DashboardDesktopContent, type DashboardCollaborator, type DashboardDesktopContentProps } from "@/components/Dashboard/DashboardDesktopContent";
import { DashboardModals } from "@/components/Dashboard/DashboardModals";
import type {
    CalendarEvent, CalendarViewMode, DecryptedFile, DeleteConfirmState, DeleteErrorState,
    NoteSecurityModalItem, SaveStatus, ShareModalFile, SummaryStats, Tab,
} from "@/components/Dashboard/types";
import { useSessionRestore } from "@/hooks/dashboard/useSessionRestore";
import { useFolderAndGroupActions } from "@/hooks/dashboard/useFolderAndGroupActions";
import { useFileActions } from "@/hooks/dashboard/useFileActions";
import { useCalendarActions } from "@/hooks/dashboard/useCalendarActions";
import { useTagMigration } from "@/hooks/dashboard/useTagMigration";
import { selectTags } from "@/lib/tags";
import { TagCreateProvider } from "@/components/Tags/useTagCreate";
import { useWorkspaceTabs, type SwitchTabFn } from "@/hooks/dashboard/useWorkspaceTabs";
import { useTaskCalendarSync } from "@/hooks/dashboard/useTaskCalendarSync";
import { useDashboardListeners } from "@/hooks/dashboard/useDashboardListeners";

const Editor = dynamic(() => import("@/components/Editor"), {
    ssr: false, loading: () => <div className="min-h-[500px] w-full animate-pulse bg-t2-sub rounded-lg" />,
});
const CanvasNoteEditor = dynamic(() => import("@/components/Canvas/CanvasNoteEditor"), { ssr: false });
const SUMMARY_STATS: SummaryStats = { events: 0, tasks: 0 };

interface ExtendedDecryptedFile extends DecryptedFile {
    isShared?: boolean;
    access_keys?: string | Record<string, unknown>;
    permission?: string;
}

function getInitialTabs(): Tab[] {
    const initial: Tab[] = [{ id: "calendar", title: "Calendar", type: "calendar" }];
    if (typeof window !== "undefined") {
        try {
            if (localStorage.getItem("tide_navigation_mode") === "folders") {
                initial.push({ id: "folders", title: "Notizen", type: "folders" });
            }
        } catch { /* Ignore storage access errors */ }
    }
    return initial;
}

export default function Dashboard() {
    useTouchContextMenu();
    const router = useRouter();
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    const [openTabs, setOpenTabs] = useState<Tab[]>(getInitialTabs);
    const [activeTabId, setActiveTabId] = useState<string>("calendar");
    const { width: sidebarWidth, isCollapsed: isSidebarCollapsed, toggleCollapse: toggleSidebarCollapse, startDragging: startSidebarDrag } =
        useSplitViewDrag({ defaultWidth: 256, minWidth: 200, maxWidth: 400, storageKey: "tide_sidebar_width", breakpoint: 1024 });
    const isSidebarOpen = !isSidebarCollapsed;

    const [isSummaryOpen, setIsSummaryOpen] = useState(false);
    const [showBackups, setShowBackups] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
    const [deleteError, setDeleteError] = useState<DeleteErrorState | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [noteSecurityModalItem, setNoteSecurityModalItem] = useState<NoteSecurityModalItem | null>(null);
    const [shareModalFile, setShareModalFile] = useState<ShareModalFile | null>(null);
    const [activeCollaborators, setActiveCollaborators] = useState<DashboardCollaborator[]>([]);
    const [editorInstance, setEditorInstance] = useState<TipTapEditor | null>(null);
    const [editorVersion, setEditorVersion] = useState(0);
    const [editingFileId, setEditingFileId] = useState<string | null>(null);
    const [hiddenThemeIds, setHiddenThemeIds] = useState<string[]>([]);
    const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
    const avatarMenuRef = useRef<HTMLDivElement>(null);
    const [calendarDate, setCalendarDate] = useState<Date>(() => new Date());
    const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>("week");
    const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
    const [scheduleInitialStart, setScheduleInitialStart] = useState<Date | null>(null);
    const [activeEventId, setActiveEventId] = useState<string | null>(null);
    const [, setMinimizedEventIds] = useState<string[]>([]);
    const syncingTaskIdsRef = useRef<Set<string>>(new Set());
    const [deletedBlockIds, setDeletedBlockIds] = useState<string[]>([]);
    const [pendingBindBlockId, setPendingBindBlockId] = useState<string | null>(null);
    const [isLinkingMode, setIsLinkingMode] = useState(false);
    const [activeLinkBlockId, setActiveLinkBlockId] = useState<string | null>(null);
    const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
    const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
    const [calendarDropActive, setCalendarDropActive] = useState(false);
    const [draggedText, setDraggedText] = useState<string | null>(null);

    const {
        notes: storeFiles, events: storeEvents, tasks: storeTasks, eventsLoaded, setKeys, fetchDirectory,
        loadedDirectories, enabledExtensions, setEnabledExtensions, noteLayout, setNoteLayout,
        isSettingsModalOpen, setSettingsModalOpen, navigationMode, updateTask, setEvents, activeSafes,
    } = useDataStore(useShallow((s) => ({
        notes: s.notes, events: s.events, tasks: s.tasks, eventsLoaded: s.eventsLoaded, setKeys: s.setKeys, fetchDirectory: s.fetchDirectory,
        loadedDirectories: s.loadedDirectories, enabledExtensions: s.enabledExtensions,
        setEnabledExtensions: s.setEnabledExtensions, noteLayout: s.noteLayout, setNoteLayout: s.setNoteLayout,
        isSettingsModalOpen: s.isSettingsModalOpen, setSettingsModalOpen: s.setSettingsModalOpen,
        navigationMode: s.navigationMode, updateTask: s.updateTask, setEvents: s.setEvents, activeSafes: s.activeSafes,
    })));
    const { push: islandPush, setIdlePayload } = useIslandStore();

    const shouldShowSidebar = isSidebarOpen && navigationMode !== "folders";
    const files = storeFiles as unknown as ExtendedDecryptedFile[];
    const events = storeEvents as unknown as CalendarEvent[];

    // Bridge ref so useSessionRestore can trigger editor actions declared after it
    const editorActionsRef = useRef<{
        setEditorContent: (content: unknown) => void;
        setActiveFileKey: (key: CryptoKey | null) => void;
        setFileName: (name: string) => void;
        loadNoteContent: (id: string, title?: string) => Promise<void> | void;
    } | null>(null);

    const { myId, privateKey, publicKey, userProfile, isRestored, status } = useSessionRestore({
        setKeys, fetchDirectory, setOpenTabs, setActiveTabId, setCalendarDate,
        setEditorContent: (content) => editorActionsRef.current?.setEditorContent(content),
        setActiveFileKey: (key) => editorActionsRef.current?.setActiveFileKey(key),
        setFileName: (name) => editorActionsRef.current?.setFileName(name),
        loadNoteContent: (id, title) => editorActionsRef.current?.loadNoteContent(id, title),
    });

    const activeTabIdStr = typeof activeTabId === "string" ? activeTabId : String(activeTabId || "calendar");
    const activeNoteId =
        activeTabIdStr !== "calendar" && activeTabIdStr !== "todos" && activeTabIdStr !== "messages" &&
        activeTabIdStr !== "folders" && !activeTabIdStr.startsWith("chat-") ? activeTabIdStr : null;

    const safeFilteredFiles = useMemo(() => filterFilesBySafe(files, activeSafes), [files, activeSafes]);
    const sidebarFiles = useMemo(
        () => (files ? files.filter((f) => !f.isGroup && !(f.title || "").startsWith(".")) : []),
        [files]
    );
    const filteredCalendarEvents = useMemo(
        () => events
            .map((e) => ({ ...e, effect: files?.find((f) => f.id === e.parent_id)?.effect || "none" }))
            .filter((e) => {
                const gIds = getEventGroupIds(e);
                return gIds.length === 0
                    ? !hiddenThemeIds.includes("general-theme")
                    : gIds.some((gid) => !hiddenThemeIds.includes(gid));
            }),
        [events, files, hiddenThemeIds]
    );

    const canvasSidecar = useStyleFile({ noteId: activeNoteId, userId: myId, privateKey, publicKey });
    const handleEditorReady = useCallback((ed: unknown) => {
        setTimeout(() => setEditorInstance(ed as TipTapEditor | null), 0);
    }, []);
    const switchTabRef = useRef<SwitchTabFn | null>(null);

    const {
        saveStatus, setSaveStatus, isLoadingContent, activeFileKey, setActiveFileKey,
        editorContent, setEditorContent, canvasNoteData, setCanvasNoteData, fileName, setFileName,
        userHasTypedRef, initialContentRef, handleEditorChange, triggerSave, performSave, loadNoteContent,
    } = useAutoSaveSync({
        activeNoteId, openTabs, setOpenTabs, setEditorVersion, privateKey, publicKey, myId,
        files, events, switchTab: (...args) => switchTabRef.current?.(...args),
    });
    editorActionsRef.current = {
        setEditorContent, setActiveFileKey, setFileName,
        loadNoteContent: (id, title) => loadNoteContent(id, title ?? ""),
    };

    const {
        handleCreateFolder, handleCreateEventGroup, handleUpdateEventGroup, handleMoveFileToFolder,
        handleUpdateFolderColor, handleCreateFolderCentral, handleMoveFile, handleToggleThemeVisibility,
    } = useFolderAndGroupActions({ privateKey, publicKey, files, setEditingFileId, setHiddenThemeIds });

    const {
        handleEventCreate, handleScheduleApply, handleEventUpdate, handleEventRename,
        handleEventSave, handleDeleteEvent,
    } = useCalendarActions({
        publicKey, privateKey, myId, events: storeEvents, setEvents, setActiveEventId,
        scheduleInitialStart, syncingTaskIdsRef, updateTask, handleCreateEventGroup,
    });

    const createTagForContext = useCallback(
        (title: string) => handleCreateEventGroup(title), [handleCreateEventGroup]);
    const migrationTags = useMemo(() => selectTags(storeFiles), [storeFiles]);
    useTagMigration({
        ready: !!privateKey && !!publicKey && eventsLoaded && loadedDirectories.has("root"),
        events, tasks: storeTasks, tags: migrationTags,
        createTag: (title) => handleCreateEventGroup(title),
        saveEvent: (id, u) => handleEventSave(id, u),
        saveTask: (id, u) => updateTask(id, u),
    });

    const {
        handleNewNote, handleNewCanvasNote, switchTab, handleFileSelect, handleLogout, handleDateSelect,
        handleToggleTodos, handleTabSelect, handleTabClose, handleMagicLinkClick, handleOpenMessages,
        handleChatSelect, handleRestoreBackup,
    } = useWorkspaceTabs({
        openTabs, setOpenTabs, activeTabId, setActiveTabId, activeNoteId, files, navigationMode, router,
        setCalendarDate, setActiveEventId, setShowBackups, editorInstance, editorContent, setEditorContent,
        canvasNoteData, setCanvasNoteData, fileName, setFileName, activeFileKey, setActiveFileKey,
        saveStatus, setSaveStatus,
        setActiveCollaborators: (users) => setActiveCollaborators(users as DashboardCollaborator[]),
        initialContentRef, userHasTypedRef, switchTabRef, triggerSave, loadNoteContent, handleEditorChange,
    });

    const {
        handleDeleteNote, executeDeleteNote, handleRenameNote, submitRename,
        handleToggleVisibility, handleShare, performShare, handleSaveNoteSecuritySettings,
    } = useFileActions({
        files, events, activeTabId, myId, privateKey, publicKey, deleteConfirm, setDeleteConfirm,
        setDeleteError, setEditingFileId, setOpenTabs, setFileName, setSaveStatus, shareModalFile,
        setShareModalFile, noteSecurityModalItem, handleTabClose, fetchDirectory,
    });

    useTaskCalendarSync({
        tasks: storeTasks, events: storeEvents, privateKey, publicKey, loadedDirectories,
        syncingTaskIdsRef, handleEventCreate, handleEventSave,
    });

    const { handleBlocksDeleted } = useDashboardListeners({
        privateKey, publicKey, myId, isRestored, activeNoteId, fileName, setFileName, openTabs,
        setOpenTabs, activeTabId, setActiveTabId, noteLayout, calendarDate, setCalendarDate,
        setActiveEventId, storeFiles, files, events, tasks: storeTasks, enabledExtensions, editorInstance,
        setDraggedText, setCalendarDropActive, setDeletedBlockIds, setPendingBindBlockId, setKeys,
        fetchDirectory, loadNoteContent, handleFileSelect, switchTab, switchTabRef, handleNewNote,
        islandPush, setIdlePayload,
    });

    useRealtimeSync({ myId, activeNoteId, fileName, isLoadingContent, editorContent, privateKey });
    useMobileConnectionSync(events);
    useTextCollector({ enabledExtensions, setOpenTabs, setActiveTabId });
    useProductivityStats();

    useGlobalShortcuts({
        onNewNote: () => handleNewNote(),
        onSave: () => { if (activeNoteId && editorContent) triggerSave(activeNoteId, activeFileKey, editorContent); },
        onToggleSidebar: toggleSidebarCollapse,
        onOpenSearch: () => setIsSearching(true),
        onToggleTodos: () => handleToggleTodos(),
        onOpenCalendar: () => handleTabSelect("calendar", "calendar"),
        onCloseModals: () => {
            setIsSearching(false); setSettingsModalOpen(false); setScheduleModalOpen(false);
            setIsSummaryOpen(false); setShowBackups(false); setDeleteConfirm(null);
            setShareModalFile(null); setNoteSecurityModalItem(null);
        },
    });

    const dateDetectionEnabled = enabledExtensions.includes("smart_date_detection");
    const dateDetectionMode: DateDetectionMode =
        typeof window !== "undefined" && localStorage.getItem("tide_date_detection_mode") === "manual" ? "manual" : "auto";
    useDateDetection({
        editor: editorInstance, enabled: dateDetectionEnabled && !!activeNoteId, mode: dateDetectionMode,
        onAcceptSuggestion: async ({ title, start, end, blockId }) => {
            const newId = await handleEventCreate(start, end, false, { title });
            if (!newId || !editorInstance) return;
            try {
                const { state } = editorInstance;
                let insertPos: number | null = null;
                state.doc.descendants((node: ProseMirrorNode, pos: number) => {
                    if ((node.attrs as Record<string, unknown> | undefined)?.blockId === blockId) {
                        insertPos = pos + node.nodeSize - 1;
                        return false;
                    }
                    return true;
                });
                editorInstance.chain().insertContentAt(insertPos ?? state.doc.content.size - 1, [
                    { type: "text", text: " " }, { type: "calendarEvent", attrs: { eventId: newId } },
                ]).run();
            } catch (err) { console.error("[useDateDetection] Failed to insert mention", err); }
        },
    });

    useEffect(() => {
        if (navigationMode === "folders") {
            setOpenTabs((prev) => {
                if (prev.some((t) => t.id === "folders")) return prev;
                const calIdx = prev.findIndex((t) => t.id === "calendar");
                const next = [...prev];
                next.splice(calIdx !== -1 ? calIdx + 1 : next.length, 0, { id: "folders", title: "Notizen", type: "folders" });
                return next;
            });
        } else if (navigationMode === "sidebar") {
            setOpenTabs((prev) => prev.filter((t) => t.id !== "folders"));
            setActiveTabId((cur) => (cur === "folders" ? "calendar" : cur));
        }
    }, [navigationMode]);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) setIsAvatarMenuOpen(false);
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const handleEventCreateRef = useRef(handleEventCreate);
    handleEventCreateRef.current = handleEventCreate;
    useEffect(() => {
        useIslandActionsStore.getState().register({
            createEvent: (start, end, title) => handleEventCreateRef.current(start, end, false, { title }),
            editEvent: (start) => { setScheduleInitialStart(start); setScheduleModalOpen(true); },
        });
        const onCollectorCreate = (e: Event) => {
            const { title, start, end } = (e as CustomEvent<{ title: string; start: string; end: string }>).detail;
            void handleEventCreateRef.current(new Date(start), new Date(end), false, { title });
        };
        window.addEventListener("tide:collector-create-event", onCollectorCreate);
        return () => {
            useIslandActionsStore.getState().unregister();
            window.removeEventListener("tide:collector-create-event", onCollectorCreate);
        };
    }, []);

    const handleToggleExtension = async (extensionId: string, enabled: boolean) => {
        setEnabledExtensions((prev) => {
            const next = enabled ? [...prev, extensionId] : prev.filter((e) => e !== extensionId);
            localStorage.setItem("tide_enabled_extensions", JSON.stringify(next));
            return next;
        });
        if (!enabled) {
            if (activeTabId === `ext_${extensionId}`) setActiveTabId("calendar");
            setOpenTabs((prev) => prev.filter((t) => t.id !== `ext_${extensionId}`));
        }
        try {
            await apiFetch("/api/v1/user/extensions", {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ extension: extensionId, enabled }),
            });
        } catch (e) { console.error("Failed to toggle extension", e); }
    };

    if (status === "loading") {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-t2-surface gap-4">
                <div className="relative w-8 h-8">
                    <div className="absolute inset-0 rounded-full border-2 border-t2-line-soft" />
                    <div className="absolute inset-0 rounded-full border-2 border-t-gray-800 dark:border-t-white/60 animate-spin" />
                </div>
                <span className="text-[11px] font-semibold text-t2-ink-3 tracking-[0.3em] uppercase">tide</span>
            </div>
        );
    }

    const activeFile = files.find((f) => f.id === activeNoteId);
    const isSharedMobileNote = Boolean(
        activeFile && (activeFile.isShared || (activeFile.owner_id && activeFile.owner_id !== myId) ||
            (activeFile.share_status && activeFile.share_status !== "owner") || (() => {
                try {
                    const keys = typeof activeFile.access_keys === "string"
                        ? (JSON.parse(activeFile.access_keys) as Record<string, unknown>) : activeFile.access_keys;
                    return Boolean(keys && typeof keys === "object" && Object.keys(keys).length > 1);
                } catch { return false; }
            })())
    );
    const loadingBox = (
        <div className="flex-1 flex flex-col items-center justify-center text-t2-ink-3 h-[50vh] mt-20">
            <span className="font-medium text-sm">Lade...</span>
        </div>
    );
    const mobileEditorElement = activeFile?.type === "canvas" ? (
        canvasNoteData === null ? loadingBox : (
            <div className="flex-1 h-full overflow-hidden">
                <CanvasNoteEditor key={activeNoteId || ""} noteId={activeNoteId || ""} initialData={canvasNoteData}
                    publicKey={publicKey} privateKey={privateKey} userId={myId}
                    onChange={(data) => { setCanvasNoteData(data); setSaveStatus("unsaved"); }} />
            </div>
        )
    ) : editorContent === null ? loadingBox : (
        <Editor key={activeTabId} isShared={isSharedMobileNote} initialContent={editorContent} dek={activeFileKey}
            keyEpoch={useActiveNoteStore.getState().keyEpoch || 1} editable={activeFile?.permission !== "view"}
            onEditorReady={handleEditorReady} onChange={handleEditorChange} onLinkClick={handleMagicLinkClick}
            onForceSave={(json) => {
                if (activeNoteId && activeFile) {
                    setSaveStatus("saving");
                    performSave(json, activeNoteId, activeFileKey, activeFile.visibility)
                        .then(() => setSaveStatus("saved")).catch(() => setSaveStatus("unsaved"));
                }
            }}
            onActiveUsersChange={(users: DashboardCollaborator[]) => {
                const currentMyId = myId || useDataStore.getState().myId;
                setActiveCollaborators(currentMyId ? users.filter((u) => u.id !== currentMyId) : []);
            }}
            userProfile={userProfile} myId={myId} onBlocksDeleted={handleBlocksDeleted}
            onPopOut={(text, anchorBlockId) => canvasSidecar.addElement({
                id: crypto.randomUUID(), type: "text-widget", anchorBlockId,
                offsetX: 24, offsetY: 0, content: text, backgroundColor: "transparent",
            } satisfies TextWidgetElement)}
            onConnectImage={(blockId) => setPendingBindBlockId(blockId)} onBlockHover={setHoveredBlockId}
            onAbortLinking={() => { if (isLinkingMode) { setIsLinkingMode(false); setActiveLinkBlockId(null); } }}
            activeTabId={activeTabId} onReturnToTab={(tabId) => setActiveTabId(tabId)} />
    );

    const desktopContentProps: DashboardDesktopContentProps = {
        isSidebarOpen, toggleSidebarCollapse, openTabs, setOpenTabs, activeTabId, setActiveTabId,
        handleTabSelect, handleTabClose, handleNewNote, switchTab, userProfile, myId, privateKey, publicKey,
        isAvatarMenuOpen, setIsAvatarMenuOpen, avatarMenuRef, navigationMode, enabledExtensions,
        setSettingsModalOpen, selectedTodoId: null, handleToggleTodos, calendarDate, handleDateSelect,
        calendarViewMode, setCalendarViewMode, filteredCalendarEvents, events, activeEventId, setActiveEventId,
        setMinimizedEventIds, calendarDropActive, setCalendarDropActive, draggedText, setDraggedText,
        handleEventCreate, handleEventUpdate, handleDeleteEvent, handleEventRename, handleEventSave,
        handleShare, handleScheduleApply, handleCreateEventGroup, files, safeFilteredFiles, handleFileSelect,
        handleCreateFolderCentral, handleMoveFileToFolder, handleUpdateFolderColor, handleDeleteNote,
        activeNoteId, isLoadingContent, noteLayout, canvasSidecar, deletedBlockIds, pendingBindBlockId,
        setPendingBindBlockId, hoveredElementId, setHoveredElementId, isLinkingMode, setIsLinkingMode,
        activeLinkBlockId, setActiveLinkBlockId, hoveredBlockId, setHoveredBlockId, editorInstance,
        editorVersion, editorContent, activeCollaborators, setActiveCollaborators, fileName, setFileName,
        saveStatus: saveStatus as SaveStatus, setSaveStatus, submitRename, showBackups, setShowBackups,
        handleRestoreBackup, setNoteSecurityModalItem, canvasNoteData, setCanvasNoteData, handleEditorReady,
        handleEditorChange, activeFileKey, performSave, handleBlocksDeleted,
        handleMagicLinkClick: (target) => {
            if (target.id) return handleMagicLinkClick({ id: target.id, type: target.type || "file", title: target.title });
        },
    };

    return (
        <TagCreateProvider create={createTagForContext}>
        <div className="flex h-[100dvh] w-full bg-[var(--background)] text-foreground overflow-hidden">
            {isMobile ? (
                <MobileLayout events={events} activeNoteId={activeNoteId} activeNoteTitle={fileName}
                    files={safeFilteredFiles.filter((f) => !f.isGroup && !(f.title || "").startsWith(".") && f.type !== "event")}
                    folders={safeFilteredFiles.filter((f) => f.type === "folder" && !f.isGroup)}
                    onNoteSelect={(id: string, title: string) => handleFileSelect(id, title)}
                    onNewNote={() => handleNewNote()}
                    onDeleteNote={(id: string) => handleDeleteNote({ stopPropagation: () => {} } as React.MouseEvent, id)}
                    onNewEvent={(date: Date, endDate?: Date, meta?: import("@/components/Layout/mobile/MobileOverlaysAndModals").NewEventMeta) =>
                        handleEventCreate(date, endDate || new Date(date.getTime() + 3_600_000), false, meta || { title: "Neuer Termin" })}
                    onEventClick={(_id: string) => {}}
                    onEventUpdate={(id: string, newStart: Date, newEnd: Date, meta?: { title?: string; color?: string; description?: string }) =>
                        meta ? handleEventSave(id, { ...meta, start: newStart.toISOString(), end: newEnd.toISOString() })
                            : handleEventUpdate(id, newStart, newEnd)}
                    onEventSave={handleEventSave} onEventDelete={(id: string) => handleDeleteEvent(id)}
                    onTaskComplete={(id: string, completed: boolean) => handleEventSave(id, { is_completed: completed })}
                    socialHubElement={<SocialHub compact={true} onOpenProfile={() => {}} userProfile={userProfile} privateKey={privateKey}
                        onOpenFile={(fileId, title) => handleFileSelect(fileId, title)}
                        onOpenCalendar={() => window.dispatchEvent(new CustomEvent("mobile_switch_calendar"))} />}
                    userProfile={userProfile} editorElement={mobileEditorElement} />
            ) : (
                <>
                    <div style={{ width: shouldShowSidebar ? `${sidebarWidth}px` : "0px" }}
                        className={`hidden md:flex flex-col h-full bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] shrink-0 z-[100] transition-[width,opacity] duration-300 ease-in-out relative ${
                            shouldShowSidebar ? "opacity-100 overflow-visible" : "opacity-0 border-r-0 pointer-events-none overflow-hidden"
                        }`}>
                        <div style={{ width: `${sidebarWidth}px` }} className="h-full flex flex-col shrink-0">
                            <Sidebar userProfile={userProfile || undefined} files={sidebarFiles} onFileSelect={handleFileSelect}
                                onNewNote={handleNewNote} onNewCanvasNote={handleNewCanvasNote} onDeleteNote={handleDeleteNote}
                                onRenameNote={handleRenameNote} onToggleVisibility={handleToggleVisibility} onShare={handleShare}
                                onOpenMessages={handleOpenMessages} onChatSelect={handleChatSelect} editingFileId={editingFileId}
                                onRenameSubmit={submitRename} onCreateFolder={handleCreateFolder} onMoveItem={handleMoveFile}
                                selectedDate={calendarDate} onDateSelect={handleDateSelect} hiddenThemeIds={hiddenThemeIds}
                                onToggleThemeVisibility={handleToggleThemeVisibility}
                                eventGroups={files.filter((f) => f.type === "folder" && f.isGroup)}
                                onCreateEventGroup={handleCreateEventGroup} onUpdateEventGroup={handleUpdateEventGroup}
                                enabledExtensions={enabledExtensions} openTabs={openTabs} activeTabId={activeTabId}
                                onTabSelect={handleTabSelect} onTabClose={handleTabClose} onTabsReorder={setOpenTabs}
                                onOpenCalendar={() => handleTabSelect("calendar", "calendar")} onOpenSocial={() => setActiveTabId("social")}
                                onOpenExams={() => handleTabSelect("job_planner", "job_planner")}
                                onOpenStudium={() => handleTabSelect("job_planner", "job_planner")}
                                onOpenTodos={handleToggleTodos} isTodosActive={activeTabId === "todos"} onToggleTodos={handleToggleTodos} />
                        </div>
                        {shouldShowSidebar && (
                            <div onMouseDown={startSidebarDrag} title="Drag to resize sidebar"
                                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-t2-sub active:bg-indigo-500/50 transition-colors z-20" />
                        )}
                    </div>
                    <DashboardDesktopContent {...desktopContentProps} />
                </>
            )}

            <DashboardModals
                shareModalFile={shareModalFile} setShareModalFile={setShareModalFile} onShare={performShare} myId={myId}
                noteSecurityModalItem={noteSecurityModalItem} setNoteSecurityModalItem={setNoteSecurityModalItem}
                onSaveSecuritySettings={handleSaveNoteSecuritySettings} isSettingsModalOpen={isSettingsModalOpen}
                setSettingsModalOpen={setSettingsModalOpen} enabledExtensions={enabledExtensions}
                onToggleExtension={handleToggleExtension} userProfile={userProfile} onLogout={handleLogout}
                noteLayout={noteLayout} onSetNoteLayout={setNoteLayout} files={files} hiddenThemeIds={hiddenThemeIds}
                onToggleThemeVisibility={handleToggleThemeVisibility} onUpdateEventGroup={handleUpdateEventGroup}
                onShareGroup={handleShare} onCreateEventGroup={handleCreateEventGroup} onDeleteNote={handleDeleteNote}
                scheduleModalOpen={scheduleModalOpen} setScheduleModalOpen={setScheduleModalOpen}
                onApplySchedule={handleScheduleApply} isSummaryOpen={isSummaryOpen} setIsSummaryOpen={setIsSummaryOpen}
                streak={0} summaryStats={SUMMARY_STATS} showBackups={showBackups} setShowBackups={setShowBackups}
                activeNoteId={activeNoteId} editorContent={editorContent as JSONContent | Record<string, unknown> | null}
                onRestoreBackup={handleRestoreBackup} deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm}
                onConfirmDelete={executeDeleteNote} deleteError={deleteError} setDeleteError={setDeleteError}
                setOpenTabs={setOpenTabs} activeTabId={activeTabId} onTabClose={handleTabClose}
                isSearching={isSearching} setIsSearching={setIsSearching}
                onSelectSearchResult={(target) => { void handleMagicLinkClick(target); }}
                privateKey={privateKey} publicKey={publicKey}
            />
        </div>
        </TagCreateProvider>
    );
}
