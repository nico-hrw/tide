"use client";

import React, { useRef, useState, useEffect } from 'react';
import { 
    X, 
    Calendar, 
    FileText, 
    MessageSquare, 
    User, 
    Users, 
    GraduationCap, 
    Trash2, 
    Plus, 
    Lock, 
    Settings, 
    LogOut,
    ListTodo,
    PanelLeft,
    Folder,
    Puzzle,
    ChevronDown
} from 'lucide-react';
import { useHighlight } from '../HighlightContext';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import Avatar from '../Profile/Avatar';
import { useSocialStore } from '@/store/useSocialStore';
import DT from '@/lib/designTokens';

export interface Tab {
    id: string;
    title: string;
    type: 'file' | 'calendar' | 'todos' | 'messages' | 'chat' | 'ext_finance' | 'profile' | 'social' | 'exams' | 'job_planner' | 'trash' | 'folders';
    content?: any;
    _fileKey?: CryptoKey | null;
    _saveStatus?: "saved" | "unsaved" | "saving";
}

interface TabListProps {
    tabs: Tab[];
    activeTabId: string;
    onTabSelect: (id: string, type: Tab['type']) => void;
    onTabClose: (e: React.MouseEvent | null, id: string) => void;
    onTabsReorder?: (newTabs: Tab[]) => void;
    onNewTab?: () => void;
    onOpenFolders?: () => void;
    isSidebarOpen?: boolean;
    onToggleSidebar?: () => void;
    userProfile?: { 
        username: string; 
        email: string; 
        avatar_seed?: string; 
        avatar_salt?: string; 
        avatar_style?: string; 
        id?: string; 
        user_id?: string; 
    } | null;
    myId?: string;
    isAvatarMenuOpen?: boolean;
    setIsAvatarMenuOpen?: React.Dispatch<React.SetStateAction<boolean>>;
    avatarMenuRef?: React.RefObject<HTMLDivElement | null>;
    onOpenSocial?: () => void;
    onOpenSettings?: () => void;
    onOpenTrash?: () => void;
    onLogout?: () => void;
    pluginSlot?: React.ReactNode;
}

export default function TabList({ 
    tabs, 
    activeTabId, 
    onTabSelect, 
    onTabClose, 
    onTabsReorder, 
    onNewTab,
    onOpenFolders,
    isSidebarOpen,
    onToggleSidebar,
    userProfile,
    myId,
    isAvatarMenuOpen,
    setIsAvatarMenuOpen,
    avatarMenuRef,
    onOpenSocial,
    onOpenSettings,
    onOpenTrash,
    onLogout,
    pluginSlot
}: TabListProps) {
    const { highlight } = useHighlight();
    const pendingRequests = useSocialStore(s => s.pendingRequests);
    const myStatus = useSocialStore(s => s.myStatus);
    const setMyStatus = useSocialStore(s => s.setMyStatus);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isPluginMenuOpen, setIsPluginMenuOpen] = useState(false);
    const pluginMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isPluginMenuOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (pluginMenuRef.current && !pluginMenuRef.current.contains(e.target as Node)) {
                setIsPluginMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isPluginMenuOpen]);

    const getTabIcon = (type: string) => {
        switch (type) {
            case 'calendar':
                return <Calendar size={13} />;
            case 'todos':
                return <ListTodo size={13} />;
            case 'chat':
            case 'messages':
                return <MessageSquare size={13} />;
            case 'profile':
                return <User size={13} />;
            case 'social':
                return <Users size={13} />;
            case 'job_planner':
            case 'exams':
                return <GraduationCap size={13} />;
            case 'trash':
                return <Trash2 size={13} />;
            case 'folders':
                return <Folder size={13} />;
            case 'file':
            default:
                return <FileText size={13} />;
        }
    };

    const getTabLabel = (tab: Tab) => {
        if (tab.title && tab.title !== 'Untitled' && tab.title !== 'Neue Notiz' && tab.title !== 'New Note') {
            return tab.title;
        }
        switch (tab.type) {
            case 'calendar': return 'Kalender';
            case 'todos': return 'Todos';
            case 'social': return 'Social';
            case 'job_planner': return 'Job & Uni';
            case 'exams': return 'Job & Uni';
            case 'chat': return 'Chat';
            case 'profile': return 'Profil';
            case 'trash': return 'Papierkorb';
            case 'folders': return 'Ordner';
            case 'file':
            default:
                return 'Neue Notiz';
        }
    };

    return (
        <div 
            className="w-full flex-shrink-0 min-h-[calc(4.25rem+env(safe-area-inset-top,0px))] bg-gray-100/70 dark:bg-slate-950/60 border-b border-gray-200/80 dark:border-white/10 flex items-center justify-between px-3 gap-2 select-none z-30 pt-[env(safe-area-inset-top,0px)]"
        >
            {/* Zone 1: Left balanced zone (Sidebar toggle) */}
            <div className="flex items-center justify-start gap-2 flex-1 min-w-0 shrink-0">
                {onToggleSidebar && (
                    <button
                        type="button"
                        onClick={onToggleSidebar}
                        title={isSidebarOpen ? "Sidebar einklappen" : "Sidebar ausklappen"}
                        aria-label="Sidebar umschalten"
                        style={{ borderRadius: DT.radius }}
                        className="flex items-center justify-center w-8 h-8 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-200/60 dark:hover:bg-white/10 active:scale-95 transition-all shrink-0 cursor-pointer"
                    >
                        <PanelLeft className={`w-4 h-4 transition-transform duration-200 ${isSidebarOpen ? '' : 'text-primary'}`} />
                    </button>
                )}
            </div>

            {/* Zone 2: Center balanced zone (Horizontally Centered Tabs) */}
            <div 
                ref={scrollRef}
                className="flex items-center min-w-0 max-w-full overflow-x-auto no-scrollbar py-1"
            >
                <div className="flex items-center gap-1 mx-auto shrink-0">
                    <Reorder.Group
                        axis="x"
                        values={tabs}
                        onReorder={(newTabs) => onTabsReorder?.(newTabs)}
                        className="flex items-center gap-1 m-0 p-0 list-none"
                        layout
                    >
                        <AnimatePresence initial={false} mode="popLayout">
                            {tabs.map((tab) => {
                                const isActive = activeTabId === tab.id;

                                return (
                                    <Reorder.Item
                                        key={tab.id}
                                        value={tab}
                                        id={tab.id}
                                        initial={{ opacity: 0, scale: 0.92, y: -2 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.12 } }}
                                        whileDrag={{ scale: 1.03, zIndex: 60, boxShadow: DT.shadowFloat }}
                                        transition={{ type: "spring", stiffness: 450, damping: 35 }}
                                        className="list-none shrink-0"
                                    >
                                        <div
                                            onClick={(e) => {
                                                if (highlight.isSelectingLink && highlight.onLinkSelect) {
                                                    highlight.onLinkSelect({ 
                                                        id: tab.id, 
                                                        title: tab.title, 
                                                        type: tab.type as any, 
                                                        rect: e.currentTarget.getBoundingClientRect() 
                                                    });
                                                } else {
                                                    onTabSelect(tab.id, tab.type);
                                                }
                                            }}
                                            title={getTabLabel(tab)}
                                            style={{ borderRadius: DT.radius }}
                                            className={`group relative flex items-center gap-2 min-h-[32px] px-3 py-1.5 text-xs font-medium cursor-pointer transition-all duration-150 max-w-[190px] min-w-[100px] border
                                                ${isActive
                                                    ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 shadow-sm border-gray-200/90 dark:border-slate-700/80 font-semibold'
                                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-slate-900/40 border-transparent'
                                                }`}
                                        >
                                            {/* Icon */}
                                            <div className={`shrink-0 ${isActive ? 'text-blue-500' : 'text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-300 transition-colors'}`}>
                                                {getTabIcon(tab.type)}
                                            </div>

                                            {/* Title */}
                                            <span className="truncate flex-1 min-w-0">
                                                {getTabLabel(tab)}
                                            </span>

                                            {/* Unsaved indicator dot */}
                                            {tab._saveStatus === 'unsaved' && (
                                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Ungespeichert" />
                                            )}

                                            {/* Close Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onTabClose(e, tab.id);
                                                }}
                                                style={{ borderRadius: DT.radiusSm }}
                                                className={`p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-all shrink-0
                                                    ${isActive ? 'opacity-70 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-slate-800' : 'opacity-0 group-hover:opacity-100 hover:bg-gray-300/50 dark:hover:bg-slate-800'}
                                                `}
                                                title="Tab schließen"
                                            >
                                                <X size={12} strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </Reorder.Item>
                                );
                            })}
                        </AnimatePresence>
                    </Reorder.Group>

                    {/* "+" New Note Tab Button */}
                    {onNewTab && (
                        <button
                            onClick={onNewTab}
                            style={{ borderRadius: DT.radius }}
                            className="flex items-center justify-center w-7 h-7 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-slate-800/80 transition-colors shrink-0 cursor-pointer"
                            title="Neue Notiz (Neuer Tab)"
                        >
                            <Plus size={15} />
                        </button>
                    )}
                </div>
            </div>

            {/* Zone 3: Right balanced zone (Plugin Slot, Dropdown & Profile) */}
            <div className="flex items-center justify-end gap-2 flex-1 min-w-0 shrink-0">
                {/* Optional external plugin slot */}
                {pluginSlot}

                {/* Compact plugin toolbar slot / dropdown button */}
                <div ref={pluginMenuRef} className="relative shrink-0 flex items-center">
                    <button
                        type="button"
                        onClick={() => setIsPluginMenuOpen(prev => !prev)}
                        style={{ borderRadius: DT.radius }}
                        title="Plugins & Erweiterungen"
                        aria-label="Plugins"
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-all active:scale-95 cursor-pointer border ${
                            isPluginMenuOpen 
                                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border-gray-200/90 dark:border-slate-700/80 shadow-xs' 
                                : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-white/10 border-transparent'
                        }`}
                    >
                        <Puzzle size={14} className={isPluginMenuOpen ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'} />
                        <span className="hidden sm:inline text-xs font-medium">Plugins</span>
                        <ChevronDown size={11} className={`text-gray-400 transition-transform duration-200 ${isPluginMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Plugin Dropdown Menu */}
                    {isPluginMenuOpen && (
                        <div 
                            style={{ 
                                borderRadius: DT.radiusLg,
                                boxShadow: DT.shadowFloat,
                            }}
                            className="absolute right-0 top-10 w-56 bg-white dark:bg-slate-900 border border-gray-200/90 dark:border-slate-700/80 py-1.5 px-1 z-[150] animate-in fade-in zoom-in-95 duration-100"
                        >
                            <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-slate-400 uppercase tracking-wider">
                                Plugins & Tools
                            </div>
                            
                            <button
                                type="button"
                                onClick={() => {
                                    setIsPluginMenuOpen(false);
                                    onTabSelect('job_planner', 'job_planner');
                                }}
                                style={{ borderRadius: DT.radius }}
                                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer"
                            >
                                <GraduationCap size={15} className="text-blue-500 shrink-0" />
                                <div className="truncate">
                                    <div className="font-medium">Job & Uni Planner</div>
                                    <div className="text-[10px] text-gray-400 font-normal">Vorlesungen, Prüfungen & Jobs</div>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setIsPluginMenuOpen(false);
                                    onTabSelect('calendar', 'calendar');
                                }}
                                style={{ borderRadius: DT.radius }}
                                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer"
                            >
                                <Calendar size={15} className="text-indigo-500 shrink-0" />
                                <div className="truncate">
                                    <div className="font-medium">Kalender</div>
                                    <div className="text-[10px] text-gray-400 font-normal">Termine & Wochenansicht</div>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setIsPluginMenuOpen(false);
                                    onTabSelect('todos', 'todos');
                                }}
                                style={{ borderRadius: DT.radius }}
                                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer"
                            >
                                <ListTodo size={15} className="text-emerald-500 shrink-0" />
                                <div className="truncate">
                                    <div className="font-medium">Aufgaben & Todos</div>
                                    <div className="text-[10px] text-gray-400 font-normal">Task Management</div>
                                </div>
                            </button>

                            {onOpenSocial && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsPluginMenuOpen(false);
                                        onOpenSocial();
                                    }}
                                    style={{ borderRadius: DT.radius }}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer"
                                >
                                    <Users size={15} className="text-purple-500 shrink-0" />
                                    <div className="truncate">
                                        <div className="font-medium">Social Hub</div>
                                        <div className="text-[10px] text-gray-400 font-normal">Chat & Kontakte</div>
                                    </div>
                                </button>
                            )}

                            {onOpenSettings && (
                                <>
                                    <div className="h-px bg-gray-100 dark:bg-slate-800 my-1" />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsPluginMenuOpen(false);
                                            onOpenSettings();
                                        }}
                                        style={{ borderRadius: DT.radius }}
                                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer"
                                    >
                                        <Settings size={15} className="text-gray-400 dark:text-slate-500 shrink-0" />
                                        <span>Plugin-Einstellungen</span>
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Right side: Profile / Avatar Menu */}
                {setIsAvatarMenuOpen && avatarMenuRef && (
                    <div ref={avatarMenuRef} className="relative shrink-0 flex items-center">
                        <button
                            onClick={() => setIsAvatarMenuOpen(o => !o)}
                            className="relative w-14 h-14 rounded-full hover:ring-2 hover:ring-blue-400/80 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                            title="Profil"
                        >
                            <div className="w-full h-full rounded-full overflow-hidden">
                                <Avatar
                                    seed={(userProfile?.avatar_seed || userProfile?.user_id || userProfile?.id || myId || 'default') + (userProfile?.avatar_salt || '')}
                                    size={56}
                                />
                            </div>
                            <span
                                className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full ring-2 ring-white dark:ring-slate-900 z-10 ${
                                    myStatus === 'online' ? 'bg-emerald-500' :
                                    myStatus === 'away' ? 'bg-amber-500' :
                                    'bg-gray-400'
                                }`}
                                title={myStatus === 'online' ? 'Online' : myStatus === 'away' ? 'Abwesend' : 'Offline'}
                            />
                            {pendingRequests.length > 0 && (
                                <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 border-2 border-white dark:border-slate-900 rounded-full z-10" />
                            )}
                        </button>

                        {isAvatarMenuOpen && (
                            <div className="absolute right-0 top-16 w-48 bg-white dark:bg-slate-900 border border-gray-200/90 dark:border-slate-700 rounded-xl shadow-2xl py-1 z-[150] animate-in fade-in zoom-in-95 duration-100">
                                <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-800">
                                    <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{userProfile?.username || 'User'}</p>
                                    <p className="text-xs text-gray-400 truncate">{userProfile?.email || ''}</p>
                                    {/* Status Selector */}
                                    <div className="mt-2 flex items-center gap-1 p-0.5 bg-gray-100 dark:bg-slate-800/80 rounded-lg">
                                        <button
                                            type="button"
                                            onClick={() => setMyStatus('online')}
                                            className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-medium transition-all ${myStatus === 'online' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'}`}
                                            title="Online"
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                            <span>Online</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMyStatus('away')}
                                            className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-medium transition-all ${myStatus === 'away' ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-xs font-semibold' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'}`}
                                            title="Abwesend"
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                            <span>Abwesend</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMyStatus('offline')}
                                            className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-medium transition-all ${myStatus === 'offline' ? 'bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 shadow-xs font-semibold' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'}`}
                                            title="Offline"
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                                            <span>Offline</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="py-1 px-1">
                                    {onOpenSocial && (
                                        <button
                                            onClick={() => { setIsAvatarMenuOpen(false); onOpenSocial(); }}
                                            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="relative">
                                                    <Users size={14} className="text-gray-400 dark:text-slate-500" />
                                                    {pendingRequests.length > 0 && (
                                                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                                                    )}
                                                </div>
                                                <span>Social</span>
                                            </div>
                                            {pendingRequests.length > 0 && (
                                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500 text-white shrink-0 leading-none">
                                                    {pendingRequests.length}
                                                </span>
                                            )}
                                        </button>
                                    )}
                                    {onOpenSettings && (
                                        <button
                                            onClick={() => { setIsAvatarMenuOpen(false); onOpenSettings(); }}
                                            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                        >
                                            <Settings size={14} className="text-gray-400 dark:text-slate-500" />
                                            <span>Einstellungen</span>
                                        </button>
                                    )}
                                    {onOpenTrash && (
                                        <button
                                            onClick={() => { setIsAvatarMenuOpen(false); onOpenTrash(); }}
                                            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                        >
                                            <Trash2 size={14} className="text-gray-400 dark:text-slate-500" />
                                            <span>Papierkorb</span>
                                        </button>
                                    )}
                                    <div className="h-px bg-gray-100 dark:bg-slate-800 my-1" />
                                    {onLogout && (
                                        <button
                                            onClick={onLogout}
                                            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                                        >
                                            <LogOut size={14} className="text-rose-500" />
                                            <span>Abmelden</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
