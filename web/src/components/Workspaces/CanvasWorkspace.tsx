"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { GraduationCap, Copy, Download, MoreHorizontal, UploadCloud, Share2, Sigma } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useDataStore } from '@/store/useDataStore';
import { useActiveNoteStore } from '@/store/activeNoteStore';
import { getTranslation } from '@/lib/i18n';
import { tipTapToMarkdown } from '@/lib/bundleImportExport';
import Avatar from '@/components/Profile/Avatar';
import EditorGutter from '@/components/Canvas/EditorGutter';
import SaveStatusMenu from '@/components/Editor/SaveStatusMenu';
import ShareManagementPanel from '@/components/ShareManagementPanel';
import type { TextWidgetElement } from '@/types/canvas';
import type { JSONContent } from '@tiptap/react';
import { getPlainTextFromJSON } from '@/lib/diff';
import { useNoteBackups } from '@/hooks/useNoteBackups';
import SaveStateIcon from '@/components/Editor/SaveStateIcon';
import NoteOutline from '@/components/Editor/NoteOutline';
import NoteHistoryLabel from '@/components/Editor/NoteHistoryLabel';
import NoteHeaderActions from '@/components/Workspaces/NoteHeaderActions';
import NoteHistoryTimeline from '@/components/Editor/NoteHistoryTimeline';
import NoteBreadcrumb from '@/components/Editor/NoteBreadcrumb';
import NoteVersionDiffView from '@/components/Editor/NoteVersionDiffView';
import NoteSettingsMenuComponent from './NoteSettingsMenu';
import { useVarSheetBindings } from '@/components/VarSheet/useVarSheetBindings';
const NoteSettingsMenu = NoteSettingsMenuComponent as React.ComponentType<any>;

const Editor = dynamic(() => import('@/components/Editor'), {
    ssr: false,
    loading: () => <div className="min-h-[500px] w-full animate-pulse bg-t2-sub  rounded-lg" />
});
const CanvasLayer = dynamic(() => import('@/components/Canvas/CanvasLayer'), { ssr: false });
const CanvasNoteEditor = dynamic(() => import('@/components/Canvas/CanvasNoteEditor'), { ssr: false });
const VarSheetDock = dynamic(() => import('@/components/VarSheet').then(m => m.VarSheetDock), { ssr: false });

export interface CanvasWorkspaceProps {
    activeTabId: string;
    isActive?: boolean;
    isLoadingContent: boolean;
    noteLayout?: 'thin' | 'normal' | 'wide' | 'extra-wide' | string;
    canvasSidecar: {
        elements: any[];
        isLoaded: boolean;
        updateElement: (id: string, updates: any) => Promise<void> | void;
        addElement: (element: any) => Promise<void> | void;
        removeElement: (id: string) => Promise<void> | void;
        save: (elements?: any) => Promise<void> | void;
    };
    publicKey: any;
    privateKey: any;
    myId: string;
    activeNoteId: string | null;
    deletedBlockIds?: string[] | Set<string>;
    pendingBindBlockId: string | null;
    setPendingBindBlockId: (id: string | null) => void;
    hoveredElementId?: string | null;
    setHoveredElementId?: (id: string | null) => void;
    isLinkingMode?: boolean;
    setIsLinkingMode?: (linking: boolean) => void;
    activeLinkBlockId?: string | null;
    setActiveLinkBlockId?: (id: string | null) => void;
    hoveredBlockId?: string | null;
    setHoveredBlockId?: (id: string | null) => void;
    editorInstance: any;
    editorVersion: number;
    openTabs: Array<{ id: string; title: string; type?: string; [key: string]: any }>;
    setOpenTabs?: React.Dispatch<React.SetStateAction<any[]>>;
    files: Array<{ id: string; title: string; type?: string; [key: string]: any }>;
    editorContent: any;
    handleFileSelect: (id: string, title: string) => void;
    activeCollaborators: any[];
    setActiveCollaborators: (users: any[]) => void;
    fileName: string;
    setFileName: (name: string) => void;
    saveStatus: 'unsaved' | 'saving' | 'saved';
    setSaveStatus: (status: 'unsaved' | 'saving' | 'saved') => void;
    submitRename: (id: string, newTitle: string, force?: boolean) => void;
    setShowBackups: (show: boolean) => void;
    showBackups?: boolean;
    onRestoreBackup?: (content: JSONContent | Record<string, unknown> | null) => void;
    handleShare: (e: any, id?: string) => void;
    setNoteSecurityModalItem: (item: any) => void;
    handleDeleteNote: (e: any, id: string) => void;
    canvasNoteData: any;
    setCanvasNoteData: (data: any) => void;
    handleEditorReady: (editor: any) => void;
    handleEditorChange: (content: any) => void;
    handleMagicLinkClick: (linkData: any) => void;
    activeFileKey: any;
    performSave: (json: any, id: string, key: any, visibility: any) => Promise<any>;
    handleBlocksDeleted: (blockIds: string[]) => void;
    setActiveTabId: (tabId: string) => void;
    userProfile: any;
}

const isSharedFile = (f: any, myId: string) => Boolean(f && (
    f.isShared || (f.owner_id && f.owner_id !== myId) || (f.share_status && f.share_status !== 'owner') ||
    (() => { try { const k = typeof f.access_keys === 'string' ? JSON.parse(f.access_keys) : f.access_keys; return k && typeof k === 'object' && Object.keys(k).length > 1; } catch { return false; } })()
));

const NON_EDITOR_TABS = new Set(['calendar', 'todos', 'messages', 'social', 'job_planner', 'exams', 'trash', 'folders', 'ext_finance']);

export function CanvasWorkspace(props: CanvasWorkspaceProps) {
    const {
        activeTabId, isActive, isLoadingContent, noteLayout, canvasSidecar, publicKey, privateKey,
        myId, activeNoteId, deletedBlockIds, pendingBindBlockId, setPendingBindBlockId, editorInstance,
        editorVersion, openTabs, setOpenTabs, files, editorContent, handleFileSelect, activeCollaborators,
        setActiveCollaborators, fileName, setFileName, saveStatus, setSaveStatus, submitRename, setShowBackups,
        handleShare, setNoteSecurityModalItem, handleDeleteNote, canvasNoteData, setCanvasNoteData,
        handleEditorReady, handleEditorChange, handleMagicLinkClick, activeFileKey, performSave,
        handleBlocksDeleted, setActiveTabId, userProfile,
        showBackups, onRestoreBackup,
    } = props;

    const enabledExtensions = useDataStore((s) => s.enabledExtensions);
    const isVarSheetEnabled = enabledExtensions.includes('varsheet');

    // The version timeline belongs to one note. It is open only for the note it was opened on,
    // so switching notes never carries it along.
    const [historyNoteId, setHistoryNoteId] = useState<string | null>(null);
    const isHistoryMode = !!activeNoteId && historyNoteId === activeNoteId;
    // VarSheet dock belongs to one note, and is only active when the varsheet extension is enabled.
    const [varSheetNoteId, setVarSheetNoteId] = useState<string | null>(null);
    const isVarSheetOpen = isVarSheetEnabled && !!activeNoteId && varSheetNoteId === activeNoteId;
    // The note's formulas read the VarSheet's variables, whether or not the panel is open.
    useVarSheetBindings(activeNoteId, isVarSheetEnabled);
    // Timeline open = isHistoryMode; the old-version preview (replaces the editor) = isViewingVersion
    const [isViewingVersion, setIsViewingVersion] = useState<boolean>(false);
    const [isDraggingEditorFile, setIsDraggingEditorFile] = useState(false);
    const [liveEditorContent, setLiveEditorContent] = useState<any>(editorContent);

    useEffect(() => {
        setLiveEditorContent(editorContent);
    }, [activeNoteId]);

    const captureLiveContent = useCallback(() => {
        let latest: any = null;
        try {
            const inst = editorInstance || (typeof window !== 'undefined' ? (window as any).__tideEditor : null);
            if (inst && !inst.isDestroyed && typeof inst.getJSON === 'function') {
                latest = inst.getJSON();
            }
        } catch (e) {
            console.warn('[CanvasWorkspace] Could not capture live editor content', e);
        }
        if (!latest || (latest.type === 'doc' && (!latest.content || latest.content.length === 0))) {
            if (editorContent && editorContent.content && editorContent.content.length > 0) {
                latest = editorContent;
            }
        }
        const finalContent = latest || editorContent;
        setLiveEditorContent(finalContent);
        return finalContent;
    }, [editorInstance, editorContent]);

    const effectiveCurrentContent = useMemo(() => {
        if (liveEditorContent) {
            const text = getPlainTextFromJSON(liveEditorContent);
            if (text.trim().length > 0) return liveEditorContent;
        }
        try {
            const inst = editorInstance || (typeof window !== 'undefined' ? (window as any).__tideEditor : null);
            if (inst && !inst.isDestroyed && typeof inst.getJSON === 'function') {
                const json = inst.getJSON();
                if (json) {
                    const text = getPlainTextFromJSON(json);
                    if (text.trim().length > 0) return json;
                }
            }
        } catch (_) {}
        if (editorContent) {
            const text = getPlainTextFromJSON(editorContent);
            if (text.trim().length > 0) return editorContent;
        }
        try {
            const inst = editorInstance || (typeof window !== 'undefined' ? (window as any).__tideEditor : null);
            if (inst && !inst.isDestroyed && typeof inst.getJSON === 'function') {
                const json = inst.getJSON();
                if (json) return json;
            }
        } catch (_) {}
        return liveEditorContent || editorContent;
    }, [liveEditorContent, editorInstance, editorContent]);

    const handleToggleHistory = useCallback(() => {
        const next = !isHistoryMode;
        if (next) {
            captureLiveContent();
            setVarSheetNoteId(null);
        }
        if (!next) { setIsViewingVersion(false); setActiveIndex(0); }
        setHistoryNoteId(next ? (activeNoteId ?? null) : null);
        setShowBackups?.(next);
    }, [isHistoryMode, captureLiveContent, setShowBackups, activeNoteId]);

    const handleToggleVarSheet = useCallback(() => {
        const next = !isVarSheetOpen;
        if (next) {
            setHistoryNoteId(null);
            setIsViewingVersion(false);
            setShowBackups?.(false);
        }
        setVarSheetNoteId(next ? (activeNoteId ?? null) : null);
    }, [isVarSheetOpen, activeNoteId, setShowBackups]);

    const handleCloseVarSheet = useCallback(() => {
        setVarSheetNoteId(null);
    }, []);

    // Notes switch the timeline off on their own; the viewed version belongs to the note it was opened on.
    useEffect(() => {
        setIsViewingVersion(false);
        setActiveIndex(0);
    }, [activeNoteId]);

    const handleEditorReadyWrapper = useCallback((editor: any) => {
        handleEditorReady(editor);
        try {
            if (editor && typeof editor.getJSON === 'function') {
                const json = editor.getJSON();
                if (json) {
                    setLiveEditorContent(json);
                }
            }
        } catch (_) {}
    }, [handleEditorReady]);

    const handleEditorChangeWrapper = useCallback((content: any) => {
        setLiveEditorContent(content);
        handleEditorChange(content);
    }, [handleEditorChange]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!activeNoteId) {
            (window as any).__tide_active_attachments = [];
            return;
        }
        const noteAttachments = files
            .filter(f => (f.parent_file_id === activeNoteId || f.parent_id === activeNoteId) && f.id !== activeNoteId)
            .map(f => ({
                id: f.id,
                name: f.title || (f as any).name || 'File',
                size: f.size || 0,
            }));
        (window as any).__tide_active_attachments = noteAttachments;
    }, [activeNoteId, files]);

    const {
        points,
        activeIndex,
        setActiveIndex,
        selectedPoint,
        selectedContent,
        diffChanges,
        isLoading: isBackupLoading,
        error: backupError
    } = useNoteBackups({
        fileId: activeNoteId,
        privateKey,
        myId,
        currentContent: effectiveCurrentContent,
        enabled: isHistoryMode,
    });

    const handleCancelHistory = useCallback(() => {
        setHistoryNoteId(null);
        setIsViewingVersion(false);
        setShowBackups?.(false);
        setActiveIndex(0);
    }, [setShowBackups, setActiveIndex]);

    const handleApplyHistory = useCallback(() => {
        setHistoryNoteId(null);
        setIsViewingVersion(false);
        setShowBackups?.(false);
        setActiveIndex(0);
        if (selectedContent) {
            setLiveEditorContent(selectedContent);
            if (onRestoreBackup) {
                onRestoreBackup(selectedContent);
            } else {
                window.dispatchEvent(new CustomEvent('editor:restore-content', { detail: selectedContent }));
                if (activeNoteId && performSave) {
                    const currentFile = files.find(f => f.id === activeNoteId);
                    performSave(selectedContent, activeNoteId, activeFileKey, currentFile?.visibility);
                }
            }
        }
    }, [selectedContent, onRestoreBackup, activeNoteId, performSave, files, activeFileKey, setShowBackups, setActiveIndex]);

    const titleInputNoteIdRef = useRef<string | null>(null);
    const initialTitleRef = useRef<string>(fileName);
    const lastSubmittedTitleRef = useRef<string>(fileName);
    const isEditingTitleRef = useRef<boolean>(false);

    useEffect(() => {
        isEditingTitleRef.current = false;
        initialTitleRef.current = fileName;
        lastSubmittedTitleRef.current = fileName;
    }, [activeNoteId]);

    useEffect(() => {
        if (!isEditingTitleRef.current) {
            initialTitleRef.current = fileName;
            lastSubmittedTitleRef.current = fileName;
        }
    }, [fileName]);
    const [internalHoveredElementId, setInternalHoveredElementId] = useState<string | null>(null);
    const [internalIsLinkingMode, setInternalIsLinkingMode] = useState(false);
    const [internalActiveLinkBlockId, setInternalActiveLinkBlockId] = useState<string | null>(null);
    const [internalHoveredBlockId, setInternalHoveredBlockId] = useState<string | null>(null);
    const [showSaveStatusMenu, setShowSaveStatusMenu] = useState(false);
    const [showSharePanel, setShowSharePanel] = useState(false);
    const [showNoteSettingsMenu, setShowNoteSettingsMenu] = useState(false);
    const paperPattern = useDataStore((s) => s.paperPattern);
    const showPageBreaks = useDataStore((s) => s.showPageBreaks);
    const headingNumbering = useDataStore((s) => s.headingNumbering);
    const a4SideBorders = useDataStore((s) => s.a4SideBorders);
    const noteMargin = useDataStore((s) => s.noteMargin);
    const activeNoteTitle = fileName;

    const hoveredElementId = props.hoveredElementId !== undefined ? props.hoveredElementId : internalHoveredElementId;
    const setHoveredElementId = props.setHoveredElementId || setInternalHoveredElementId;
    const isLinkingMode = props.isLinkingMode !== undefined ? props.isLinkingMode : internalIsLinkingMode;
    const setIsLinkingMode = props.setIsLinkingMode || setInternalIsLinkingMode;
    const activeLinkBlockId = props.activeLinkBlockId !== undefined ? props.activeLinkBlockId : internalActiveLinkBlockId;
    const setActiveLinkBlockId = props.setActiveLinkBlockId || setInternalActiveLinkBlockId;
    const hoveredBlockId = props.hoveredBlockId !== undefined ? props.hoveredBlockId : internalHoveredBlockId;
    const setHoveredBlockId = props.setHoveredBlockId || setInternalHoveredBlockId;

    const isHidden = isActive !== undefined ? !isActive : (NON_EDITOR_TABS.has(activeTabId) || activeTabId.startsWith('chat-') || activeTabId.startsWith('profile:'));
    const isA4 = noteLayout === 'a4';
    const headerShared = isSharedFile(files.find(f => f.id === activeNoteId), myId);
    const headerFile = files.find(f => f.id === activeNoteId) as any;
    const headerIsRecipient = headerFile?.share_status === 'shared' || headerFile?.share_status === 'accepted' || headerFile?.share_status === 'pending';
    const headerIsOwner = !headerIsRecipient && (!headerFile?.owner_id || headerFile?.owner_id === myId || headerFile?.share_status === 'owner');

    // The timeline sits beside the right edge of the A4 sheet; other layouts keep it in the top-right corner.
    const timeline = (
        <NoteHistoryTimeline
            open={isHistoryMode}
            onClose={handleCancelHistory}
            points={points}
            activeIndex={activeIndex}
            // Choosing a save shows its changes at once; there is no separate step.
            onSelectIndex={(i) => { setActiveIndex(i); setIsViewingVersion(i > 0); }}
            isLoading={isBackupLoading}
            error={backupError}
            onRestore={handleApplyHistory}
            canRestore={!!selectedContent && activeIndex > 0}
            edge={isA4}
        />
    );

    return (
        <div className={`flex-1 min-h-0 relative ${isHidden ? 'hidden' : 'flex flex-col'}`}>
            {/* Note and VarSheet sit side by side: the sheet takes its own column, so it can never cover the page. */}
            <div className="flex-1 min-h-0 relative flex">
            <div className={`flex-1 min-w-0 min-h-0 relative overflow-y-auto transition-[padding] duration-300 ${isHistoryMode ? 'lg:pr-[300px]' : ''}`}>
                {!isHidden && !isLoadingContent && <NoteOutline editor={editorInstance} />}
            {!isHidden && !isLoadingContent && !isA4 && timeline}
            {isLoadingContent ? (
                <div className="flex items-center justify-center h-full text-t2-ink-3">Loading content...</div>
            ) : (
                <div className={`mx-auto min-h-[500px] py-12 px-8 lg:px-24 transition-all duration-300 ${
                    noteLayout === 'thin' ? 'max-w-2xl' : noteLayout === 'normal' ? 'max-w-4xl' : noteLayout === 'wide' ? 'max-w-6xl' : 'max-w-full'
                } margin-${noteMargin || 'normal'}`}>
                    <CanvasLayer
                        elements={canvasSidecar.elements}
                        isLoaded={canvasSidecar.isLoaded}
                        publicKey={publicKey}
                        privateKey={privateKey}
                        userId={myId}
                        noteId={activeNoteId}
                        deletedBlockIds={Array.isArray(deletedBlockIds) ? deletedBlockIds : Array.from(deletedBlockIds || [])}
                        pendingBindBlockId={pendingBindBlockId}
                        onBindingComplete={() => setPendingBindBlockId(null)}
                        onElementMove={async (id, ox, oy) => { await canvasSidecar.updateElement(id, { offsetX: ox, offsetY: oy }); }}
                        onElementAdd={async (el) => { await canvasSidecar.addElement(el); }}
                        onElementRemove={async (id) => { await canvasSidecar.removeElement(id); }}
                        onUpdate={async (id, updates) => { await canvasSidecar.updateElement(id, updates); }}
                        onSaveAll={async (elems) => { await canvasSidecar.save(elems); }}
                        hoveredElementId={hoveredElementId}
                        setHoveredElementId={setHoveredElementId}
                        isLinkingMode={isLinkingMode}
                        activeLinkBlockId={activeLinkBlockId}
                        onLinkingComplete={() => { setIsLinkingMode(false); setActiveLinkBlockId(null); }}
                        onInsertAnchor={(x, y) => {
                            if (!editorInstance || editorInstance.isDestroyed || !editorInstance.commands) return null;
                            try {
                                const pos = editorInstance.view.posAtCoords({ left: x, top: y });
                                if (!pos) return null;
                                const anchorId = crypto.randomUUID();
                                if (editorInstance && !editorInstance.isDestroyed && editorInstance.commands) {
                                    editorInstance.commands.focus();
                                    editorInstance.chain().insertContentAt(pos.pos, { type: 'anchor', attrs: { anchorId } }).run();
                                }
                                return anchorId;
                            } catch (e) { console.error("[Canvas] Failed to insert anchor", e); return null; }
                        }}
                    >
                        <div className={`w-full mx-auto flex flex-row items-start min-h-[500px] py-12 ${noteLayout === 'a4' ? '' : 'px-4 sm:px-8'} note-layout-${noteLayout || 'normal'}`}>
                            <EditorGutter
                                elements={canvasSidecar.elements}
                                onPinClick={(bid) => {
                                    const isCur = isLinkingMode && activeLinkBlockId === bid;
                                    setIsLinkingMode(!isCur);
                                    setActiveLinkBlockId(isCur ? null : bid);
                                }}
                                activeLinkBlockId={activeLinkBlockId}
                                hoveredElementId={hoveredElementId}
                                hoveredBlockId={hoveredBlockId}
                                isLinkingMode={isLinkingMode}
                                contentVersion={editorVersion}
                            />
                            <div className={`relative flex flex-col paper-${paperPattern || 'blanko'} ${noteLayout === 'a4' ? `a4-sheet margin-${noteMargin || 'normal'}` : 'flex-1 min-w-0 pt-12'} ${noteLayout === 'a4' && !a4SideBorders ? 'a4-no-sides' : ''} ${headingNumbering ? 'heading-numbered' : ''}`}>
                                {noteLayout === 'a4' && showPageBreaks && (
                                    <div className="a4-page-breaks-overlay pointer-events-none absolute inset-0 z-0" />
                                )}
                                {isA4 && !isHidden && !isLoadingContent && timeline}
                                {activeNoteId && openTabs.find(t => t.id === activeNoteId && t.type === 'file') && (
                                    <>
                                        {(() => {
                                            const af = files.find(f => f.id === activeNoteId) as any;
                                            if (af && af.permission === 'view') {
                                                return (
                                                    <div className="bg-t2-sub  border border-t2-line  rounded-xl p-3.5 mb-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                                        <div className="flex items-center gap-3 text-t2-accent ">
                                                            <div className="p-2 rounded-xl bg-t2-sub  text-t2-accent  shrink-0">
                                                                <GraduationCap size={20} />
                                                            </div>
                                                            <div>
                                                                <div className="text-xs font-bold uppercase tracking-wider text-t2-accent ">Lehrseite / Schreibgeschützt</div>
                                                                <div className="text-xs text-t2-accent ">Du hast Lesezugriff auf dieses Dokument. Verlinkungen und Event-Referenzen sind interaktiv.</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                                                            <button
                                                                onClick={async () => {
                                                                    const newTitle = `${af.title || 'Dokument'} (Kopie)`;
                                                                    const newId = await useDataStore.getState().createNote(newTitle, editorContent);
                                                                    await useDataStore.getState().fetchDirectory(null, true);
                                                                    handleFileSelect(newId, newTitle);
                                                                }}
                                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-t2-surface  border border-t2-line  text-t2-accent  hover:bg-t2-sub  transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
                                                                title="Erstelle deine eigene bearbeitbare Kopie dieser Notiz"
                                                            >
                                                                <Copy size={13} />
                                                                <span>In eigene Notizen duplizieren</span>
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const md = tipTapToMarkdown(editorContent);
                                                                    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
                                                                    const url = URL.createObjectURL(blob);
                                                                    const a = document.createElement('a');
                                                                    a.href = url;
                                                                    a.download = `${(af.title || 'note').replace(/[/\\?%*:|"<>]/g, '_')}.md`;
                                                                    document.body.appendChild(a);
                                                                    a.click();
                                                                    document.body.removeChild(a);
                                                                    URL.revokeObjectURL(url);
                                                                }}
                                                                className="p-1.5 rounded-lg text-xs bg-t2-surface  border border-t2-line  text-t2-accent  hover:bg-t2-sub  transition-colors shadow-xs flex items-center gap-1 cursor-pointer"
                                                                title="Als Markdown herunterladen"
                                                            >
                                                                <Download size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}

                                        {/* Active Collaborators Avatars */}
                                        {(() => {
                                            const af = files.find(f => f.id === activeNoteId) as any;
                                            const isShared = af && (af.isShared || (af.owner_id && af.owner_id !== myId));
                                            if (!isShared || activeCollaborators.length === 0) return null;
                                            return (
                                                <div className="flex items-center gap-2 mb-2">
                                                    {activeCollaborators.map((u, idx) => (
                                                        <div key={u?.id || `collab-${idx}`} className="relative group" title={`${u?.name || 'User'} (Aktiv)`}>
                                                            <div className="w-8 h-8 rounded-full border-2 overflow-hidden shadow-sm transition-transform hover:scale-110" style={{ borderColor: u?.color || '#ccc' }}>
                                                                <Avatar seed={u?.seed || 'guest'} size={28} />
                                                            </div>
                                                            <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-t2-ink text-white text-[11px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-50">
                                                                {u?.name || 'User'}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })()}

                                        {/* On the A4 sheet the path sits in the top margin, left; the icons sit in the top margin, right. */}
                                        <div className={isA4 ? 'lg:absolute lg:bottom-full lg:left-0 lg:mb-3 lg:z-20' : ''}>
                                            <NoteBreadcrumb noteId={activeNoteId} files={files} />
                                        </div>
                                        <div className="flex items-center gap-2 mb-6">
                                            <input
                                                id="note-title-input"
                                                type="text"
                                                autoFocus
                                                value={fileName}
                                                readOnly={(files.find(f => f.id === (titleInputNoteIdRef.current || activeNoteId)) as any)?.permission === 'view'}
                                                onFocus={(e) => {
                                                    // A fresh note: the placeholder title is selected, so typing replaces it
                                                    if (/^(Untitled|Neue Notiz|New Note)$/i.test(fileName.trim())) e.currentTarget.select();
                                                    isEditingTitleRef.current = true;
                                                    titleInputNoteIdRef.current = activeNoteId || (!NON_EDITOR_TABS.has(activeTabId) ? activeTabId : null);
                                                    if (!lastSubmittedTitleRef.current) {
                                                        lastSubmittedTitleRef.current = fileName;
                                                    }
                                                }}
                                                onChange={(e) => {
                                                    isEditingTitleRef.current = true;
                                                    const targetId = titleInputNoteIdRef.current || activeNoteId || (!NON_EDITOR_TABS.has(activeTabId) ? activeTabId : null);
                                                    if (!titleInputNoteIdRef.current) titleInputNoteIdRef.current = targetId;
                                                    if ((files.find(f => f.id === targetId) as any)?.permission === 'view') return;
                                                    const newTitle = e.target.value;
                                                    setFileName(newTitle);
                                                    setSaveStatus('unsaved');
                                                    if (targetId) {
                                                        useDataStore.getState().setNotes(useDataStore.getState().notes.map(f => f.id === targetId ? { ...f, title: newTitle } as any : f));
                                                        setOpenTabs?.(prev => prev.map(t => t.id === targetId ? { ...t, title: newTitle } : t));
                                                    }
                                                }}
                                                onBlur={(e) => {
                                                    isEditingTitleRef.current = false;
                                                    const targetId = titleInputNoteIdRef.current || activeNoteId || (!NON_EDITOR_TABS.has(activeTabId) ? activeTabId : null);
                                                    titleInputNoteIdRef.current = null;
                                                    if (!targetId) return;
                                                    if ((files.find(f => f.id === targetId) as any)?.permission === 'view') return;
                                                    const newTitle = e.target.value;
                                                    if (newTitle !== lastSubmittedTitleRef.current) {
                                                        lastSubmittedTitleRef.current = newTitle;
                                                        initialTitleRef.current = newTitle;
                                                        submitRename(targetId, newTitle, true);
                                                    }
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === 'Tab') {
                                                        e.preventDefault();
                                                        (e.target as HTMLInputElement).blur();
                                                        if (editorInstance && !editorInstance.isDestroyed && editorInstance.commands) {
                                                            editorInstance.commands.focus('start');
                                                        } else {
                                                            // Editor still mounting: wait for it (up to ~3 s) and focus it as soon as it exists
                                                            const focusBody = (tries: number) => {
                                                                const body = document.querySelector<HTMLElement>('.ProseMirror[contenteditable="true"]');
                                                                if (body) body.focus();
                                                                else if (tries < 30) setTimeout(() => focusBody(tries + 1), 100);
                                                            };
                                                            focusBody(0);
                                                        }
                                                    }
                                                }}
                                                placeholder={getTranslation(useDataStore.getState().language || 'de', 'common', 'newNote')}
                                                className="text-4xl font-bold bg-transparent border-none outline-none text-t2-ink  placeholder-t2-ink-3  pb-1 leading-normal overflow-visible flex-1"
                                            />
                                            {/* On the A4 sheet the icons hang beside its right edge, so the title keeps the full width. */}
                                            <NoteHeaderActions
                                                isOwner={headerIsOwner}
                                                isA4={isA4}
                                                historyLabel={
                                                    <NoteHistoryLabel
                                                        lastEdited={headerFile?.updated_at || headerFile?.updatedAt}
                                                        open={isHistoryMode}
                                                        onToggle={handleToggleHistory}
                                                    />
                                                }
                                                actions={<>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (headerShared) setShowSharePanel(true);
                                                        else handleShare({ stopPropagation: () => {} } as any, activeNoteId);
                                                    }}
                                                    className="p-1.5 rounded-lg text-t2-ink-2 hover:bg-t2-hover hover:text-t2-ink transition-colors"
                                                    title="Notiz teilen"
                                                    aria-label="Notiz teilen"
                                                >
                                                    <Share2 size={16} />
                                                </button>
                                                {isVarSheetEnabled && !isViewingVersion && (
                                                    <button
                                                        type="button"
                                                        onClick={handleToggleVarSheet}
                                                        aria-pressed={isVarSheetOpen}
                                                        className={`p-1.5 rounded-lg transition-colors ${
                                                            isVarSheetOpen
                                                                ? 'bg-t2-sub text-t2-accent'
                                                                : 'text-t2-ink-2 hover:bg-t2-hover hover:text-t2-ink'
                                                        }`}
                                                        title="VarSheet ein-/ausblenden (Berechnungen & Variablen)"
                                                        aria-label="VarSheet ein-/ausblenden (Berechnungen & Variablen)"
                                                    >
                                                        <Sigma size={16} />
                                                    </button>
                                                )}
                                                <div className="relative flex items-center justify-center">
                                                    {(() => {
                                                        const af = files.find(f => f.id === activeNoteId) as any;
                                                        const isRecipient = af?.share_status === 'shared' || af?.share_status === 'accepted' || af?.share_status === 'pending';
                                                        const ak = af?.access_keys;
                                                        const akObj = ak ? (typeof ak === 'string' ? JSON.parse(ak) : ak) : {};
                                                        const isSharedByOwner = Object.keys(akObj).length > 1;
                                                        const isShared = isRecipient || isSharedByOwner;
                                                        const isOwner = !isRecipient && (!af?.owner_id || af?.owner_id === myId || af?.share_status === 'owner');
                                                        const isProtected = !!(af?.metadata?.has_custom_password || af?.metadata?.security_settings?.has_custom_password);

                                                        return (
                                                            <>
                                                                <SaveStateIcon
                                                                    saveStatus={saveStatus}
                                                                    isLiveShared={isShared && activeCollaborators.length > 0}
                                                                    onClick={() => setShowSaveStatusMenu(prev => !prev)}
                                                                />
                                                                {showSaveStatusMenu && af && (
                                                                    <SaveStatusMenu
                                                                        fileId={activeNoteId}
                                                                        saveStatus={saveStatus}
                                                                        visibility={af.visibility}
                                                                        isShared={isShared}
                                                                        isSharedByOwner={isSharedByOwner}
                                                                        isRecipient={isRecipient}
                                                                        isProtected={isProtected}
                                                                        onClose={() => setShowSaveStatusMenu(false)}
                                                                        onOpenShare={() => {
                                                                            setShowSaveStatusMenu(false);
                                                                            if (isShared) setShowSharePanel(true);
                                                                            else handleShare({ stopPropagation: () => {} } as any, activeNoteId);
                                                                        }}
                                                                        onOpenSecurity={() => {
                                                                            setShowSaveStatusMenu(false);
                                                                            setNoteSecurityModalItem({ id: af.id, title: af.title, type: (af.type as any) || 'note', metadata: af.metadata });
                                                                        }}
                                                                    />
                                                                )}
                                                                {showSharePanel && af && (
                                                                    <ShareManagementPanel
                                                                        fileId={activeNoteId}
                                                                        onClose={() => setShowSharePanel(false)}
                                                                        isOwner={isOwner}
                                                                        myPermission={af?.permission || 'view'}
                                                                        onLeave={() => {
                                                                            setShowSharePanel(false);
                                                                            handleDeleteNote({ stopPropagation: () => {} } as any, activeNoteId);
                                                                        }}
                                                                    />
                                                                )}
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowNoteSettingsMenu(prev => !prev)}
                                                        className="p-1.5 rounded-lg hover:bg-t2-hover  text-t2-ink-2 hover:text-t2-ink  transition-colors"
                                                        title="Notiz-Optionen & Export"
                                                    >
                                                        <MoreHorizontal size={16} />
                                                    </button>
                                                    {showNoteSettingsMenu && (
                                                        <NoteSettingsMenu
                                                            onClose={() => setShowNoteSettingsMenu(false)}
                                                            activeNoteId={activeNoteId}
                                                            activeNoteTitle={activeNoteTitle}
                                                            editorContent={editorContent}
                                                            isOpen={showNoteSettingsMenu}
                                                            noteId={activeNoteId || undefined}
                                                            noteTitle={activeNoteTitle}
                                                            noteContent={editorContent}
                                                        />
                                                    )}
                                                </div>
                                                </>}
                                            />
                                        </div>
                                    </>
                                )}

                                {(() => {
                                    const activeFileType = files.find(f => f.id === activeNoteId)?.type;

                                    if (activeFileType === 'canvas') {
                                        return (
                                            <div className="flex-1 h-full overflow-hidden">
                                                <CanvasNoteEditor
                                                    key={activeNoteId || ''}
                                                    noteId={activeNoteId || ''}
                                                    initialData={canvasNoteData}
                                                    publicKey={publicKey}
                                                    privateKey={privateKey}
                                                    userId={myId}
                                                    onChange={(data) => {
                                                        setCanvasNoteData(data);
                                                        setSaveStatus('unsaved');
                                                    }}
                                                />
                                            </div>
                                        );
                                    }

                                    const isShared = isSharedFile(files.find(f => f.id === activeNoteId), myId);

                                    return editorContent === null ? (
                                        <div className="flex-1 flex flex-col items-center justify-center text-t2-ink-3 h-[50vh] mt-20">
                                            <span className="font-medium text-sm">Lade...</span>
                                        </div>
                                    ) : (
                                        <>
                                            {isViewingVersion && (
                                                <div className="flex-1 min-w-0">
                                                    <NoteVersionDiffView
                                                        point={selectedPoint}
                                                        diffChanges={diffChanges}
                                                        isLoading={isBackupLoading}
                                                        error={backupError}
                                                        rawPlainText={getPlainTextFromJSON(effectiveCurrentContent)}
                                                    />
                                                </div>
                                            )}
                                            <div
                                                className={isViewingVersion ? 'hidden' : 'relative flex-1 min-w-0 flex flex-col'}
                                                onDragOver={(e) => {
                                                    if (e.dataTransfer?.types?.includes('Files')) {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setIsDraggingEditorFile(true);
                                                    }
                                                }}
                                                onDragLeave={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                                        setIsDraggingEditorFile(false);
                                                    }
                                                }}
                                                onDrop={async (e) => {
                                                    if (!e.dataTransfer?.files?.length || !activeNoteId) return;
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setIsDraggingEditorFile(false);

                                                    const droppedFiles = Array.from(e.dataTransfer.files);
                                                    for (const file of droppedFiles) {
                                                        try {
                                                            const fileId = crypto.randomUUID();
                                                            // 1. Create file record
                                                            const createRes = await apiFetch('/api/v1/files', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({
                                                                    id: fileId,
                                                                    parent_id: activeNoteId,
                                                                    parent_file_id: activeNoteId,
                                                                    type: 'file',
                                                                    title: file.name,
                                                                    mime_type: file.type || 'application/octet-stream',
                                                                    size: file.size,
                                                                    visibility: 'private',
                                                                }),
                                                            });
                                                            if (!createRes.ok) continue;

                                                            // 2. Upload file blob
                                                            const uploadRes = await apiFetch(`/api/v1/files/${encodeURIComponent(fileId)}/upload?parent_file_id=${encodeURIComponent(activeNoteId)}`, {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': file.type || 'application/octet-stream' },
                                                                body: file,
                                                            });
                                                            if (!uploadRes.ok) {
                                                                const errData = await uploadRes.json().catch(() => null);
                                                                if (uploadRes.status === 403 && errData?.error === 'storage_limit_exceeded') {
                                                                    alert(errData.message || 'Speicherlimit von 250MB pro Notiz überschritten.');
                                                                }
                                                            }
                                                        } catch (err) {
                                                            console.error('Failed to upload file attachment:', err);
                                                        }
                                                    }
                                                    // Refresh files list
                                                    useDataStore.getState().fetchDirectory(activeNoteId, true);
                                                }}
                                            >
                                                {isDraggingEditorFile && (
                                                    <div className="absolute inset-0 z-50 pointer-events-none bg-t2-sub  backdrop-blur-sm border-2 border-dashed border-t2-accent rounded-xl flex flex-col items-center justify-center gap-3">
                                                        <UploadCloud className="w-10 h-10 text-t2-accent animate-bounce" />
                                                        <div className="text-sm font-semibold text-t2-accent ">
                                                            Dateien hier ablegen zum Anhängen an diese Notiz...
                                                        </div>
                                                    </div>
                                                )}
                                                <Editor
                                                    key={activeTabId}
                                                    isShared={isShared}
                                                    initialContent={editorContent}
                                                    dek={activeFileKey}
                                                    keyEpoch={useActiveNoteStore.getState().keyEpoch || 1}
                                                    editable={(files.find(f => f.id === activeNoteId) as any)?.permission !== 'view'}
                                                    onEditorReady={handleEditorReadyWrapper}
                                                    onChange={handleEditorChangeWrapper}
                                                    onLinkClick={handleMagicLinkClick}
                                                    onForceSave={(json) => {
                                                        const cur = activeNoteId ? files.find(f => f.id === activeNoteId) : null;
                                                        if (cur && activeNoteId) {
                                                            setSaveStatus("saving");
                                                            performSave(json, activeNoteId, activeFileKey, cur.visibility)
                                                                .then(() => setSaveStatus("saved"))
                                                                .catch(() => setSaveStatus("unsaved"));
                                                        }
                                                    }}
                                                    onBlocksDeleted={handleBlocksDeleted}
                                                    onPopOut={(text, anchorBlockId) => {
                                                        canvasSidecar.addElement({
                                                            id: crypto.randomUUID(),
                                                            type: 'text-widget',
                                                            anchorBlockId,
                                                            offsetX: 24,
                                                            offsetY: 0,
                                                            content: text,
                                                            backgroundColor: 'transparent',
                                                        } as TextWidgetElement);
                                                    }}
                                                    onConnectImage={(blockId) => setPendingBindBlockId(blockId)}
                                                    onBlockHover={setHoveredBlockId}
                                                    onAbortLinking={() => {
                                                        if (isLinkingMode) {
                                                            setIsLinkingMode(false);
                                                            setActiveLinkBlockId(null);
                                                        }
                                                    }}
                                                    onActiveUsersChange={(users) => {
                                                        const currentMyId = myId || useDataStore.getState().myId;
                                                        setActiveCollaborators(currentMyId ? users.filter(u => u.id !== currentMyId) : []);
                                                    }}
                                                    activeTabId={activeTabId}
                                                    onReturnToTab={(tabId) => setActiveTabId(tabId)}
                                                    userProfile={userProfile}
                                                    myId={myId}
                                                />
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </CanvasLayer>
                </div>
            )}
            </div>
            {isVarSheetEnabled && isVarSheetOpen && activeNoteId && (
                <div className="absolute inset-y-0 right-0 z-30 p-3.5 pointer-events-none flex items-start lg:static lg:z-auto lg:shrink-0 lg:py-3.5 lg:pl-3 lg:pr-3.5">
                    <div className="pointer-events-auto flex w-[360px] max-w-[calc(100vw-1.75rem)] max-h-full">
                        <VarSheetDock noteId={activeNoteId} onClose={handleCloseVarSheet} />
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}

export default CanvasWorkspace;
