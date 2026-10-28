"use client";

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Clock, GraduationCap, Copy, Download } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { getTranslation } from '@/lib/i18n';
import { tipTapToMarkdown } from '@/lib/bundleImportExport';
import Avatar from '@/components/Profile/Avatar';
import EditorGutter from '@/components/Canvas/EditorGutter';
import SaveStatusMenu from '@/components/Editor/SaveStatusMenu';
import ShareManagementPanel from '@/components/ShareManagementPanel';
import type { TextWidgetElement } from '@/types/canvas';

const Editor = dynamic(() => import('@/components/Editor'), {
    ssr: false,
    loading: () => <div className="min-h-[500px] w-full animate-pulse bg-gray-50 dark:bg-gray-800/50 rounded-lg" />
});
const CanvasLayer = dynamic(() => import('@/components/Canvas/CanvasLayer'), { ssr: false });
const CanvasNoteEditor = dynamic(() => import('@/components/Canvas/CanvasNoteEditor'), { ssr: false });

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
    submitRename: (id: string, newTitle: string) => void;
    setShowBackups: (show: boolean) => void;
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
    } = props;

    const [internalHoveredElementId, setInternalHoveredElementId] = useState<string | null>(null);
    const [internalIsLinkingMode, setInternalIsLinkingMode] = useState(false);
    const [internalActiveLinkBlockId, setInternalActiveLinkBlockId] = useState<string | null>(null);
    const [internalHoveredBlockId, setInternalHoveredBlockId] = useState<string | null>(null);
    const [showSaveStatusMenu, setShowSaveStatusMenu] = useState(false);
    const [showSharePanel, setShowSharePanel] = useState(false);

    const hoveredElementId = props.hoveredElementId !== undefined ? props.hoveredElementId : internalHoveredElementId;
    const setHoveredElementId = props.setHoveredElementId || setInternalHoveredElementId;
    const isLinkingMode = props.isLinkingMode !== undefined ? props.isLinkingMode : internalIsLinkingMode;
    const setIsLinkingMode = props.setIsLinkingMode || setInternalIsLinkingMode;
    const activeLinkBlockId = props.activeLinkBlockId !== undefined ? props.activeLinkBlockId : internalActiveLinkBlockId;
    const setActiveLinkBlockId = props.setActiveLinkBlockId || setInternalActiveLinkBlockId;
    const hoveredBlockId = props.hoveredBlockId !== undefined ? props.hoveredBlockId : internalHoveredBlockId;
    const setHoveredBlockId = props.setHoveredBlockId || setInternalHoveredBlockId;

    const isHidden = isActive !== undefined ? !isActive : (NON_EDITOR_TABS.has(activeTabId) || activeTabId.startsWith('chat-') || activeTabId.startsWith('profile:'));

    return (
        <div className={`flex-1 min-h-0 relative overflow-y-auto ${isHidden ? 'hidden' : 'block'}`}>
            {isLoadingContent ? (
                <div className="flex items-center justify-center h-full text-gray-400">Loading content...</div>
            ) : (
                <div className={`mx-auto min-h-[500px] py-12 px-8 lg:px-24 transition-all duration-300 ${
                    noteLayout === 'thin' ? 'max-w-2xl' : noteLayout === 'normal' ? 'max-w-4xl' : noteLayout === 'wide' ? 'max-w-6xl' : 'max-w-full'
                }`}>
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
                            if (!editorInstance) return null;
                            try {
                                const pos = editorInstance.view.posAtCoords({ left: x, top: y });
                                if (!pos) return null;
                                const anchorId = crypto.randomUUID();
                                editorInstance.commands.focus();
                                editorInstance.chain().insertContentAt(pos.pos, { type: 'anchor', attrs: { anchorId } }).run();
                                return anchorId;
                            } catch (e) { console.error("[Canvas] Failed to insert anchor", e); return null; }
                        }}
                    >
                        <div className={`w-full mx-auto flex flex-row items-start min-h-[500px] py-12 px-4 sm:px-8 note-layout-${noteLayout || 'normal'}`}>
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
                            <div className="flex-1 min-w-0 flex flex-col">
                                {activeNoteId && openTabs.find(t => t.id === activeNoteId && t.type === 'file') && (
                                    <>
                                        {(() => {
                                            const af = files.find(f => f.id === activeNoteId) as any;
                                            if (af && af.permission === 'view') {
                                                return (
                                                    <div className="bg-sky-50/80 dark:bg-sky-950/40 border border-sky-200/80 dark:border-sky-800/60 rounded-xl p-3.5 mb-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                                        <div className="flex items-center gap-3 text-sky-900 dark:text-sky-200">
                                                            <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-900/60 text-sky-600 dark:text-sky-400 shrink-0">
                                                                <GraduationCap size={20} />
                                                            </div>
                                                            <div>
                                                                <div className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">Lehrseite / Schreibgeschützt</div>
                                                                <div className="text-xs text-sky-800/80 dark:text-sky-300/80">Du hast Lesezugriff auf dieses Dokument. Verlinkungen und Event-Referenzen sind interaktiv.</div>
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
                                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-sky-200 dark:border-sky-700/80 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-slate-700 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
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
                                                                className="p-1.5 rounded-lg text-xs bg-white dark:bg-slate-800 border border-sky-200 dark:border-sky-700/80 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-slate-700 transition-colors shadow-xs flex items-center gap-1 cursor-pointer"
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
                                                            <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-50">
                                                                {u?.name || 'User'}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })()}

                                        <div className="flex items-center gap-2 mb-6">
                                            <input
                                                id="note-title-input"
                                                type="text"
                                                autoFocus
                                                value={fileName}
                                                readOnly={(files.find(f => f.id === activeNoteId) as any)?.permission === 'view'}
                                                onChange={(e) => {
                                                    if ((files.find(f => f.id === activeNoteId) as any)?.permission === 'view') return;
                                                    const newTitle = e.target.value;
                                                    setFileName(newTitle);
                                                    setSaveStatus('unsaved');
                                                    if (activeNoteId) {
                                                        useDataStore.getState().setNotes(useDataStore.getState().notes.map(f => f.id === activeNoteId ? { ...f, title: newTitle } as any : f));
                                                        setOpenTabs?.(prev => prev.map(t => t.id === activeNoteId ? { ...t, title: newTitle } : t));
                                                    }
                                                }}
                                                onBlur={(e) => {
                                                    if ((files.find(f => f.id === activeNoteId) as any)?.permission === 'view') return;
                                                    if (activeNoteId) submitRename(activeNoteId, e.target.value);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); editorInstance?.commands.focus(); }
                                                }}
                                                placeholder={getTranslation(useDataStore.getState().language || 'de', 'common', 'newNote')}
                                                className="text-4xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-700 pb-1 leading-normal overflow-visible flex-1"
                                            />
                                            <div className="flex items-center gap-1 shrink-0 self-end mb-2">
                                                {(() => {
                                                    const af = files.find(f => f.id === activeNoteId) as any;
                                                    const isRecipient = af?.share_status === 'shared' || af?.share_status === 'accepted' || af?.share_status === 'pending';
                                                    const isOwner = !isRecipient && (!af?.owner_id || af?.owner_id === myId || af?.share_status === 'owner');
                                                    if (!isOwner) return null;
                                                    return (
                                                        <button
                                                            onClick={() => setShowBackups(true)}
                                                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400 hover:text-indigo-600 transition-colors"
                                                            title="Versionsverlauf / Backups"
                                                        >
                                                            <Clock size={16} />
                                                        </button>
                                                    );
                                                })()}
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
                                                                <button
                                                                    onClick={() => setShowSaveStatusMenu(prev => !prev)}
                                                                    title={saveStatus === 'saving' ? 'Wird gespeichert…' : saveStatus === 'unsaved' ? 'Nicht gespeichert – Klick für Details' : 'Gespeichert – Klick für Details'}
                                                                    className="p-1.5 rounded-lg transition-colors cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center"
                                                                >
                                                                    {saveStatus === 'saved' && (
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isShared ? "text-sky-400 opacity-80 hover:opacity-100" : "text-emerald-500 opacity-80 hover:opacity-100"}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                                                                    )}
                                                                    {saveStatus === 'saving' && (
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 opacity-80 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                                                                    )}
                                                                    {saveStatus === 'unsaved' && (
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 opacity-80"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                                                    )}
                                                                </button>
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
                                            </div>
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
                                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 h-[50vh] mt-20">
                                            <span className="font-medium text-sm">Lade...</span>
                                        </div>
                                    ) : (
                                        <Editor
                                            key={activeTabId}
                                            isShared={isShared}
                                            initialContent={editorContent}
                                            editable={(files.find(f => f.id === activeNoteId) as any)?.permission !== 'view'}
                                            onEditorReady={handleEditorReady}
                                            onChange={handleEditorChange}
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
                                    );
                                })()}
                            </div>
                        </div>
                    </CanvasLayer>
                </div>
            )}
        </div>
    );
}

export default CanvasWorkspace;
