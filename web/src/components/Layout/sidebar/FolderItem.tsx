import { Plus, Folder, FolderOpen, Trash, Edit2, Share, Eye, EyeOff, ChevronRight, ChevronDown, MessageSquare, User, Lock, Pin, Users, Puzzle, Globe, Check, Loader2, X, FileText } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion, Reorder, AnimatePresence } from "framer-motion";
import { Tab } from '@/components/Layout/TabList';
import { useHighlight } from "@/components/HighlightContext";
import { useDataStore } from "@/store/useDataStore";
import { useDragGhost } from "@/store/useDragGhost";
import { apiFetch } from "@/lib/api";
import { isItemUnlocked } from "@/lib/pinSecurity";
import type { DecryptedFile, ContextMenuEvent } from "./types";
import { FileItem, AnimatedLinkingText, isTouchDevice } from "./FileItem";

export interface FolderItemProps {
    folder: DecryptedFile;
    allFiles: DecryptedFile[];
    level: number;
    onSelect: (id: string, title: string) => void;
    onDelete: (e: React.MouseEvent, id: string) => void;
    onRename: (e: React.MouseEvent, id: string, currentTitle: string) => void;
    onVisibility: (e: React.MouseEvent, id: string, currentVisibility: string) => void;
    onShare: (e: React.MouseEvent, id: string) => void;
    editingId?: string | null;
    onRenameSubmit?: (id: string, newTitle: string) => void;
    onCreateFolder?: (parentId: string | null, color?: string) => void;
    onMoveItem?: (id: string, newParentId: string | null) => void;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onContextMenu: (e: ContextMenuEvent, id: string, type: 'file' | 'folder') => void;
    hiddenThemeIds?: string[];
    onToggleThemeVisibility?: (id: string) => void;
    viewMode?: 'files' | 'calendar';
    enabledExtensions?: string[];
    myId?: string;
    index?: number;
    dropIndicator?: { id: string, zone: 'top' | 'middle' | 'bottom' } | null;
    setDropIndicator?: (indicator: { id: string, zone: 'top' | 'middle' | 'bottom' } | null) => void;
    orderedNoteIds?: string[];
    setOrderedNoteIds?: (ids: string[]) => void;
    handleReorder?: (newItems: DecryptedFile[]) => void;
    activeTabId?: string;
    openTabs?: Tab[];
}

export const FolderItem = ({ folder, allFiles, level, onSelect, onDelete, onRename, onVisibility, onShare, editingId, onRenameSubmit, onCreateFolder, onMoveItem, onDragStart, onContextMenu, viewMode, enabledExtensions, myId, index, dropIndicator, setDropIndicator, orderedNoteIds, setOrderedNoteIds, handleReorder, activeTabId, openTabs }: FolderItemProps) => {
    const [isLoading, setIsLoading] = useState(false);
    const children = allFiles.filter(f => f.parent_id === folder.id);
    const { highlight } = useHighlight();
    const { fetchDirectory, loadedDirectories, openFolderIds, toggleFolder } = useDataStore();
    const isOpen = openFolderIds.has(folder.id);
    const isLocked = Boolean(folder.metadata?.has_custom_password || folder.metadata?.security_settings?.has_custom_password || (typeof folder.title === 'string' && folder.title.startsWith('#')));

    // Touch long-press handling
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPressTriggeredRef = useRef(false);

    useEffect(() => {
        return () => {
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        };
    }, []);

    const handleToggle = async (e: React.MouseEvent) => {
        if (isLongPressTriggeredRef.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        e.stopPropagation();

        const isFolderProtected = !!(folder.metadata?.has_custom_password || folder.metadata?.security_settings?.has_custom_password);
        if (isFolderProtected && !isOpen && !isItemUnlocked(folder.id, folder.metadata?.security_settings || folder.metadata)) {
            window.dispatchEvent(new CustomEvent('tide:prompt-pin', {
                detail: {
                    id: folder.id,
                    title: folder.title,
                    type: 'folder',
                    metadata: folder.metadata
                }
            }));
            return;
        }

        if (!isOpen) {
            // Expand
            setIsLoading(true);
            await fetchDirectory(folder.id);
            setIsLoading(false);
            toggleFolder(folder.id, true);
        } else {
            // Collapse
            toggleFolder(folder.id, false);
        }
    };

    return (
        <div>
            <motion.div
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 350, damping: 40, mass: 0.8, delay: (index || 0) * 0.03 }}
                draggable={!isTouchDevice}
                style={{
                    WebkitTouchCallout: 'none',
                    userSelect: 'none',
                }}
                onTouchStart={(e) => {
                    if (e.touches.length !== 1) return;
                    const touch = e.touches[0];
                    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
                    isLongPressTriggeredRef.current = false;
                    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = setTimeout(() => {
                        isLongPressTriggeredRef.current = true;
                        onContextMenu({
                            clientX: touch.clientX,
                            clientY: touch.clientY,
                            preventDefault: () => {},
                            stopPropagation: () => {},
                        }, folder.id, 'folder');
                    }, 450);
                }}
                onTouchMove={(e) => {
                    if (!touchStartRef.current || !longPressTimerRef.current) return;
                    const touch = e.touches[0];
                    const dx = touch.clientX - touchStartRef.current.x;
                    const dy = touch.clientY - touchStartRef.current.y;
                    if (Math.hypot(dx, dy) > 10) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                    }
                }}
                onTouchEnd={(e) => {
                    if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                    }
                    if (isLongPressTriggeredRef.current) {
                        e.preventDefault();
                        setTimeout(() => {
                            isLongPressTriggeredRef.current = false;
                        }, 150);
                    }
                }}
                onTouchCancel={() => {
                    if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                    }
                    isLongPressTriggeredRef.current = false;
                }}
                onDragStart={(e: any) => onDragStart(e, folder.id)}
                onContextMenu={(e: any) => onContextMenu(e, folder.id, 'folder')}
                onDragOver={level > 0 ? (e: any) => e.preventDefault() : undefined}
                onDrop={level > 0 ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = e.dataTransfer.getData("text/plain");
                    if (id && id !== folder.id) onMoveItem?.(id, folder.id);
                } : undefined}
                onClick={handleToggle}
                className={`group flex items-center justify-between w-full px-2 py-1 min-h-[28px] rounded-lg cursor-pointer transition-all duration-150 hover:bg-[var(--hover-bg)] dark:hover:bg-white/[0.06] interactive-hover`}
            >
                <div className="flex items-center gap-1.5 truncate flex-1">
                    <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0 text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-300 transition-colors">
                        {isOpen ? (
                            <ChevronDown size={12} className="shrink-0 transition-transform duration-150" />
                        ) : (
                            <ChevronRight size={12} className="shrink-0 transition-transform duration-150" />
                        )}
                    </span>
                    <div className="relative shrink-0 flex items-center justify-center">
                        {isLoading ? (
                            <Loader2 size={15} className="text-gray-400 animate-spin shrink-0" />
                        ) : isOpen ? (
                            <FolderOpen size={15} className="text-gray-400 dark:text-slate-500 shrink-0" />
                        ) : (
                            <Folder size={15} className="text-gray-400 dark:text-slate-500 shrink-0" />
                        )}
                        {isLocked && (
                            <span title="PIN-geschützt" className="absolute -bottom-1 -right-1 flex items-center justify-center p-[1px] bg-white dark:bg-slate-900 rounded-full shadow-xs">
                                <Lock size={8} className="text-amber-500" strokeWidth={2.5} />
                            </span>
                        )}
                    </div>
                    {(folder as any).share_status === 'shared' && (
                        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-sky-400" title="Geteilter Ordner" />
                    )}
                    {editingId === folder.id ? (
                        <input
                            autoFocus
                            onFocus={(e) => e.target.select()}
                            defaultValue={folder.title}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={(e) => onRenameSubmit?.(folder.id, e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && onRenameSubmit?.(folder.id, e.currentTarget.value)}
                            className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded px-1 text-sm outline-none font-normal text-gray-900 dark:text-gray-100"
                        />
                    ) : (
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {folder.title.startsWith('#') ? folder.title.slice(1).trim() : folder.title}
                        </span>
                    )}
                </div>
            </motion.div>
            {isOpen && (
                <div className="relative mt-0.5 ml-3 pl-2.5 border-l border-gray-200/90 dark:border-white/10 space-y-0.5">
                    {children
                        .sort((a, b) => {
                            if (!orderedNoteIds) return 0;
                            const indexA = orderedNoteIds.indexOf(a.id);
                            const indexB = orderedNoteIds.indexOf(b.id);
                            if (indexA === -1 && indexB === -1) return 0;
                            if (indexA === -1) return 1;
                            if (indexB === -1) return -1;
                            return indexA - indexB;
                        })
                        .map((f, i) => (
                            <motion.div
                                layout
                                key={f.id}
                                transition={{ layout: { type: 'spring', stiffness: 350, damping: 40, mass: 0.8 } }}
                                className={
                                    dropIndicator?.id === f.id && dropIndicator.zone === 'top'
                                        ? 'border-t-2 border-blue-400 rounded-t'
                                        : dropIndicator?.id === f.id && dropIndicator.zone === 'bottom'
                                        ? 'border-b-2 border-blue-400 rounded-b'
                                        : ''
                                }
                                onDragOver={(e: React.DragEvent) => {
                                    if (e.dataTransfer.types.includes('tide/calendar-event')) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const rowHeight = 32;
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    const y = e.clientY - rect.top;
                                    let zone: 'top' | 'middle' | 'bottom' = 'middle';
                                    if (f.type === 'folder') {
                                        if (y < rowHeight * 0.3) zone = 'top';
                                        else if (y > rowHeight * 0.7) zone = 'bottom';
                                    } else {
                                        zone = y < rowHeight / 2 ? 'top' : 'bottom';
                                    }
                                    setDropIndicator?.({ id: f.id, zone });
                                }}
                                onDragLeave={(e: React.DragEvent) => {
                                    if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
                                    setDropIndicator?.(null);
                                }}
                                onDrop={(e: React.DragEvent) => {
                                    if (e.dataTransfer.types.includes('tide/calendar-event')) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const zone = dropIndicator?.zone || 'bottom';
                                    setDropIndicator?.(null);
                                    const draggedId = e.dataTransfer.getData("text/plain");
                                    if (!draggedId || draggedId === f.id) return;

                                    if (zone === 'middle' && f.type === 'folder') {
                                        onMoveItem?.(draggedId, f.id);
                                        return;
                                    }

                                    const draggedFile = allFiles.find(o => o.id === draggedId);
                                    if (!draggedFile) return;

                                    // If moved to a new folder, trigger move
                                    if (draggedFile.parent_id !== folder.id) {
                                        onMoveItem?.(draggedId, folder.id);
                                    }

                                    // Local reorder within the folder using orderedNoteIds
                                    if (orderedNoteIds && setOrderedNoteIds) {
                                        const sortedChildren = children.sort((a, b) => {
                                            const iA = orderedNoteIds.indexOf(a.id);
                                            const iB = orderedNoteIds.indexOf(b.id);
                                            if (iA === -1 && iB === -1) return 0;
                                            if (iA === -1) return 1;
                                            if (iB === -1) return -1;
                                            return iA - iB;
                                        });
                                        const newChildren = sortedChildren.filter(o => o.id !== draggedId);
                                        let dropIdx = newChildren.findIndex(o => o.id === f.id);
                                        if (zone === 'bottom') dropIdx += 1;
                                        newChildren.splice(dropIdx, 0, draggedFile);

                                        // Update global orderedNoteIds
                                        const newOrderedIds = [...orderedNoteIds];
                                        // Remove draggedId from its old place
                                        const oldIdx = newOrderedIds.indexOf(draggedId);
                                        if (oldIdx !== -1) newOrderedIds.splice(oldIdx, 1);
                                        // Insert it relative to the target item in global order
                                        const targetGlobalIdx = newOrderedIds.indexOf(f.id);
                                        if (targetGlobalIdx !== -1) {
                                            newOrderedIds.splice(zone === 'bottom' ? targetGlobalIdx + 1 : targetGlobalIdx, 0, draggedId);
                                        } else {
                                            newOrderedIds.push(draggedId);
                                        }
                                        setOrderedNoteIds(newOrderedIds);
                                    }
                                }}
                            >
                                {f.type === 'folder' ? (
                                    <div className={`relative ${dropIndicator?.id === f.id && dropIndicator.zone === 'middle' ? 'ring-2 ring-blue-500 bg-blue-50/50 rounded-lg' : ''}`}>
                                        <FolderItem
                                            index={i}
                                            folder={f}
                                            allFiles={allFiles}
                                            level={level + 1}
                                            onSelect={onSelect}
                                            onDelete={onDelete}
                                            onRename={onRename}
                                            onVisibility={onVisibility}
                                            onShare={onShare}
                                            editingId={editingId}
                                            onRenameSubmit={onRenameSubmit}
                                            onCreateFolder={onCreateFolder}
                                            onMoveItem={onMoveItem}
                                            onDragStart={onDragStart}
                                            onContextMenu={onContextMenu}
                                            enabledExtensions={enabledExtensions}
                                            myId={myId}
                                            dropIndicator={dropIndicator}
                                            setDropIndicator={setDropIndicator}
                                            orderedNoteIds={orderedNoteIds}
                                            setOrderedNoteIds={setOrderedNoteIds}
                                            handleReorder={handleReorder}
                                            activeTabId={activeTabId}
                                            openTabs={openTabs}
                                        />
                                    </div>
                                ) : (
                                    <FileItem
                                        index={i}
                                        file={f}
                                        level={level + 1}
                                        onSelect={onSelect}
                                        onDelete={onDelete}
                                        onRename={onRename}
                                        onVisibility={onVisibility}
                                        onShare={onShare}
                                        editingId={editingId}
                                        onRenameSubmit={onRenameSubmit}
                                        onDragStart={onDragStart}
                                        onContextMenu={onContextMenu}
                                        enabledExtensions={enabledExtensions}
                                        myId={myId}
                                        activeTabId={activeTabId}
                                        openTabs={openTabs}
                                    />
                                )}
                            </motion.div>
                        ))}
                </div>
            )}
        </div>
    );
};


