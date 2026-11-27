"use client";

import React, { useMemo } from "react";
import { askConfirm, notify, notifyError } from '@/lib/feedback';
import type { JSONContent } from "@tiptap/react";
import CloudStatusBanner from "@/components/CloudStatusBanner";
import StartupGraphOverlay from "@/components/Graph/StartupGraphOverlay";
import EventDragGhost from "@/components/Calendar/EventDragGhost";
import { GlobalModalsHost } from "@/components/Layout/GlobalModalsHost";
import type { ScheduleEventData } from "@/components/Calendar/ScheduleModal";
import { SearchOverlay } from "@/components/Workspaces/SearchOverlay";
import { useCalendarShareStore } from "@/store/useCalendarShareStore";
import { startGroupSync } from "@/lib/calendarShareActions";
import { useDataStore } from "@/store/useDataStore";
import { useJobPlannerStore } from "@/store/useJobPlannerStore";
import { apiFetch } from "@/lib/api";
import { formatMessage, getTranslation } from "@/lib/i18n";
import { isForeignOwned, removeTagFromItems } from "@/lib/tags";
import { deleteTagEverywhere } from "@/lib/deleteTag";
import { deleteEventsWithTag, eventIdsWithTag } from "@/lib/deleteTagEvents";
import { setNoteTags } from "@/hooks/dashboard/useNoteTags";
import type { CalendarEvent } from "@/components/Calendar/types";
import type { ItemSecuritySettings } from "@/lib/pinSecurity";
import type { NoteLayout, SettingsModalTab } from "@/store/slices/types";
import type {
    DecryptedFile,
    DeleteConfirmState,
    DeleteErrorState,
    NoteSecurityModalItem,
    ShareModalFile,
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

    const checkGroupDeletable = (id: string) => {
        const group = files.find((f) => f.id === id);
        const isPlannerActive = enabledExtensions.includes("job_planner");
        const plannerGroupId = useJobPlannerStore.getState().pluginGroupId;
        const isProtected = isPlannerActive && Boolean(plannerGroupId && id === plannerGroupId);
        if (isProtected) {
            notify("Diese Kategorie wird vom Job & Studienplaner verwendet und kann nicht gelöscht werden.");
            return null;
        }
        return group ?? null;
    };

    const runDeleteTagEverywhere = async (
        id: string,
        isOwner: boolean,
        text: (key: string, vars?: Record<string, string | number>) => string
    ) => {
        const fresh = useDataStore.getState();
        const freshEvents = fresh.events as unknown as CalendarEvent[];
        const freshNotes = fresh.notes.filter((n) => n.type !== "folder" && n.type !== "event");
        const result = await deleteTagEverywhere(id, {
            events: freshEvents,
            tasks: fresh.tasks,
            notes: freshNotes,
            saveNote: (noteId, tagIds) => setNoteTags(noteId, tagIds, { strict: true }),
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
        });
        if (!result.ok) notifyError(text("cal.deleteFailed"));
        // The calendar is gone: its share rule must not keep auto-sharing.
        else void useCalendarShareStore.getState().removeRule(id).catch(() => undefined);
    };

    const handleDeleteGroup = async (e: React.MouseEvent | null | undefined, id: string) => {
        const group = checkGroupDeletable(id);
        if (!group) return;
        e?.stopPropagation();
        const store = useDataStore.getState();
        const events = store.events as unknown as CalendarEvent[];
        const isOwner = !isForeignOwned(group, myId) && (!group.share_status || group.share_status === "owner");
        const noteItems = store.notes.filter((n) => n.type !== "folder" && n.type !== "event");
        const patches = isOwner
            ? removeTagFromItems(id, events, store.tasks, myId, noteItems)
            : { eventPatches: [], taskPatches: [] };
        const text = (key: string, vars?: Record<string, string | number>) =>
            formatMessage(getTranslation(store.language || "de", "settings", key), vars);
        // A shared calendar: say that shares already given stay (null = rules unreadable, say it too).
        const shareRules = await useCalendarShareStore.getState().freshRules(60_000);
        const shareRule = shareRules?.[id];
        const keepsSharesNote = !shareRules || shareRule ? ` ${text("calShare.deleteKeepsShares")}` : "";
        // Removing a tag changes events, todos and notes: a real question, not just an undo toast
        const ok = await askConfirm({
            title: text("cal.deleteConfirm"),
            message: text("cal.deleteConfirmCount", { events: patches.eventPatches.length, todos: patches.taskPatches.length }) + keepsSharesNote,
            confirmLabel: "Tag löschen",
            tone: "danger",
        });
        if (!ok) return;
        // Removals the user already confirmed but that did not finish: try them while the events still carry the tag.
        if (shareRule?.pendingRevoke?.length) {
            const res = await startGroupSync({ rule: shareRule, removed: [], permissionChanged: [], mode: "revoke-only" }).catch(() => null);
            if (!res || res.failed > 0) notifyError(text("calShare.deletePendingFailed"));
        }
        void runDeleteTagEverywhere(id, isOwner, text);
    };

    const handleDeleteGroupWithOptions = async (
        id: string,
        options: { deleteTodos: boolean; deleteEvents: boolean; deleteNotes: boolean }
    ) => {
        if (!options.deleteTodos && !options.deleteEvents && !options.deleteNotes) {
            await handleDeleteGroup(null, id);
            return;
        }
        const group = checkGroupDeletable(id);
        if (!group) return;
        const store = useDataStore.getState();
        const events = store.events as unknown as CalendarEvent[];
        const isOwner = !isForeignOwned(group, myId) && (!group.share_status || group.share_status === "owner");
        const noteItems = store.notes.filter((n) => n.type !== "folder" && n.type !== "event");
        const ownedTodos = isOwner ? store.tasks.filter((t) => !isForeignOwned(t, myId) && t.tags?.includes(id)) : [];
        const ownedEventIds = isOwner ? eventIdsWithTag(id, events, myId) : [];
        const ownedNotes = isOwner
            ? noteItems.filter(
                  (n) =>
                      !isForeignOwned(
                          { owner_id: typeof n.owner_id === "string" ? n.owner_id : undefined },
                          myId
                      ) && n.tagIds?.includes(id)
              )
            : [];
        const text = (key: string, vars?: Record<string, string | number>) =>
            formatMessage(getTranslation(store.language || "de", "settings", key), vars);
        const shareRules = await useCalendarShareStore.getState().freshRules(60_000);
        const shareRule = shareRules?.[id];
        const keepsSharesNote = !shareRules || shareRule ? ` ${text("calShare.deleteKeepsShares")}` : "";
        const ok = await askConfirm({
            title: text("cal.delete", { name: group.title }),
            message:
                text("tags.deleteConfirmWithItems", {
                    todos: options.deleteTodos ? ownedTodos.length : 0,
                    events: options.deleteEvents ? ownedEventIds.length : 0,
                    notes: options.deleteNotes ? ownedNotes.length : 0,
                }) + keepsSharesNote,
            confirmLabel: text("tags.deleteTagAndSelected"),
            tone: "danger",
        });
        if (!ok) return;
        if (shareRule?.pendingRevoke?.length) {
            const res = await startGroupSync({ rule: shareRule, removed: [], permissionChanged: [], mode: "revoke-only" }).catch(() => null);
            if (!res || res.failed > 0) notifyError(text("calShare.deletePendingFailed"));
        }
        if (isOwner && options.deleteEvents) {
            const { deleted, failed } = await deleteEventsWithTag(
                id,
                events,
                async (eventId) => {
                    const res = await apiFetch(`/api/v1/files/${encodeURIComponent(eventId)}`, { method: "DELETE" });
                    return res.ok || res.status === 404;
                },
                myId
            );
            if (deleted.length > 0) {
                const gone = new Set(deleted);
                const latest = useDataStore.getState();
                latest.setEvents(latest.events.filter((ev) => !gone.has(ev.id)));
            }
            if (failed.length > 0) notifyError(text("cal.deleteEventsFailed", { count: failed.length }));
        }
        if (isOwner && options.deleteTodos) {
            for (const todo of ownedTodos) {
                await useDataStore.getState().deleteTask(todo.id);
            }
        }
        if (isOwner && options.deleteNotes) {
            for (const note of ownedNotes) {
                const res = await apiFetch(`/api/v1/files/${encodeURIComponent(note.id)}`, { method: "DELETE" });
                if (res.ok || res.status === 404) {
                    const latest = useDataStore.getState();
                    latest.setNotes(latest.notes.filter((f) => f.id !== note.id));
                    onTabClose(null, note.id);
                }
            }
        }
        await runDeleteTagEverywhere(id, isOwner, text);
    };

    const handleDeleteGroupEvents = (id: string) => {
        const store = useDataStore.getState();
        const text = (key: string, vars?: Record<string, string | number>) =>
            formatMessage(getTranslation(store.language || "de", "settings", key), vars);
        const events = store.events as unknown as CalendarEvent[];
        const count = eventIdsWithTag(id, events, myId).length;
        if (count === 0) {
            notify(text("cal.deleteEventsNone"));
            return;
        }
        void deleteEventsWithTag(id, events, async (eventId) => {
            const res = await apiFetch(`/api/v1/files/${eventId}`, { method: "DELETE" });
            return res.ok || res.status === 404;
        }, myId).then(({ deleted, failed }) => {
            const latest = useDataStore.getState();
            const gone = new Set(deleted);
            const removed = events.filter((e) => gone.has(e.id));
            latest.setEvents(latest.events.filter((e) => !gone.has(e.id)));
            if (failed.length > 0) notifyError(text("cal.deleteEventsFailed", { count: failed.length }));
            if (deleted.length > 0) {
                notify(`${deleted.length} Termine gelöscht`, {
                    tone: "success",
                    duration: 12000,
                    action: {
                        label: "Rückgängig",
                        onClick: async () => {
                            const restored = new Set<string>();
                            for (const eventId of deleted) {
                                const res = await apiFetch(`/api/v1/files/${eventId}/restore`, { method: "POST" });
                                if (res.ok) restored.add(eventId);
                            }
                            const now = useDataStore.getState();
                            const have = new Set(now.events.map((e) => e.id));
                            now.setEvents([...now.events, ...(removed.filter((e) => restored.has(e.id) && !have.has(e.id)) as unknown as typeof now.events)]);
                            if (restored.size < deleted.length) notifyError("Nicht alle Termine konnten wiederhergestellt werden");
                        },
                    },
                });
            }
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
            <StartupGraphOverlay />

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
                onDeleteGroupWithOptions={handleDeleteGroupWithOptions}
                onDeleteGroupEvents={handleDeleteGroupEvents}
                onCreateGroup={onCreateEventGroup}
                scheduleModalOpen={scheduleModalOpen}
                setScheduleModalOpen={setScheduleModalOpen}
                onCloseScheduleModal={() => setScheduleModalOpen(false)}
                onApplySchedule={onApplySchedule}
                existingThemes={groups}
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

        </>
    );
}

export default DashboardModals;
