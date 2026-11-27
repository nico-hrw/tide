"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import SidebarIsland from "./sidebar/SidebarIsland";
import AvatarMenu from "./AvatarMenu";
import PluginsMenu from "./PluginsMenu";
import { useDataStore } from "@/store/useDataStore";
import { apiFetch } from "@/lib/api";
import SecuritySettingsModal from "@/components/Security/SecuritySettingsModal";
import PinPromptModal from "@/components/Security/PinPromptModal";
import { ItemSecuritySettings, isItemUnlocked } from "@/lib/pinSecurity";
import { Check } from "lucide-react";
import type { DecryptedFile, ContextMenuEvent, DropIndicator, SidebarProps } from "./sidebar/types";

declare module "./sidebar/types" {
    interface DecryptedFile {
        updatedAt?: string | number | Date;
        createdAt?: string | number | Date;
    }
}

interface SecurityItemMetadata {
    security_settings?: ItemSecuritySettings;
    has_custom_password?: boolean;
    pwd_salt?: string;
    pin_hash?: string;
    frequency?: ItemSecuritySettings['frequency'];
    [key: string]: unknown;
}

interface SecurityModalItem {
    id: string;
    title: string;
    type: 'file' | 'folder' | 'note' | 'canvas';
    metadata?: SecurityItemMetadata;
}
import SidebarQuickNotes from "./sidebar/SidebarQuickNotes";
import SidebarNavTree from "./sidebar/SidebarNavTree";
import SidebarContextMenu from "./sidebar/SidebarContextMenu";
import type { FileContextMenuState, SidebarContextMenuState } from "./sidebar/SidebarContextMenu";
import { useSidebarUserProfile } from "./sidebar/SidebarUserMenu";
import { filterFilesBySafe } from "./sidebar/SidebarFiles";
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
    onOpenStudium,
    onOpenSocial,
    isAvatarMenuOpen,
    setIsAvatarMenuOpen,
    avatarMenuRef,
    onOpenTrash,
    onLogout,
    onOpenExams,
}: SidebarProps) {
    const { orderedNoteIds, setOrderedNoteIds, navigationMode } = useDataStore();
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
    const [isBubbleTraversing, setIsBubbleTraversing] = useState(false);

    // Security & PIN Protection State
    const [securityModalItem, setSecurityModalItem] = useState<SecurityModalItem | null>(null);
    const [pinPromptItem, setPinPromptItem] = useState<(SecurityModalItem & { onUnlocked?: () => void }) | null>(null);

    const handleOpenSecuritySettings = (id: string) => {
        const target = files.find(f => f.id === id);
        if (target) {
            setSecurityModalItem({
                id: target.id,
                title: target.title,
                type: (target.type as 'file' | 'folder' | 'note' | 'canvas') || 'note',
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
                type: (target?.type as 'file' | 'folder' | 'note' | 'canvas') || 'note',
                metadata: target?.metadata,
                onUnlocked: () => onFileSelect(fileId, title)
            });
            return;
        }
        onFileSelect(fileId, title);
    };

    const handleProtectedTabSelect = (tabId: string, tabType: Parameters<NonNullable<SidebarProps['onTabSelect']>>[1]) => {
        if (tabType === 'file') {
            const target = files.find(f => f.id === tabId);
            const settings = target?.metadata?.security_settings || (target?.metadata?.has_custom_password ? target?.metadata : null);
            if (settings?.has_custom_password && !isItemUnlocked(tabId, settings)) {
                setPinPromptItem({
                    id: tabId,
                    title: target?.title || 'Notiz',
                    type: (target?.type as 'file' | 'folder' | 'note' | 'canvas') || 'note',
                    metadata: target?.metadata,
                    onUnlocked: () => onTabSelect?.(tabId, tabType)
                });
                return;
            }
        }
        onTabSelect?.(tabId, tabType);
    };

    const userProfile = propProfile || sidebarUserProfile;
    const activeSafes = useDataStore((s) => s.activeSafes);

    const safeFilteredFiles = useMemo(() => {
        return filterFilesBySafe(files, activeSafes);
    }, [files, activeSafes]);

    const topLevelItems = useMemo(() => {
        return safeFilteredFiles?.filter(f => f.parent_id === null && f.type !== 'event' && f.type !== 'canvas-asset' && (!(f as any).share_status || (f as any).share_status === 'owner')) || [];
    }, [safeFilteredFiles]);

    // Files shared with me (pending or accepted, not owned by me)
    const sharedWithMeItems = useMemo(() => {
        return safeFilteredFiles?.filter(f => {
            const status = (f as any).share_status;
            return status === 'pending' || status === 'accepted';
        }) || [];
    }, [safeFilteredFiles]);
    const pendingShareCount = sharedWithMeItems.filter(f => (f as any).share_status === 'pending').length;
    const [isSharedFolderOpen, setIsSharedFolderOpen] = useState(true);
    const orderedItems = useMemo(() => {
        const sorted = [...topLevelItems].sort((a, b) => {
            const indexA = orderedNoteIds.indexOf(a.id);
            const indexB = orderedNoteIds.indexOf(b.id);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            // Deterministic fallback: Folders first
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            // Most recently updated/created first
            const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
            const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
            if (timeB !== timeA) return timeB - timeA;
            // Stable tie-breaker by ID
            return a.id.localeCompare(b.id);
        });
        return Array.from(new Map(sorted.map(item => [item.id, item])).values());
    }, [topLevelItems, orderedNoteIds]);

    const handleReorder = (newItems: DecryptedFile[]) => {
        const newIds = newItems.map(i => i.id);
        const currentOtherIds = orderedNoteIds.filter(id => !topLevelItems.some(item => item.id === id));
        setOrderedNoteIds([...newIds, ...currentOtherIds]);
    };


    useEffect(() => {
        const handleTraversing = (e: Event) => {
            const customEvent = e as CustomEvent<{ active: boolean }>;
            setIsBubbleTraversing(Boolean(customEvent.detail?.active));
        };
        window.addEventListener('tide:bubble_traversing', handleTraversing);
        return () => window.removeEventListener('tide:bubble_traversing', handleTraversing);
    }, []);

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
                        if (typeof detail.onUnlocked === 'function') {
                            detail.onUnlocked();
                        } else if (detail.type === 'folder') {
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

    const storedName = typeof window !== 'undefined' ? (localStorage.getItem('tide_user_name') || sessionStorage.getItem('tide_user_name')) : null;
    const emailPrefix = (userProfile?.email || '').split('@')[0];
    const validUsername = userProfile?.username && userProfile.username !== emailPrefix ? userProfile.username : null;

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
            {setIsAvatarMenuOpen && avatarMenuRef && (
                <div className="flex items-center gap-2.5 px-3 pt-5 pb-1">
                    <AvatarMenu
                        userProfile={userProfile}
                        myId={myId}
                        isOpen={isAvatarMenuOpen}
                        setOpen={setIsAvatarMenuOpen}
                        menuRef={avatarMenuRef}
                        onOpenSocial={onOpenSocial}
                        onOpenSettings={onOpenSettings}
                        onOpenTrash={onOpenTrash}
                        onLogout={onLogout}
                        size={36}
                        placement="left"
                    />
                    <span className="min-w-0 truncate text-[14px] font-semibold text-t2-ink">{validUsername || emailPrefix || 'Profil'}</span>
                </div>
            )}
            <div className="mx-3 my-2 h-px shrink-0 bg-t2-line-soft" role="separator" />
            <nav aria-label="Bereiche" className={`flex flex-col gap-0.5 px-2 pt-0.5 transition-opacity duration-300 ${isBubbleTraversing ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
                <PluginsMenu
                    variant="row"
                    activeTabId={activeTabId ?? ''}
                    enabledExtensions={enabledExtensions}
                    onTabSelect={(id, type) => onTabSelect?.(id, type)}
                    onOpenSocial={onOpenSocial}
                    onOpenSettings={onOpenSettings}
                    onOpenVariables={() => useDataStore.getState().setVariablesModalOpen(true)}
                />
            </nav>
            <div className={`transition-opacity duration-300 ${isBubbleTraversing ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
                <SidebarQuickNotes
                    compact
                    activeTabId={activeTabId}
                    enabledExtensions={enabledExtensions}
                    onOpenSocial={onOpenSocial}
                    onOpenExams={onOpenExams}
                    onCreateFolder={onCreateFolder}
                    onNewNote={onNewNote}
                    onImport={() => handleImport(null)}
                />
            </div>
            <div className="mx-3 my-2 h-px shrink-0 bg-t2-line-soft" role="separator" />
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
                    e.dataTransfer.dropEffect = 'move';
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
                    files={safeFilteredFiles}
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


            {/* Smart Island: Quadrat in der Seitenleiste, die Karte wächst per Portal darüber hinaus */}
            {navigationMode !== 'folders' && (
                <><div className="mx-3 h-px shrink-0 bg-t2-line-soft" role="separator" /><SidebarIsland selectedDate={selectedDate} onSelect={onDateSelect} /></>
            )}

            <SidebarContextMenu
                files={files}
                onNewNote={onNewNote}
                onCreateFolder={onCreateFolder}
                onShare={onShare}
                onDeleteNote={onDeleteNote}
                onRenameNote={onRenameNote}
                onMoveItem={onMoveItem}
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
                <div className="fixed bottom-6 right-6 z-[300] bg-t2-ink text-t2-bg px-4 py-3 rounded-xl shadow-2xl border border-t2-ink-3 text-xs sm:text-sm flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-none">
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
