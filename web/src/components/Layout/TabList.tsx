"use client";

import React, { useRef } from 'react';
import { 
    X, 
    Calendar, 
    FileText, 
    MessageSquare, 
    DollarSign, 
    User, 
    Users, 
    GraduationCap, 
    Trash2, 
    Plus, 
    Lock, 
    Settings, 
    LogOut 
} from 'lucide-react';
import { useHighlight } from '../HighlightContext';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import Avatar from '../Profile/Avatar';

export interface Tab {
    id: string;
    title: string;
    type: 'file' | 'calendar' | 'messages' | 'chat' | 'ext_finance' | 'profile' | 'social' | 'exams' | 'trash';
    content?: any;
    _fileKey?: CryptoKey | null;
    _saveStatus?: "saved" | "unsaved" | "saving";
}

interface TabListProps {
    tabs: Tab[];
    activeTabId: string;
    onTabSelect: (id: string, type: 'file' | 'calendar' | 'messages' | 'chat' | 'ext_finance' | 'profile' | 'social' | 'exams' | 'trash') => void;
    onTabClose: (e: React.MouseEvent | null, id: string) => void;
    onTabsReorder?: (newTabs: Tab[]) => void;
    onNewTab?: () => void;
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
}

export default function TabList({ 
    tabs, 
    activeTabId, 
    onTabSelect, 
    onTabClose, 
    onTabsReorder, 
    onNewTab,
    userProfile,
    myId,
    isAvatarMenuOpen,
    setIsAvatarMenuOpen,
    avatarMenuRef,
    onOpenSocial,
    onOpenSettings,
    onOpenTrash,
    onLogout
}: TabListProps) {
    const { highlight } = useHighlight();
    const scrollRef = useRef<HTMLDivElement>(null);

    const getTabIcon = (type: string) => {
        switch (type) {
            case 'calendar':
                return <Calendar size={13} />;
            case 'chat':
            case 'messages':
                return <MessageSquare size={13} />;
            case 'profile':
                return <User size={13} />;
            case 'social':
                return <Users size={13} />;
            case 'exams':
                return <GraduationCap size={13} />;
            case 'ext_finance':
                return <DollarSign size={13} />;
            case 'trash':
                return <Trash2 size={13} />;
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
            case 'social': return 'Social';
            case 'exams': return 'Prüfungen';
            case 'chat': return 'Chat';
            case 'profile': return 'Profil';
            case 'ext_finance': return 'Finanzen';
            case 'trash': return 'Papierkorb';
            case 'file':
            default:
                return 'Neue Notiz';
        }
    };

    return (
        <div className="w-full flex-shrink-0 h-11 bg-gray-100/70 dark:bg-slate-950/60 border-b border-gray-200/80 dark:border-white/10 flex items-center justify-between px-2.5 gap-2 select-none z-30">
            {/* Horizontal Tabs Scroll Container */}
            <div 
                ref={scrollRef}
                className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar py-1"
            >
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
                            const isCalendar = tab.id === 'calendar';

                            return (
                                <Reorder.Item
                                    key={tab.id}
                                    value={tab}
                                    id={tab.id}
                                    initial={{ opacity: 0, scale: 0.92, y: -2 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.12 } }}
                                    whileDrag={{ scale: 1.03, zIndex: 60, boxShadow: "0px 8px 20px rgba(0,0,0,0.15)" }}
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
                                        className={`group relative flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 max-w-[190px] min-w-[100px] border
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
                                            className={`p-0.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-all shrink-0
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
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200/70 dark:hover:bg-slate-800/80 transition-colors shrink-0"
                        title="Neue Notiz (Neuer Tab)"
                    >
                        <Plus size={15} />
                    </button>
                )}
            </div>

            {/* Right side: Profile / Avatar Menu */}
            {setIsAvatarMenuOpen && avatarMenuRef && (
                <div ref={avatarMenuRef} className="relative shrink-0 flex items-center">
                    <button
                        onClick={() => setIsAvatarMenuOpen(o => !o)}
                        className="w-7 h-7 rounded-full overflow-hidden hover:ring-2 hover:ring-blue-400/80 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                        title="Profil"
                    >
                        <Avatar
                            seed={(userProfile?.avatar_seed || userProfile?.user_id || userProfile?.id || myId || 'default') + (userProfile?.avatar_salt || '')}
                            size={28}
                        />
                    </button>

                    {isAvatarMenuOpen && (
                        <div className="absolute right-0 top-9 w-48 bg-white dark:bg-slate-900 border border-gray-200/90 dark:border-slate-700 rounded-xl shadow-2xl py-1 z-[150] animate-in fade-in zoom-in-95 duration-100">
                            <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-800">
                                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{userProfile?.username || 'User'}</p>
                                <p className="text-xs text-gray-400 truncate">{userProfile?.email || ''}</p>
                            </div>
                            <div className="py-1 px-1">
                                {onOpenSocial && (
                                    <button
                                        onClick={() => { setIsAvatarMenuOpen(false); onOpenSocial(); }}
                                        className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                    >
                                        <Users size={14} className="text-gray-400 dark:text-slate-500" />
                                        <span>Social</span>
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
    );
}
