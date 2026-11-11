import { useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Plus, FolderPlus, Lock, LogOut, Share2, Edit3, Trash2, Upload, Download, Layout, ShieldCheck, Copy, Archive, ChevronRight, Check } from "lucide-react";
import { useDataStore } from "@/store/useDataStore";
import type { DecryptedFile, SidebarProps } from "./types";

export type FileContextMenuState = { x: number; y: number; id: string; type: 'file' | 'folder' };
export type SidebarContextMenuState = { x: number; y: number };

type ContextMenuProps = Pick<SidebarProps, 'files' | 'onNewNote' | 'onCreateFolder' | 'onShare' | 'onDeleteNote' | 'onRenameNote' | 'onNewCanvasNote'> & {
    contextMenu: FileContextMenuState | null;
    setContextMenu: (v: FileContextMenuState | null) => void;
    sidebarContextMenu: SidebarContextMenuState | null;
    setSidebarContextMenu: (v: SidebarContextMenuState | null) => void;
    myId: string;
    handleOpenSecuritySettings: (id: string) => void;
    handleExport: (itemId: string, format: 'bundle' | 'markdown') => void | Promise<void>;
    handleImport: (targetFolderId?: string | null) => void;
    handleCopyToMyNotes: (file: DecryptedFile) => void | Promise<void>;
};

export default function SidebarContextMenu({
    files, onNewNote, onCreateFolder, onShare, onDeleteNote, onRenameNote, onNewCanvasNote,
    contextMenu, setContextMenu, sidebarContextMenu, setSidebarContextMenu, myId,
    handleOpenSecuritySettings, handleExport, handleImport, handleCopyToMyNotes,
}: ContextMenuProps) {
    const [showSafeSubmenu, setShowSafeSubmenu] = useState(false);
    const availableSafes = useDataStore((s) => s.availableSafes);
    const setNoteSafe = useDataStore((s) => s.setNoteSafe);
    return (
        <>
            {contextMenu && typeof document !== 'undefined' && (() => {
                const clampedX = typeof window !== 'undefined' ? Math.max(8, Math.min(contextMenu.x, window.innerWidth - 240)) : contextMenu.x;
                const clampedY = typeof window !== 'undefined' ? Math.max(8, Math.min(contextMenu.y, window.innerHeight - 340)) : contextMenu.y;
                return createPortal(
                    <div
                        className="context-menu fixed z-[9999] w-56 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-100"
                        style={{ left: clampedX, top: clampedY }}
                    >
                        <div className="px-2 py-1.5 flex flex-col gap-0.5">
                        {/* 1. Rename */}
                        <button
                            onClick={(e) => { setContextMenu(null); onRenameNote(e, contextMenu.id, ""); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors group"
                        >
                            <Edit3 size={15} className="text-gray-400 group-hover:text-blue-500" />
                            <span className="font-medium">Umbenennen</span>
                        </button>

                        {/* 2. New Note | Folder (auf einer Zeile) */}
                        {(() => {
                            const currentFile = files.find((f) => f.id === contextMenu.id);
                            const parentId = contextMenu.type === 'folder' ? contextMenu.id : (currentFile?.parent_id || null);
                            return (
                                <div className="grid grid-cols-2 gap-1 my-0.5">
                                    <button
                                        onClick={() => { 
                                            setContextMenu(null); 
                                            onNewNote(parentId);
                                        }}
                                        className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-slate-800/80 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors border border-gray-200/50 dark:border-slate-700/50"
                                        title="Neue Notiz"
                                    >
                                        <Plus size={14} className="text-blue-500" />
                                        <span>Notiz</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setContextMenu(null);
                                            onCreateFolder?.(parentId);
                                        }}
                                        className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-slate-800/80 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors border border-gray-200/50 dark:border-slate-700/50"
                                        title="Neuer Ordner"
                                    >
                                        <FolderPlus size={14} className="text-amber-500" />
                                        <span>Ordner</span>
                                    </button>
                                </div>
                            );
                        })()}

                        {/* 3. Trennlinie */}
                        <div className="h-px bg-gray-100 dark:bg-slate-800 my-1" />

                        {/* In meine Notizen kopieren (für geteilte Notizen) */}
                        {(() => {
                            const targetFile = files.find(f => f.id === contextMenu.id);
                            const currentMyId = myId || useDataStore.getState().myId;
                            const isSharedNote = targetFile && targetFile.type !== 'folder' && targetFile.owner_id && currentMyId && targetFile.owner_id !== currentMyId;
                            if (!isSharedNote) return null;
                            return (
                                <button
                                    onClick={() => handleCopyToMyNotes(targetFile)}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors group"
                                >
                                    <Copy size={15} className="text-gray-400 group-hover:text-blue-500" />
                                    <span className="font-medium">In meine Notizen kopieren</span>
                                </button>
                            );
                        })()}

                        {/* 4. Share (nur wenn isOwner || file.can_reshare) */}
                        {(() => {
                            const targetFile = files.find(f => f.id === contextMenu.id);
                            const currentMyId = myId || useDataStore.getState().myId;
                            const isOwner = !targetFile?.owner_id || targetFile?.owner_id === currentMyId || targetFile?.share_status === 'owner';
                            const canShare = isOwner || Boolean(targetFile?.can_reshare);
                            if (!canShare) return null;
                            return (
                        <button
                            onClick={(e) => { setContextMenu(null); onShare(e, contextMenu.id); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors group"
                        >
                            <Share2 size={15} className="text-gray-400 group-hover:text-blue-500" />
                            <span className="font-medium">Teilen</span>
                        </button>

                            );
                        })()}

                        {/* 5. Secure (PIN) */}
                        {(() => {
                            const targetFile = files.find(f => f.id === contextMenu.id);
                            const isProtected = !!(targetFile?.metadata?.has_custom_password || targetFile?.metadata?.security_settings?.has_custom_password);
                            return (
                                <button
                                    onClick={() => {
                                        const targetId = contextMenu.id;
                                        setContextMenu(null);
                                        handleOpenSecuritySettings(targetId);
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors group"
                                >
                                    {isProtected ? (
                                        <ShieldCheck size={15} className="text-amber-500 group-hover:text-amber-600" />
                                    ) : (
                                        <Lock size={15} className="text-gray-400 group-hover:text-purple-500" />
                                    )}
                                    <span className="font-medium">
                                        {isProtected ? "PIN-Schutz verwalten" : "Sichern"}
                                    </span>
                                </button>
                            );
                        })()}

                        {/* In Workspace verschieben (für Dateien / Ordner) */}
                        {(contextMenu.type === 'file' || contextMenu.type === 'folder') && (
                            <div
                                className="relative"
                                onMouseEnter={() => setShowSafeSubmenu(true)}
                                onMouseLeave={() => setShowSafeSubmenu(false)}
                            >
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowSafeSubmenu((v) => !v);
                                    }}
                                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors group cursor-pointer"
                                >
                                    <div className="flex items-center gap-3">
                                        <Archive size={15} className="text-gray-400 group-hover:text-blue-500" />
                                        <span className="font-medium">In Workspace verschieben</span>
                                    </div>
                                    <ChevronRight size={14} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-slate-300" />
                                </button>

                                {showSafeSubmenu && (() => {
                                    const targetFile = files.find((f) => f.id === contextMenu.id);
                                    const currentSafe = targetFile?.safe || targetFile?.metadata?.safe || 'Standard';
                                    const isLeft = clampedX > (typeof window !== 'undefined' ? window.innerWidth - 380 : 600);

                                    return (
                                        <div
                                            className={`context-menu absolute ${
                                                isLeft ? 'right-full mr-1' : 'left-full ml-1'
                                            } top-0 w-44 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl py-1 z-[10000] animate-in fade-in zoom-in-95 duration-100`}
                                        >
                                            <div className="px-2.5 py-1 text-[10px] font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider border-b border-gray-100 dark:border-slate-800 mb-1">
                                                Workspace wählen
                                            </div>
                                            <div className="px-1 flex flex-col gap-0.5">
                                                {availableSafes.map((safe) => {
                                                    const isCurrent = currentSafe === safe;
                                                    const label =
                                                        safe === 'Archiv'
                                                            ? 'Ins Archiv'
                                                            : safe === 'Standard'
                                                            ? 'In Standard'
                                                            : `In ${safe}`;
                                                    return (
                                                        <button
                                                            key={safe}
                                                            type="button"
                                                            onClick={async (e) => {
                                                                e.stopPropagation();
                                                                setContextMenu(null);
                                                                setShowSafeSubmenu(false);
                                                                await setNoteSafe(contextMenu.id, safe);
                                                            }}
                                                            className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
                                                                isCurrent
                                                                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium'
                                                                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800'
                                                            }`}
                                                        >
                                                            <span className="truncate">{label}</span>
                                                            {isCurrent && (
                                                                <Check size={13} className="text-blue-500 shrink-0 ml-1.5" />
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        {/* 6. Export & Import */}
                        <div className="h-px bg-gray-100 dark:bg-slate-800 my-1" />
                        <button
                            onClick={() => {
                                const targetId = contextMenu.id;
                                setContextMenu(null);
                                handleExport(targetId, 'bundle');
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors group"
                            title="Exportiert als komplettes Bundle inklusive interner Referenzen"
                        >
                            <Download size={15} className="text-gray-400 group-hover:text-blue-500" />
                            <span className="font-medium">Export (.tide.json)</span>
                        </button>
                        {contextMenu.type === 'file' && (
                            <button
                                onClick={() => {
                                    const targetId = contextMenu.id;
                                    setContextMenu(null);
                                    handleExport(targetId, 'markdown');
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors group"
                                title="Exportiert reines Markdown"
                            >
                                <FileText size={15} className="text-gray-400 group-hover:text-blue-500" />
                                <span className="font-medium">Export (.md)</span>
                            </button>
                        )}
                        <button
                            onClick={() => {
                                const currentFile = files.find(f => f.id === contextMenu.id);
                                const targetFolder = contextMenu.type === 'folder' ? contextMenu.id : (currentFile?.parent_id || null);
                                setContextMenu(null);
                                handleImport(targetFolder);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors group"
                            title="Importiert Notizen oder Bundles direkt an diese Stelle"
                        >
                            <Upload size={15} className="text-gray-400 group-hover:text-blue-500" />
                            <span className="font-medium">Hier importieren</span>
                        </button>

                        {/* 7. Trennlinie */}
                        <div className="h-px bg-gray-100 dark:bg-slate-800 my-1" />

                        {/* 8. Delete */}
                        {(() => {
                            const targetFile = files.find(f => f.id === contextMenu.id);
                            const isShared = targetFile && targetFile.share_status && targetFile.share_status !== 'owner';
                            const isFolder = contextMenu.type === 'folder';
                            
                            return (
                                <button
                                    onClick={(e) => { setContextMenu(null); onDeleteNote(e, contextMenu.id); }}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors group"
                                >
                                    {isShared ? (
                                        <LogOut size={15} className="text-rose-400 group-hover:text-rose-600" />
                                    ) : (
                                        <Trash2 size={15} className="text-rose-400 group-hover:text-rose-600" />
                                    )}
                                    <span className="font-medium">
                                        {isShared ? (isFolder ? "Ordner verlassen" : "Notiz verlassen") : (isFolder ? "Ordner löschen" : "Löschen")}
                                    </span>
                                </button>
                            );
                        })()}
                    </div>
                </div>,
                document.body
            );
        })()}

            {sidebarContextMenu && typeof document !== 'undefined' && createPortal(
                <div
                    className="context-menu fixed z-[9999] w-56 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-100"
                    style={{ left: sidebarContextMenu.x, top: sidebarContextMenu.y }}
                >
                    <div className="px-2 py-1.5 flex flex-col gap-0.5">
                        <button
                            onClick={() => { setSidebarContextMenu(null); onNewNote(); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors group"
                        >
                            <Plus size={16} className="text-gray-400 group-hover:text-blue-500" />
                            <span className="font-medium">Neue Notiz</span>
                        </button>
                        {onNewCanvasNote && (
                            <button
                                onClick={() => { setSidebarContextMenu(null); onNewCanvasNote(); }}
                                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors group"
                            >
                                <Layout size={16} className="text-gray-400 group-hover:text-blue-500" />
                                <span className="font-medium">Neue Leinwand</span>
                            </button>
                        )}
                        <button
                            onClick={() => { setSidebarContextMenu(null); onCreateFolder && onCreateFolder(null); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors group"
                        >
                            <FolderPlus size={16} className="text-gray-400 group-hover:text-blue-500" />
                            <span className="font-medium">Neuer Ordner</span>
                        </button>
                        <div className="h-px bg-gray-100 my-1" />
                        <button
                            onClick={() => { setSidebarContextMenu(null); handleImport(); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors group"
                        >
                            <Upload size={16} className="text-gray-400 group-hover:text-blue-500" />
                            <span className="font-medium">Importieren (.tide.json, .md)</span>
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
