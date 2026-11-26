"use client";

import React, { useRef, useState, useEffect } from 'react';
import NoteIcon from '@/components/Icons/NoteIcon';
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
    ChevronDown,
    Variable
} from 'lucide-react';
import { useHighlight } from '../HighlightContext';
import { TabLayoutView } from './TabLayoutView';
import { flatten, moveTab, reconcileRows, type TabRows } from '@/lib/tabLayout';
import AvatarMenu from './AvatarMenu';
import { useSocialStore } from '@/store/useSocialStore';
import { useDataStore } from '@/store/useDataStore';
import DT from '@/lib/designTokens';
import TabHoverPreview, { type TabPreviewTarget } from './TabHoverPreview';
import PluginsMenu from './PluginsMenu';

/** Delay before the hover preview of a tab appears. */
const PREVIEW_DELAY_MS = 450;

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
    /** Toggles the Todos view (the fixed Todos tab); falls back to selecting it. */
    onToggleTodos?: () => void;
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

const TAB_LAYOUT_KEY = 'tide_tab_layout';

function loadTabRows(): TabRows {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(TAB_LAYOUT_KEY) || '[]');
        return Array.isArray(parsed) ? (parsed as TabRows) : [];
    } catch {
        return [];
    }
}

function saveTabRows(rows: TabRows): void {
    try { localStorage.setItem(TAB_LAYOUT_KEY, JSON.stringify(rows)); } catch { /* private mode */ }
}

export default function TabList({ 
    tabs, 
    activeTabId, 
    onTabSelect, 
    onTabClose, 
    onTabsReorder, 
    onNewTab,
    onToggleTodos,
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
    const navigationMode = useDataStore(s => s.navigationMode);
    const enabledExtensions = useDataStore(s => s.enabledExtensions);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [preview, setPreview] = useState<TabPreviewTarget | null>(null);
    const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const hidePreview = () => {
        if (previewTimer.current) clearTimeout(previewTimer.current);
        previewTimer.current = null;
        setPreview(null);
    };
    const schedulePreview = (tab: Tab, el: HTMLElement) => {
        hidePreview();
        previewTimer.current = setTimeout(() => {
            setPreview({ id: tab.id, title: getTabLabel(tab), isNote: tab.type === 'file', isActive: tab.id === activeTabId, content: tab.content, rect: el.getBoundingClientRect() });
        }, PREVIEW_DELAY_MS);
    };
    useEffect(() => () => { if (previewTimer.current) clearTimeout(previewTimer.current); }, []);
    // A tab that closes or changes under the pointer never sends mouseleave, which would leave the card stuck
    useEffect(() => { hidePreview(); }, [tabs.length, activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

    const getTabIcon = (type: Tab['type']) => {
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
                return <NoteIcon size={14} />;
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
            case 'folders': return 'Notizen';
            case 'file':
            default:
                return 'Neue Notiz';
        }
    };

    // Tab layout: rows of groups, saved on this device. Todos is a fixed member: movable, not closable.
    const tabsById = new Map(tabs.map((t) => [t.id, t] as const));
    const tabIds = ['todos', ...tabs.filter((t) => t.id !== 'todos' && t.type !== 'todos').map((t) => t.id)];
    const [storedRows, setStoredRows] = useState<TabRows>(() => loadTabRows());
    const rows = reconcileRows(storedRows, tabIds);
    const applyRows = (next: TabRows) => {
        setStoredRows(next);
        saveTabRows(next);
        onTabsReorder?.(flatten(next).map((id) => tabsById.get(id)).filter((t): t is Tab => Boolean(t)));
    };

    const renderTab = (id: string) => {
        if (id === 'todos') {
            return (
                <button
                    type="button"
                    onClick={navigationMode === 'folders' || !onToggleTodos ? () => onTabSelect('todos', 'todos') : onToggleTodos}
                    style={{ borderRadius: DT.radius }}
                    className={`flex items-center gap-2 min-h-[32px] px-3 py-1.5 text-xs font-medium cursor-pointer transition-all duration-150 border shrink-0 ${
                        activeTabId === 'todos'
                            ? 'bg-t2-surface text-t2-ink shadow-sm border-t2-line font-semibold'
                            : 'text-t2-ink-2 hover:text-t2-ink hover:bg-t2-stage border-transparent'
                    }`}
                >
                    <ListTodo size={13} />
                    <span>Todos</span>
                </button>
            );
        }
        const tab = tabsById.get(id);
        if (!tab) return null;
        const isActive = activeTabId === tab.id;
        return (
                <div
                    role="tab"
                    aria-selected={isActive}
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
                    onMouseEnter={(e) => schedulePreview(tab, e.currentTarget)}
                    onMouseLeave={hidePreview}
                    onPointerDown={hidePreview}
                    style={{ borderRadius: DT.radius }}
                    className={`group relative flex items-center gap-2 min-h-[32px] px-3 py-1.5 text-xs font-medium cursor-pointer hover:-translate-y-[1px] hover:shadow-xs active:translate-y-0 active:scale-[0.99] transition-all duration-150 max-w-[190px] min-w-[100px] border
                        ${isActive
                            ? 'bg-t2-surface  text-t2-ink  shadow-sm border-t2-line  font-semibold'
                            : 'text-t2-ink-2  hover:text-t2-ink  hover:bg-t2-stage  border-transparent'
                        }`}
                >
                    {/* Icon */}
                    <div className={`shrink-0 ${isActive ? 'text-t2-ink  font-semibold' : 'text-t2-ink-3  group-hover:text-t2-ink-2  transition-colors'}`}>
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
                    {!(tab.id === 'calendar' || tab.type === 'calendar' || (navigationMode === 'folders' && (tab.id === 'folders' || tab.type === 'folders'))) && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onTabClose(e, tab.id);
                            }}
                            style={{ borderRadius: DT.radiusSm }}
                            className={`p-1 text-t2-ink-3 hover:text-t2-ink  transition-all shrink-0
                                ${isActive ? 'opacity-70 hover:opacity-100 hover:bg-t2-hover ' : 'opacity-0 group-hover:opacity-100 hover:bg-t2-line '}
                            `}
                            title="Tab schließen"
                        >
                            <X size={12} strokeWidth={2.5} />
                        </button>
                    )}
                </div>
        );
    };

    return (
        <div 
            className="wco-drag w-full flex-shrink-0 min-h-[calc(4rem+env(safe-area-inset-top,0px))] bg-t2-bg border-b border-t2-line-soft flex items-center justify-between px-4 gap-3 select-none z-30 pt-[calc(0.625rem+env(safe-area-inset-top,0px))] pb-2"
        >
            {/* Zone 1: Left balanced zone (Sidebar toggle) */}
            <div className={`flex items-center justify-start gap-2 min-w-0 shrink-0 ${navigationMode === 'folders' ? 'hidden' : 'flex-1'}`}>
                {navigationMode !== 'folders' && onToggleSidebar && (
                    <button
                        type="button"
                        onClick={onToggleSidebar}
                        title={isSidebarOpen ? "Sidebar einklappen" : "Sidebar ausklappen"}
                        aria-label="Sidebar umschalten"
                        style={{ borderRadius: DT.radius }}
                        className="flex items-center justify-center w-8 h-8 text-t2-ink-2 hover:text-t2-ink   hover:bg-t2-stage  active:scale-95 transition-all shrink-0 cursor-pointer"
                    >
                        <PanelLeft className={`w-4 h-4 transition-transform duration-200 ${isSidebarOpen ? '' : 'text-primary'}`} />
                    </button>
                )}
            </div>

            {/* Zone 2: Center balanced zone (Horizontally Centered Tabs) */}
            <div 
                ref={scrollRef}
                className={`flex items-center min-w-0 py-1 ${navigationMode === 'folders' ? 'flex-1 justify-start overflow-x-auto no-scrollbar' : 'max-w-full overflow-x-auto no-scrollbar'}`}
            >
                <div className={`flex items-center gap-1.5 shrink-0 ${navigationMode === 'folders' ? 'justify-start' : 'mx-auto'}`}>
                    <TabLayoutView rows={rows} renderTab={renderTab} onMove={(id, target) => applyRows(moveTab(rows, id, target))} />

                    {/* "+" New Note Tab Button */}
                    {onNewTab && (
                        <button
                            onClick={onNewTab}
                            style={{ borderRadius: DT.radius }}
                            className="flex items-center justify-center w-7 h-7 text-t2-ink-2 hover:text-t2-ink   hover:bg-t2-stage  transition-colors shrink-0 cursor-pointer"
                            title="Neue Notiz (Neuer Tab)"
                        >
                            <Plus size={15} />
                        </button>
                    )}

                </div>
            </div>

            {preview && <TabHoverPreview target={preview} />}

            {/* Zone 3: Right balanced zone (Plugin Slot, Dropdown & Profile) */}
            <div className="flex items-center justify-end gap-2 flex-1 min-w-0 shrink-0">
                {/* Optional external plugin slot */}
                {pluginSlot}

                {/* With the sidebar open, plugins live in the sidebar. */}
                {!isSidebarOpen && (
                    <PluginsMenu
                        activeTabId={activeTabId}
                        enabledExtensions={enabledExtensions}
                        onTabSelect={onTabSelect}
                        onOpenSocial={onOpenSocial}
                        onOpenSettings={onOpenSettings}
                        onOpenVariables={() => useDataStore.getState().setVariablesModalOpen(true)}
                    />
                )}

                {/* Profile lives in the sidebar; it only shows here while the sidebar is hidden */}
                {setIsAvatarMenuOpen && avatarMenuRef && !(isSidebarOpen && navigationMode !== 'folders') && (
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
                        size={40}
                    />
                )}
            </div>
        </div>
    );
}
