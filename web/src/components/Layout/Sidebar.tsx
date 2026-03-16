"use client";

import { FileText, Plus, Folder, FolderPlus, FolderOpen, Trash, Edit2, Share, Eye, EyeOff, ChevronRight, ChevronDown, MessageSquare, User, Settings, Calendar as CalendarIcon, Lock, Pin, DollarSign, LogOut, Users, Puzzle, Globe, Check, Share2, Edit3, Trash2, Loader2 } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { motion, Reorder } from "framer-motion";
import SmartIsland from "../extensions/smart_island/SmartIsland";
import MiniCalendar from "../Calendar/MiniCalendar";
import { useHighlight } from "@/components/HighlightContext";
import { useDataStore } from "@/store/useDataStore";
import { apiFetch } from "@/lib/api";

interface DecryptedFile {
    id: string;
    title: string;
    type: string;
    visibility: string;
    parent_id?: string | null;
    color?: string;
    owner_email?: string;
    effect?: string;
    isGroup?: boolean;
}

interface SidebarProps {
    files: DecryptedFile[];
    onFileSelect: (fileId: string, title: string) => void;
    onNewNote: () => void;
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
}

interface ChatUser {
    id: string;
    encrypted_data: string;
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
    onOpenSettings
}: SidebarProps) {
    const { highlight } = useHighlight();
    const { orderedNoteIds, setOrderedNoteIds } = useDataStore();
    const [chats, setChats] = useState<ChatUser[]>([]);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const [myId, setMyId] = useState<string>("");
    const [userProfile, setUserProfile] = useState<{ username: string, email: string } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string, type: 'file' | 'folder' } | null>(null);
    const [dropIndicator, setDropIndicator] = useState<{ id: string, half: 'top' | 'bottom' } | null>(null);

    const topLevelItems = useMemo(() => {
        return files?.filter(f => f.parent_id === null) || [];
    }, [files]);
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
        setOrderedNoteIds(newIds);

        // Sync to .info file
        if (myId) {
            apiFetch('/api/v1/files/sidebar_order.info', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order: newIds })
            }).catch(e => console.error("Failed to save sidebar order", e));
        }
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
            setUserProfile({ username, email });
        }
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setIsProfileMenuOpen(false);
            }
            if (contextMenu && !(event.target as HTMLElement).closest('.context-menu')) {
                setContextMenu(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isProfileMenuOpen, contextMenu]);

    const handleSignOut = () => {
        sessionStorage.clear();
        localStorage.removeItem("tide_user_email");
        localStorage.removeItem("tide_user_id");
        localStorage.removeItem("tide_session_token");
        window.location.reload();
    };

    const handleContextMenu = (e: React.MouseEvent, id: string, type: 'file' | 'folder') => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, id, type });
    };

    return (
        <div className="w-64 h-full flex flex-col shrink-0 relative z-[100] transition-all duration-300">
            {highlight.isSelectingLink && (
                <div className="bg-purple-600 text-white p-3 flex flex-col gap-1 items-center justify-center animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-2">
                        <CalendarIcon size={16} />
                        <span className="text-xs font-bold uppercase tracking-wider">Linking Mode</span>
                    </div>
                    <span className="text-[10px] opacity-90 text-center leading-tight">Pick an event or note to link</span>
                </div>
            )}

            <div
                className="flex-1 overflow-y-auto p-2 no-scrollbar"
                onDoubleClick={(e) => {
                    if (e.target === e.currentTarget) onNewNote();
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain");
                    if (id && e.target === e.currentTarget) {
                        onMoveItem?.(id, null);
                    }
                    setDropIndicator(null);
                }}
            >
                <div className="flex items-center justify-between px-2 py-1 mb-2">
                    {/* Avatar at top-left */}
                    <div className="relative" ref={profileMenuRef}>
                        <div
                            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                            onContextMenu={(e) => { e.preventDefault(); setIsProfileMenuOpen(!isProfileMenuOpen); }}
                            className="w-8 h-8 shrink-0 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex items-center justify-center text-gray-700 dark:text-gray-300 font-bold uppercase text-sm shadow-sm cursor-pointer hover:shadow-md transition-all hover:scale-105 active:scale-95 overflow-hidden"
                        >
                            {userProfile?.username?.[0] || "U"}
                        </div>

                        {isProfileMenuOpen && (
                            <div className="absolute left-0 top-10 w-64 bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200 z-[100] origin-top-left">
                                <div className="p-4 bg-gray-50/50 dark:bg-white/5 flex items-center justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-base font-bold text-gray-900 dark:text-white truncate leading-tight">{userProfile?.username || "User"}</div>
                                        <div className="text-xs text-gray-500 truncate mt-0.5">{userProfile?.email || ""}</div>
                                    </div>
                                    <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-white/10 flex items-center justify-center text-gray-700 dark:text-gray-300 text-base font-bold shadow-sm">
                                        {userProfile?.username?.[0] || "U"}
                                    </div>
                                </div>
                                <div className="h-px bg-gray-100 dark:bg-white/5" />
                                <div className="p-2 flex flex-col gap-1">
                                    <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-all group">
                                        <User size={18} className="text-gray-400 group-hover:text-blue-500" />
                                        <span className="font-semibold flex-1 text-left">Profile</span>
                                    </button>
                                    <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-all group">
                                        <Users size={18} className="text-gray-400 group-hover:text-blue-500" />
                                        <span className="font-semibold flex-1 text-left">Community</span>
                                    </button>
                                    <button onClick={() => { setIsProfileMenuOpen(false); onOpenSettings?.(); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-all group">
                                        <Puzzle size={18} className="text-gray-400 group-hover:text-blue-500" />
                                        <span className="font-semibold flex-1 text-left">Extensions</span>
                                    </button>
                                    <button onClick={() => { setIsProfileMenuOpen(false); onOpenSettings?.(); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-all group">
                                        <Settings size={18} className="text-gray-400 group-hover:text-blue-500" />
                                        <span className="font-semibold flex-1 text-left">Settings</span>
                                    </button>
                                </div>
                                <div className="h-px bg-gray-100 dark:bg-white/5" />
                                <div className="p-2">
                                    <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all font-semibold group">
                                        <LogOut size={18} className="text-gray-400 group-hover:text-rose-500" />
                                        <span className="flex-1 text-left">Sign out</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right-side action buttons */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => onCreateFolder && onCreateFolder(null)}
                            title="New Folder"
                            className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg text-gray-500 hover:text-gray-900 transition-all mx-1"
                        >
                            <FolderPlus size={16} />
                        </button>
                        <button
                            onClick={onNewNote}
                            title="New Note"
                            className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg text-gray-500 hover:text-gray-900 transition-all mx-1"
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                </div>

                <Reorder.Group axis="y" values={orderedItems} onReorder={handleReorder} className="space-y-0.5">
                    {orderedItems.map((item, i) => (
                        <Reorder.Item
                            key={item.id}
                            value={item}
                            onDragOver={(e: React.DragEvent) => {
                                e.preventDefault();
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const half = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
                                setDropIndicator({ id: item.id, half });
                            }}
                            onDragLeave={() => setDropIndicator(null)}
                            onDrop={(e: React.DragEvent) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const half = dropIndicator?.half || 'bottom';
                                setDropIndicator(null);
                                const draggedId = e.dataTransfer.getData("text/plain");
                                if (!draggedId || draggedId === item.id) return;
                                const newItems = orderedItems.filter(o => o.id !== draggedId);
                                let dropIdx = newItems.findIndex(o => o.id === item.id);
                                if (half === 'bottom') dropIdx += 1;
                                const draggedItem = orderedItems.find(o => o.id === draggedId);
                                if (draggedItem) {
                                    newItems.splice(dropIdx, 0, draggedItem);
                                    handleReorder(newItems);
                                }
                            }}
                        >
                            {item.type === 'folder' ? (
                                <div className={`relative ${dropIndicator?.id === item.id && dropIndicator.half === 'top' ? 'border-t-2 border-blue-500' : ''} ${dropIndicator?.id === item.id && dropIndicator.half === 'bottom' ? 'border-b-2 border-blue-500' : ''}`}>
                                <FolderItem
                                    folder={item}
                                    allFiles={files}
                                    level={0}
                                    viewMode={'files'}
                                    onSelect={onFileSelect}
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
                                />
                                </div>
                            ) : (
                                <FileItem
                                    file={item}
                                    level={0}
                                    onSelect={onFileSelect}
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
                                    isDragTarget={dropIndicator?.id === item.id ? dropIndicator.half : undefined}
                                />
                            )}
                        </Reorder.Item>
                    ))}
                </Reorder.Group>
            </div>

            {/* Smart Island — absolutely positioned to bottom-left with equal margins */}
            <div className="absolute bottom-6 left-6 z-[100]">
                {enabledExtensions?.includes('smart_island') ? (
                    <SmartIsland
                        selectedDate={selectedDate || new Date()}
                        onSelect={(date: Date) => onDateSelect && onDateSelect(date)}
                        userName={userProfile?.username}
                    />
                ) : (
                    <div className="px-2 pb-2">
                        <MiniCalendar selectedDate={selectedDate} onSelect={onDateSelect} />
                    </div>
                )}
            </div>


            {contextMenu && (
                <div
                    className="context-menu fixed z-[200] w-56 bg-white border border-gray-200 rounded-xl shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-100"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <div className="px-2 py-1.5 flex flex-col gap-0.5">
                        <button
                            onClick={() => { setContextMenu(null); onFileSelect(contextMenu.id, ""); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors group"
                        >
                            <FileText size={16} className="text-gray-400 group-hover:text-blue-500" />
                            <span className="font-medium">Open in new tab</span>
                        </button>

                        <div className="relative group/sub">
                            <button className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors group">
                                <div className="flex items-center gap-3">
                                    <Eye size={16} className="text-gray-400 group-hover:text-blue-500" />
                                    <span className="font-medium">Visibility</span>
                                </div>
                                <ChevronRight size={14} className="text-gray-400" />
                            </button>
                            <div className="hidden group-hover/sub:block absolute left-full top-0 ml-1 w-48 bg-white border border-gray-200 rounded-xl shadow-xl py-1">
                                <button onClick={(e) => { setContextMenu(null); onToggleVisibility(e, contextMenu.id, 'private'); }} className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors group">
                                    <span>Private</span>
                                    <Lock size={14} className="text-gray-400" />
                                </button>
                                <button onClick={(e) => { setContextMenu(null); onToggleVisibility(e, contextMenu.id, 'contacts'); }} className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors group">
                                    <span>For Contacts</span>
                                    <Users size={14} className="text-gray-400" />
                                </button>
                                <button onClick={(e) => { setContextMenu(null); onToggleVisibility(e, contextMenu.id, 'public'); }} className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors group">
                                    <span>Public link</span>
                                    <Globe size={14} className="text-gray-400" />
                                </button>
                            </div>
                        </div>

                        <div className="h-px bg-gray-100 my-1" />

                        <button
                            onClick={(e) => { setContextMenu(null); onShare(e, contextMenu.id); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors group"
                        >
                            <Share2 size={16} className="text-gray-400 group-hover:text-blue-500" />
                            <span className="font-medium">Share</span>
                        </button>

                        <button
                            onClick={(e) => { setContextMenu(null); onRenameNote(e, contextMenu.id, ""); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors group"
                        >
                            <Edit3 size={16} className="text-gray-400 group-hover:text-blue-500" />
                            <span className="font-medium">Rename</span>
                        </button>

                        <div className="h-px bg-gray-100 my-1" />

                        <button
                            onClick={(e) => { setContextMenu(null); onDeleteNote(e, contextMenu.id); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 rounded-lg transition-colors group"
                        >
                            <Trash2 size={16} className="text-rose-400 group-hover:text-rose-600" />
                            <span className="font-medium">Delete</span>
                        </button>
                    </div>
                </div>
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
}

const FileItem = ({ file, level, onSelect, onDelete, onRename, onVisibility, onShare, editingId, onRenameSubmit, onDragStart, onContextMenu, enabledExtensions, myId, index, isDragTarget }: FileItemProps & { isDragTarget?: 'top' | 'bottom' | undefined }) => {
    const { isHighlighted, highlight } = useHighlight();
    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: (index || 0) * 0.05 }}
            draggable
            onDragStart={(e: any) => onDragStart(e, file.id)}
            onContextMenu={(e: any) => onContextMenu(e, file.id, 'file')}
            onClick={(e) => {
                if (highlight.isSelectingLink && highlight.onLinkSelect) {
                    e.stopPropagation();
                    highlight.onLinkSelect({ id: file.id, title: file.title, type: 'file', rect: e.currentTarget.getBoundingClientRect() });
                } else {
                    onSelect(file.id, file.title);
                }
            }}
            className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all duration-200 
                ${isHighlighted(file.id, 'file') ? 'ring-2 ring-purple-500 bg-purple-50' : 'hover:bg-gray-100'} 
                ${highlight.isSelectingLink ? 'ring-2 ring-purple-400/50 bg-purple-50/30' : ''} 
                ${isDragTarget === 'top' ? 'border-t-2 border-blue-500' : isDragTarget === 'bottom' ? 'border-b-2 border-blue-500' : ''}`}
            style={{ marginLeft: `${level * 12}px` }}
        >
            <div className="flex items-center gap-2 truncate flex-1 flex-shrink-0">
                {file.title.startsWith('#') ? <Lock size={15} className="shrink-0 text-gray-400" /> : <FileText size={15} className="shrink-0 text-gray-400" />}
                {editingId === file.id ? (
                    <input
                        autoFocus
                        onFocus={(e) => e.target.select()}
                        defaultValue={file.title}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => onRenameSubmit?.(file.id, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && onRenameSubmit?.(file.id, e.currentTarget.value)}
                        className="w-full bg-white border border-gray-200 rounded px-1 text-sm outline-none"
                    />
                ) : (
                    <span className="text-sm text-gray-600 truncate font-medium group-hover:text-gray-800 transition-colors">
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
}

const FolderItem = ({ folder, allFiles, level, onSelect, onDelete, onRename, onVisibility, onShare, editingId, onRenameSubmit, onCreateFolder, onMoveItem, onDragStart, onContextMenu, viewMode, enabledExtensions, myId, index }: FolderItemProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const children = allFiles.filter(f => f.parent_id === folder.id);
    const { highlight } = useHighlight();
    const { fetchDirectory, loadedDirectories } = useDataStore();

    const handleToggle = async (e: React.MouseEvent) => {
        e.stopPropagation();

        if (!isOpen) {
            // Expand
            if (!loadedDirectories.has(folder.id)) {
                setIsLoading(true);
                await fetchDirectory(folder.id);
                setIsLoading(false);
            }
            setIsOpen(true);
        } else {
            // Collapse
            setIsOpen(false);
        }
    };

    return (
        <div>
            <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: (index || 0) * 0.05 }}
                draggable
                onDragStart={(e: any) => onDragStart(e, folder.id)}
                onContextMenu={(e: any) => onContextMenu(e, folder.id, 'folder')}
                onDragOver={(e: any) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = e.dataTransfer.getData("text/plain");
                    if (id && id !== folder.id) onMoveItem?.(id, folder.id);
                }}
                onClick={handleToggle}
                className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all duration-200
                    ${highlight.isSelectingLink ? 'ring-2 ring-purple-400/30 bg-purple-50/20' : 'hover:bg-gray-100'}
                `}
                style={{ marginLeft: `${level * 12}px` }}
            >
                <div className="flex items-center gap-2 truncate flex-1">
                    {isLoading ? (
                        <Loader2 size={15} className="text-gray-400 animate-spin" />
                    ) : isOpen ? (
                        <FolderOpen size={15} className="text-gray-400" />
                    ) : (
                        <Folder size={15} className="text-gray-400" />
                    )}
                    {editingId === folder.id ? (
                        <input
                            autoFocus
                            onFocus={(e) => e.target.select()}
                            defaultValue={folder.title}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={(e) => onRenameSubmit?.(folder.id, e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && onRenameSubmit?.(folder.id, e.currentTarget.value)}
                            className="w-full bg-white border border-gray-200 rounded px-1 text-sm outline-none font-normal"
                        />
                    ) : (
                        <span className="text-sm font-semibold text-gray-900 truncate">
                            {folder.title.startsWith('#') ? folder.title.slice(1).trim() : folder.title}
                        </span>
                    )}
                </div>
            </motion.div>
            {isOpen && (
                <div className="mt-0.5">
                    {children.filter(f => f.type === 'folder').map((f, i) => (
                        <FolderItem
                            key={f.id}
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
                        />
                    ))}
                    {children.filter(f => f.type !== 'folder' && f.type !== 'event').map((f, i) => (
                        <FileItem
                            key={f.id}
                            index={i + children.filter(c => c.type === 'folder').length}
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
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
