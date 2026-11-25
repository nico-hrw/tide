"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { JSONContent } from "@tiptap/react";
import TabList from "@/components/Layout/TabList";
import CalendarView from "@/components/Calendar/CalendarView";
import type { CalendarViewProps } from "@/components/Calendar/types";
import type { ScheduleEventData } from "@/components/Calendar/ScheduleModal";
import { CentralFolderView } from "@/components/Workspaces/CentralFolderView";
import { CanvasWorkspace } from "@/components/Workspaces/CanvasWorkspace";
import type { UseStyleFileReturn } from "@/components/Canvas/useStyleFile";
import { clearAllSessionData } from "@/lib/api";
import type { NavigationMode, NoteLayout, SettingsModalTab } from "@/store/slices/types";
import type {
    CalendarEvent,
    CalendarViewMode,
    DecryptedFile,
    NoteSecurityModalItem,
    SaveStatus,
    Tab,
    UserProfile,
} from "./types";

const ProfilePage = dynamic(() => import("@/components/Profile/ProfilePage"), { ssr: false });
const SocialHub = dynamic(() => import("@/components/Social/SocialHub"), { ssr: false });
const JobsWorkspace = dynamic(
    () => import("@/components/Workspaces/JobsWorkspace").then((m) => m.JobsWorkspace),
    { ssr: false }
);
const TodoList = dynamic(() => import("@/components/Todo/TodoList").then((m) => m.TodoList), {
    ssr: false,
});
const TrashPanel = dynamic(() => import("@/components/TrashPanel"), { ssr: false });

export interface DashboardCollaborator {
    id?: string;
    user_id?: string;
    username?: string;
    color?: string;
    [key: string]: unknown;
}

export interface DashboardMagicLinkTarget {
    id?: string;
    title?: string;
    type?: string;
    [key: string]: unknown;
}

export interface DashboardDesktopContentProps {
    // Sidebar & Tab Bar
    isSidebarOpen: boolean;
    toggleSidebarCollapse: () => void;
    openTabs: Tab[];
    setOpenTabs: React.Dispatch<React.SetStateAction<Tab[]>>;
    activeTabId: string;
    setActiveTabId: (tabId: string) => void;
    handleTabSelect: (id: string, type: Tab["type"]) => void;
    handleTabClose: (e: React.MouseEvent | null, id: string) => void;
    handleNewNote: (parentIdOverride?: string | null) => Promise<void> | void;
    switchTab: (newId: string, type: string, forcedTitle?: string) => Promise<void> | void;

    // User & Avatar Menu
    userProfile: UserProfile | null;
    myId: string;
    privateKey: CryptoKey | null;
    publicKey: CryptoKey | null;
    isAvatarMenuOpen: boolean;
    setIsAvatarMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
    avatarMenuRef: React.RefObject<HTMLDivElement | null>;

    // Navigation & Settings
    navigationMode: NavigationMode;
    enabledExtensions: string[];
    setSettingsModalOpen: (open: boolean, tab?: SettingsModalTab) => void;
    selectedTodoId: string | null;
    handleToggleTodos: () => void;

    // Calendar & Text->Calendar Drop
    calendarDate: Date;
    handleDateSelect: (date: Date) => void;
    calendarViewMode: CalendarViewMode;
    setCalendarViewMode: (mode: CalendarViewMode) => void;
    filteredCalendarEvents: CalendarEvent[];
    events: CalendarEvent[];
    activeEventId: string | null;
    setActiveEventId: (id: string | null) => void;
    setMinimizedEventIds: React.Dispatch<React.SetStateAction<string[]>>;
    calendarDropActive: boolean;
    setCalendarDropActive: (active: boolean) => void;
    draggedText: string | null;
    setDraggedText: (text: string | null) => void;
    handleEventCreate: (
        start: Date,
        end: Date,
        isAllDay?: boolean,
        extraMeta?: Record<string, unknown>
    ) => Promise<string | null>;
    handleEventUpdate: (id: string, start: Date, end: Date) => Promise<void>;
    handleDeleteEvent: (id: string) => Promise<void>;
    handleEventRename: (id: string, newTitle: string) => Promise<void>;
    handleEventSave: NonNullable<CalendarViewProps["onEventSave"]>;
    handleShare: (e: React.MouseEvent, id: string) => Promise<void> | void;
    handleScheduleApply: (
        schedEvents: ScheduleEventData[],
        themeIdOrName: string,
        options?: { color?: string; effect?: string }
    ) => Promise<void>;
    handleCreateEventGroup: (
        forcedTitle?: string,
        forcedColor?: string,
        forcedEffect?: string
    ) => Promise<string | undefined>;

    // Files & Folders
    files: DecryptedFile[];
    safeFilteredFiles: DecryptedFile[];
    handleFileSelect: (fileId: string, title: string, fileData?: DecryptedFile) => Promise<void> | void;
    handleCreateFolderCentral: (
        name: string,
        color?: string,
        parentId?: string | null
    ) => Promise<void> | void;
    handleMoveFileToFolder: (fileId: string, targetFolderId: string | null) => Promise<void> | void;
    handleUpdateFolderColor: (folderId: string, color: string) => Promise<void> | void;
    handleDeleteNote: (e: React.MouseEvent, fileId: string) => Promise<void> | void;

    // Canvas & Note Editor Workspace
    activeNoteId: string | null;
    isLoadingContent: boolean;
    noteLayout: NoteLayout;
    canvasSidecar: UseStyleFileReturn;
    deletedBlockIds: string[];
    pendingBindBlockId: string | null;
    setPendingBindBlockId: (id: string | null) => void;
    hoveredElementId: string | null;
    setHoveredElementId: (id: string | null) => void;
    isLinkingMode: boolean;
    setIsLinkingMode: (linking: boolean) => void;
    activeLinkBlockId: string | null;
    setActiveLinkBlockId: (id: string | null) => void;
    hoveredBlockId: string | null;
    setHoveredBlockId: (id: string | null) => void;
    editorInstance: unknown;
    editorVersion: number;
    editorContent: unknown;
    activeCollaborators: DashboardCollaborator[];
    setActiveCollaborators: (users: DashboardCollaborator[]) => void;
    fileName: string;
    setFileName: (name: string) => void;
    saveStatus: SaveStatus;
    setSaveStatus: (status: SaveStatus) => void;
    submitRename: (id: string, newTitle: string, force?: boolean) => Promise<void> | void;
    showBackups: boolean;
    setShowBackups: (show: boolean) => void;
    handleRestoreBackup: (content: JSONContent | Record<string, unknown> | null) => void;
    setNoteSecurityModalItem: (item: NoteSecurityModalItem | null) => void;
    canvasNoteData: unknown;
    setCanvasNoteData: (data: unknown) => void;
    handleEditorReady: (editor: unknown) => void;
    handleEditorChange: (content: unknown, yjsUpdateBase64?: string) => void;
    handleMagicLinkClick: (target: DashboardMagicLinkTarget) => Promise<void> | void;
    activeFileKey: CryptoKey | null;
    performSave: (
        content: unknown,
        fileId: string,
        fileKey?: CryptoKey | null,
        visibility?: string
    ) => Promise<unknown>;
    handleBlocksDeleted: (blockIds: string[]) => void;
}

export function DashboardDesktopContent(props: DashboardDesktopContentProps) {
    const {
        isSidebarOpen, toggleSidebarCollapse, openTabs, setOpenTabs, activeTabId, setActiveTabId,
        handleTabSelect, handleTabClose, handleNewNote, switchTab, userProfile, myId, privateKey,
        publicKey, isAvatarMenuOpen, setIsAvatarMenuOpen, avatarMenuRef, navigationMode,
        enabledExtensions, setSettingsModalOpen, selectedTodoId, handleToggleTodos, calendarDate,
        handleDateSelect, calendarViewMode, setCalendarViewMode, filteredCalendarEvents, events,
        activeEventId, setActiveEventId, setMinimizedEventIds, calendarDropActive,
        setCalendarDropActive, draggedText, setDraggedText, handleEventCreate, handleEventUpdate,
        handleDeleteEvent, handleEventRename, handleEventSave, handleShare, handleScheduleApply,
        handleCreateEventGroup, files, safeFilteredFiles, handleFileSelect,
        handleCreateFolderCentral, handleMoveFileToFolder, handleUpdateFolderColor,
        handleDeleteNote, activeNoteId, isLoadingContent, noteLayout, canvasSidecar,
        deletedBlockIds, pendingBindBlockId, setPendingBindBlockId, hoveredElementId,
        setHoveredElementId, isLinkingMode, setIsLinkingMode, activeLinkBlockId,
        setActiveLinkBlockId, hoveredBlockId, setHoveredBlockId, editorInstance, editorVersion,
        editorContent, activeCollaborators, setActiveCollaborators, fileName, setFileName,
        saveStatus, setSaveStatus, submitRename, showBackups, setShowBackups, handleRestoreBackup,
        setNoteSecurityModalItem, canvasNoteData, setCanvasNoteData, handleEditorReady,
        handleEditorChange, handleMagicLinkClick, activeFileKey, performSave, handleBlocksDeleted,
    } = props;

    const isCentralFoldersVisible =
        activeTabId === "folders" ||
        (navigationMode === "folders" &&
            !activeNoteId &&
            activeTabId !== "calendar" &&
            activeTabId !== "todos" &&
            activeTabId !== "social" &&
            activeTabId !== "job_planner" &&
            activeTabId !== "trash" &&
            !activeTabId.startsWith("profile:") &&
            !activeTabId.startsWith("chat-"));

    return (
        <div className="hidden md:flex flex-1 flex-col min-w-0 bg-[var(--background)] relative overflow-hidden">
            {/* Horizontal Browser Tab Bar */}
            <TabList
                isSidebarOpen={isSidebarOpen}
                onToggleSidebar={toggleSidebarCollapse}
                tabs={openTabs}
                activeTabId={activeTabId}
                onTabSelect={handleTabSelect}
                onTabClose={handleTabClose}
                onTabsReorder={setOpenTabs}
                onNewTab={() => handleNewNote()}
                onOpenFolders={() => switchTab("folders", "folders", "Notizen")}
                userProfile={userProfile}
                myId={myId}
                isAvatarMenuOpen={isAvatarMenuOpen}
                setIsAvatarMenuOpen={setIsAvatarMenuOpen}
                avatarMenuRef={avatarMenuRef}
                onOpenSocial={() => setActiveTabId("social")}
                onOpenSettings={() => setSettingsModalOpen(true)}
                onOpenTrash={() => setActiveTabId("trash")}
                onLogout={async () => {
                    setIsAvatarMenuOpen(false);
                    await clearAllSessionData({ callServerLogout: true });
                    window.location.reload();
                }}
            />

            {/* Main Workspace Body */}
            <div className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
                <div
                    className={`absolute inset-0 z-10 bg-[var(--background)] transition-opacity duration-200 ${activeTabId === "calendar" ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
                    onDragOver={(e) => {
                        if (calendarDropActive) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "copy";
                        }
                    }}
                    onDrop={(e) => {
                        if (!calendarDropActive) return;
                        e.preventDefault();
                        setCalendarDropActive(false);
                        const text = e.dataTransfer.getData("tide/text-to-calendar") || draggedText || "";
                        if (!text) return;
                        // Create event 1h from now with text as description
                        const start = new Date();
                        start.setMinutes(0, 0, 0);
                        start.setHours(start.getHours() + 1);
                        const end = new Date(start.getTime() + 60 * 60 * 1000);
                        handleEventCreate(start, end, false, { description: text, title: text.slice(0, 60) });
                        setDraggedText(null);
                    }}
                >
                    {/* Glowing "drop here" overlay when text is being dragged */}
                    {calendarDropActive && activeTabId === "calendar" && (
                        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.12) 100%)", border: "3px dashed rgba(99,102,241,0.5)", borderRadius: "12px", backdropFilter: "blur(2px)", animation: "calDropPulse 1.5s ease-in-out infinite" }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "24px 40px", borderRadius: "16px", background: "rgba(255,255,255,0.85)", boxShadow: "0 8px 40px rgba(99,102,241,0.25)", backdropFilter: "blur(8px)" }}>
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                    <line x1="12" y1="14" x2="12" y2="18" /><line x1="10" y1="16" x2="14" y2="16" />
                                </svg>
                                <div style={{ fontSize: "15px", fontWeight: 700, color: "#6366f1" }}>Drop to create event</div>
                                <div style={{ fontSize: "12px", color: "#94a3b8", maxWidth: "200px", textAlign: "center" }}>Your selected text will become the event description</div>
                            </div>
                        </div>
                    )}
                    <style>{`
                        @keyframes calDropPulse {
                            0%, 100% { border-color: rgba(99,102,241,0.4); box-shadow: 0 0 0 0 rgba(99,102,241,0.1); }
                            50% { border-color: rgba(99,102,241,0.8); box-shadow: 0 0 0 12px rgba(99,102,241,0.05); }
                        }
                    `}</style>
                    <CalendarView
                        events={filteredCalendarEvents}
                        viewMode={calendarViewMode}
                        onViewModeChange={setCalendarViewMode}
                        onEventCreate={handleEventCreate}
                        onEventUpdate={handleEventUpdate}
                        onEventDelete={handleDeleteEvent}
                        onEventRename={handleEventRename}
                        onEventSave={handleEventSave}
                        onEventClick={(id) => {
                            if (!id) return;
                            setActiveEventId(id);
                            setMinimizedEventIds((prev) => prev.filter((mId) => mId !== id));
                        }}
                        onEventShare={(e, id) => handleShare(e, id)}
                        editingEventId={activeEventId}
                        date={calendarDate}
                        onDateChange={handleDateSelect}
                        themes={files?.filter((f) => f.type === "folder" && f.isGroup).map((g) => ({ id: g.id, title: g.title, effect: g.effect, color: g.color }))}
                        onScheduleApply={handleScheduleApply}
                    />
                </div>

                <div className={`absolute inset-0 z-10 bg-[var(--background)] overflow-y-auto ${activeTabId.startsWith("profile:") ? "block" : "hidden"}`}>
                    {activeTabId.startsWith("profile:") && (
                        <ProfilePage
                            userId={activeTabId.split(":")[1]}
                            onOpenFile={(fileId, title) => switchTab(fileId, "file", title)}
                            onMessage={() => setActiveTabId("social")}
                        />
                    )}
                </div>

                <div className={`absolute inset-0 z-10 bg-[var(--background)] overflow-y-auto ${activeTabId === "social" ? "block" : "hidden"}`}>
                    {activeTabId === "social" && (
                        <SocialHub
                            onOpenProfile={(userId, username) => switchTab(`profile:${userId}`, "profile", username)}
                            onOpenFile={(fileId, title) => switchTab(fileId, "file", title)}
                            onOpenCalendar={() => switchTab("calendar", "calendar")}
                            userProfile={userProfile}
                            privateKey={privateKey}
                        />
                    )}
                </div>

                <JobsWorkspace
                    isActive={activeTabId === "job_planner" || activeTabId === "exams"}
                    onCreateGroup={handleCreateEventGroup}
                    onOpenCalendar={() => handleTabSelect("calendar", "calendar")}
                    onOpenSettings={(tab?: SettingsModalTab) => setSettingsModalOpen(true, tab || "extensions")}
                />

                <div className={`absolute inset-0 z-10 bg-t2-sub overflow-y-auto ${activeTabId === "todos" ? "block" : "hidden"}`}>
                    {activeTabId === "todos" && (!enabledExtensions || enabledExtensions.includes("todos")) && (
                        <TodoList variant="desktop" initialTaskId={selectedTodoId} onCreateTag={(title) => handleCreateEventGroup(title)} />
                    )}
                </div>

                <div className={`absolute inset-0 z-10 bg-[var(--background)] overflow-y-auto ${activeTabId === "trash" ? "block" : "hidden"}`}>
                    {activeTabId === "trash" && <TrashPanel />}
                </div>

                {/* Central Folder View for iPad / Tablet and Folders Tab */}
                <div className={`absolute inset-0 z-10 bg-[var(--background)] overflow-y-auto ${isCentralFoldersVisible ? "block" : "hidden"}`}>
                    {isCentralFoldersVisible && (
                        <CentralFolderView
                            files={safeFilteredFiles}
                            events={events}
                            onEventClick={(id) => {
                                const ev = events.find((e) => e.id === id);
                                handleDateSelect(ev?.start ? new Date(ev.start) : new Date());
                            }}
                            onFileSelect={(id, title) => handleFileSelect(id, title)}
                            onCreateFolder={handleCreateFolderCentral}
                            onCreateNote={(folderId) => handleNewNote(folderId)}
                            onMoveFile={handleMoveFileToFolder}
                            onUpdateFolderColor={handleUpdateFolderColor}
                            onDeleteFile={(id) => handleDeleteNote({ stopPropagation: () => {} } as React.MouseEvent, id)}
                            onOpenTodos={() => handleToggleTodos()}
                        />
                    )}
                </div>

                <CanvasWorkspace
                    activeTabId={activeTabId}
                    isLoadingContent={isLoadingContent}
                    noteLayout={noteLayout}
                    canvasSidecar={canvasSidecar}
                    publicKey={publicKey}
                    privateKey={privateKey}
                    myId={myId}
                    activeNoteId={activeNoteId}
                    deletedBlockIds={deletedBlockIds}
                    pendingBindBlockId={pendingBindBlockId}
                    setPendingBindBlockId={setPendingBindBlockId}
                    hoveredElementId={hoveredElementId}
                    setHoveredElementId={setHoveredElementId}
                    isLinkingMode={isLinkingMode}
                    setIsLinkingMode={setIsLinkingMode}
                    activeLinkBlockId={activeLinkBlockId}
                    setActiveLinkBlockId={setActiveLinkBlockId}
                    hoveredBlockId={hoveredBlockId}
                    setHoveredBlockId={setHoveredBlockId}
                    editorInstance={editorInstance}
                    editorVersion={editorVersion}
                    openTabs={openTabs}
                    setOpenTabs={setOpenTabs}
                    files={files}
                    editorContent={editorContent}
                    handleFileSelect={handleFileSelect}
                    activeCollaborators={activeCollaborators}
                    setActiveCollaborators={setActiveCollaborators}
                    fileName={fileName}
                    setFileName={setFileName}
                    saveStatus={saveStatus}
                    setSaveStatus={setSaveStatus}
                    submitRename={submitRename}
                    setShowBackups={setShowBackups}
                    showBackups={showBackups}
                    onRestoreBackup={handleRestoreBackup}
                    handleShare={(e: React.MouseEvent, id?: string) => { if (id) handleShare(e, id); }}
                    setNoteSecurityModalItem={setNoteSecurityModalItem}
                    handleDeleteNote={handleDeleteNote}
                    canvasNoteData={canvasNoteData}
                    setCanvasNoteData={setCanvasNoteData}
                    handleEditorReady={handleEditorReady}
                    handleEditorChange={handleEditorChange}
                    handleMagicLinkClick={handleMagicLinkClick}
                    activeFileKey={activeFileKey}
                    performSave={performSave}
                    handleBlocksDeleted={handleBlocksDeleted}
                    setActiveTabId={setActiveTabId}
                    userProfile={userProfile}
                />
            </div>
        </div>
    );
}

export default DashboardDesktopContent;
