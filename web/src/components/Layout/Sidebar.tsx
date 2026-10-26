"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import SmartIsland from "../extensions/smart_island/SmartIsland";
import MiniCalendar from "../Calendar/MiniCalendar";
import { ListTodo } from "lucide-react";
import { useDataStore } from "@/store/useDataStore";
import { apiFetch } from "@/lib/api";
import SecuritySettingsModal from "@/components/Security/SecuritySettingsModal";
import PinPromptModal from "@/components/Security/PinPromptModal";
import { ItemSecuritySettings, isItemUnlocked } from "@/lib/pinSecurity";
import { Check } from "lucide-react";
import type { DecryptedFile, ContextMenuEvent, DropIndicator, SidebarProps } from "./sidebar/types";
import SidebarQuickNotes from "./sidebar/SidebarQuickNotes";
import SidebarNavTree from "./sidebar/SidebarNavTree";
import SidebarContextMenu from "./sidebar/SidebarContextMenu";
import type { FileContextMenuState, SidebarContextMenuState } from "./sidebar/SidebarContextMenu";
import { useSidebarUserProfile } from "./sidebar/SidebarUserMenu";
import * as actions from "./sidebar/sidebarActions";

export default function Sidebar({
    files,
    onFileSelect,
    onNewNote,
    onDeleteNote,
    onRenameNote,
    onToggleVisibility,
    onShare,
    onOpenMessages,
    editingFileId,
    onRenameSubmit,
    onCreateFolder,
    onMoveItem,
    selectedDate,
    onDateSelect,
    hiddenThemeIds,
    onToggleThemeVisibility,
    onChatSelect,
    eventGroups,
    onCreateEventGroup,
    onUpdateEventGroup,
    enabledExtensions,
    onOpenSettings,
    userProfile: propProfile,
    openTabs,
    activeTabId,
    onTabSelect,
    onTabClose,
    onTabsReorder,
    onOpenCalendar,
    onOpenSocial,
    onOpenExams,
    onNewCanvasNote,
    onOpenTodos,
    isTodosActive,
    onToggleTodos,
}: SidebarProps) {
    const { orderedNoteIds, setOrderedNoteIds } = useDataStore();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const clearScrollInterval = () => {
        if (scrollIntervalRef.current !== null) {
            clearInterval(scrollIntervalRef.current);
            scrollIntervalRef.current = null;
        }
    };

    const { myId, sidebarUserProfile } = useSidebarUserProfile();
    const [contextMenu, setContextMenu] = useState<FileContextMenuState | null>(null);
    const lastContextMenuOpenTimeRef = useRef(0);
    const [sidebarContextMenu, setSidebarContextMenu] = useState<SidebarContextMenuState | null>(null);
    const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Security & PIN Protection State
    const [securityModalItem, setSecurityModalItem] = useState<{ id: string; title: string; type: 'file' | 'folder' | 'note' | 'canvas'; metadata?: any } | null>(null);
    const [pinPromptItem, setPinPromptItem] = useState<{ id: string; title: string; type: 'file' | 'folder' | 'note' | 'canvas'; metadata?: any; onUnlocked?: () => void } | null>(null);

    const handleOpenSecuritySettings = (id: string) => {
        const target = files.find(f => f.id === id);
        if (target) {
            setSecurityModalItem({
                id: target.id,
                title: target.title,
                type: (target.type as any) || 'note',
                metadata: target.metadata
            });
        }
    };

    const handleSaveSecuritySettings = async (settings: ItemSecuritySettings | null) => {
        if (!securityModalItem) return;
        const itemId = securityModalItem.id;
        const target = files.find(f => f.id === itemId);
        const currentMeta = target?.metadata || {};
        const updatedMeta = settings ? {
            ...currentMeta,
            has_custom_password: true,
            pwd_salt: settings.pwd_salt,
            pin_hash: settings.pin_hash,
            security_settings: settings
        } : {
            ...currentMeta,
            has_custom_password: false,
            pwd_salt: undefined,
            pin_hash: undefined,
            security_settings: null
        };

        const res = await apiFetch(`/api/v1/files/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ metadata: updatedMeta })
        });
        if (!res.ok) {
            throw new Error('Fehler beim Speichern der Sicherheitseinstellungen.');
        }
        useDataStore.getState().updateFileRaw(itemId, { metadata: updatedMeta });
    };

    const handleProtectedSelect = (fileId: string, title: string) => {
        const target = files.find(f => f.id === fileId);
        const settings = target?.metadata?.security_settings || (target?.metadata?.has_custom_password ? target?.metadata : null);
        if (settings?.has_custom_password && !isItemUnlocked(fileId, settings)) {
            setPinPromptItem({
                id: fileId,
                title: title || target?.title || 'Notiz',
                type: (target?.type as any) || 'note',
                metadata: target?.metadata,
                onUnlocked: () => onFileSelect(fileId, title)
            });
            return;
        }
        onFileSelect(fileId, title);
    };

    const handleProtectedTabSelect = (tabId: string, tabType: any) => {
        if (tabType === 'file') {
            const target = files.find(f => f.id === tabId);
            const settings = target?.metadata?.security_settings || (target?.metadata?.has_custom_password ? target?.metadata : null);
            if (settings?.has_custom_password && !isItemUnlocked(tabId, settings)) {
                setPinPromptItem({
                    id: tabId,
                    title: target?.title || 'Notiz',
                    type: (target?.type as any) || 'note',
                    metadata: target?.metadata,
                    onUnlocked: () => onTabSelect?.(tabId, tabType)
                });
                return;
            }
        }
        onTabSelect?.(tabId, tabType);
    };

    const userProfile = propProfile || sidebarUserProfile;

    const topLevelItems = useMemo(() => {
        return files?.filter(f => f.parent_id === null && f.type !== 'event' && f.type !== 'canvas-asset' && (!(f as any).share_status || (f as any).share_status === 'owner')) || [];
    }, [files]);

    // Files shared with me (pending or accepted, not owned by me)
    const sharedWithMeItems = useMemo(() => {
        return files?.filter(f => {
            const status = (f as any).share_status;
            return status === 'pending' || status === 'accepted';
        }) || [];
    }, [files]);
    const pendingShareCount = sharedWithMeItems.filter(f => (f as any).share_status === 'pending').length;
    const [isSharedFolderOpen, setIsSharedFolderOpen] = useState(true);
    const [orderedItems, setOrderedItems] = useState<DecryptedFile[]>([]);

    useEffect(() => {
        const sorted = [...topLevelItems].sort((a, b) => {
            const indexA = orderedNoteIds.indexOf(a.id);
            const indexB = orderedNoteIds.indexOf(b.id);
            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });
        const uniqueItems = Array.from(new Map(sorted.map(item => [item.id, item])).values());
        setOrderedItems(uniqueItems);
    }, [files, orderedNoteIds]);

    const handleReorder = (newItems: DecryptedFile[]) => {
        setOrderedItems(newItems);
        const newIds = newItems.map(i => i.id);
    };


    useEffect(() => {
        const handlePromptPin = (e: Event) => {
            const detail = (e as CustomEvent)?.detail;
            if (detail) {
                setPinPromptItem({
                    id: detail.id,
                    title: detail.title,
                    type: detail.type,
                    metadata: detail.metadata,
                    onUnlocked: () => {
                        if (detail.type === 'folder') {
                            useDataStore.getState().toggleFolder(detail.id, true);
                        }
                    }
                });
            }
        };
        window.addEventListener('tide:prompt-pin', handlePromptPin);
        return () => window.removeEventListener('tide:prompt-pin', handlePromptPin);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (Date.now() - lastContextMenuOpenTimeRef.current < 450) return;
            const target = event.target as HTMLElement | null;
            if (contextMenu && target && !target.closest?.('.context-menu')) {
                setContextMenu(null);
            }
            if (sidebarContextMenu && target && !target.closest?.('.context-menu')) {
                setSidebarContextMenu(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("touchstart", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("touchstart", handleClickOutside);
        };
    }, [contextMenu, sidebarContextMenu]);

    useEffect(() => {
        const handleDragEnd = () => {
            setDropIndicator(null);
            clearScrollInterval();
        };
        document.addEventListener('dragend', handleDragEnd);
        return () => document.removeEventListener('dragend', handleDragEnd);
    }, []);

    const handleContextMenu = (e: ContextMenuEvent, id: string, type: 'file' | 'folder') => {
        e.preventDefault?.();
        e.stopPropagation?.();
        lastContextMenuOpenTimeRef.current = Date.now();
        setContextMenu({ x: e.clientX, y: e.clientY, id, type });
    };

    const effectiveUserName = userProfile?.username || (typeof window !== 'undefined' ? sessionStorage.getItem('tide_user_name') : null) || (userProfile?.email || "").split('@')[0] || "User";

    const handleImport = (targetFolderId: string | null = null) => actions.handleImport(onFileSelect, targetFolderId);
    const handleExport = (itemId: string, format: 'bundle' | 'markdown') => actions.handleExport(files, itemId, format);
    const handleCopyToMyNotes = (file: DecryptedFile) => actions.handleCopyToMyNotes(file, onFileSelect, setContextMenu, setToastMessage);

    return (
        <div
            className="w-56 md:w-60 lg:w-64 h-full flex flex-col shrink-0 relative z-[100] transition-all duration-300 overflow-visible"
            onContextMenu={(e) => {
                if (e.defaultPrevented) return;
                e.preventDefault();
                lastContextMenuOpenTimeRef.current = Date.now();
                setSidebarContextMenu({ x: e.clientX, y: e.clientY });
            }}
        >
            <SidebarQuickNotes
                activeTabId={activeTabId}
                enabledExtensions={enabledExtensions}
                onOpenSocial={onOpenSocial}
                onOpenExams={onOpenExams}
                onCreateFolder={onCreateFolder}
                onNewNote={onNewNote}
                onImport={() => handleImport(null)}
            />
            {/* Scrollable notes section — flex-based height so RECENT expansion doesn't push content under Smart Island */}
            <div
                ref={scrollContainerRef}
                className="overflow-y-auto overflow-x-visible px-2 no-scrollbar overscroll-contain"
                style={{
                    flex: '1 1 0',
                    minHeight: 0,
                    paddingBottom: '32px',
                    touchAction: 'pan-y',
                    overscrollBehavior: 'contain',
                    WebkitOverflowScrolling: 'touch',
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    const container = scrollContainerRef.current;
                    if (!container) return;
                    const rect = container.getBoundingClientRect();
                    const ZONE = 60;
                    const SPEED = 6;
                    if (e.clientY < rect.top + ZONE) {
                        if (scrollIntervalRef.current === null) {
                            scrollIntervalRef.current = setInterval(() => container.scrollBy(0, -SPEED), 16);
                        }
                    } else if (e.clientY > rect.bottom - ZONE) {
                        if (scrollIntervalRef.current === null) {
                            scrollIntervalRef.current = setInterval(() => container.scrollBy(0, SPEED), 16);
                        }
                    } else {
                        clearScrollInterval();
                    }
                }}
                onDragLeave={(e) => {
                    const container = scrollContainerRef.current;
                    if (!container) return;
                    const rect = container.getBoundingClientRect();
                    if (e.clientY < rect.top || e.clientY > rect.bottom || e.clientX < rect.left || e.clientX > rect.right) {
                        clearScrollInterval();
                    }
                }}
                onDrop={(e) => {
                    clearScrollInterval();
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain");
                    if (id && e.target === e.currentTarget) {
                        onMoveItem?.(id, null);
                    }
                    setDropIndicator(null);
                }}
            >
                <SidebarNavTree
                    files={files}
                    onDeleteNote={onDeleteNote}
                    onRenameNote={onRenameNote}
                    onToggleVisibility={onToggleVisibility}
                    onShare={onShare}
                    editingFileId={editingFileId}
                    onRenameSubmit={onRenameSubmit}
                    onCreateFolder={onCreateFolder}
                    onMoveItem={onMoveItem}
                    hiddenThemeIds={hiddenThemeIds}
                    onToggleThemeVisibility={onToggleThemeVisibility}
                    enabledExtensions={enabledExtensions}
                    activeTabId={activeTabId}
                    openTabs={openTabs}
                    myId={myId}
                    sharedWithMeItems={sharedWithMeItems}
                    pendingShareCount={pendingShareCount}
                    isSharedFolderOpen={isSharedFolderOpen}
                    setIsSharedFolderOpen={setIsSharedFolderOpen}
                    orderedItems={orderedItems}
                    dropIndicator={dropIndicator}
                    setDropIndicator={setDropIndicator}
                    orderedNoteIds={orderedNoteIds}
                    setOrderedNoteIds={setOrderedNoteIds}
                    handleReorder={handleReorder}
                    handleProtectedSelect={handleProtectedSelect}
                    handleContextMenu={handleContextMenu}
                />
            </div>


            {/* Bottom spacer — reserves height for the absolutely-positioned Smart Island.
                Needs to be >= island height (≈250px) + bottom-6 margin (24px). */}
            <div className="flex-shrink-0 h-[220px]" />

            {/* Smart Island — absolutely positioned, extends beyond sidebar */}
            <div className="absolute bottom-4 left-4 z-[500] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-[calc(100vw-2rem)] pointer-events-none [&>*]:pointer-events-auto">
                {(!enabledExtensions || enabledExtensions.includes('todos')) && (
                    <div className="flex items-center justify-start px-1">
                        <button
                            onClick={() => onToggleTodos ? onToggleTodos() : onOpenTodos?.()}
                            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                isTodosActive || activeTabId === 'todos'
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 shadow-sm'
                            }`}
                            title="Todos"
                        >
                            <ListTodo size={18} />
                        </button>
                    </div>
                )}

                {enabledExtensions?.includes('smart_island') ? (
                    <SmartIsland
                        selectedDate={selectedDate || new Date()}
                        onSelect={(date: Date) => onDateSelect && onDateSelect(date)}
                        userName={effectiveUserName}
                    />
                ) : (
                    <div className="px-2 pb-2">
                        <MiniCalendar selectedDate={selectedDate} onSelect={onDateSelect} />
                    </div>
                )}
            </div>

            <SidebarContextMenu
                files={files}
                onNewNote={onNewNote}
                onCreateFolder={onCreateFolder}
                onShare={onShare}
                onDeleteNote={onDeleteNote}
                onRenameNote={onRenameNote}
                onNewCanvasNote={onNewCanvasNote}
                contextMenu={contextMenu}
                setContextMenu={setContextMenu}
                sidebarContextMenu={sidebarContextMenu}
                setSidebarContextMenu={setSidebarContextMenu}
                myId={myId}
                handleOpenSecuritySettings={handleOpenSecuritySettings}
                handleExport={handleExport}
                handleImport={handleImport}
                handleCopyToMyNotes={handleCopyToMyNotes}
            />

            {securityModalItem && (
                <SecuritySettingsModal
                    isOpen={!!securityModalItem}
                    onClose={() => setSecurityModalItem(null)}
                    item={securityModalItem}
                    userEmail={userProfile?.email}
                    onSaveSettings={handleSaveSecuritySettings}
                />
            )}

            {pinPromptItem && (
                <PinPromptModal
                    isOpen={!!pinPromptItem}
                    onClose={() => setPinPromptItem(null)}
                    item={pinPromptItem}
                    userEmail={userProfile?.email}
                    onUnlock={() => {
                        const cb = pinPromptItem.onUnlocked;
                        setPinPromptItem(null);
                        cb?.();
                    }}
                    onOpenSecuritySettings={() => {
                        const itemToConfigure = pinPromptItem;
                        setPinPromptItem(null);
                        setSecurityModalItem(itemToConfigure);
                    }}
                />
            )}

            {toastMessage && (
                <div className="fixed bottom-6 right-6 z-[300] bg-[#111827] dark:bg-zinc-800 text-white dark:text-zinc-100 px-4 py-3 rounded-xl shadow-2xl border border-zinc-700 text-xs sm:text-sm flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-none">
                    <Check size={16} className="text-emerald-400 shrink-0" />
                    <span className="font-medium">{toastMessage}</span>
                </div>
            )}

            <style jsx>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}
