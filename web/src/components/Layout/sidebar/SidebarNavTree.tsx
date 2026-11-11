import { useState, useMemo } from "react";
import { Folder, FolderOpen, ChevronRight, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";
import type { DecryptedFile, ContextMenuEvent, DropIndicator, SidebarProps } from "./types";
import { FileItem } from "./FileItem";
import { FolderItem } from "./FolderItem";
import { useDataStore } from "@/store/useDataStore";

type NavTreeProps = Pick<SidebarProps, 'files' | 'onDeleteNote' | 'onRenameNote' | 'onToggleVisibility' | 'onShare' | 'editingFileId' | 'onRenameSubmit' | 'onCreateFolder' | 'onMoveItem' | 'hiddenThemeIds' | 'onToggleThemeVisibility' | 'enabledExtensions' | 'activeTabId' | 'openTabs'> & {
    myId: string;
    sharedWithMeItems: DecryptedFile[];
    pendingShareCount: number;
    isSharedFolderOpen: boolean;
    setIsSharedFolderOpen: (fn: (o: boolean) => boolean) => void;
    orderedItems: DecryptedFile[];
    dropIndicator: DropIndicator | null;
    setDropIndicator: (indicator: DropIndicator | null) => void;
    orderedNoteIds: string[];
    setOrderedNoteIds: (ids: string[]) => void;
    handleReorder: (newItems: DecryptedFile[]) => void;
    handleProtectedSelect: (fileId: string, title: string) => void;
    handleContextMenu: (e: ContextMenuEvent, id: string, type: 'file' | 'folder') => void;
};

export default function SidebarNavTree({
    files, onDeleteNote, onRenameNote, onToggleVisibility, onShare, editingFileId, onRenameSubmit, onCreateFolder, onMoveItem,
    hiddenThemeIds, onToggleThemeVisibility, enabledExtensions, activeTabId, openTabs, myId, sharedWithMeItems, pendingShareCount,
    isSharedFolderOpen, setIsSharedFolderOpen, orderedItems, dropIndicator, setDropIndicator, orderedNoteIds, setOrderedNoteIds,
    handleReorder, handleProtectedSelect, handleContextMenu,
}: NavTreeProps) {
    const activeSafes = useDataStore((s) => s.activeSafes);
    const normActiveSafes = useMemo(() => (activeSafes || []).map((s) => (s === 'Standard' ? 'main' : s)), [activeSafes]);
    const [isRelatedFolderOpen, setIsRelatedFolderOpen] = useState(true);

    const relatedItems = useMemo(() => {
        return files.filter((f) => {
            if (f.type === 'folder' || f.type === 'event' || f.type === 'canvas-asset') return false;
            const rawSafe = f.safe || (f.metadata && f.metadata.safe) || 'main';
            const primarySafe = rawSafe === 'Standard' ? 'main' : rawSafe;
            if (normActiveSafes.includes(primarySafe)) return false;

            const rawLinked: string[] = Array.isArray(f.linkedSafes)
                ? f.linkedSafes
                : Array.isArray(f.metadata?.linkedSafes)
                ? f.metadata.linkedSafes
                : [];
            const normLinked = rawLinked.map((s) => (s === 'Standard' ? 'main' : s));
            const isLinked = normLinked.some((s) => normActiveSafes.includes(s));
            if (!isLinked) return false;

            // Check if assigned to a folder in the current active safe
            if (f.parent_id) {
                const parent = files.find((p) => p.id === f.parent_id);
                if (parent && parent.type === 'folder') {
                    const parentSafe = (parent.safe || parent.metadata?.safe || 'main') === 'Standard' ? 'main' : (parent.safe || parent.metadata?.safe || 'main');
                    if (normActiveSafes.includes(parentSafe)) {
                        return false;
                    }
                }
            }
            return true;
        });
    }, [files, normActiveSafes]);

    const displayOrderedItems = useMemo(() => {
        if (relatedItems.length === 0) return orderedItems;
        const relatedIds = new Set(relatedItems.map((r) => r.id));
        return orderedItems.filter((item) => !relatedIds.has(item.id));
    }, [orderedItems, relatedItems]);

    const isDescendant = (parentCandidateId: string, childCandidateId: string): boolean => {
        let curr = files.find(f => f.id === childCandidateId);
        let depth = 0;
        while (curr && curr.parent_id && depth < 20) {
            if (curr.parent_id === parentCandidateId) return true;
            curr = files.find(f => f.id === curr!.parent_id);
            depth++;
        }
        return false;
    };

    return (
                <div className="space-y-0.5">
                    {relatedItems.length > 0 && (
                        <div className="mb-1">
                            <button
                                onClick={() => setIsRelatedFolderOpen(o => !o)}
                                className="group flex items-center justify-between w-full px-2 py-1.5 rounded-lg hover:bg-[var(--hover-bg)] dark:hover:bg-white/[0.06] interactive-hover transition-colors"
                            >
                                <div className="flex items-center gap-1.5 truncate flex-1">
                                    <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0 text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-300 transition-colors">
                                        {isRelatedFolderOpen ? (
                                            <ChevronDown size={12} className="shrink-0 transition-transform duration-150" />
                                        ) : (
                                            <ChevronRight size={12} className="shrink-0 transition-transform duration-150" />
                                        )}
                                    </span>
                                    {isRelatedFolderOpen ? <FolderOpen size={15} className="text-blue-500 shrink-0" /> : <Folder size={15} className="text-blue-500 shrink-0" />}
                                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">Verwandt</span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                                        {relatedItems.length}
                                    </span>
                                </div>
                            </button>
                            {isRelatedFolderOpen && (
                                <div className="relative mt-0.5 ml-3 pl-2.5 border-l border-blue-200/60 dark:border-blue-800/40 space-y-0.5">
                                    {relatedItems.map((item) => (
                                        <FileItem
                                            key={item.id}
                                            file={item}
                                            level={0}
                                            onSelect={handleProtectedSelect}
                                            onDelete={onDeleteNote}
                                            onRename={onRenameNote}
                                            onVisibility={onToggleVisibility}
                                            onShare={onShare}
                                            editingId={editingFileId}
                                            onRenameSubmit={onRenameSubmit}
                                            onDragStart={(e, id) => e.dataTransfer.setData("text/plain", id)}
                                            enabledExtensions={enabledExtensions}
                                            myId={myId}
                                            onContextMenu={handleContextMenu}
                                            activeTabId={activeTabId}
                                            openTabs={openTabs}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {sharedWithMeItems.length > 0 && (
                        <div className="mb-1">
                            <button
                                onClick={() => setIsSharedFolderOpen(o => !o)}
                                className="group flex items-center justify-between w-full px-2 py-1.5 rounded-lg hover:bg-[var(--hover-bg)] dark:hover:bg-white/[0.06] interactive-hover transition-colors"
                            >
                                <div className="flex items-center gap-1.5 truncate flex-1">
                                    <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0 text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-300 transition-colors">
                                        {isSharedFolderOpen ? (
                                            <ChevronDown size={12} className="shrink-0 transition-transform duration-150" />
                                        ) : (
                                            <ChevronRight size={12} className="shrink-0 transition-transform duration-150" />
                                        )}
                                    </span>
                                    {isSharedFolderOpen ? <FolderOpen size={15} className="text-violet-400 shrink-0" /> : <Folder size={15} className="text-violet-400 shrink-0" />}
                                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">Geteilt mit mir</span>
                                    {pendingShareCount > 0 && (
                                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
                                            {pendingShareCount} neu
                                        </span>
                                    )}
                                </div>
                            </button>
                            {isSharedFolderOpen && (
                                <div className="relative mt-0.5 ml-3 pl-2.5 border-l border-violet-200/60 dark:border-violet-800/40 space-y-0.5">
                                    {(() => {
                                        const topShared = sharedWithMeItems.filter(f => !f.parent_id || !sharedWithMeItems.some(p => p.id === f.parent_id));
                                        return topShared.map((item) => (
                                            item.type === 'folder' ? (
                                                <FolderItem
                                                    key={item.id}
                                                    folder={item}
                                                    allFiles={files}
                                                    level={0}
                                                    viewMode={'files'}
                                                    onSelect={handleProtectedSelect}
                                                    onDelete={onDeleteNote}
                                                    onRename={onRenameNote}
                                                    onVisibility={onToggleVisibility}
                                                    onShare={onShare}
                                                    editingId={editingFileId}
                                                    onRenameSubmit={onRenameSubmit}
                                                    onCreateFolder={onCreateFolder}
                                                    onMoveItem={onMoveItem}
                                                    onDragStart={(e, id) => e.dataTransfer.setData("text/plain", id)}
                                                    hiddenThemeIds={hiddenThemeIds}
                                                    onToggleThemeVisibility={(id) => onToggleThemeVisibility && onToggleThemeVisibility(id)}
                                                    enabledExtensions={enabledExtensions}
                                                    myId={myId}
                                                    onContextMenu={handleContextMenu}
                                                    dropIndicator={dropIndicator}
                                                    setDropIndicator={setDropIndicator}
                                                    orderedNoteIds={orderedNoteIds}
                                                    setOrderedNoteIds={setOrderedNoteIds}
                                                    handleReorder={handleReorder}
                                                    activeTabId={activeTabId}
                                                    openTabs={openTabs}
                                                />
                                            ) : (
                                                <FileItem
                                                    key={item.id}
                                                    file={item}
                                                    level={0}
                                                    onSelect={handleProtectedSelect}
                                                    onDelete={onDeleteNote}
                                                    onRename={onRenameNote}
                                                    onVisibility={onToggleVisibility}
                                                    onShare={onShare}
                                                    editingId={editingFileId}
                                                    onRenameSubmit={onRenameSubmit}
                                                    onDragStart={(e, id) => e.dataTransfer.setData("text/plain", id)}
                                                    enabledExtensions={enabledExtensions}
                                                    myId={myId}
                                                    onContextMenu={handleContextMenu}
                                                    activeTabId={activeTabId}
                                                    openTabs={openTabs}
                                                />
                                            )
                                        ));
                                    })()}
                                </div>
                            )}
                        </div>
                    )}
                    {displayOrderedItems.map((item, i) => (
                        <motion.div
                            layout
                            key={item.id}
                            transition={{ layout: { type: 'spring', stiffness: 350, damping: 40, mass: 0.8 } }}
                            className={
                                dropIndicator?.id === item.id && dropIndicator.zone === 'top'
                                    ? 'border-t-2 border-blue-400 rounded-t'
                                    : dropIndicator?.id === item.id && dropIndicator.zone === 'bottom'
                                    ? 'border-b-2 border-blue-400 rounded-b'
                                    : ''
                            }
                            onDragOver={(e: React.DragEvent) => {
                                if (e.dataTransfer.types.includes('tide/calendar-event')) {
                                    return; // Let FileItem handle calendar drops!
                                }
                                e.preventDefault();
                                e.stopPropagation();
                                const rowHeight = 32; // Feste Höhe einer Item-Row
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const y = e.clientY - rect.top;
                                let zone: 'top' | 'middle' | 'bottom' = 'middle';
                                if (item.type === 'folder') {
                                    if (y < rowHeight * 0.3) zone = 'top';
                                    else if (y > rowHeight * 0.7) zone = 'bottom';
                                } else {
                                    zone = y < rowHeight / 2 ? 'top' : 'bottom';
                                }
                                setDropIndicator({ id: item.id, zone });
                            }}
                            onDragLeave={(e: React.DragEvent) => {
                                if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
                                setDropIndicator(null);
                            }}
                            onDrop={(e: React.DragEvent) => {
                                if (e.dataTransfer.types.includes('tide/calendar-event')) {
                                    return; // Handled by FileItem
                                }
                                e.preventDefault();
                                e.stopPropagation();
                                const zone = dropIndicator?.zone || 'bottom';
                                setDropIndicator(null);
                                const draggedId = e.dataTransfer.getData("text/plain");
                                if (!draggedId || draggedId === item.id) return;

                                if (zone === 'middle' && item.type === 'folder') {
                                    if (!isDescendant(draggedId, item.id)) {
                                        onMoveItem?.(draggedId, item.id);
                                    }
                                    return;
                                }

                                const draggedFile = files.find(o => o.id === draggedId);
                                if (!draggedFile) return;

                                const newItems = [...orderedItems].filter(o => o.id !== draggedId);
                                let dropIdx = newItems.findIndex(o => o.id === item.id);
                                if (zone === 'bottom') dropIdx += 1;

                                if (draggedFile.parent_id !== null) {
                                    onMoveItem?.(draggedId, null);
                                    // Since it's moving from a folder to root, we must add it to the top level
                                    newItems.splice(dropIdx, 0, draggedFile);
                                    handleReorder(newItems);
                                } else {
                                    // It's already top level, just reorder
                                    const draggedItemInOrder = orderedItems.find(o => o.id === draggedId);
                                    if (draggedItemInOrder) {
                                        newItems.splice(dropIdx, 0, draggedItemInOrder);
                                        handleReorder(newItems);
                                    }
                                }
                            }}
                        >
                            {item.type === 'folder' ? (
                                <div className={`relative ${dropIndicator?.id === item.id && dropIndicator.zone === 'middle' ? 'ring-2 ring-blue-500 bg-blue-50/50 rounded-lg' : ''}`}>
                                    <FolderItem
                                        folder={item}
                                        allFiles={files}
                                        level={0}
                                        viewMode={'files'}
                                        onSelect={handleProtectedSelect}
                                        onDelete={onDeleteNote}
                                        onRename={onRenameNote}
                                        onVisibility={onToggleVisibility}
                                        onShare={onShare}
                                        editingId={editingFileId}
                                        onRenameSubmit={onRenameSubmit}
                                        onCreateFolder={onCreateFolder}
                                        onMoveItem={onMoveItem}
                                        onDragStart={(e, id) => e.dataTransfer.setData("text/plain", id)}
                                        hiddenThemeIds={hiddenThemeIds}
                                        onToggleThemeVisibility={(id) => onToggleThemeVisibility && onToggleThemeVisibility(id)}
                                        enabledExtensions={enabledExtensions}
                                        myId={myId}
                                        onContextMenu={handleContextMenu}
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
                                    file={item}
                                    level={0}
                                    onSelect={handleProtectedSelect}
                                    onDelete={onDeleteNote}
                                    onRename={onRenameNote}
                                    onVisibility={onToggleVisibility}
                                    onShare={onShare}
                                    editingId={editingFileId}
                                    onRenameSubmit={onRenameSubmit}
                                    onDragStart={(e, id) => e.dataTransfer.setData("text/plain", id)}
                                    enabledExtensions={enabledExtensions}
                                    myId={myId}
                                    onContextMenu={handleContextMenu}
                                    activeTabId={activeTabId}
                                    openTabs={openTabs}
                                />
                            )}
                        </motion.div>
                    ))}
                </div>
    );
}
