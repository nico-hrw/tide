"use client";

import { FileText, Plus, Folder, FolderPlus, FolderOpen, Trash, Edit2, Share, Eye, EyeOff, ChevronRight, ChevronDown, MessageSquare, User, Settings, Lock, Pin, DollarSign, LogOut, Users, Puzzle, Globe, Check, Share2, Edit3, Trash2, Loader2, Upload, Download } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { motion, Reorder } from "framer-motion";
import SmartIsland from "../extensions/smart_island/SmartIsland";
import MiniCalendar from "../Calendar/MiniCalendar";
import { useHighlight } from "@/components/HighlightContext";
import { useDataStore } from "@/store/useDataStore";
import { apiFetch, getApiBase } from "@/lib/api";
import Avatar from "@/components/Profile/Avatar";

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
    userProfile?: { id?: string; user_id?: string; username: string; email: string; bio?: string; title?: string; avatar_seed?: string; avatar_salt?: string };
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
    userProfile: propProfile
}: SidebarProps) {
    const { highlight } = useHighlight();
    const { orderedNoteIds, setOrderedNoteIds, setSettingsModalOpen } = useDataStore();
    const [chats, setChats] = useState<ChatUser[]>([]);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const [myId, setMyId] = useState<string>("");
    const [sidebarUserProfile, setSidebarUserProfile] = useState<{ id?: string, user_id?: string, username: string, email: string, avatar_seed?: string, avatar_salt?: string } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string, type: 'file' | 'folder' } | null>(null);
    const [dropIndicator, setDropIndicator] = useState<{ id: string, zone: 'top' | 'middle' | 'bottom' } | null>(null);

    const userProfile = propProfile || sidebarUserProfile;

    const topLevelItems = useMemo(() => {
        return files?.filter(f => f.parent_id === null && f.type !== 'event') || [];
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
                    .catch(() => {});
            }
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

    const effectiveUserName = userProfile?.username || (typeof window !== 'undefined' ? sessionStorage.getItem('tide_user_name') : null) || (userProfile?.email || "").split('@')[0] || "User";

    return (
        <div className="w-64 h-full flex flex-col shrink-0 relative z-[100] transition-all duration-300">
            {/* VLM banner removed — linking mode logic stays active in HighlightContext */}

            <div
                className="max-h-[58%] overflow-y-auto p-2 pb-6 no-scrollbar"
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
                            onClick={() => setSettingsModalOpen(true)}
                            onContextMenu={(e) => { e.preventDefault(); setSettingsModalOpen(true); }}
                            className="w-8 h-8 shrink-0 rounded-full cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all hover:scale-105 active:scale-95 overflow-hidden"
                            title="Settings"
                        >
                            <Avatar
                                seed={(userProfile?.avatar_seed || userProfile?.user_id || userProfile?.id || myId || 'default') + (userProfile?.avatar_salt || '')}
                                size={32}
                            />
                        </div>
                    </div>

                    {/* Right-side action buttons */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => {
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

                                        // SECURITY: rawContent MUST be converted to Tiptap-JSON nodes,
                                        // never passed to setContent() as raw HTML. Tiptap text nodes
                                        // are escaped automatically — no XSS risk here.
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

                                        // Use the store's createNote which now uses the full V2 pipeline
                                        const newId = await useDataStore.getState().createNote(title, tiptapDoc);
                                        // Refresh directory and select new note
                                        useDataStore.getState().fetchDirectory(null, true);
                                        onFileSelect(newId, title);
                                    };
                                    reader.readAsText(file);
                                };
                                input.click();
                            }}
                            title="Notiz Importieren (.md)"
                            className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg text-gray-500 hover:text-gray-900 transition-all mx-1"
                        >
                            <Upload size={16} />
                        </button>
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

                <div className="space-y-0.5">
                    {orderedItems.map((item, i) => (
                        <motion.div
                            layout="position"
                            key={item.id}
                            onDragOver={(e: React.DragEvent) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const y = e.clientY - rect.top;
                                let zone: 'top' | 'middle' | 'bottom' = 'middle';
                                if (item.type === 'folder') {
                                    if (y < rect.height * 0.25) zone = 'top';
                                    else if (y > rect.height * 0.75) zone = 'bottom';
                                } else {
                                    zone = y < rect.height / 2 ? 'top' : 'bottom';
                                }
                                setDropIndicator({ id: item.id, zone });
                            }}
                            onDragLeave={() => setDropIndicator(null)}
                            onDrop={(e: React.DragEvent) => {
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
                            {dropIndicator?.id === item.id && dropIndicator.zone === 'top' && (
                                <motion.div layout initial={{ height: 0 }} animate={{ height: 40 }} className="bg-blue-50/50 rounded-lg border-2 border-dashed border-blue-300" />
                            )}
                            
                            {item.type === 'folder' ? (
                                <div className={`relative ${dropIndicator?.id === item.id && dropIndicator.zone === 'middle' ? 'ring-2 ring-blue-500 bg-blue-50/50 rounded-lg' : ''}`}>
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
                                />
                            )}

                            {dropIndicator?.id === item.id && dropIndicator.zone === 'bottom' && (
                                <motion.div layout initial={{ height: 0 }} animate={{ height: 40 }} className="bg-blue-50/50 rounded-lg border-2 border-dashed border-blue-300 mt-1" />
                            )}
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Smart Island — absolutely positioned to bottom-left with equal margins */}
            <div className="absolute bottom-6 left-6 z-[100]">
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
                                {(() => {
                                    const currentFile = files.find((f: any) => f.id === contextMenu.id);
                                    const v = currentFile?.visibility || 'private';
                                    return (
                                        <>
                                            <button onClick={(e) => { setContextMenu(null); onToggleVisibility(e, contextMenu.id, 'private'); }} className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-100 rounded-lg transition-colors group ${v === 'private' ? 'text-blue-600 bg-blue-50/50' : 'text-gray-700'}`}>
                                                <span className="font-medium">Private</span>
                                                <div className="flex items-center gap-2">
                                                    {v === 'private' && <Check size={14} className="text-blue-600" />}
                                                    <Lock size={14} className="text-gray-400" />
                                                </div>
                                            </button>
                                            <button onClick={(e) => { setContextMenu(null); onToggleVisibility(e, contextMenu.id, 'contacts'); }} className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-100 rounded-lg transition-colors group ${v === 'contacts' ? 'text-blue-600 bg-blue-50/50' : 'text-gray-700'}`}>
                                                <span className="font-medium">For Contacts</span>
                                                <div className="flex items-center gap-2">
                                                    {v === 'contacts' && <Check size={14} className="text-blue-600" />}
                                                    <Users size={14} className="text-gray-400" />
                                                </div>
                                            </button>
                                            <button onClick={(e) => { setContextMenu(null); onToggleVisibility(e, contextMenu.id, 'public'); }} className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-100 rounded-lg transition-colors group ${v === 'public' ? 'text-blue-600 bg-blue-50/50' : 'text-gray-700'}`}>
                                                <span className="font-medium">Public link</span>
                                                <div className="flex items-center gap-2">
                                                    {v === 'public' && <Check size={14} className="text-blue-600" />}
                                                    <Globe size={14} className="text-gray-400" />
                                                </div>
                                            </button>
                                        </>
                                    );
                                })()}
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

const FileItem = ({ file, level, onSelect, onDelete, onRename, onVisibility, onShare, editingId, onRenameSubmit, onDragStart, onContextMenu, enabledExtensions, myId, index }: FileItemProps) => {
    const { isHighlighted, highlight } = useHighlight();
    return (
        <motion.div
            layout="position"
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
                ${isHighlighted(file.id, 'file') ? 'bg-purple-50 dark:bg-purple-900/20' : 'hover:bg-gray-100 dark:hover:bg-white/5'} 
                ${highlight.isSelectingLink ? 'bg-purple-50/30 dark:bg-purple-900/10' : ''}`}
            style={{ 
                marginLeft: `${level * 12}px`,
                boxShadow: highlight.isSelectingLink 
                    ? '0 0 10px rgba(168, 85, 247, 0.6)' 
                    : (isHighlighted(file.id, 'file') ? '0 0 5px rgba(168, 85, 247, 0.4)' : 'none')
            }}
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
                        className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded px-1 text-sm outline-none text-gray-900 dark:text-gray-100"
                    />
                ) : (
                    <span className="text-sm text-gray-600 dark:text-gray-400 truncate font-medium group-hover:text-gray-800 dark:group-hover:text-gray-200 transition-colors">
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
    const [isLoading, setIsLoading] = useState(false);
    const children = allFiles.filter(f => f.parent_id === folder.id);
    const { highlight } = useHighlight();
    const { fetchDirectory, loadedDirectories, openFolderIds, toggleFolder } = useDataStore();
    const isOpen = openFolderIds.has(folder.id);

    const handleToggle = async (e: React.MouseEvent) => {
        e.stopPropagation();

        if (!isOpen) {
            // Expand
            if (!loadedDirectories.has(folder.id)) {
                setIsLoading(true);
                await fetchDirectory(folder.id);
                setIsLoading(false);
            }
            toggleFolder(folder.id, true);
        } else {
            // Collapse
            toggleFolder(folder.id, false);
        }
    };

    return (
        <div>
            <motion.div
                layout="position"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: (index || 0) * 0.05 }}
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
                className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all duration-200 hover:bg-gray-100 dark:hover:bg-white/5`}
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
