"use client";

import React, { useState } from 'react';
import { NoteLayout } from '@/store/slices/types';
import DashboardModals, { DashboardModalsProps, ScheduleEventData } from './DashboardModals';

export type { ScheduleEventData };

export interface GlobalModalsHostProps {
    // Share Modal
    shareModalFile?: DashboardModalsProps['shareModalFile'];
    setShareModalFile?: React.Dispatch<React.SetStateAction<DashboardModalsProps['shareModalFile']>>;
    onCloseShareModal?: () => void;
    onShare: DashboardModalsProps['onShare'];
    myId: string;
    callerPermission?: 'owner' | 'view' | 'edit' | 'share';

    // Security Settings Modal
    noteSecurityModalItem?: DashboardModalsProps['noteSecurityModalItem'];
    setNoteSecurityModalItem?: React.Dispatch<React.SetStateAction<DashboardModalsProps['noteSecurityModalItem']>>;
    onCloseSecurityModal?: () => void;
    userEmail?: string;
    onSaveSecuritySettings: DashboardModalsProps['onSaveSecuritySettings'];

    // Settings Modal
    isSettingsModalOpen?: boolean;
    setSettingsModalOpen?: React.Dispatch<React.SetStateAction<boolean>>;
    onCloseSettingsModal?: () => void;
    initialSettingsTab?: DashboardModalsProps['initialSettingsTab'];
    enabledExtensions: string[];
    onToggleExtension: (extensionId: string, enabled: boolean) => void;
    userProfile?: DashboardModalsProps['userProfile'];
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
    scheduleModalOpen?: boolean;
    setScheduleModalOpen?: React.Dispatch<React.SetStateAction<boolean>>;
    onCloseScheduleModal?: () => void;
    onApplySchedule: DashboardModalsProps['onApplySchedule'];
    existingThemes?: { id: string; title: string; effect?: string; color?: string }[];

    // Daily Summary Modal
    isSummaryOpen?: boolean;
    setIsSummaryOpen?: React.Dispatch<React.SetStateAction<boolean>>;
    onCloseSummary?: () => void;
    streak: number;
    summaryStats: { events: number; tasks: number };

    // Backup History Modal
    showBackups?: boolean;
    setShowBackups?: React.Dispatch<React.SetStateAction<boolean>>;
    activeNoteId: string | null;
    editorContent: any;
    onCancelBackups?: () => void;
    onRestoreBackup: (content: any) => void;

    // Delete Confirm Modal
    deleteConfirm?: DashboardModalsProps['deleteConfirm'];
    setDeleteConfirm?: React.Dispatch<React.SetStateAction<DashboardModalsProps['deleteConfirm']>>;
    onConfirmDelete: () => void;
    onCancelDelete?: () => void;

    // Delete Error Modal
    deleteError?: DashboardModalsProps['deleteError'];
    setDeleteError?: React.Dispatch<React.SetStateAction<DashboardModalsProps['deleteError']>>;
    onConfirmDeleteError?: () => void;
    onCancelDeleteError?: () => void;
}

export function GlobalModalsHost(props: GlobalModalsHostProps) {
    // Encapsulated modal trigger states
    const [internalShareModalFile, setInternalShareModalFile] = useState<DashboardModalsProps['shareModalFile']>(null);
    const [internalSecurityItem, setInternalSecurityItem] = useState<DashboardModalsProps['noteSecurityModalItem']>(null);
    const [internalSettingsOpen, setInternalSettingsOpen] = useState(false);
    const [internalScheduleOpen, setInternalScheduleOpen] = useState(false);
    const [internalSummaryOpen, setInternalSummaryOpen] = useState(false);
    const [internalShowBackups, setInternalShowBackups] = useState(false);
    const [internalDeleteConfirm, setInternalDeleteConfirm] = useState<DashboardModalsProps['deleteConfirm']>(null);
    const [internalDeleteError, setInternalDeleteError] = useState<DashboardModalsProps['deleteError']>(null);

    const shareModalFile = props.shareModalFile !== undefined ? props.shareModalFile : internalShareModalFile;
    const handleCloseShareModal = () => {
        props.onCloseShareModal?.();
        props.setShareModalFile?.(null);
        setInternalShareModalFile(null);
    };

    const noteSecurityModalItem = props.noteSecurityModalItem !== undefined ? props.noteSecurityModalItem : internalSecurityItem;
    const handleCloseSecurityModal = () => {
        props.onCloseSecurityModal?.();
        props.setNoteSecurityModalItem?.(null);
        setInternalSecurityItem(null);
    };

    const isSettingsModalOpen = props.isSettingsModalOpen !== undefined ? props.isSettingsModalOpen : internalSettingsOpen;
    const handleCloseSettingsModal = () => {
        props.onCloseSettingsModal?.();
        props.setSettingsModalOpen?.(false);
        setInternalSettingsOpen(false);
    };

    const scheduleModalOpen = props.scheduleModalOpen !== undefined ? props.scheduleModalOpen : internalScheduleOpen;
    const handleCloseScheduleModal = () => {
        props.onCloseScheduleModal?.();
        props.setScheduleModalOpen?.(false);
        setInternalScheduleOpen(false);
    };

    const isSummaryOpen = props.isSummaryOpen !== undefined ? props.isSummaryOpen : internalSummaryOpen;
    const handleCloseSummary = () => {
        props.onCloseSummary?.();
        props.setIsSummaryOpen?.(false);
        setInternalSummaryOpen(false);
    };

    const showBackups = props.showBackups !== undefined ? props.showBackups : internalShowBackups;
    const handleCancelBackups = () => {
        props.onCancelBackups?.();
        props.setShowBackups?.(false);
        setInternalShowBackups(false);
    };

    const deleteConfirm = props.deleteConfirm !== undefined ? props.deleteConfirm : internalDeleteConfirm;
    const handleCancelDelete = () => {
        props.onCancelDelete?.();
        props.setDeleteConfirm?.(null);
        setInternalDeleteConfirm(null);
    };

    const deleteError = props.deleteError !== undefined ? props.deleteError : internalDeleteError;
    const handleCancelDeleteError = () => {
        props.onCancelDeleteError?.();
        props.setDeleteError?.(null);
        setInternalDeleteError(null);
    };

    return (
        <DashboardModals
            shareModalFile={shareModalFile}
            onCloseShareModal={handleCloseShareModal}
            onShare={props.onShare}
            myId={props.myId}
            callerPermission={props.callerPermission}
            noteSecurityModalItem={noteSecurityModalItem}
            onCloseSecurityModal={handleCloseSecurityModal}
            userEmail={props.userEmail}
            onSaveSecuritySettings={props.onSaveSecuritySettings}
            isSettingsModalOpen={isSettingsModalOpen}
            onCloseSettingsModal={handleCloseSettingsModal}
            initialSettingsTab={props.initialSettingsTab}
            enabledExtensions={props.enabledExtensions}
            onToggleExtension={props.onToggleExtension}
            userProfile={props.userProfile}
            onLogout={props.onLogout}
            noteLayout={props.noteLayout}
            onSetNoteLayout={props.onSetNoteLayout}
            groups={props.groups}
            hiddenGroupIds={props.hiddenGroupIds}
            onToggleGroupVisibility={props.onToggleGroupVisibility}
            onUpdateGroup={props.onUpdateGroup}
            onShareGroup={props.onShareGroup}
            onDeleteGroup={props.onDeleteGroup}
            onCreateGroup={props.onCreateGroup}
            scheduleModalOpen={scheduleModalOpen}
            onCloseScheduleModal={handleCloseScheduleModal}
            onApplySchedule={props.onApplySchedule}
            existingThemes={props.existingThemes}
            isSummaryOpen={isSummaryOpen}
            onCloseSummary={handleCloseSummary}
            streak={props.streak}
            summaryStats={props.summaryStats}
            showBackups={showBackups}
            activeNoteId={props.activeNoteId}
            editorContent={props.editorContent}
            onCancelBackups={handleCancelBackups}
            onRestoreBackup={props.onRestoreBackup}
            deleteConfirm={deleteConfirm}
            onConfirmDelete={props.onConfirmDelete}
            onCancelDelete={handleCancelDelete}
            deleteError={deleteError}
            onConfirmDeleteError={props.onConfirmDeleteError || handleCancelDeleteError}
            onCancelDeleteError={handleCancelDeleteError}
        />
    );
}

export default GlobalModalsHost;
