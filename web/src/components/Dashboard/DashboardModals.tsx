"use client";

import React, { useMemo } from "react";
import type { JSONContent } from "@tiptap/react";
import CloudStatusBanner from "@/components/CloudStatusBanner";
import EventDragGhost from "@/components/Calendar/EventDragGhost";
import { GlobalModalsHost } from "@/components/Layout/GlobalModalsHost";
import type { ScheduleEventData } from "@/components/Calendar/ScheduleModal";
import { SearchOverlay } from "@/components/Workspaces/SearchOverlay";
import { MoodPopup } from "@/components/Surveys/MoodPopup";
import { useDataStore } from "@/store/useDataStore";
import { useJobPlannerStore } from "@/store/useJobPlannerStore";
import { apiFetch } from "@/lib/api";
import { formatMessage, getTranslation } from "@/lib/i18n";
import { isForeignOwned, removeTagFromItems } from "@/lib/tags";
import { deleteTagEverywhere } from "@/lib/deleteTag";
import type { CalendarEvent } from "@/components/Calendar/types";
import type { ItemSecuritySettings } from "@/lib/pinSecurity";
import type { NoteLayout, SettingsModalTab } from "@/store/slices/types";
import type {
    DecryptedFile,
    DeleteConfirmState,
    DeleteErrorState,
    NoteSecurityModalItem,
    ShareModalFile,
    SummaryStats,
    Tab,
    UserProfile,
} from "./types";

export interface DashboardModalsProps {
    // Share Modal
    shareModalFile: ShareModalFile | null;
    setShareModalFile: React.Dispatch<React.SetStateAction<ShareModalFile | null>>;
    onShare: (
        recipientId: string,
        recipientEmail: string,
        recipientPubKey: string,
        permission: "view" | "edit" | "share",
        dependencyFileIds?: string[],
        canReshare?: boolean
    ) => Promise<void>;
    myId: string;

    // Security Settings Modal
    noteSecurityModalItem: NoteSecurityModalItem | null;
    setNoteSecurityModalItem: React.Dispatch<React.SetStateAction<NoteSecurityModalItem | null>>;
    onSaveSecuritySettings: (settings: ItemSecuritySettings | null) => Promise<void>;

    // Settings Modal
    isSettingsModalOpen: boolean;
    setSettingsModalOpen: (open: boolean, tab?: SettingsModalTab) => void;
    enabledExtensions: string[];
    onToggleExtension: (extensionId: string, enabled: boolean) => void;
    userProfile: UserProfile | null;
    onLogout: () => void | Promise<void>;
    noteLayout: NoteLayout;
    onSetNoteLayout: (layout: NoteLayout) => void;
    files: DecryptedFile[];
    hiddenThemeIds: string[];
    onToggleThemeVisibility: (id: string) => void;
    onUpdateEventGroup: (
        id: string,
        updates: { title?: string; effect?: string; color?: string }
    ) => void | Promise<void>;
    onShareGroup: (e: React.MouseEvent, id: string) => void | Promise<void>;
    onCreateEventGroup: (
        title: string,
        color?: string,
        effect?: string
    ) => Promise<string | undefined>;
    onDeleteNote: (e: React.MouseEvent, id: string) => void | Promise<void>;
    onEventSave: (id: string, updates: { groupIds?: string[]; parent_id?: string | null }, options?: { strict?: boolean }) => Promise<void>;

    // Schedule Modal
    scheduleModalOpen: boolean;
    setScheduleModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
    onApplySchedule: (
        events: ScheduleEventData[],
        theme: string,
        options?: { color?: string; effect?: string }
    ) => Promise<void>;

    // Daily Summary Modal
    isSummaryOpen: boolean;
    setIsSummaryOpen: React.Dispatch<React.SetStateAction<boolean>>;
    streak: number;
    summaryStats: SummaryStats;

    // Backup History Modal
    showBackups: boolean;
    setShowBackups: React.Dispatch<React.SetStateAction<boolean>>;
    activeNoteId: string | null;
    editorContent: JSONContent | Record<string, unknown> | null;
    onRestoreBackup: (content: JSONContent | Record<string, unknown> | null) => void;

    // Delete Confirm & Error Modals
    deleteConfirm: DeleteConfirmState | null;
    setDeleteConfirm: React.Dispatch<React.SetStateAction<DeleteConfirmState | null>>;
    onConfirmDelete: () => void | Promise<void>;
    deleteError: DeleteErrorState | null;
    setDeleteError: React.Dispatch<React.SetStateAction<DeleteErrorState | null>>;
    setOpenTabs: React.Dispatch<React.SetStateAction<Tab[]>>;
    activeTabId: string;
    onTabClose: (e: React.MouseEvent | null, id: string) => void;

    // Search Overlay
    isSearching: boolean;
    setIsSearching: React.Dispatch<React.SetStateAction<boolean>>;
    onSelectSearchResult: (target: { id: string; type: string; title: string }) => void;
    privateKey: CryptoKey | null;
    publicKey: CryptoKey | null;
}

/**
 * Renders dashboard-level banners, drag ghosts, global modal hosts,
 * search overlay, and mood tracking popup.
 */
export function DashboardModals({
    shareModalFile,
    setShareModalFile,
    onShare,
    myId,
    noteSecurityModalItem,
    setNoteSecurityModalItem,
    onSaveSecuritySettings,
    isSettingsModalOpen,
    setSettingsModalOpen,
    enabledExtensions,
    onToggleExtension,
    userProfile,
    onLogout,
    noteLayout,
    onSetNoteLayout,
    files,
    hiddenThemeIds,
    onToggleThemeVisibility,
    onUpdateEventGroup,
    onShareGroup,
    onCreateEventGroup,
    onDeleteNote,
    onEventSave,
    scheduleModalOpen,
    setScheduleModalOpen,
    onApplySchedule,
    isSummaryOpen,
    setIsSummaryOpen,
    streak,
    summaryStats,
    showBackups,
    setShowBackups,
    activeNoteId,
    editorContent,
    onRestoreBackup,
    deleteConfirm,
    setDeleteConfirm,
    onConfirmDelete,
    deleteError,
    setDeleteError,
    setOpenTabs,
    activeTabId,
    onTabClose,
    isSearching,
    setIsSearching,
    onSelectSearchResult,
    privateKey,
    publicKey,
}: DashboardModalsProps) {
    const groups = useMemo(
        () =>
            files
                .filter((f) => f.type === "folder" && f.isGroup)
                .map((g) => ({
                    id: g.id,
                    title: g.title,
                    effect: g.effect,
                    color: g.color,
                })),
        [files]
    );

    const handleDeleteGroup = (e: React.MouseEvent, id: string) => {
        const group = files.find((f) => f.id === id);
        const isPlannerActive = enabledExtensions.includes("job_planner");
        const plannerGroupId = useJobPlannerStore.getState().pluginGroupId;
        const isProtected = isPlannerActive && Boolean(plannerGroupId && id === plannerGroupId);
        if (isProtected) {
            alert("Diese Kategorie wird vom Job & Studienplaner verwendet und kann nicht gelöscht werden.");
            return;
        }
        if (!group) return;
        e.stopPropagation();
        const store = useDataStore.getState();
        const events = store.events as unknown as CalendarEvent[];
        const isOwner = !isForeignOwned(group, myId) && (!group.share_status || group.share_status === "owner");
        const patches = isOwner
            ? removeTagFromItems(id, events, store.tasks, myId)
            : { eventPatches: [], taskPatches: [] };
        const text = (key: string, vars?: Record<string, string | number>) =>
            formatMessage(getTranslation(store.language || "de", "settings", key), vars);
        const question = `${text("cal.deleteConfirm")}

${text("cal.deleteConfirmCount", {
            events: patches.eventPatches.length,
            todos: patches.taskPatches.length,
        })}`;
        if (!confirm(question)) return;
        void deleteTagEverywhere(id, {
            events,
            tasks: store.tasks,
            myId,
            isOwner,
            saveEvent: (eventId, updates) => onEventSave(eventId, updates, { strict: true }),
            saveTask: (taskId, updates) => useDataStore.getState().updateTask(taskId, updates, { strict: true }),
            pruneViews: (tagId) => useDataStore.getState().pruneTagFromViews(tagId),
            clearFilters: (tagId) => {
                const s = useDataStore.getState();
                s.setCalendarTagFilter({ ...s.calendarTagFilter, tagIds: s.calendarTagFilter.tagIds.filter((t) => t !== tagId) });
                s.setTodoTagFilter({ ...s.todoTagFilter, tagIds: s.todoTagFilter.tagIds.filter((t) => t !== tagId) });
            },
            deleteFile: async (tagId) => {
                const res = await apiFetch(`/api/v1/files/${tagId}`, { method: "DELETE" });
                if (!res.ok && res.status !== 404) throw new Error("Backend failed to delete tag");
                const s = useDataStore.getState();
                s.setNotes(s.notes.filter((f) => f.id !== tagId));
                onTabClose(null, tagId);
            },
        }).then((result) => {
            if (!result.ok) alert(text("cal.deleteFailed"));
        });
    };

    const handleConfirmDeleteError = () => {
        if (deleteError?.isCorrupt) {
            const currentNotes = useDataStore.getState().notes;
            useDataStore.getState().setNotes(currentNotes.filter((f) => f.id !== deleteError.fileId));
            setOpenTabs((prev) => {
                const nextTabs = prev.filter((t) => t.id !== deleteError.fileId);
                localStorage.setItem("tide_open_tabs", JSON.stringify(nextTabs));
                return nextTabs;
            });
            if (activeTabId === deleteError.fileId) {
                onTabClose(null, deleteError.fileId);
            }
        }
        setDeleteError(null);
        setDeleteConfirm(null);
    };

    const handleCancelDeleteError = () => {
        setDeleteError(null);
        setDeleteConfirm(null);
    };

    return (
        <>
            <CloudStatusBanner />
            <EventDragGhost />

            <GlobalModalsHost
                shareModalFile={shareModalFile}
                setShareModalFile={setShareModalFile}
                onCloseShareModal={() => setShareModalFile(null)}
                onShare={onShare}
                myId={myId}
                noteSecurityModalItem={noteSecurityModalItem}
                setNoteSecurityModalItem={setNoteSecurityModalItem}
                onCloseSecurityModal={() => setNoteSecurityModalItem(null)}
                userEmail={userProfile?.email}
                onSaveSecuritySettings={onSaveSecuritySettings}
                isSettingsModalOpen={isSettingsModalOpen}
                setSettingsModalOpen={(val) => {
                    const next = typeof val === "function" ? val(isSettingsModalOpen) : val;
                    setSettingsModalOpen(Boolean(next));
                }}
                onCloseSettingsModal={() => setSettingsModalOpen(false)}
                enabledExtensions={enabledExtensions}
                onToggleExtension={onToggleExtension}
                userProfile={userProfile || undefined}
                onLogout={onLogout}
                noteLayout={noteLayout}
                onSetNoteLayout={onSetNoteLayout}
                groups={groups}
                hiddenGroupIds={hiddenThemeIds}
                onToggleGroupVisibility={onToggleThemeVisibility}
                onUpdateGroup={onUpdateEventGroup}
                onShareGroup={onShareGroup}
                onDeleteGroup={handleDeleteGroup}
                onCreateGroup={onCreateEventGroup}
                scheduleModalOpen={scheduleModalOpen}
                setScheduleModalOpen={setScheduleModalOpen}
                onCloseScheduleModal={() => setScheduleModalOpen(false)}
                onApplySchedule={onApplySchedule}
                existingThemes={groups}
                isSummaryOpen={isSummaryOpen}
                setIsSummaryOpen={setIsSummaryOpen}
                onCloseSummary={() => setIsSummaryOpen(false)}
                streak={streak}
                summaryStats={summaryStats}
                showBackups={showBackups}
                setShowBackups={setShowBackups}
                activeNoteId={activeNoteId}
                editorContent={editorContent}
                onCancelBackups={() => setShowBackups(false)}
                onRestoreBackup={onRestoreBackup}
                deleteConfirm={deleteConfirm}
                setDeleteConfirm={setDeleteConfirm}
                onConfirmDelete={onConfirmDelete}
                onCancelDelete={() => setDeleteConfirm(null)}
                deleteError={deleteError}
                setDeleteError={setDeleteError}
                onConfirmDeleteError={handleConfirmDeleteError}
                onCancelDeleteError={handleCancelDeleteError}
            />

            <SearchOverlay
                isOpen={isSearching}
                onClose={() => setIsSearching(false)}
                onOpen={() => setIsSearching(true)}
                onSelectResult={onSelectSearchResult}
                privateKey={privateKey}
                publicKey={publicKey}
                myId={myId}
            />

            <MoodPopup />
        </>
    );
}

export default DashboardModals;
