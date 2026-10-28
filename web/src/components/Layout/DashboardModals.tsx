"use client";

import React from "react";
import ShareModal from "@/components/ShareModal";
import SecuritySettingsModal from "@/components/Security/SecuritySettingsModal";
import SettingsModal from "@/components/Settings/SettingsModal";
import { ScheduleModal, ScheduleEventData } from "@/components/Calendar/ScheduleModal";
import DailySummary from "@/components/Calendar/DailySummary";
import ConfirmModal from "@/components/Modals/ConfirmModal";
import { useDataStore } from "@/store/useDataStore";
import type { NoteLayout } from "@/store/slices/types";

export type { ScheduleEventData };

export interface DashboardModalsProps {
    // Share Modal
    shareModalFile: { id: string; title: string; type?: string; callerPermission?: 'owner' | 'view' | 'edit' | 'share' } | null;
    onCloseShareModal: () => void;
    onShare: (
        recipientId: string,
        recipientEmail: string,
        recipientPubKey: string,
        permission: 'view' | 'edit' | 'share',
        dependencyFileIds?: string[],
        canReshare?: boolean
    ) => Promise<void>;
    myId: string;
    callerPermission?: 'owner' | 'view' | 'edit' | 'share';

    // Security Settings Modal
    noteSecurityModalItem: {
        id: string;
        title: string;
        type: 'file' | 'folder' | 'canvas' | 'note';
        metadata?: any;
    } | null;
    onCloseSecurityModal: () => void;
    userEmail?: string;
    onSaveSecuritySettings: (settings: any) => Promise<void>;

    // Settings Modal
    isSettingsModalOpen: boolean;
    onCloseSettingsModal: () => void;
    initialSettingsTab?: 'account' | 'calendar' | 'extensions' | 'appearance' | 'info' | 'access';
    enabledExtensions: string[];
    onToggleExtension: (extensionId: string, enabled: boolean) => void;
    userProfile?: {
        id?: string;
        user_id?: string;
        username: string;
        email: string;
        bio?: string;
        title?: string;
        avatar_seed?: string;
        avatar_salt?: string;
        avatar_style?: string;
        is_verified?: boolean;
        profile_status?: number;
    } | null;
    onLogout?: () => void;
    noteLayout?: NoteLayout;
    onSetNoteLayout?: (layout: NoteLayout) => void;
    groups: { id: string; title: string; effect?: string; color?: string }[];
    hiddenGroupIds: string[];
    onToggleGroupVisibility: (id: string) => void;
    onUpdateGroup: (id: string, updates: any) => void;
    onShareGroup: (e: any, id: string) => void;
    onDeleteGroup: (e: any, id: string) => void;
    onCreateGroup: (title: string, color?: string, effect?: string) => Promise<string | undefined>;

    // Schedule Modal
    scheduleModalOpen: boolean;
    onCloseScheduleModal: () => void;
    onApplySchedule: (
        events: ScheduleEventData[],
        theme: string,
        options?: { color?: string; effect?: string }
    ) => Promise<void>;
    existingThemes?: { id: string; title: string; effect?: string; color?: string }[];

    // Daily Summary Modal
    isSummaryOpen: boolean;
    onCloseSummary: () => void;
    streak: number;
    summaryStats: { events: number; tasks: number };

    // Backup History Modal (optional - versions managed directly in-note)
    showBackups?: boolean;
    activeNoteId?: string | null;
    editorContent?: any;
    onCancelBackups?: () => void;
    onRestoreBackup?: (content: any) => void;

    // Delete Confirm Modal
    deleteConfirm: { isOpen?: boolean; fileId: string; isShared: boolean; isFolder: boolean } | null;
    onConfirmDelete: () => void;
    onCancelDelete: () => void;

    // Delete Error Modal
    deleteError: { fileId: string; title: string; message: string; isCorrupt: boolean } | null;
    onConfirmDeleteError: () => void;
    onCancelDeleteError: () => void;
}

export function DashboardModals({
    // Share Modal
    shareModalFile,
    onCloseShareModal,
    onShare,
    myId,
    callerPermission,

    // Security Modal
    noteSecurityModalItem,
    onCloseSecurityModal,
    userEmail,
    onSaveSecuritySettings,

    // Settings Modal
    isSettingsModalOpen,
    onCloseSettingsModal,
    initialSettingsTab,
    enabledExtensions,
    onToggleExtension,
    userProfile,
    onLogout,
    noteLayout,
    onSetNoteLayout,
    groups,
    hiddenGroupIds,
    onToggleGroupVisibility,
    onUpdateGroup,
    onShareGroup,
    onDeleteGroup,
    onCreateGroup,

    // Schedule Modal
    scheduleModalOpen,
    onCloseScheduleModal,
    onApplySchedule,
    existingThemes,

    // Daily Summary
    isSummaryOpen,
    onCloseSummary,
    streak,
    summaryStats,

    // Delete Confirm
    deleteConfirm,
    onConfirmDelete,
    onCancelDelete,

    // Delete Error
    deleteError,
    onConfirmDeleteError,
    onCancelDeleteError,
}: DashboardModalsProps) {
    return (
        <>
            {/* Share Modal */}
            {shareModalFile && (
                <ShareModal
                    fileId={shareModalFile.id}
                    fileName={shareModalFile.title}
                    onClose={onCloseShareModal}
                    onShare={onShare}
                    myId={myId}
                    callerPermission={callerPermission ?? shareModalFile.callerPermission ?? 'owner'}
                />
            )}

            {/* Note Security / PIN Settings Modal */}
            {noteSecurityModalItem && (
                <SecuritySettingsModal
                    isOpen={!!noteSecurityModalItem}
                    onClose={onCloseSecurityModal}
                    item={noteSecurityModalItem}
                    userEmail={userEmail}
                    onSaveSettings={onSaveSecuritySettings}
                />
            )}

            {/* Settings Modal */}
            <SettingsModal
                isOpen={isSettingsModalOpen}
                onClose={onCloseSettingsModal}
                initialTab={initialSettingsTab ?? useDataStore.getState().settingsModalTab}
                enabledExtensions={enabledExtensions}
                onToggleExtension={onToggleExtension}
                userProfile={userProfile || undefined}
                onLogout={onLogout}
                noteLayout={noteLayout}
                onSetNoteLayout={onSetNoteLayout}
                groups={groups}
                hiddenGroupIds={hiddenGroupIds}
                onToggleGroupVisibility={onToggleGroupVisibility}
                onUpdateGroup={onUpdateGroup}
                onShareGroup={onShareGroup}
                onDeleteGroup={onDeleteGroup}
                onCreateGroup={onCreateGroup}
            />

            {/* Schedule Modal */}
            <ScheduleModal
                isOpen={scheduleModalOpen}
                onClose={onCloseScheduleModal}
                onApply={onApplySchedule}
                existingThemes={existingThemes || groups}
            />

            {/* Daily Summary */}
            <DailySummary
                isOpen={isSummaryOpen}
                onClose={onCloseSummary}
                streak={streak}
                eventsToday={summaryStats.events}
                completedTasksToday={summaryStats.tasks}
            />

            {/* Delete Confirm Modal */}
            <ConfirmModal
                isOpen={!!deleteConfirm}
                title={deleteConfirm?.isFolder ? "Ordner löschen" : "Notiz löschen"}
                message={
                    deleteConfirm?.isShared
                        ? (deleteConfirm.isFolder ? "Möchtest du diesen geteilten Ordner wirklich verlassen?" : "Möchtest du diese geteilte Notiz wirklich verlassen?")
                        : (deleteConfirm?.isFolder ? "Möchtest du diesen Ordner und alle Inhalte wirklich löschen?" : "Möchtest du diese Notiz wirklich löschen?")
                }
                confirmText={deleteConfirm?.isShared ? "Verlassen" : "Löschen"}
                onConfirm={onConfirmDelete}
                onCancel={onCancelDelete}
            />

            {/* Delete Error Modal */}
            <ConfirmModal
                isOpen={!!deleteError}
                title={deleteError?.title || "Fehler"}
                message={deleteError?.message || ""}
                confirmText={deleteError?.isCorrupt ? "Trotzdem entfernen" : "OK"}
                cancelText={deleteError?.isCorrupt ? "Abbrechen" : undefined}
                onConfirm={onConfirmDeleteError}
                onCancel={onCancelDeleteError}
            />
        </>
    );
}

export default DashboardModals;
