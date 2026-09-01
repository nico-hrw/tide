"use client";

import { FileText, Plus, Folder, FolderPlus, FolderOpen, Trash, Edit2, Share, Eye, EyeOff, ChevronRight, ChevronDown, MessageSquare, User, Settings, Lock, Pin, LogOut, Users, Puzzle, Globe, Check, Share2, Edit3, Trash2, Loader2, Upload, Download, Layout, X, GraduationCap, ShieldCheck } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { motion, Reorder, AnimatePresence, LayoutGroup } from "framer-motion";
import { Tab } from '@/components/Layout/TabList';
import SmartIsland from "../extensions/smart_island/SmartIsland";
import MiniCalendar from "../Calendar/MiniCalendar";
import { useHighlight } from "@/components/HighlightContext";
import { useDataStore } from "@/store/useDataStore";
import { useDragGhost } from "@/store/useDragGhost";
import { apiFetch, getApiBase } from "@/lib/api";
import Avatar from "@/components/Profile/Avatar";
import SecuritySettingsModal from "@/components/Security/SecuritySettingsModal";
import PinPromptModal from "@/components/Security/PinPromptModal";
import { ItemSecuritySettings, isItemUnlocked } from "@/lib/pinSecurity";

interface DecryptedFile {
    id: string;
    title: string;
    type: string;
    visibility: string;
    parent_id?: string | null;
    color?: string;
    owner_email?: string;
    owner_id?: string;
    effect?: string;
    isGroup?: boolean;
    share_status?: string;
    permission?: string;
    metadata?: any;
}

interface SidebarProps {
    files: DecryptedFile[];
    onFileSelect: (fileId: string, title: string) => void;
    onNewNote: (parentId?: string | null) => void;
    onDeleteNote: (e: React.MouseEvent, id: string) => void;
    onRenameNote: (e: React.MouseEvent, id: string, currentTitle: string) => void;
    onToggleVisibility: (e: React.MouseEvent, id: string, currentVisibility: string) => void;
    onShare: (e: React.MouseEvent, id: string) => void;
    onOpenMessages: () => void;
    editingFileId?: string | null;
    onRenameSubmit?: (id: string, newTitle: string) => void;
    onCreateFolder?: (parentId: string | null, color?: string) => void;
    onMoveItem?: (id: string, newParentId: string | null) => void;
    selectedDate?: Date;
    onDateSelect?: (date: Date) => void;
    hiddenThemeIds?: string[];
    onToggleThemeVisibility?: (themeId: string) => void;
    onChatSelect?: (partnerId: string, partnerName: string, partnerEmail: string) => void;
    eventGroups?: DecryptedFile[];
    onCreateEventGroup?: () => void;
    onUpdateEventGroup?: (id: string, updates: any) => void;
    enabledExtensions?: string[];
    onOpenSettings?: () => void;
    userProfile?: { id?: string; user_id?: string; username: string; email: string; bio?: string; title?: string; avatar_seed?: string; avatar_salt?: string };
    openTabs?: Tab[];
    activeTabId?: string;
    onTabSelect?: (id: string, type: Tab['type']) => void;
    onTabClose?: (e: React.MouseEvent, id: string) => void;
    onTabsReorder?: (newTabs: Tab[]) => void;
    onOpenCalendar?: () => void;
    onOpenSocial?: () => void;
    onOpenFinance?: () => void;
    onOpenExams?: () => void;
    onNewCanvasNote?: () => void;
}

interface ChatUser {
    id: string;
    public_key: string;
    username?: string;
    email?: string;
}

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
    onOpenFinance,
    onOpenExams,
    onNewCanvasNote,
}: SidebarProps) {
    const { highlight } = useHighlight();
    const { orderedNoteIds, setOrderedNoteIds, setSettingsModalOpen } = useDataStore();
    const [chats, setChats] = useState<ChatUser[]>([]);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const clearScrollInterval = () => {
        if (scrollIntervalRef.current !== null) {
            clearInterval(scrollIntervalRef.current);
            scrollIntervalRef.current = null;
        }
    };

    const [myId, setMyId] = useState<string>("");
    const [sidebarUserProfile, setSidebarUserProfile] = useState<{ id?: string, user_id?: string, username: string, email: string, avatar_seed?: string, avatar_salt?: string } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string, type: 'file' | 'folder' } | null>(null);
    const [sidebarContextMenu, setSidebarContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [dropIndicator, setDropIndicator] = useState<{ id: string, zone: 'top' | 'middle' | 'bottom' } | null>(null);

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
        const id = sessionStorage.getItem('tide_user_id') || localStorage.getItem('tide_user_id') || '';
        setMyId(id);

        const email = sessionStorage.getItem("tide_user_email") || localStorage.getItem("tide_user_email");
        let username = "User";

        if (email) {
            username = email.split('@')[0];
            const userRecordStr = localStorage.getItem("tide_user_" + email);
            if (userRecordStr) {
                try {
                    const record = JSON.parse(userRecordStr);
                    if (record.username) username = record.username;
                } catch (e) { }
            }
            setSidebarUserProfile({ username, email });

            // Fetch real profile (avatar_seed + avatar_salt) from backend
            if (id) {
                fetch(`${getApiBase()}/api/v1/profiles/${id}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(profile => {
                        if (profile) {
                            setSidebarUserProfile({
                                username: profile.username || username,
                                email,
                                avatar_seed: profile.avatar_seed || id,
                                avatar_salt: profile.avatar_salt || '',
                            });
                        }
                    })
                    .catch(() => { });
            }
        }
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
        const handleClickOutside = (event: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setIsProfileMenuOpen(false);
            }
            if (contextMenu && !(event.target as HTMLElement).closest('.context-menu')) {
                setContextMenu(null);
            }
            if (sidebarContextMenu && !(event.target as HTMLElement).closest('.context-menu')) {
                setSidebarContextMenu(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isProfileMenuOpen, contextMenu, sidebarContextMenu]);

    useEffect(() => {
        const handleDragEnd = () => {
            setDropIndicator(null);
            clearScrollInterval();
        };
        document.addEventListener('dragend', handleDragEnd);
        return () => document.removeEventListener('dragend', handleDragEnd);
    }, []);

    const handleSignOut = () => {
        sessionStorage.clear();
        localStorage.removeItem("tide_user_email");
        localStorage.removeItem("tide_user_id");
        localStorage.removeItem("tide_session_token");
        window.location.reload();
    };

    const handleContextMenu = (e: React.MouseEvent, id: string, type: 'file' | 'folder') => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, id, type });
    };

    const effectiveUserName = userProfile?.username || (typeof window !== 'undefined' ? sessionStorage.getItem('tide_user_name') : null) || (userProfile?.email || "").split('@')[0] || "User";

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.md';
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (event) => {
                const rawContent = event.target?.result as string;
                const title = file.name.replace(/\.md$/, '');
                const lines = rawContent.split('\n');
                const contentNodes = lines
                    .map((line: string) => line.trimEnd())
                    .filter((line: string) => line.length > 0)
                    .map((line: string) => ({
                        type: 'paragraph',
                        attrs: { blockId: crypto.randomUUID() },
                        content: [{ type: 'text', text: line }]
                    }));
                const tiptapDoc = {
                    type: 'doc',
                    content: contentNodes.length > 0 ? contentNodes : [
                        { type: 'paragraph', attrs: { blockId: crypto.randomUUID() } }
                    ]
                };
                const newId = await useDataStore.getState().createNote(title, tiptapDoc);
                useDataStore.getState().fetchDirectory(null, true);
                onFileSelect(newId, title);
            };
            reader.readAsText(file);
        };
        input.click();
    };

    return (
        <div
            className="w-64 h-full flex flex-col shrink-0 relative z-[100] transition-all duration-300 overflow-visible"
            onContextMenu={(e) => {
                if (e.defaultPrevented) return;
                e.preventDefault();
                setSidebarContextMenu({ x: e.clientX, y: e.clientY });
            }}
        >
            {/* Sticky top section: Navigation & Recent */}
            <div className="flex-shrink-0 p-2 pt-3 pb-0">
                {/* Navigation Section */}
                <div className="mb-4 px-1 flex gap-1">
                    <button
                        onClick={() => onOpenSocial?.()}
                        className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius)] cursor-pointer interactive-hover transition-colors group ${activeTabId === 'social' ? 'bg-[#EBEBEB] dark:bg-white/10' : 'hover:bg-[var(--hover-bg)]'}`}
                    >
                        <div className={`shrink-0 ${activeTabId === 'social' ? 'text-blue-500' : 'text-[var(--text-muted)] group-hover:text-blue-500 transition-colors'}`}>
                            <Users size={16} />
                        </div>
                        <span className={`text-[13px] font-medium flex-1 text-left ${activeTabId === 'social' ? 'text-[var(--text-body)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-body)] transition-colors'}`}>
                            Social
                        </span>
                    </button>
                    <button
                        onClick={() => onOpenExams?.()}
                        className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius)] cursor-pointer interactive-hover transition-colors group ${activeTabId === 'exams' ? 'bg-[#EBEBEB] dark:bg-white/10' : 'hover:bg-[var(--hover-bg)]'}`}
                    >
                        <div className={`shrink-0 ${activeTabId === 'exams' ? 'text-blue-500' : 'text-[var(--text-muted)] group-hover:text-blue-500 transition-colors'}`}>
                            <GraduationCap size={16} />
                        </div>
                        <span className={`text-[13px] font-medium flex-1 text-left ${activeTabId === 'exams' ? 'text-[var(--text-body)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-body)] transition-colors'}`}>
                            Prüfungen
                        </span>
                    </button>

                </div>
            </div>{/* end sticky top section */}

            {/* Notes label — outside scrollable area so it stays visible while scrolling */}
            <div className="flex-shrink-0 px-4 pt-2 pb-1">
                <p className="text-[11px] font-semibold uppercase tracking-[1.2px] text-gray-700 dark:text-slate-300">
                    Notes
                </p>
            </div>

            {/* Scrollable notes section — flex-based height so RECENT expansion doesn't push content under Smart Island */}
            <div
                ref={scrollContainerRef}
                className="overflow-y-auto overflow-x-visible px-2 no-scrollbar"
                style={{ flex: '1 1 0', minHeight: 0, paddingBottom: '32px' }}
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
                <div className="space-y-0.5">
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
                    {orderedItems.map((item, i) => (
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
                                    onMoveItem?.(draggedId, item.id);
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
            </div>

            {/* Bottom spacer — reserves height for the absolutely-positioned Smart Island.
                Needs to be >= island height (≈250px) + bottom-6 margin (24px). */}
            <div className="flex-shrink-0 h-[300px]" />

            {/* Smart Island — absolutely positioned, extends beyond sidebar */}
            <div className="absolute bottom-4 left-3.5 right-3.5 sm:right-auto z-[100] max-w-none">
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


            {contextMenu && (
                <div
                    className="context-menu fixed z-[200] w-56 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-100"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
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

                        {/* 4. Share (inkl. Sichtbarkeit) */}
                        <button
                            onClick={(e) => { setContextMenu(null); onShare(e, contextMenu.id); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors group"
                        >
                            <Share2 size={15} className="text-gray-400 group-hover:text-blue-500" />
                            <span className="font-medium">Teilen</span>
                        </button>

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

                        {/* 6. Trennlinie */}
                        <div className="h-px bg-gray-100 dark:bg-slate-800 my-1" />

                        {/* 7. Delete */}
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
                </div>
            )}

            {sidebarContextMenu && (
                <div
                    className="context-menu fixed z-[200] w-56 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-100"
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
                            <span className="font-medium">Importieren (.md)</span>
                        </button>
                    </div>
                </div>
            )}

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

            <style jsx>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}

interface FileItemProps {
    file: DecryptedFile;
    level: number;
    onSelect: (id: string, title: string) => void;
    onDelete: (e: React.MouseEvent, id: string) => void;
    onRename: (e: React.MouseEvent, id: string, currentTitle: string) => void;
    onVisibility: (e: React.MouseEvent, id: string, currentVisibility: string) => void;
    onShare: (e: React.MouseEvent, id: string) => void;
    editingId?: string | null;
    onRenameSubmit?: (id: string, newTitle: string) => void;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onContextMenu: (e: React.MouseEvent, id: string, type: 'file' | 'folder') => void;
    enabledExtensions?: string[];
    myId?: string;
    index?: number;
    activeTabId?: string;
    openTabs?: Tab[];
}

const FileItem = ({ file, level, onSelect, onDelete, onRename, onVisibility, onShare, editingId, onRenameSubmit, onDragStart, onContextMenu, enabledExtensions, myId, index, activeTabId, openTabs }: FileItemProps) => {
    const { isHighlighted, highlight } = useHighlight();
    const startGhost = useDragGhost(s => s.startGhost);
    const [isCalendarDropTarget, setIsCalendarDropTarget] = useState(false);
    const activeNoteId = useDataStore(s => s.activeNoteId);

    // Active state and Open tabs state
    const isActive = activeTabId === file.id || activeNoteId === file.id;
    const isOpen = !!openTabs?.some(t => t.id === file.id);

    // Custom-drag detection: the calendar's main drag uses mousedown/mousemove,
    // not HTML5 DnD, so onDragOver never fires. We listen for the global custom
    // events emitted by CalendarView and decide whether the cursor is over our
    // own bounding rect.
    const tileRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const onMove = (ev: Event) => {
            const detail = (ev as CustomEvent).detail;
            if (!detail || !tileRef.current) return;
            const r = tileRef.current.getBoundingClientRect();
            const inside = detail.x >= r.left && detail.x <= r.right && detail.y >= r.top && detail.y <= r.bottom;
            if (inside && !isCalendarDropTarget) {
                setIsCalendarDropTarget(true);
                onSelect(file.id, file.title);
            } else if (!inside && isCalendarDropTarget) {
                setIsCalendarDropTarget(false);
            }
        };
        const onDrop = (ev: Event) => {
            const detail = (ev as CustomEvent).detail;
            if (!detail || detail.consumed || !tileRef.current) return;
            const r = tileRef.current.getBoundingClientRect();
            const inside = detail.x >= r.left && detail.x <= r.right && detail.y >= r.top && detail.y <= r.bottom;
            if (!inside) return;
            // Mark this drop as consumed so CalendarView skips its own time-move logic.
            detail.consumed = true;
            detail.targetNoteId = file.id;
            setIsCalendarDropTarget(false);
            onSelect(file.id, file.title);
            setTimeout(() => {
                startGhost({
                    eventId: detail.eventId,
                    title: detail.title || 'Untitled',
                    start: detail.start || '',
                    end: detail.end || '',
                    color: detail.color || undefined,
                    targetNoteId: file.id,
                });
            }, 80);
        };
        window.addEventListener('tide:event-drag-move', onMove);
        window.addEventListener('tide:event-drag-drop', onDrop);
        return () => {
            window.removeEventListener('tide:event-drag-move', onMove);
            window.removeEventListener('tide:event-drag-drop', onDrop);
        };
    }, [file.id, file.title, isCalendarDropTarget, onSelect, startGhost]);

    return (
        <motion.div
            ref={tileRef}
            data-note-tile={file.id}
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 40, mass: 0.8, delay: (index || 0) * 0.03 }}
            draggable
            onDragStart={(e: any) => onDragStart(e, file.id)}
            onContextMenu={(e: any) => onContextMenu(e, file.id, 'file')}
            onDragOver={(e) => {
                if (e.dataTransfer.types.includes('tide/calendar-event')) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'copy';
                    if (!isCalendarDropTarget) {
                        setIsCalendarDropTarget(true);
                        // Open the note when hovering over it
                        onSelect(file.id, file.title);
                    }
                }
            }}
            onDragLeave={() => setIsCalendarDropTarget(false)}
            onDrop={(e) => {
                const payload = e.dataTransfer.getData('tide/calendar-event');
                if (!payload) return;
                e.preventDefault();
                e.stopPropagation();
                setIsCalendarDropTarget(false);
                try {
                    const ev = JSON.parse(payload);
                    onSelect(file.id, file.title);
                    // Defer slightly so the editor has time to mount before the click handler arms.
                    setTimeout(() => {
                        startGhost({
                            eventId: ev.id,
                            title: ev.title || 'Untitled',
                            start: ev.start || '',
                            end: ev.end || '',
                            color: ev.color || undefined,
                            targetNoteId: file.id,
                        });
                    }, 80);
                } catch (err) {
                    console.error('[Sidebar] Bad calendar-event drop payload', err);
                }
            }}
            onClick={(e) => {
                if (highlight.isSelectingLink && highlight.onLinkSelect) {
                    e.stopPropagation();
                    highlight.onLinkSelect({ id: file.id, title: file.title, type: 'file', rect: e.currentTarget.getBoundingClientRect() });
                } else {
                    onSelect(file.id, file.title);
                }
            }}
            className={`group flex items-center justify-between w-full px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-150
                ${isCalendarDropTarget ? 'ring-2 ring-violet-400 bg-violet-50 dark:bg-violet-900/20' : ''}
                ${isActive
                    ? 'bg-blue-100/90 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 font-semibold ring-1 ring-blue-400/40'
                    : isOpen
                        ? 'bg-blue-50/75 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 font-medium'
                        : isHighlighted(file.id, 'file')
                            ? 'bg-purple-50 dark:bg-purple-900/20'
                            : 'hover:bg-[var(--hover-bg)] dark:hover:bg-white/[0.06] interactive-hover text-gray-700 dark:text-gray-300'
                }
                ${highlight.isSelectingLink ? 'bg-purple-50/30 dark:bg-purple-900/10' : ''}`}
            style={{
                boxShadow: highlight.isSelectingLink
                    ? '0 0 10px rgba(168, 85, 247, 0.6)'
                    : (isHighlighted(file.id, 'file') ? '0 0 5px rgba(168, 85, 247, 0.4)' : 'none')
            }}
        >
            <div className="flex items-center gap-2 truncate flex-1 flex-shrink-0">
                {file.title.startsWith('#')
                    ? <Lock size={15} className={`shrink-0 ${isActive || isOpen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'}`} />
                    : file.type === 'canvas'
                        ? <Layout size={15} className={`shrink-0 ${isActive || isOpen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'}`} />
                        : <FileText size={15} className={`shrink-0 ${isActive || isOpen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'}`} />}
                {(file.metadata?.has_custom_password || file.metadata?.security_settings?.has_custom_password) && (
                    <span title="PIN-geschützt" className="shrink-0 inline-flex items-center">
                        <Lock size={13} className="text-amber-500" />
                    </span>
                )}
                {(file as any).share_status === 'shared' && (
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-sky-400" title="Geteilte Notiz" />
                )}
                {editingId === file.id ? (
                    <input
                        autoFocus
                        onFocus={(e) => e.target.select()}
                        defaultValue={file.title}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => onRenameSubmit?.(file.id, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && onRenameSubmit?.(file.id, e.currentTarget.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded px-1 text-sm outline-none text-gray-900 dark:text-gray-100"
                    />
                ) : (
                    <span className={`text-sm truncate transition-colors ${
                        isActive
                            ? 'text-blue-950 dark:text-blue-100 font-semibold'
                            : isOpen
                                ? 'text-blue-800 dark:text-blue-200 font-medium'
                                : 'text-gray-700 dark:text-gray-300 font-medium group-hover:text-gray-900 dark:group-hover:text-gray-100'
                    } ${file.owner_id && myId && file.owner_id !== myId ? 'purple-shimmer-text' : ''}`}>
                        {file.title.startsWith('#') ? file.title.slice(1).trim() : file.title}
                    </span>
                )}
            </div>
        </motion.div>
    );
};

interface FolderItemProps {
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
    onContextMenu: (e: React.MouseEvent, id: string, type: 'file' | 'folder') => void;
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

const FolderItem = ({ folder, allFiles, level, onSelect, onDelete, onRename, onVisibility, onShare, editingId, onRenameSubmit, onCreateFolder, onMoveItem, onDragStart, onContextMenu, viewMode, enabledExtensions, myId, index, dropIndicator, setDropIndicator, orderedNoteIds, setOrderedNoteIds, handleReorder, activeTabId, openTabs }: FolderItemProps) => {
    const [isLoading, setIsLoading] = useState(false);
    const children = allFiles.filter(f => f.parent_id === folder.id);
    const { highlight } = useHighlight();
    const { fetchDirectory, loadedDirectories, openFolderIds, toggleFolder } = useDataStore();
    const isOpen = openFolderIds.has(folder.id);

    const handleToggle = async (e: React.MouseEvent) => {
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
                draggable
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
                className={`group flex items-center justify-between w-full px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-150 hover:bg-[var(--hover-bg)] dark:hover:bg-white/[0.06] interactive-hover`}
            >
                <div className="flex items-center gap-1.5 truncate flex-1">
                    <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0 text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-300 transition-colors">
                        {isOpen ? (
                            <ChevronDown size={12} className="shrink-0 transition-transform duration-150" />
                        ) : (
                            <ChevronRight size={12} className="shrink-0 transition-transform duration-150" />
                        )}
                    </span>
                    {isLoading ? (
                        <Loader2 size={15} className="text-gray-400 animate-spin shrink-0" />
                    ) : isOpen ? (
                        <FolderOpen size={15} className="text-gray-400 dark:text-slate-500 shrink-0" />
                    ) : (
                        <Folder size={15} className="text-gray-400 dark:text-slate-500 shrink-0" />
                    )}
                    {(folder.metadata?.has_custom_password || folder.metadata?.security_settings?.has_custom_password) && (
                        <span title="PIN-geschützt" className="shrink-0 inline-flex items-center">
                            <Lock size={13} className="text-amber-500" />
                        </span>
                    )}
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
