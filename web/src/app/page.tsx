"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import * as cryptoLib from "@/lib/crypto";
import * as cryptoV2 from "@/lib/cryptoV2";
import { apiFetch, getApiBase } from "@/lib/api";
import { getMasterKey, storeMasterKey, clearMasterKey, purgeLegacyKeys } from "@/lib/keyStorage";
import ChatPanel from "@/components/Chat/ChatPanel";
import Sidebar from "@/components/Layout/Sidebar";
import TabList, { Tab } from "@/components/Layout/TabList";
import CalendarView from "@/components/Calendar/CalendarView";
import WeekView from "@/components/Calendar/WeekView";
import { ItemSecuritySettings } from "@/lib/pinSecurity";
import ThemeItem from "@/components/Settings/ThemeItem";
import ProfilePage from "@/components/Profile/ProfilePage";
import SocialHub from "@/components/Social/SocialHub";
import dynamic from 'next/dynamic';
import { getTranslation, useTranslation } from "@/lib/i18n";
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { ScheduleEventData } from "@/components/Calendar/ScheduleModal";
import { TodoList } from '../components/Todo/TodoList';
import { getEventGroupIds } from '../lib/calendarUtils';

const Editor = dynamic(() => import('@/components/Editor'), {
    ssr: false,
    loading: () => <div className="min-h-[500px] w-full animate-pulse bg-gray-50 dark:bg-gray-800/50 rounded-lg"></div>
});

const CanvasNoteEditor = dynamic(() => import('@/components/Canvas/CanvasNoteEditor'), { ssr: false });

import MobileLayout from "@/components/Layout/MobileLayout";
import { Clock, Settings, LogOut, Users, Trash2, GraduationCap, Copy, ListTodo, GripVertical } from 'lucide-react';
import Avatar from "@/components/Profile/Avatar";
import SmartIsland from "@/components/SmartIsland";
import { tipTapToMarkdown } from "@/lib/bundleImportExport";
import TrashPanel from "@/components/TrashPanel";

import { useJobPlannerStore } from "@/store/useJobPlannerStore";
import { useStyleFile } from "@/components/Canvas/useStyleFile";
import { TextWidgetElement } from "@/types/canvas";
import { useHighlight } from "@/components/HighlightContext";
import { CheckCircle2, Loader2, Plus, ChevronDown, Share, Download, Check } from 'lucide-react';
import { useIslandStore } from '@/components/extensions/smart_island/useIslandStore';
import { isSameDay } from 'date-fns';
import { useDataStore, DataItem, TaskItem } from "@/store/useDataStore";
import { useDragGhost } from "@/store/useDragGhost";
import EventDragGhost from "@/components/Calendar/EventDragGhost";
import CloudStatusBanner from "@/components/CloudStatusBanner";
import { useDateDetection, DateDetectionMode } from "@/hooks/useDateDetection";
import { useProductivityStats } from "@/hooks/useProductivityStats";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useTextCollector } from "@/hooks/useTextCollector";
import { useTouchContextMenu } from "@/hooks/useTouchContextMenu";
import { useMobileConnectionSync } from "@/hooks/useMobileConnectionSync";
import { motion } from 'framer-motion';

// Newly imported modular hooks and components
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useSplitViewDrag } from "@/hooks/useSplitViewDrag";
import { useAutoSaveSync } from "@/hooks/useAutoSaveSync";
import { JobsWorkspace } from "@/components/Workspaces/JobsWorkspace";
import { SearchOverlay } from "@/components/Workspaces/SearchOverlay";
import { CanvasWorkspace } from "@/components/Workspaces/CanvasWorkspace";
import { GlobalModalsHost } from "@/components/Layout/GlobalModalsHost";

// Stable ref to avoid stale closures in event-listener callbacks
function useLatestRef<T>(value: T) {
    const ref = useRef<T>(value);
    ref.current = value;
    return ref;
}

interface DecryptedFile {
    id: string;
    title: string;
    type: string;
    size: number;
    updated_at: string;
    secured_meta?: string;
    share_status?: string;
    visibility: string;
    parent_id?: string | null;
    owner_email?: string;
    owner_id?: string;
    color?: string;
    isGroup?: boolean;
    effect?: string;
}

// ...

// ...
// Removed handleCreateFolder from here

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    description?: string;
    color?: string;
    secured_meta?: string; // Store for rename/update without re-fetch
    share_status?: string; // Track pending/accepted status for shared events
    parent_id?: string | null;
    effect?: string;
    allDay?: boolean;
    is_task?: boolean;
    is_completed?: boolean;
    linkedTaskId?: string;
    recurrence_rule?: string;
    recurrence_end?: string;
}


const isSameTime = (d1?: string, d2?: string) => {
    if (!d1 && !d2) return true;
    if (!d1 || !d2) return false;
    const t1 = new Date(d1).getTime();
    const t2 = new Date(d2).getTime();
    return !isNaN(t1) && !isNaN(t2) && Math.abs(t1 - t2) < 60000;
};

export default function Dashboard() {
    // -------------------------------------------------------------------------
    // 0. State & Initialization
    // -------------------------------------------------------------------------
    useTouchContextMenu();

    // Auth & User State
    const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
    const [publicKey, setPublicKey] = useState<CryptoKey | null>(null);
    const [myId, setMyId] = useState<string>("");
    const [userEmail, setUserEmail] = useState<string>("");
    const router = useRouter();
    const [status, setStatus] = useState<"loading" | "ready">("loading");

    // UI & Navigation State
    const [openTabs, setOpenTabs] = useState<Tab[]>([{ id: 'calendar', title: 'Calendar', type: 'calendar' }]);
    const [activeTabId, setActiveTabId] = useState<string>('calendar');
    const [isSharingDisabled, setIsSharingDisabled] = useState(false);
    const {
        width: sidebarWidth,
        isCollapsed: isSidebarCollapsed,
        toggleCollapse: toggleSidebarCollapse,
        setIsCollapsed: setIsSidebarCollapsed,
        startDragging: startSidebarDrag,
    } = useSplitViewDrag({
        defaultWidth: 256,
        minWidth: 200,
        maxWidth: 400,
        storageKey: 'tide_sidebar_width',
        breakpoint: 1024,
    });
    const isSidebarOpen = !isSidebarCollapsed;
    const [userProfile, setUserProfile] = useState<{ username: string; email: string; avatar_seed?: string; avatar_salt?: string; avatar_style?: string; bio?: string; title?: string; is_verified?: boolean; profile_status?: number; id?: string; user_id?: string } | null>(null);
    const [streak, setStreak] = useState(0);
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);
    const [summaryStats, setSummaryStats] = useState({ events: 0, tasks: 0 });
    const [showBackups, setShowBackups] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen?: boolean; fileId: string; isShared: boolean; isFolder: boolean } | null>(null);

    // Data State (selectors)
    const {
        notes: storeFiles,
        events: storeEvents,
        tasks: storeTasks,
        setKeys,
        fetchDirectory,
        loadedDirectories,
        enabledExtensions, setEnabledExtensions,
        noteLayout, setNoteLayout,
        isSettingsModalOpen, setSettingsModalOpen
    } = useDataStore();
    const deleteTask = useDataStore(s => s.deleteTask);
    const updateTask = useDataStore(s => s.updateTask);

    const files = storeFiles as unknown as DecryptedFile[];
    const events = storeEvents as unknown as CalendarEvent[];
    const tasks = storeTasks as any[];

    // Editor & File State
    const [isSearching, setIsSearching] = useState(false);
    const [noteSecurityModalItem, setNoteSecurityModalItem] = useState<{ id: string; title: string; type: 'file' | 'folder' | 'canvas' | 'note'; metadata?: any } | null>(null);
    const [deleteError, setDeleteError] = useState<{ fileId: string, title: string, message: string, isCorrupt: boolean } | null>(null);
    const [activeCollaborators, setActiveCollaborators] = useState<any[]>([]);
    const [editorInstance, setEditorInstance] = useState<any>(null);
    const editorInstanceRef = useRef<any>(null);
    const [editorVersion, setEditorVersion] = useState(0);

    // Sidebar & Reordering State
    const [editingFileId, setEditingFileId] = useState<string | null>(null);
    const [hiddenThemeIds, setHiddenThemeIds] = useState<string[]>([]);
    const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
    const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
    const avatarMenuRef = useRef<HTMLDivElement>(null);

    // Calendar & Event State
    const [calendarDate, setCalendarDate] = useState(new Date());

    const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
    const [scheduleInitialStart, setScheduleInitialStart] = useState<Date | null>(null);
    const [activeEventId, setActiveEventId] = useState<string | null>(null);
    const [pinnedEventIds, setPinnedEventIds] = useState<string[]>([]);
    const [minimizedEventIds, setMinimizedEventIds] = useState<string[]>([]);
    const syncingTaskIdsRef = useRef<Set<string>>(new Set());

    // Canvas & Linking State
    const [deletedBlockIds, setDeletedBlockIds] = useState<string[]>([]);
    const [pendingBindBlockId, setPendingBindBlockId] = useState<string | null>(null);
    const [isLinkingMode, setIsLinkingMode] = useState(false);
    const [activeLinkBlockId, setActiveLinkBlockId] = useState<string | null>(null);
    const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
    const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);

    // Extensions State
    const { push: islandPush, setIdlePayload, clearAll: islandClearAll } = useIslandStore();

    // Layout Options
    const [isRestored, setIsRestored] = useState(false);

    // [FEATURE] Text → Calendar drag state
    const [calendarDropActive, setCalendarDropActive] = useState(false);
    const [draggedText, setDraggedText] = useState<string | null>(null);

    // Share Modal State
    const [shareModalFile, setShareModalFile] = useState<{ id: string, title: string, type?: string, callerPermission?: 'owner' | 'view' | 'edit' | 'share' } | null>(null);

    const handleToggleExtension = async (extensionId: string, enabled: boolean) => {
        setEnabledExtensions(prev => {
            const next = enabled ? [...prev, extensionId] : prev.filter(e => e !== extensionId);
            localStorage.setItem('tide_enabled_extensions', JSON.stringify(next));
            return next;
        });
        if (!enabled) {
            if (activeTabId === `ext_${extensionId}`) setActiveTabId('calendar');
            setOpenTabs(prev => prev.filter(t => t.id !== `ext_${extensionId}`));
        }
        try {
            await apiFetch("/api/v1/user/extensions", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ extension: extensionId, enabled })
            });
        } catch (e) { console.error("Failed to toggle extension", e); }
    };


    // Derived State
    const activeTabIdStr = typeof activeTabId === 'string' ? activeTabId : String(activeTabId || 'calendar');
    const activeNoteId = (activeTabIdStr !== 'calendar' && activeTabIdStr !== 'todos' && activeTabIdStr !== 'messages' && !activeTabIdStr.startsWith('chat-'))
        ? activeTabIdStr
        : null;

    const canvasSidecar = useStyleFile({
        noteId: activeNoteId,
        userId: myId,
        privateKey,
        publicKey,
    });

    const sidebarFiles = useMemo(() => {
        if (!files) return [];
        return files.filter((f: any) => !f.isGroup && !(f.title || '').startsWith('.'));
    }, [files]);

    // Callbacks
    const handleEditorReady = useCallback((ed: any) => {
        setTimeout(() => { setEditorInstance(ed); editorInstanceRef.current = ed; }, 0);
    }, []);

    const switchTabRef = useLatestRef<((newId: string, type: string, forcedTitle?: string, fallbackData?: any, currentOverride?: any) => Promise<void> | void) | null>(null);

    const {
        saveStatus,
        setSaveStatus,
        isLoadingContent,
        setIsLoadingContent,
        activeFileKey,
        setActiveFileKey,
        editorContent,
        setEditorContent,
        canvasNoteData,
        setCanvasNoteData,
        fileName,
        setFileName,
        userHasTypedRef,
        initialContentRef,
        handleEditorChange,
        triggerSave,
        performSave,
        loadNoteContent,
    } = useAutoSaveSync({
        activeNoteId,
        openTabs,
        setOpenTabs,
        setEditorVersion,
        privateKey,
        publicKey,
        myId,
        files,
        events,
        switchTab: (...args) => switchTabRef.current?.(...args),
    });

    useGlobalShortcuts({
        onNewNote: () => handleNewNote(),
        onSave: () => {
            if (activeNoteId && editorContent) {
                triggerSave(activeNoteId, activeFileKey, editorContent);
            }
        },
        onToggleSidebar: toggleSidebarCollapse,
        onOpenSearch: () => setIsSearching(true),
        onToggleTodos: () => handleToggleTodos(),
        onOpenCalendar: () => handleTabSelect('calendar', 'calendar'),
        onCloseModals: () => {
            setIsSearching(false);
            setSettingsModalOpen(false);
            setScheduleModalOpen(false);
            setIsSummaryOpen(false);
            setShowBackups(false);
            setDeleteConfirm(null);
            setShareModalFile(null);
            setNoteSecurityModalItem(null);
        },
    });

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
                setIsAvatarMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Passive Productivity Stats
    useProductivityStats();

    const handleNewNote = async (parentIdOverride?: string | null) => {
        try {
            const { createNote, activeParentId, toggleFolder } = useDataStore.getState();
            const parentId = parentIdOverride !== undefined ? parentIdOverride : activeParentId;
            const newFileId = await createNote("Untitled", undefined, parentId);
            if (parentId) {
                toggleFolder(parentId, true);
            }
            switchTab(newFileId, 'file', "Untitled");
        } catch (e) {
            console.error(e);
            alert("Error creating note");
        }
    };

    const handleNewCanvasNote = async () => {
        const title = 'Neue Leinwand';
        const newId = await useDataStore.getState().createCanvasNote(title);
        useDataStore.getState().fetchDirectory(null, true);
        switchTab(newId, 'file', title);
    };

    const handleExportNote = useCallback(() => {
        if (!activeNoteId || !editorContent || !fileName) return;

        let contentToExport = "";
        if (typeof editorContent === 'string') {
            contentToExport = editorContent;
        } else if (editorInstance) {
            // Basic HTML-to-Markdown conversion for standard Tiptap nodes
            const html = editorInstance.getHTML();
            contentToExport = html
                .replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n')
                .replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n')
                .replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n')
                .replace(/<p>(.*?)<\/p>/gi, '$1\n\n')
                .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
                .replace(/<em>(.*?)<\/em>/gi, '*$1*')
                .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
                .replace(/<ul>(.*?)<\/ul>/gi, '$1\n')
                .replace(/<ol>(.*?)<\/ol>/gi, '$1\n')
                .replace(/<br\s*\/?>/gi, '\n')
                // Remove any remaining tags
                .replace(/<[^>]+>/g, '')
                // Decode HTML entities
                .replace(/&nbsp;/g, ' ')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .trim();
        }

        const blob = new Blob([contentToExport], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [activeNoteId, editorContent, fileName, editorInstance]);

    const switchTab = async (newId: string, type: string, forcedTitle?: string, fallbackData?: any, currentOverride?: any) => {
        switchTabRef.current = switchTab;
        if (!newId) {
            newId = 'calendar';
            type = 'calendar';
            forcedTitle = undefined;
        }
        const currentContentToUse = currentOverride || editorContent || canvasNoteData;
        const currentTabId = useDataStore.getState().activeNoteId || activeTabId; // Use ref-like safety

        const isOldAFile = currentTabId !== 'calendar' && currentTabId !== 'todos' && currentTabId !== 'messages' && !currentTabId.startsWith('chat-');

        if (isOldAFile && (saveStatus === 'unsaved' || currentOverride) && currentContentToUse) {
            console.log(`[Lifecycle] Tab switch: Forcing final save of ${currentTabId}`);
            // Use triggerSave for the latest logic and keys
            triggerSave(currentTabId, activeFileKey, currentContentToUse);
        }

        setOpenTabs(prev => {
            let nextTabs = [...prev];
            if (isOldAFile) {
                nextTabs = nextTabs.map(t => t.id === activeTabId ? {
                    ...t, content: currentContentToUse, _fileKey: activeFileKey, _saveStatus: 'saved'
                } : t);
            }
            const existingTab = nextTabs.find(t => t.id === newId);
            const defaultNoteTitle = getTranslation(useDataStore.getState().language || 'de', 'common', 'newNote');

            if (existingTab) {
                if (forcedTitle && forcedTitle !== existingTab.title) {
                    return nextTabs.map(t => t.id === newId ? { ...t, title: forcedTitle } : t);
                }
                return nextTabs;
            } else {
                const newTab: Tab = {
                    id: newId,
                    title: forcedTitle || (type === 'calendar' ? 'Calendar' : type === 'todos' ? 'Todos' : defaultNoteTitle),
                    type: type as any
                };
                return [...nextTabs, newTab];
            }
        });

        setActiveTabId(newId);
        setEditorContent(null);
        setCanvasNoteData(null);
        setActiveFileKey(null);
        setSaveStatus("saved");
        setActiveCollaborators([]);

        if (type === 'file') {
            useDataStore.getState().setActiveNoteId(newId);
            const existingTab = openTabs.find(t => t.id === newId);
            const finalTitle = forcedTitle || existingTab?.title || "";
            setFileName(finalTitle);
            if (existingTab && existingTab.content) {
                setEditorContent(existingTab.content);
                initialContentRef.current = existingTab.content;
                userHasTypedRef.current = false;
                if (existingTab._fileKey) setActiveFileKey(existingTab._fileKey);
                setSaveStatus(existingTab._saveStatus || 'saved');
            } else {
                userHasTypedRef.current = false;
                loadNoteContent(newId, finalTitle, fallbackData);
            }

            // Auto-focus logic: Title input if empty/default title, otherwise Editor at last caret position
            const defaultTitleStr = getTranslation(useDataStore.getState().language || 'de', 'common', 'newNote');
            const isUnsetTitle = !finalTitle || finalTitle === defaultTitleStr || finalTitle === 'Untitled' || finalTitle === 'Neue Notiz' || finalTitle === 'New Note';
            setTimeout(() => {
                if (isUnsetTitle) {
                    const inputEl = document.getElementById('note-title-input') as HTMLInputElement | null;
                    if (inputEl) {
                        inputEl.focus();
                        inputEl.select();
                    }
                } else {
                    const pos = useDataStore.getState().noteCaretPositions[newId];
                    if (editorInstance) {
                        editorInstance.commands.focus(pos ? pos.from : 'end');
                    }
                }
            }, 180);
        } else {
            useDataStore.getState().setActiveNoteId(null);
        }
    };

    const handleFileSelect = async (fileId: string, title: string, fileData?: any) => {
        switchTab(fileId, 'file', title, fileData);
    };

    // -------------------------------------------------------------------------
    // 2. Continuous Hooks (Effects)
    // -------------------------------------------------------------------------

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleSelectNote = (e: Event) => {
            const { id, title } = (e as CustomEvent).detail;
            handleFileSelect(id, title);
        };
        
        const handleSelectEvent = (e: Event) => {
            const { id, start } = (e as CustomEvent).detail || {};
            setActiveTabId('calendar');
            setOpenTabs(prev => prev.some(t => t.id === 'calendar') ? prev : [...prev, { id: 'calendar', title: 'Calendar', type: 'calendar' }]);
            const ev = events.find((item: any) => item.id === id);
            const eventStart = start || ev?.start;
            if (eventStart) {
                setCalendarDate(new Date(eventStart));
            }
            if (id) {
                setActiveEventId(id);
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('calendar:scroll-to', { detail: { id, start: eventStart } }));
                }, 150);
            }
        };

        const handleReloadNote = (e: Event) => {
            const { fileId } = (e as CustomEvent).detail || {};
            if (fileId && fileId === activeNoteId) {
                const liveFile = useDataStore.getState().notes.find(f => f.id === fileId);
                const title = liveFile?.title || fileName || "Untitled";
                loadNoteContent(fileId, title);
            }
        };

        window.addEventListener('tide:select-note', handleSelectNote);
        window.addEventListener('tide:select-event', handleSelectEvent);
        window.addEventListener('tide:reload_note', handleReloadNote);

        return () => {
            window.removeEventListener('tide:select-note', handleSelectNote);
            window.removeEventListener('tide:select-event', handleSelectEvent);
            window.removeEventListener('tide:reload_note', handleReloadNote);
        };
    }, [handleFileSelect, events]);

    useRealtimeSync({
        myId,
        activeNoteId,
        fileName,
        isLoadingContent,
        editorContent,
        privateKey,
    });


    // Auto-Save Effect — intentionally removed: the ref-based triggerSave system above
    // (lines 297-363) is the single, canonical auto-save path. Having a second effect
    // that also depends on `files` caused a race condition: every successful save fired
    // an SSE `file_updated` event → fetchDirectory() updated `files` → this effect
    // re-ran, sometimes spawning a new 1500ms timer on stale content that overwrote the
    // recently saved version. All auto-save is now handled by triggerSave + its effects.

    // [FIX-2b] Reactive title-sync: whenever fetchDirectory resolves and the store
    // holds a decrypted title for the currently-open note, push it into the local
    // fileName state AND the open-tab title. This is the definitive fix for the
    // "Locked Note (Decrypting...)" placeholder persisting after F5.
    useEffect(() => {
        if (!activeNoteId) return;
        const freshNote = storeFiles.find((f: any) => f.id === activeNoteId) as any;
        if (!freshNote) return;
        const realTitle = freshNote.title;
        if (!realTitle || realTitle.includes('Locked Note')) return;
        // Update fileName if showing a placeholder/empty/Locked or if store has a newer title
        setFileName(prev => (prev === '' || prev.includes('Locked') || prev !== realTitle) ? realTitle : prev);
        // Sync the open tab's title whenever the store title differs (fixes first-letter-only bug)
        setOpenTabs(prev => prev.map(tab =>
            tab.id === activeNoteId && tab.title !== realTitle
                ? { ...tab, title: realTitle }
                : tab
        ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeFiles, activeNoteId]);

    // Data Load Effect
    useEffect(() => {
        if (privateKey && publicKey && myId) {
            setKeys(privateKey, publicKey, myId);
            fetchDirectory(null, true);

            // Eagerly load all note metadata so @-mentions find notes in subfolders
            useDataStore.getState().loadAllMetadata().catch(console.error);

            import('@/lib/searchIndex').then(({ loadSearchIndex, rebuildIndex }) => {
                loadSearchIndex(privateKey, myId).then(async (idx) => {
                    if (!idx || idx.length === 0) {
                        try {
                            await useDataStore.getState().loadAllMetadata();
                            const s = useDataStore.getState();
                            const items = [
                                ...s.events.map(e => ({ id: e.id, title: e.title, date: (e as any).start || new Date().toISOString(), type: 'event' as const })),
                                ...s.notes.map(n => ({ id: n.id, title: n.title, date: new Date().toISOString(), type: 'note' as const })),
                                ...s.tasks.map(t => ({ id: t.id, title: t.title, date: new Date().toISOString(), type: 'task' as const }))
                            ];
                            if (items.length > 0) {
                                // Pass both privateKey and publicKey to support reading and writing the index
                                await rebuildIndex(items, privateKey, publicKey, myId);
                            }
                        } catch (e) {
                            console.error("Index initialization failed", e);
                        }
                    }
                });
            });
        }
    }, [privateKey, publicKey, myId, setKeys, fetchDirectory]);

    // Debounced Search Index Sync Effect
    useEffect(() => {
        if (!privateKey || !publicKey || !myId || !isRestored) return;
        
        const timer = setTimeout(() => {
            const s = useDataStore.getState();
            const items = [
                ...s.events.map(e => ({ id: e.id, title: e.title, date: e.start || new Date().toISOString(), type: 'event' as const })),
                ...s.notes.map(n => ({ id: n.id, title: n.title, date: new Date().toISOString(), type: 'note' as const })),
                ...s.tasks.map(t => ({ id: t.id, title: t.title, date: new Date().toISOString(), type: 'task' as const }))
            ];
            if (items.length > 0) {
                import('@/lib/searchIndex').then(({ rebuildIndex }) => {
                    rebuildIndex(items, privateKey, publicKey, myId).catch(err => {
                        console.error("[SearchIndexSync] Rebuild failed", err);
                    });
                });
            }
        }, 2000); // 2s debounce

        return () => clearTimeout(timer);
    }, [files, events, tasks, privateKey, publicKey, myId, isRestored]);

    // Cleanup orphaned tabs when access is revoked or file is deleted
    useEffect(() => {
        if (!isRestored || !files || files.length === 0) return;
        setOpenTabs(prev => {
            const next = prev.filter(tab => {
                if (tab.id === 'calendar' || tab.id === 'messages' || tab.id.startsWith('ext_') || tab.id.startsWith('chat-') || tab.id.startsWith('profile:')) return true;
                return files.some(f => f.id === tab.id);
            });
            return next.length !== prev.length ? next : prev;
        });
    }, [files, isRestored]);

    // Persistence Effect for Tabs & Layout
    useEffect(() => {
        if (!isRestored) return;
        // Tabs are sessionStorage only — each browser window stays independent
        sessionStorage.setItem('tide_open_tabs', JSON.stringify(openTabs));
        sessionStorage.setItem('tide_active_tab_id', activeTabId);
        // Layout stays in localStorage — it's a cross-window preference
        localStorage.setItem('tide_note_layout', noteLayout);
    }, [openTabs, activeTabId, noteLayout, isRestored]);

    // Idle Payload Effect
    useEffect(() => {
        const today = new Date();
        const todayEvents = events.filter(e => {
            try { return isSameDay(new Date(e.start), today); } catch { return false; }
        });
        setIdlePayload({ events: todayEvents.map(e => ({ title: e.title, start: e.start })) });
    }, [events, setIdlePayload]);

    // [FEATURE] Text → Calendar: detect text drag globally to light up the calendar drop zone
    useEffect(() => {
        const handleDragStart = (e: DragEvent) => {
            const text = e.dataTransfer?.getData('text/plain') || window.getSelection()?.toString() || '';
            if (text && text.trim().length > 0 && !e.dataTransfer?.types.includes('tide/calendar-event')) {
                // Store for later use when dropped
                setDraggedText(text.trim());
                setCalendarDropActive(true);
                // Also put text in transfer so the calendar can read it
                try { e.dataTransfer?.setData('tide/text-to-calendar', text.trim()); } catch (_) {}
            }
        };
        const handleDragEnd = () => {
            setCalendarDropActive(false);
        };
        window.addEventListener('dragstart', handleDragStart, true);
        window.addEventListener('dragend', handleDragEnd, true);
        return () => {
            window.removeEventListener('dragstart', handleDragStart, true);
            window.removeEventListener('dragend', handleDragEnd, true);
        };
    }, []);


    // ── Reminder: 10 min before event ─────────────────────────────────────────
    const remindedEventsRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (!enabledExtensions.includes('smart_island')) return;
        const check = () => {
            const now = new Date();
            for (const ev of events) {
                try {
                    const start = new Date(ev.start);
                    const diffMs = start.getTime() - now.getTime();
                    const diffMins = diffMs / 60_000;
                    if (diffMins > 0 && diffMins <= 10 && !remindedEventsRef.current.has(ev.id)) {
                        remindedEventsRef.current.add(ev.id);
                        islandPush({
                            type: 'reminder',
                            priority: 'CRITICAL',
                            payload: {
                                event: { title: ev.title, start: ev.start, end: ev.end, description: (ev as any).description || '' },
                                duration: 15_000, // show for 15s
                            },
                        });
                    }
                } catch { /* skip invalid dates */ }
            }
        };
        check(); // immediate
        const interval = setInterval(check, 60_000); // every minute
        return () => clearInterval(interval);
    }, [events, enabledExtensions, islandPush]);

    useMobileConnectionSync(events);

    useTextCollector({
        enabledExtensions,
        setOpenTabs,
        setActiveTabId,
    });

    // Store Event Listener
    useEffect(() => {
        const h = () => handleNewNote();
        window.addEventListener('dataStore:createNote', h);
        return () => window.removeEventListener('dataStore:createNote', h);
    }, [handleNewNote]);

    const handleLogout = async () => {
        sessionStorage.clear();
        await clearMasterKey();
        localStorage.removeItem("tide_session_key");
        localStorage.removeItem("tide_session_token");
        localStorage.removeItem("tide_user_id");
        localStorage.removeItem("tide_user_email");
        router.push("/auth");
    };

    const handleDateSelect = (date: Date) => {
        setCalendarDate(date);
        setActiveTabId('calendar');
        if (!openTabs.find(t => t.id === 'calendar')) {
            setOpenTabs(prev => [...prev, { id: 'calendar', title: 'Calendar', type: 'calendar' }]);
        }
    };

    const handlePrevWeek = () => {
        setCalendarDate(prev => {
            const d = new Date(prev);
            d.setDate(d.getDate() - 7);
            return d;
        });
    };

    const handleNextWeek = () => {
        setCalendarDate(prev => {
            const d = new Date(prev);
            d.setDate(d.getDate() + 7);
            return d;
        });
    };

    const handleCreateFolder = async (parentId: string | null = null, color: string = "#3b82f6") => {
        if (!privateKey || !publicKey) return;
        const title = "New Folder";

        try {
            // Folders might not need encryption for content, but we encrypt metadata (title & color)
            const meta = { title, parent_id: parentId, color };
            const securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);

            const res = await apiFetch("/api/v1/files", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "folder",
                    parent_id: parentId,
                    public_meta: {},
                    metadata: { title }, // Unencrypted fallback
                    secured_meta: securedMeta,
                    visibility: 'private'
                })
            });

            if (!res.ok) throw new Error("Failed to create folder");
            const newFolder = await res.json();

            if (parentId) {
                useDataStore.getState().toggleFolder(parentId, true);
            }

            // Optimistic
            const decFolder: DecryptedFile = {
                id: newFolder.id,
                title: title,
                type: 'folder',
                size: 0,
                updated_at: new Date().toISOString(),
                secured_meta: newFolder.secured_meta,
                share_status: 'owner',
                visibility: 'private',
                parent_id: parentId,
                color: color
            };
            // Refresh parent
            const pKey = parentId === null ? 'root' : parentId;
            useDataStore.getState().loadedDirectories.delete(pKey);
            useDataStore.getState().fetchDirectory(parentId);
            setEditingFileId(newFolder.id); // Rename immediately

        } catch (e) {
            console.error(e);
            alert("Failed to create folder");
        }
    };

    const handleCreateEventGroup = async (forcedTitle?: string, forcedColor?: string, forcedEffect?: string) => {
        const storeState = useDataStore.getState();
        const privKey = privateKey || storeState.privateKey;
        const pubKey = publicKey || storeState.publicKey;
        if (!privKey || !pubKey) return;
        const title = forcedTitle || "New Group";
        const effect = forcedEffect || "none";
        const color = forcedColor || undefined;
        try {
            const meta = { title, isGroup: true, effect, color };
            const securedMeta = await cryptoLib.encryptMetadata(meta, pubKey);

            const res = await apiFetch("/api/v1/files", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "folder",
                    parent_id: null,
                    public_meta: { isGroup: true },
                    secured_meta: securedMeta,
                    metadata: { title, isGroup: true, effect, color },
                    version: 2,
                    visibility: 'private'
                })
            });

            if (!res.ok) throw new Error("Failed to create event group");
            const newFolder = await res.json();

            // Optimistically add to notes using the state-updater form to avoid
            // overwriting concurrent updates with a stale snapshot.
            const optimisticGroup: any = {
                id: newFolder.id,
                title,
                type: 'folder',
                isGroup: true,
                effect,
                color,
                parent_id: null,
                secured_meta: securedMeta,
                visibility: 'private',
            };
            useDataStore.setState(s => ({ notes: [...s.notes, optimisticGroup] }));
            // No fetchDirectory here — the optimistic entry is sufficient for the current
            // session. Any subsequent fetch will preserve isGroup via the merge guard in
            // fetchDirectory (see useDataStore).

            return newFolder.id;

        } catch (e) {
            console.error(e);
            alert("Failed to create event group");
        }
    };

    const handleUpdateEventGroup = async (id: string, updates: { title?: string, effect?: string, color?: string }) => {
        const storeState = useDataStore.getState();
        const privKey = privateKey || storeState.privateKey;
        const pubKey = publicKey || storeState.publicKey;
        if (!privKey || !pubKey) return;
        try {
            // Optimistic local update: BOTH notes AND metadataCache must be updated
            // so that a subsequent fetchDirectory cache-hit returns the new values.
            useDataStore.setState(s => ({
                notes: s.notes.map(f => f.id === id ? { ...f, ...updates } as any : f),
                metadataCache: {
                    ...s.metadataCache,
                    [id]: { ...(s.metadataCache[id] || {}), ...updates, isGroup: true }
                }
            }));

            // Read group AFTER optimistic update so we get the merged values
            const updatedState = useDataStore.getState();
            const group = updatedState.notes.find(f => f.id === id);
            if (!group) return;

            const meta: Record<string, any> = {
                title: group.title ?? 'New Group',
                isGroup: true,
                effect: (group as any).effect ?? 'none',
                color: (group as any).color,
            };

            const encryptedMeta = await cryptoLib.encryptMetadata(meta, pubKey);

            // Stamp save timestamp BEFORE the API call so SSE cooldown
            // suppresses the immediate refetch that would overwrite our update
            if ((window as any).__tideSaveTimestamp) (window as any).__tideSaveTimestamp();

            await apiFetch(`/api/v1/files/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                // public_meta preserves isGroup in plaintext so fetchDirectory always finds it.
                // metadata stores title/effect/color as plaintext V2 fallback — themes
                // contain no sensitive data so this is safe and ensures persistence even
                // if RSA decryption fails on reload.
                body: JSON.stringify({
                    secured_meta: encryptedMeta,
                    public_meta: { isGroup: true },
                    metadata: { title: meta.title, isGroup: true, effect: meta.effect, color: meta.color },
                    version: 2
                })
            });

            // Re-apply optimistic update after API success to survive any concurrent refetch.
            // Must update BOTH notes AND metadataCache again.
            useDataStore.setState(s => ({
                notes: s.notes.map(f => f.id === id ? { ...f, ...updates } as any : f),
                metadataCache: {
                    ...s.metadataCache,
                    [id]: { ...(s.metadataCache[id] || {}), ...updates, isGroup: true }
                }
            }));
        } catch (e) {
            console.error("Failed to update group", e);
        }
    };

    const handleMoveFile = async (fileId: string, newParentId: string | null) => {
        try {
            const files = useDataStore.getState().notes;
            const targetFile = files.find(f => f.id === fileId);
            const oldParentId = targetFile?.parent_id || null;

            await apiFetch(`/api/v1/files/${fileId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ parent_id: newParentId || "" })
            });
            // Update local state directly
            useDataStore.getState().setNotes(files.map(f => f.id === fileId ? { ...f, parent_id: newParentId } as any : f));

            // Clear cache for old and new parent and refetch both
            const oldKey = oldParentId === null ? 'root' : oldParentId;
            const newKey = newParentId === null ? 'root' : newParentId;
            const state = useDataStore.getState();

            const newLoaded = new Set(state.loadedDirectories);
            newLoaded.delete(oldKey);
            newLoaded.delete(newKey);
            useDataStore.setState({ loadedDirectories: newLoaded });

            state.fetchDirectory(oldParentId);
            if (oldParentId !== newParentId) {
                state.fetchDirectory(newParentId);
            }
        } catch (e) {
            console.error("Move failed", e);
            alert("Failed to move item");
        }
    };



    // Layout State
    // (activeTabId and openTabs moved to top level for sync hook)

    // Removed Link Selection Routing at user request

    // Theme Visibility State


    const handleToggleThemeVisibility = (themeId: string) => {
        setHiddenThemeIds(prev => prev.includes(themeId) ? prev.filter(id => id !== themeId) : [...prev, themeId]);
    };    // -------------------------------------------------------------------------
    // 1. Session & Initialization
    // -------------------------------------------------------------------------
    useEffect(() => {
        const restoreSession = async () => {
            console.log("[STATE-AUDIT] Initializing Application | Restore Session Start");
            const email = sessionStorage.getItem("tide_user_email") || localStorage.getItem("tide_user_email");
            const userId = sessionStorage.getItem("tide_user_id") || localStorage.getItem("tide_user_id");
            let privKey = await getMasterKey();
            if (!privKey) {
                const legacyKeyJwkStr = sessionStorage.getItem("tide_session_key") || localStorage.getItem("tide_session_key");
                if (legacyKeyJwkStr) {
                    try {
                        privKey = await window.crypto.subtle.importKey(
                            "jwk",
                            JSON.parse(legacyKeyJwkStr),
                            { name: "RSA-OAEP", hash: "SHA-256" },
                            true,
                            ["decrypt"]
                        );
                        if (privKey) {
                            await storeMasterKey(privKey);
                        }
                    } catch (e) {
                        console.error("Failed to migrate legacy session key", e);
                    }
                }
            }
            purgeLegacyKeys();

            const token = sessionStorage.getItem("tide_session_token") || localStorage.getItem("tide_session_token");

            if (!email || !userId || !privKey || !token) {
                console.warn("[STATE-AUDIT] Session missing or incomplete.");
                setStatus("ready");
                if (window.location.pathname !== '/auth' && window.location.pathname !== '/login') {
                    sessionStorage.clear();
                    await clearMasterKey();
                    localStorage.removeItem("tide_session_key");
                    localStorage.removeItem("tide_session_token");
                    router.push("/auth");
                }
                return;
            }

            let pubKeySpkiStr = "";
            try {
                const userRecordStr = localStorage.getItem("tide_user_" + email);
                if (userRecordStr) {
                    const record = JSON.parse(userRecordStr);
                    pubKeySpkiStr = record.public_key;
                }
                if (!pubKeySpkiStr) {
                    const sessionPubKey = sessionStorage.getItem("tide_user_public_key") || localStorage.getItem("tide_user_public_key");
                    if (sessionPubKey) pubKeySpkiStr = sessionPubKey;
                }
            } catch (e) { console.error("Error reading user record", e); }

            if (!pubKeySpkiStr) {
                console.error("Public key not found for user", email);
                setStatus("ready");
                sessionStorage.clear();
                await clearMasterKey();
                localStorage.removeItem("tide_session_key");
                localStorage.removeItem("tide_session_token");
                router.push("/auth");
                return;
            }

            try {
                const pubKey = await window.crypto.subtle.importKey(
                    "spki",
                    cryptoLib.base64ToArrayBuffer(pubKeySpkiStr),
                    { name: "RSA-OAEP", hash: "SHA-256" },
                    true,
                    ["encrypt"]
                );

                setPrivateKey(privKey);
                setPublicKey(pubKey);

                // --- CRYPTO SANITY CHECK ---
                try {
                    // Test if we can actually use these keys for their intended purpose.
                    // This catches cases where keys were stored but the browser's crypto 
                    // state is incompatible or the keys are corrupted.
                    const testData = new TextEncoder().encode("sanity-check");
                    const encrypted = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, pubKey, testData);
                    const decrypted = await window.crypto.subtle.decrypt({ name: "RSA-OAEP" }, privKey, encrypted);
                    const result = new TextDecoder().decode(decrypted);
                    if (result !== "sanity-check") throw new Error("Sanity check result mismatch");
                    console.log("[CRYPTO-AUDIT] Keys validated successfully.");
                } catch (sanityErr: any) {
                    const isCryptoError = sanityErr.name === 'InvalidAccessError' || sanityErr.name === 'OperationError';
                    console.error("[CRYPTO-AUDIT] FATAL: Keys in storage are invalid or incompatible.", sanityErr);
                    
                    if (isCryptoError || sanityErr.message.includes("Sanity check")) {
                        console.warn("[CRYPTO-AUDIT] Performing emergency cache reset...");
                        await clearMasterKey();
                        localStorage.clear();
                        sessionStorage.clear();
                        window.location.href = "/auth?error=crypto_reset";
                        return;
                    }
                }
                // ---------------------------

                setKeys(privKey, pubKey, userId);
                setMyId(userId);
                setUserEmail(email);
                // Set a quick initial profile from stored data
                setUserProfile({ username: email.split('@')[0], email: email });
                // Then fetch the real profile (avatar_seed, bio, title, avatar_style, is_verified) from the public endpoint
                fetch(`${getApiBase()}/api/v1/profiles/${userId}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(profile => {
                        if (profile) {
                            setUserProfile(prev => {
                                if (!prev) return null;
                                return {
                                    ...prev,
                                    username: profile.username || prev.username || email.split('@')[0],
                                    avatar_seed: profile.avatar_seed || prev.avatar_seed || userId,
                                    avatar_salt: profile.avatar_salt || prev.avatar_salt || '',
                                    avatar_style: profile.avatar_style || prev.avatar_style || 'notionists',
                                    bio: profile.bio || prev.bio || '',
                                    title: profile.title || prev.title || '',
                                    is_verified: profile.is_verified ?? prev.is_verified ?? false,
                                    profile_status: profile.profile_status ?? prev.profile_status ?? 0,
                                    id: userId,
                                    user_id: userId,
                                    email: prev.email // Ensure email is preserved and type-safe
                                };
                            });
                        }
                    })
                    .catch(() => { /* non-critical, keep fallback */ });

                // Persistence: Restore tabs (from sessionStorage — per-window)
                const savedTabs = sessionStorage.getItem("tide_open_tabs");
                const savedActiveId = sessionStorage.getItem("tide_active_tab_id");

                if (savedTabs) {
                    try {
                        const parsed = JSON.parse(savedTabs);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            setOpenTabs(parsed);
                            const validActive = parsed.find((t: any) => t.id === savedActiveId);
                            const activeIdToSet = validActive ? validActive.id : parsed[0].id;
                            const activeTypeToSet = validActive ? validActive.type : parsed[0].type;
                            setActiveTabId(activeIdToSet);
                            // Only the active tab is loaded immediately; other tabs load on-demand when clicked.

                            if (activeTypeToSet === 'file') {
                                const activeTitle = validActive ? validActive.title : parsed[0].title;
                                useDataStore.getState().setActiveNoteId(activeIdToSet);
                                const content = validActive?.content || parsed[0].content;
                                if (content) {
                                    setEditorContent(content);
                                    if (validActive?._fileKey || parsed[0]._fileKey) {
                                        setActiveFileKey(validActive?._fileKey || parsed[0]._fileKey);
                                    }
                                    setFileName(activeTitle);
                                } else {
                                    setTimeout(() => {
                                        loadNoteContent(activeIdToSet, activeTitle);
                                    }, 50);
                                }
                            } else {
                                useDataStore.getState().setActiveNoteId(null);
                            }
                        }
                    } catch (e) {
                        console.error("Corrupted tabs payload", e);
                    }
                }

                const savedDate = localStorage.getItem("tide_calendar_date");
                if (savedDate) setCalendarDate(new Date(savedDate));

                // Note: enabledExtensions and noteLayout are already loaded from localStorage
                // by the Zustand store initializer — no need to call setEnabledExtensions/setNoteLayout here.

                setIsRestored(true);
                setStatus("ready");
            } catch (e) {
                console.error("Session restore failed:", e);
                setStatus("ready");
                sessionStorage.clear();
                await clearMasterKey();
                localStorage.removeItem("tide_session_key");
                localStorage.removeItem("tide_session_token");
                router.push("/auth");
            }
        };

        restoreSession();
    }, [router, setKeys]);

    // ...

    // Removed loadFilesAndEvents since we delegate to store's fetchDirectory


    // ...

    // -------------------------------------------------------------------------
    // 2. Data Loading (Files & Events)
    // -------------------------------------------------------------------------

    useEffect(() => {
        if (privateKey && publicKey && myId) {
            setKeys(privateKey, publicKey, myId);
            fetchDirectory(null, true); // Force initial fetch of root to ensure UI update
        }
    }, [privateKey, publicKey, myId, setKeys, fetchDirectory]);


    // Update the idle payload whenever events change so the periodic timeline is accurate
    useEffect(() => {
        const today = new Date();
        const todayEvents = events.filter(e => {
            try { return isSameDay(new Date(e.start), today); } catch { return false; }
        });
        setIdlePayload({ events: todayEvents.map(e => ({ title: e.title, start: e.start })) });
    }, [events, setIdlePayload]);




    const handleDeleteNote = async (e: React.MouseEvent, fileId: string) => {
        e.stopPropagation();
        const freshNotes = useDataStore.getState().notes;
        const target = freshNotes.find(f => f.id === fileId);
        const isShared = target && target.share_status && target.share_status !== 'owner';
        const isFolder = target?.type === 'folder';

        setDeleteConfirm({ isOpen: true, fileId, isShared: !!isShared, isFolder });
    };

    const executeDeleteNote = async () => {
        if (!deleteConfirm) return;
        const { fileId, isShared } = deleteConfirm;
        const freshNotes = useDataStore.getState().notes;
        const target = freshNotes.find(f => f.id === fileId);

        try {
            setDeleteConfirm(null);
            const res = await apiFetch(`/api/v1/files/${fileId}`, { method: "DELETE" });
            if (!res.ok && res.status !== 404) throw new Error("Backend failed to delete note");
            
            // Remove from local state immediately
            useDataStore.getState().setNotes(freshNotes.filter(f => f.id !== fileId) as any);
            
            handleTabClose(null, fileId);
        } catch (err) {
            console.error("Delete failed:", err);
            const isCorrupt = !target || target.isLocked || (target.title && (target.title.includes("Corrupted") || target.title.includes("Locked") || target.title.includes("Decrypting")));
            if (isCorrupt) {
                setDeleteError({
                    fileId,
                    title: "Fehler beim Löschen",
                    message: "Das Löschen auf dem Server ist fehlgeschlagen. Möchtest du diese fehlerhafte Notiz trotzdem erzwingend aus deiner Liste entfernen?",
                    isCorrupt: true
                });
                return;
            }
            setDeleteError({
                fileId,
                title: "Fehler",
                message: isShared ? "Die Notiz konnte nicht verlassen werden." : "Die Notiz konnte nicht gelöscht werden.",
                isCorrupt: false
            });
            setDeleteConfirm(null);
        }
    };

    // Rename File

    const handleRenameNote = (e: React.MouseEvent, fileId: string, currentTitle: string) => {
        e.stopPropagation();
        setEditingFileId(fileId);
    };

    const submitRename = async (fileId: string, newTitle: string) => {
        setEditingFileId(null);

        const files = useDataStore.getState().notes;
        const events = useDataStore.getState().events;
        const target = files.find(f => f.id === fileId) || events.find(e => e.id === fileId);
        
        if (!target) return;
        
        // Prevent unnecessary backend updates if the title hasn't actually changed
        if (target.title === newTitle) return;

        // Optimistic
        useDataStore.getState().setUpdatingMetadata(fileId, true);
        useDataStore.getState().updateSpecificMetadataCache(fileId, { title: newTitle });
        useDataStore.getState().setNotes(files.map(f => f.id === fileId ? { ...f, title: newTitle } as any : f));
        useDataStore.getState().setEvents(events.map(e => e.id === fileId ? { ...e, title: newTitle } as any : e));
        setOpenTabs(prev => prev.map(t => t.id === fileId ? { ...t, title: newTitle } : t));
        if (activeTabId === fileId) setFileName(newTitle);

        try {
            const isPublic = 'visibility' in target && target.visibility === 'public';

            if (isPublic) {
                await apiFetch(`/api/v1/files/${fileId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ public_meta: { title: newTitle } })
                });
            } else {
                if (!publicKey || !privateKey) {
                    useDataStore.getState().setUpdatingMetadata(fileId, false);
                    return;
                }

                // For V2 notes, secured_meta only ever contains {title} — no fileKey, no IV.
                // We can safely re-encrypt just the title without decrypting the old blob first.
                // This avoids OperationError when the old secured_meta was written in V1 format.
                const isV2 = (target as any).version >= 2;
                let encryptedMeta: string;

                if (isV2) {
                    let fileKeyToUse = activeTabId === fileId ? activeFileKey : null;
                    if (!fileKeyToUse && privateKey) {
                        try {
                            const accessKeys = typeof (target as any).access_keys === 'string'
                                ? JSON.parse((target as any).access_keys)
                                : ((target as any).access_keys || {});
                            const myAccess = accessKeys[myId];
                            if (myAccess?.wrapped_key) {
                                const rawDek = await cryptoV2.unwrapDEKData(myAccess.wrapped_key, privateKey);
                                fileKeyToUse = await cryptoV2.importDEK(rawDek);
                            }
                        } catch (dekErr) {
                            console.warn("[submitRename] Failed to unwrap DEK on-demand, falling back to publicKey", dekErr);
                        }
                    }

                    if (fileKeyToUse) {
                        encryptedMeta = await cryptoLib.encryptMetadata({ title: newTitle, isLocked: false }, fileKeyToUse);
                    } else {
                        encryptedMeta = await cryptoLib.encryptMetadata({ title: newTitle, isLocked: false }, publicKey);
                    }
                } else if (target.type === 'folder') {
                    encryptedMeta = await cryptoLib.encryptMetadata({ title: newTitle, isLocked: false }, publicKey);
                } else {
                    // V1: try to decrypt+merge to preserve fileKey/IV, fall back to fresh encrypt
                    let currentSecuredMeta = (target as any).secured_meta;
                    if (!currentSecuredMeta) {
                        const res = await apiFetch(`/api/v1/files/${fileId}`);
                        if (res.ok) {
                            const freshFile = await res.json();
                            currentSecuredMeta = freshFile.secured_meta;
                        }
                    }
                    let metaToEncrypt: any = { title: newTitle };
                    if (currentSecuredMeta) {
                        const decrypted = await cryptoLib.decryptMetadata(currentSecuredMeta, privateKey);
                        if (!decrypted.isLocked) {
                            metaToEncrypt = { ...decrypted, title: newTitle };
                        }
                        // If decryption fails, we just use {title: newTitle} — the fileKey is
                        // in the V2 access_keys anyway; V1 files without fileKey can't be saved.
                    }
                    encryptedMeta = await cryptoLib.encryptMetadata(metaToEncrypt, publicKey);
                }

                // Always persist the title in plaintext `metadata.title` too. This is
                // the load-time fallback when secured_meta decryption fails or when the
                // metadataCache is empty (e.g. after a hard reload). Without this, V1
                // notes/folders whose secured_meta can't be decrypted lose the new
                // title and revert to "Untitled" / "Locked Note" on the next fetch.
                const existingMetadata = ((target as any).metadata && typeof (target as any).metadata === 'object')
                    ? (target as any).metadata
                    : {};
                const payload: any = {
                    secured_meta: encryptedMeta,
                    metadata: { ...existingMetadata, title: newTitle },
                };

                const res = await apiFetch(`/api/v1/files/${fileId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(`Failed to update title: ${res.status} ${errText}`);
                }
            }

            useDataStore.getState().setUpdatingMetadata(fileId, false);
            useDataStore.getState().loadedDirectories.clear();
            useDataStore.getState().fetchDirectory(null);
        } catch (e) {
            console.error("Rename failed", e);
            alert("Rename failed");
            useDataStore.getState().setUpdatingMetadata(fileId, false);
            useDataStore.getState().loadedDirectories.clear();
            useDataStore.getState().fetchDirectory(null);
        }
    };

    // ...

    const handleToggleVisibility = async (e: React.MouseEvent, fileId: string, newVisibility: string) => {
        if (e) e.stopPropagation();
        if (!privateKey || !publicKey) {
            alert("Keys not available");
            return;
        }

        const file = files.find(f => f.id === fileId);
        const prevVisibility = file?.visibility || 'private';
        if (!file) return;

        const isFolder = file.type === 'folder';

        // Optimistic update
        useDataStore.getState().setNotes(files.map(f => f.id === fileId ? { ...f, visibility: newVisibility } : f) as any);

        try {
            let contentBlob: Blob | null = null;
            let currentMeta: any = null;

            // 1. Get decrypted metadata & content (if currently encrypted)
            if (prevVisibility !== 'public') {
                if (file.secured_meta) {
                    try {
                        currentMeta = await cryptoLib.decryptMetadata(file.secured_meta, privateKey);
                    } catch {
                        const parsedMeta = typeof (file as any).metadata === 'string' ? JSON.parse((file as any).metadata || '{}') : ((file as any).metadata || {});
                        currentMeta = { title: parsedMeta?.title || file.title || 'Untitled' };
                    }
                } else {
                    const parsedMeta = typeof (file as any).metadata === 'string' ? JSON.parse((file as any).metadata || '{}') : ((file as any).metadata || {});
                    currentMeta = { title: parsedMeta?.title || file.title || 'Untitled' };
                }

                if (!isFolder) {
                    const resBlob = await apiFetch(`/api/v1/files/${fileId}/download`);
                    if (resBlob.ok) {
                        const isV2 = (file as any).version >= 2 || !!(file as any).access_keys;
                        if (isV2) {
                            // V2: get DEK from access_keys, decrypt AES-GCM payload
                            const accessKeys = typeof (file as any).access_keys === 'string'
                                ? JSON.parse((file as any).access_keys)
                                : ((file as any).access_keys || {});
                            const myAccess = accessKeys[myId];
                            if (!myAccess?.wrapped_key) throw new Error('No V2 access key for visibility toggle');
                            const rawDek = await cryptoV2.unwrapDEKData(myAccess.wrapped_key, privateKey);
                            const dek = await cryptoV2.importDEK(rawDek);
                            const blobText = await resBlob.text();
                            if (blobText) {
                                const payload = JSON.parse(blobText);
                                if (payload.data && payload.iv) {
                                    const ivBuf = cryptoLib.base64ToArrayBuffer(payload.iv);
                                    const dataBuf = cryptoLib.base64ToArrayBuffer(payload.data);
                                    const decrypted = await window.crypto.subtle.decrypt(
                                        { name: 'AES-GCM', iv: ivBuf },
                                        dek,
                                        dataBuf
                                    );
                                    contentBlob = new Blob([decrypted]);
                                }
                            }
                        } else {
                            // V1: fileKey and iv are in secured_meta
                            const blob = await resBlob.blob();
                            const fileKey = await window.crypto.subtle.importKey(
                                "jwk", currentMeta.fileKey,
                                { name: "AES-GCM" },
                                true, ["encrypt", "decrypt"]
                            );
                            contentBlob = await cryptoLib.decryptFile(blob, currentMeta.iv, fileKey);
                        }
                    }
                }
            } else {
                currentMeta = { title: file.title || "Untitled" };
                if (!isFolder) {
                    const resBlob = await apiFetch(`/api/v1/files/${fileId}/download`);
                    if (resBlob.ok) contentBlob = await resBlob.blob();
                }
            }

            // 2. Prepare Update
            let uploadBlob: Blob | null = null;
            let updatePayload: any = { visibility: newVisibility };

            if (newVisibility === 'public') {
                // To Public: Decrypt and upload unencrypted
                if (!isFolder) uploadBlob = contentBlob || new Blob([], { type: "text/plain" });
                updatePayload.public_meta = { title: currentMeta.title };
                updatePayload.secured_meta = [];
            } else {
                // To Private or Contacts: Encrypt for Owner
                if (isFolder) {
                    const metaPayload = { title: currentMeta.title };
                    updatePayload.secured_meta = await cryptoLib.encryptMetadata(metaPayload, publicKey);
                } else {
                    const isV2File = (file as any).version >= 2 || !!(file as any).access_keys;
                    if (isV2File) {
                        // V2: re-encrypt with fresh DEK, keep access_keys structure
                        const contentStr = contentBlob ? await contentBlob.text() : '';
                        const v2Result = await cryptoV2.encryptFileV2(contentStr || '', publicKey);
                        updatePayload.version = 2;
                        updatePayload.access_keys = { [myId]: v2Result.encrypted_dek };
                        updatePayload.metadata = { ...v2Result.metadata, title: currentMeta.title };
                        updatePayload.secured_meta = await cryptoLib.encryptMetadata({ title: currentMeta.title }, publicKey);
                        // Upload the V2 ciphertext string (not a blob)
                        uploadBlob = new Blob([v2Result.content_ciphertext], { type: 'application/json' });
                        currentMeta = { title: currentMeta.title };
                    } else {
                        // V1: keep legacy path
                        const fileKey = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
                        const encrypted = await cryptoLib.encryptFile(contentBlob || new Blob([]), fileKey);
                        uploadBlob = encrypted.ciphertext;
                        const fileKeyJwk = await window.crypto.subtle.exportKey("jwk", fileKey);
                        const metaPayload = { title: currentMeta.title, fileKey: fileKeyJwk, iv: encrypted.iv };
                        updatePayload.secured_meta = await cryptoLib.encryptMetadata(metaPayload, publicKey);
                        currentMeta = metaPayload;
                    }
                }
                updatePayload.public_meta = {};
            }

            // 3. Upload (if needed)
            if (uploadBlob) {
                await apiFetch(`/api/v1/files/${fileId}/upload`, {
                    method: "POST",
                    body: uploadBlob
                });
            }

            // 4. Update Main Metadata
            const updateRes = await apiFetch(`/api/v1/files/${fileId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatePayload)
            });
            if (!updateRes.ok) throw new Error("Failed to update visibility");

            // 5. If "Contacts" visibility, perform bulk share
            if (newVisibility === 'contacts') {
                const _ak = (file as any).access_keys;
                const isV2 = (file as any).version >= 2 ||
                    (_ak && typeof _ak === 'string' && _ak !== 'null' && _ak !== '{}') ||
                    (_ak && typeof _ak === 'object' && Object.keys(_ak).length > 0);
                if (!isV2) {
                    // V1 files only: bulk-share with contacts using legacy secured_meta
                    const contactsRes = await apiFetch("/api/v1/contacts");
                    if (contactsRes.ok) {
                        const partnerList = await contactsRes.json();
                        for (const contact of partnerList) {
                            try {
                                const recipientPubKey = await window.crypto.subtle.importKey(
                                    "spki",
                                    cryptoLib.base64ToArrayBuffer(contact.partner.public_key),
                                    { name: "RSA-OAEP", hash: "SHA-256" },
                                    true,
                                    ["encrypt"]
                                );
                                const reEncMeta = await cryptoLib.encryptMetadata(currentMeta, recipientPubKey);
                                await apiFetch(`/api/v1/files/${fileId}/share`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        email: contact.partner.email,
                                        secured_meta: reEncMeta
                                    })
                                });
                            } catch (e) { console.error("Failed to share with contact", contact.partner.email, e); }
                        }
                    }
                }
                // V2 files: contacts must be shared individually via the Share modal (DEK wrapping required)
            }

            fetchDirectory(null);
        } catch (err) {
            console.error("Visibility toggle failed:", err);
            alert("Failed to change visibility");
            useDataStore.getState().setNotes(files.map(f => f.id === fileId ? { ...f, visibility: prevVisibility } as any : f));
        }
    };
    const handleShare = async (e: React.MouseEvent, fileId: string) => {
        e.stopPropagation();

        // Recurring event instances have IDs like 'uuid_timestamp'. Extract the base UUID.
        const baseId = fileId.includes('_') ? fileId.split('_')[0] : fileId;

        // Read from the store at call time — the closure-captured `events`/`files`
        // can be stale (e.g. the calendar still shows a recurring instance that was
        // expanded from a base event the closure no longer sees).
        const liveStore = useDataStore.getState();
        const liveFiles = liveStore.notes as any[];
        const liveEvents = liveStore.events as any[];

        let file: any = liveFiles.find(f => f.id === baseId) || liveEvents.find(ev => ev.id === baseId);
        console.log('[handleShare] baseId:', baseId, 'found in files:', !!liveFiles.find(f => f.id === baseId), 'found in events:', !!liveEvents.find(ev => ev.id === baseId));

        // Last-resort fallback: fetch metadata from the backend so a recurring
        // instance whose base event isn't currently in the local store can still
        // be shared. We need at least { id, title } for the share modal.
        if (!file) {
            try {
                const res = await apiFetch(`/api/v1/files/${baseId}`);
                if (res.ok) {
                    const remote = await res.json();
                    const remoteTitle = remote?.public_meta?.title
                        || remote?.metadata?.title
                        || 'Untitled';
                    file = { id: baseId, title: remoteTitle, type: remote?.type };
                }
            } catch (fetchErr) {
                console.warn('handleShare: backend fallback fetch failed', fetchErr);
            }
        }

        if (!file) {
            console.error("File/Event not found for sharing:", fileId, "(base:", baseId, ")");
            alert('Termin konnte nicht zum Teilen gefunden werden.');
            return;
        }

        const currentMyId = myId || liveStore.myId;
        const isOwner = !file.owner_id || file.owner_id === currentMyId || file.share_status === 'owner';
        const canReshare = Boolean(file.can_reshare);

        if (!isOwner && !canReshare) {
            alert("Du hast keine Berechtigung, diese Notiz weiterzuleiten.");
            return;
        }

        let callerPermission: 'owner' | 'view' | 'edit' | 'share' = 'owner';
        if (!isOwner) {
            const rawPerm = file.share_permission || file.permission;
            if (rawPerm === 'view') {
                callerPermission = 'view';
            } else if (rawPerm === 'edit') {
                callerPermission = 'edit';
            } else if (rawPerm === 'share') {
                callerPermission = 'share';
            } else {
                callerPermission = 'view';
            }
        }

        setShareModalFile({ id: baseId, title: file.title, type: (file as any).type, callerPermission });
    };

    const performShare = async (
        recipientId: string, 
        recipientEmail: string, 
        recipientPubKeySpki: string, 
        permission: 'view' | 'edit' | 'share' = 'view',
        dependencyFileIds: string[] = [],
        canReshare: boolean = false
    ) => {
        if (!shareModalFile || !privateKey || !publicKey) return;

        // Note: upload_progress push removed — sending a note/event should not
        // trigger a Smart Island change per user request.

        const shareLib = await import('@/lib/shareLogic');

        if (shareModalFile.type === 'folder') {
            await shareLib.performFolderShare(
                shareModalFile.id,
                shareModalFile.title,
                myId,
                privateKey,
                publicKey,
                recipientId,
                recipientEmail,
                recipientPubKeySpki,
                permission,
            );
        } else {
            await shareLib.performMessengerShare(
                shareModalFile,
                myId,
                privateKey,
                publicKey,
                events,
                recipientId,
                recipientEmail,
                recipientPubKeySpki,
                permission,
                dependencyFileIds,
                canReshare
            );
        }

        // Refresh the directory so the shared file reflects updated state immediately
        useDataStore.getState().fetchDirectory(null);
    };

    const handleSaveNoteSecuritySettings = async (settings: ItemSecuritySettings | null) => {
        if (!noteSecurityModalItem) return;
        const itemId = noteSecurityModalItem.id;
        const target = files.find(f => f.id === itemId);
        const currentMeta = (target as any)?.metadata || {};
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


    // -------------------------------------------------------------------------
    // DateMention Calendar Navigation
    // -------------------------------------------------------------------------
    useEffect(() => {
        const handler = (e: Event) => {
            const { isoDate } = (e as CustomEvent).detail || {};
            if (!isoDate) return;
            const date = new Date(isoDate);
            if (isNaN(date.getTime())) return;
            // Switch to calendar tab
            switchTab('calendar', 'calendar');
            // Set the calendar view date
            setCalendarDate(date);
        };
        window.addEventListener('dateMention:click', handler);
        return () => window.removeEventListener('dateMention:click', handler);
    }, []);



    // -------------------------------------------------------------------------
    // 4. Calendar Logic
    // -------------------------------------------------------------------------
    const handleEventCreate = async (start: Date, end: Date, isAllDay: boolean = false, extraMeta: any = {}): Promise<string | null> => {
        if (!privateKey || !publicKey) return null;
        const linkedTaskId = extraMeta?.linkedTaskId;
        if (linkedTaskId) {
            syncingTaskIdsRef.current.add(linkedTaskId);
        }
        const title = extraMeta.title || "New Event";
        try {
            const meta = { title, start: start.toISOString(), end: end.toISOString(), allDay: isAllDay, ...extraMeta };
            const securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);

            const bodyPayload: any = {
                type: "event",
                parent_id: null,
                public_meta: {},
            };
            
            try {
                const { encryptFileV2 } = await import('@/lib/cryptoV2');
                const contentString = JSON.stringify({
                    title: title,
                    description: extraMeta.description || ""
                });
                
                const v2Result = await encryptFileV2(contentString, publicKey);
                bodyPayload.version = 2;
                bodyPayload.metadata = {
                    ...v2Result.metadata,
                    ...meta
                };
                bodyPayload.access_keys = { [myId]: v2Result.encrypted_dek };
                bodyPayload.content_ciphertext = v2Result.content_ciphertext;
                bodyPayload.secured_meta = securedMeta; // Always include for title decryption on reload
            } catch (e) {
                console.error("V2 encryption failed for create", e);
                // fallback to V1
                bodyPayload.secured_meta = securedMeta;
            }

            const res = await apiFetch("/api/v1/files", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyPayload)
            });
            if (res.ok) {
                const newFile = await res.json().catch(() => null);
                if (newFile && newFile.id) {
                    useDataStore.getState().setEvents([...useDataStore.getState().events, { id: newFile.id, title, start: meta.start, end: meta.end, allDay: isAllDay, is_task: extraMeta.is_task, linkedTaskId: extraMeta.linkedTaskId, ...extraMeta }] as any);
                    setActiveEventId(newFile.id);
                    return newFile.id;
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            if (linkedTaskId) {
                setTimeout(() => {
                    syncingTaskIdsRef.current.delete(linkedTaskId);
                }, 500);
            }
        }
        return null;
    };

    // Bridge: Text Collector event creation → handleEventCreate
    useEffect(() => {
        const handler = (e: Event) => {
            const { title, start, end } = (e as CustomEvent).detail;
            handleEventCreate(new Date(start), new Date(end), false, { title });
        };
        window.addEventListener('tide:collector-create-event', handler);
        return () => window.removeEventListener('tide:collector-create-event', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [privateKey, publicKey]);

    const handleScheduleApply = async (schedEvents: ScheduleEventData[], themeIdOrName: string, options?: { color?: string, effect?: string }) => {
        let targetThemeId = themeIdOrName;
        if (options) {
            targetThemeId = await handleCreateEventGroup(themeIdOrName, options.color, options.effect) || 'none';
        }

        for (const ev of schedEvents) {
            const baseDate = ev.dateOverride ? new Date(ev.dateOverride) : (scheduleInitialStart || new Date());
            const [hStart, mStart] = ev.startTime.split(':').map(Number);
            const [hEnd, mEnd] = ev.endTime.split(':').map(Number);

            const start = new Date(baseDate);
            start.setHours(hStart || 9, mStart || 0, 0, 0);

            const end = new Date(baseDate);
            end.setHours(hEnd || 10, mEnd || 0, 0, 0);

            await handleEventCreate(start, end, ev.allDay, {
                title: ev.title || "New Event",
                description: ev.description,
                parent_id: targetThemeId === 'none' ? null : targetThemeId,
                recurrence_rule: ev.recurrence !== 'none' ? `FREQ=${ev.recurrence.toUpperCase()};INTERVAL=1` : undefined,
                recurrence_end: ev.recurrenceEnd ? new Date(ev.recurrenceEnd).toISOString() : undefined
            });
        }
    };

    const handleEventUpdate = async (id: string, start: Date, end: Date) => {
        const baseId = id.includes('_') ? id.split('_')[0] : id;
        await handleEventSave(baseId, { start: start.toISOString(), end: end.toISOString() });
    };

    const handleEventRename = async (id: string, newTitle: string) => {
        if (!privateKey || !publicKey) return;
        try {
            // Optimistic update
            useDataStore.getState().setEvents(useDataStore.getState().events.map(e => e.id === id ? { ...e, title: newTitle } as any : e));

            const event = events.find(e => e.id === id);
            if (!event) return;
            const meta = {
                title: newTitle,
                start: event.start,
                end: event.end,
                color: event.color,
                description: event.description,
                allDay: event.allDay,
                isGroup: (event as any).isGroup,
                effect: (event as any).effect,
                recurrence_rule: (event as any).recurrence_rule,
                recurrence_end: (event as any).recurrence_end,
                tags: (event as any).tags,
                is_important: (event as any).is_important
            };
            const securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);
            await apiFetch(`/api/v1/files/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ secured_meta: securedMeta })
            });
        } catch (e) { console.error(e); }
    };

    const handleEventSave = async (id: string, updates: any) => {
        if (!privateKey || !publicKey) return;
        try {
            const isOccurrence = id.includes('_');
            const baseId = isOccurrence ? id.split('_')[0] : id;
            const currentEvents = useDataStore.getState().events;
            const event = currentEvents.find(e => e.id === baseId);
            if (!event) return;

            // Determine specific date key for this instance
            let occurrenceDateKey: string | null = null;
            if (isOccurrence) {
                const timestamp = parseInt(id.split('_')[1], 10);
                if (!isNaN(timestamp)) occurrenceDateKey = format(new Date(timestamp), "yyyy-MM-dd");
            } else if ((event as any).recurrence_rule && (event as any).recurrence_rule !== 'none') {
                // If base ID of a recurring event, treat as the first occurrence date
                occurrenceDateKey = format(new Date(event.start), "yyyy-MM-dd");
            }

            const isInstanceSpecific = occurrenceDateKey !== null;

            // [TASK 3] Handle recurring cancellation & completion
            if (isInstanceSpecific) {
                if (updates.is_cancelled !== undefined) {
                    let exdates = [...((event as any).exdates || [])];
                    if (updates.is_cancelled) {
                        if (occurrenceDateKey && !exdates.includes(occurrenceDateKey)) exdates.push(occurrenceDateKey);
                    } else {
                        exdates = exdates.filter((d: string) => d !== occurrenceDateKey);
                    }
                    updates = { ...updates, exdates: exdates, is_cancelled: (event as any).is_cancelled || false };
                }
                if (updates.is_completed !== undefined) {
                    let completed = [...((event as any).completed_dates || [])];
                    if (updates.is_completed) {
                        if (occurrenceDateKey && !completed.includes(occurrenceDateKey)) completed.push(occurrenceDateKey);
                    } else {
                        completed = completed.filter((d: string) => d !== occurrenceDateKey);
                    }
                    updates = { ...updates, completed_dates: completed, is_completed: (event as any).is_completed || false };
                }
            }

            // 1. Prepare Metadata
            const meta: any = {
                title: updates.title !== undefined ? updates.title : event.title,
                start: updates.start || event.start,
                end: updates.end || event.end,
                description: updates.description !== undefined ? updates.description : event.description,
                color: updates.color || event.color,
                allDay: updates.allDay !== undefined ? updates.allDay : event.allDay,
                isGroup: updates.isGroup !== undefined ? updates.isGroup : (event as any).isGroup,
                effect: updates.effect !== undefined ? updates.effect : (event as any).effect,
                is_cancelled: updates.is_cancelled !== undefined ? updates.is_cancelled : (event as any).is_cancelled,
                exdates: updates.exdates !== undefined ? updates.exdates : (event as any).exdates,
                is_completed: updates.is_completed !== undefined ? updates.is_completed : (event as any).is_completed,
                completed_dates: updates.completed_dates !== undefined ? updates.completed_dates : (event as any).completed_dates,
                is_task: updates.is_task !== undefined ? updates.is_task : event.is_task,
                shading: updates.shading !== undefined ? updates.shading : (event as any).shading,
                linkedTaskId: updates.linkedTaskId !== undefined ? updates.linkedTaskId : (event as any).linkedTaskId,
                tags: updates.tags !== undefined ? updates.tags : (event as any).tags,
                is_important: updates.is_important !== undefined ? updates.is_important : (event as any).is_important,
                groupIds: updates.groupIds !== undefined ? updates.groupIds : (event as any).groupIds
            };
            if (updates.recurrence_rule !== undefined) meta.recurrence_rule = updates.recurrence_rule;
            else if ((event as any).recurrence_rule) meta.recurrence_rule = (event as any).recurrence_rule;

            if (updates.recurrence_end !== undefined) meta.recurrence_end = updates.recurrence_end;
            else if ((event as any).recurrence_end) meta.recurrence_end = (event as any).recurrence_end;

            // 2. IMMEDIATE optimistic update
            useDataStore.getState().setEvents(currentEvents.map(e => {
                if (e.id === baseId) {
                    const evt = { ...e, ...meta } as any;
                    if (updates.is_task !== undefined) evt.is_task = updates.is_task;
                    if (updates.is_completed !== undefined) evt.is_completed = updates.is_completed;
                    if (updates.groupIds !== undefined) {
                        (evt as any).groupIds = updates.groupIds;
                        const primaryId = updates.groupIds.length > 0 ? updates.groupIds[0] : null;
                        evt.parent_id = primaryId;
                    } else if (updates.parent_id !== undefined) {
                        evt.parent_id = updates.parent_id;
                    }
                    return evt;
                }
                return e;
            }));

            // Also update the metadata cache
            useDataStore.getState().updateSpecificMetadataCache(baseId, meta);

            // Sync with linked task if start date or completion changed
            const targetLinkedTaskId = meta.linkedTaskId;
            if (targetLinkedTaskId) {
                const currentTasks = useDataStore.getState().tasks;
                const linkedTask = currentTasks.find(t => t.id === targetLinkedTaskId);
                if (linkedTask) {
                    const taskUpdates: Partial<TaskItem> = {};
                    if (updates.start !== undefined && !isSameTime(linkedTask.dueDate, updates.start)) {
                        taskUpdates.dueDate = updates.start;
                        taskUpdates.scheduledDate = updates.start;
                    }
                    if (updates.is_completed !== undefined && linkedTask.isCompleted !== updates.is_completed) {
                        taskUpdates.isCompleted = updates.is_completed;
                    }
                    if (Object.keys(taskUpdates).length > 0 && !syncingTaskIdsRef.current.has(targetLinkedTaskId)) {
                        updateTask(targetLinkedTaskId, taskUpdates);
                    }
                }
            }

            // If theme changed
            if (updates.groupIds !== undefined) {
                const primaryId = updates.groupIds.length > 0 ? updates.groupIds[0] : null;
                const currentFiles = useDataStore.getState().notes;
                useDataStore.getState().setNotes(currentFiles.map((n: any) => n.id === baseId ? { ...n, parent_id: primaryId } : n));
            } else
            if (updates.parent_id !== undefined) {
                const currentFiles = useDataStore.getState().notes;
                useDataStore.getState().setNotes(currentFiles.map((n: any) => n.id === baseId ? { ...n, parent_id: updates.parent_id } : n));
            }

            // 3. Async crypto & network
            // Only encrypt the title in secured_meta — RSA-OAEP has a ~446-byte plaintext limit,
            // and large metadata objects (with exdates, tags, etc.) can silently exceed it.
            // All other fields go into body.metadata (V2 AES-encrypted, no size limit).
            const securedMeta = await cryptoLib.encryptMetadata({ title: meta.title }, publicKey);

            // 4. Build body
            const body: any = {
                secured_meta: securedMeta, // Only title — prevents RSA size overflow
            };

            try {
                const { encryptFileV2 } = await import('@/lib/cryptoV2');
                const contentString = JSON.stringify({
                    title: meta.title,
                    description: meta.description || ""
                });
                
                const v2Result = await encryptFileV2(contentString, publicKey);
                
                body.version = 2;
                body.metadata = {
                    ...v2Result.metadata,
                    ...meta
                };
                body.access_keys = { [sessionStorage.getItem("tide_user_id") || ""]: v2Result.encrypted_dek };
                body.content_ciphertext = v2Result.content_ciphertext;
                // secured_meta is already set above — no override needed
            } catch (e) {
                console.error("V2 encryption failed for save", e);
                body.metadata = meta; // fallback
            }

            // 5. Handle Theme Change
            if (updates.groupIds !== undefined) {
                (event as any).groupIds = updates.groupIds;
                const primaryId = updates.groupIds.length > 0 ? updates.groupIds[0] : null;
                event.parent_id = primaryId;
                body.parent_id = primaryId === null ? '__none__' : primaryId;
                meta.groupIds = updates.groupIds;
            } else
            if (updates.parent_id !== undefined) {
                // Go backend can't distinguish absent vs null for *string fields,
                // so we send "__none__" as a sentinel to mean "set to NULL".
                body.parent_id = updates.parent_id === null ? '__none__' : updates.parent_id;
            }

            // 6. Handle Task flags
            if (updates.is_task !== undefined) {
                body.is_task = updates.is_task;
            }
            if (updates.is_completed !== undefined) {
                body.is_completed = updates.is_completed;
            }
            if (updates.exdates !== undefined) {
                body.exdates = updates.exdates;
            }
            if (updates.completed_dates !== undefined) {
                body.completed_dates = updates.completed_dates;
            }

            // 7. Fire network call
            await apiFetch(`/api/v1/files/${baseId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            // [FIX-4] Stamp save time to suppress SSE echo refetch
            if (typeof (window as any).__tideSaveTimestamp === 'function') {
                (window as any).__tideSaveTimestamp();
            }
        } catch (e) { console.error(e); }
    };
    // Use a stable ref so the listener always calls the latest handleEventSave
    // even if the events array changed since the listener was registered.
    const handleEventSaveRef = useLatestRef(handleEventSave);
    useEffect(() => {
        const handleEventTaskToggle = (e: Event) => {
            const { id, is_completed } = (e as CustomEvent).detail;
            if (id) {
                handleEventSaveRef.current(id, { is_completed });
            }
        };
        window.addEventListener('event-task:toggle', handleEventTaskToggle);
        return () => window.removeEventListener('event-task:toggle', handleEventTaskToggle);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally empty — ref always has the latest version

    // ── Dynamic synchronization between Todos and Calendar Events ─────────────
    // syncingTaskIdsRef declared at component top
    const handleEventCreateRef = useLatestRef(handleEventCreate);

    useEffect(() => {
        if (!privateKey || !publicKey || !loadedDirectories.has('root') || !tasks || tasks.length === 0) return;

        const tasksWithDueDate = (tasks || []).filter(t => t.dueDate && t.showInCalendar !== false);

        // Remove any existing calendar events for tasks that have showInCalendar explicitly disabled
        const hiddenTaskIds = new Set((tasks || []).filter(t => t.showInCalendar === false).map(t => t.id));
        if (hiddenTaskIds.size > 0) {
            const eventsToRemove = events.filter(e => (e as any).linkedTaskId && hiddenTaskIds.has((e as any).linkedTaskId));
            if (eventsToRemove.length > 0) {
                const removeIds = new Set(eventsToRemove.map(e => e.id));
                useDataStore.getState().setEvents(useDataStore.getState().events.filter(ev => !removeIds.has(ev.id)));
                eventsToRemove.forEach(async (e) => {
                    const linkedId = (e as any).linkedTaskId;
                    if (linkedId) syncingTaskIdsRef.current.add(linkedId);
                    try {
                        await apiFetch(`/api/v1/files/${e.id}`, { method: "DELETE" });
                    } catch (err) {
                        console.error("Failed to delete hidden task event", err);
                    } finally {
                        if (linkedId) {
                            setTimeout(() => {
                                syncingTaskIdsRef.current.delete(linkedId);
                            }, 500);
                        }
                    }
                });
            }
        }

        tasksWithDueDate.forEach(async (t) => {
            if (syncingTaskIdsRef.current.has(t.id)) return;

            const existingEvent = events.find(e => (e as any).linkedTaskId === t.id);

            if (!existingEvent) {
                syncingTaskIdsRef.current.add(t.id);
                try {
                    const start = new Date(t.dueDate);
                    if (isNaN(start.getTime())) return;
                    const end = new Date(start.getTime() + 30 * 60 * 1000);
                    await handleEventCreateRef.current(start, end, false, {
                        title: t.title,
                        is_task: true,
                        linkedTaskId: t.id,
                        color: t.color,
                        recurrence_rule: t.recurrence_rule,
                        recurrence_end: t.recurrence_end,
                        is_completed: t.isCompleted,
                    });
                } finally {
                    setTimeout(() => {
                        syncingTaskIdsRef.current.delete(t.id);
                    }, 500);
                }
            } else {
                const isTitleDiff = existingEvent.title !== t.title;
                const isStartDiff = !isSameTime(existingEvent.start, t.dueDate);
                const isCompletedDiff = (existingEvent.is_completed ?? false) !== (t.isCompleted ?? false);
                const isRecurrenceDiff = (existingEvent as any).recurrence_rule !== t.recurrence_rule;

                if (isTitleDiff || isStartDiff || isCompletedDiff || isRecurrenceDiff) {
                    const start = new Date(t.dueDate);
                    const end = isNaN(start.getTime())
                        ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
                        : new Date(start.getTime() + 30 * 60 * 1000).toISOString();

                    syncingTaskIdsRef.current.add(t.id);
                    try {
                        await handleEventSaveRef.current(existingEvent.id, {
                            title: t.title,
                            start: t.dueDate,
                            end,
                            is_completed: t.isCompleted,
                            recurrence_rule: t.recurrence_rule,
                            recurrence_end: t.recurrence_end,
                        });
                    } finally {
                        setTimeout(() => {
                            syncingTaskIdsRef.current.delete(t.id);
                        }, 500);
                    }
                }
            }
        });
    }, [tasks, events, privateKey, publicKey, loadedDirectories]);

    switchTabRef.current = switchTab;

    useEffect(() => {
        const handleNavigate = (e: Event) => {
            const { noteId } = (e as CustomEvent).detail;
            if (noteId) {
                switchTabRef.current?.(noteId, 'file');
            }
        };
        window.addEventListener('tide:navigate', handleNavigate);
        return () => window.removeEventListener('tide:navigate', handleNavigate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Smart Date Detection ──────────────────────────────────────────────────
    // Read settings from localStorage (defaults: enabled, auto mode)
    const dateDetectionEnabled = enabledExtensions.includes('smart_date_detection');
    const dateDetectionMode: DateDetectionMode = (typeof window !== 'undefined'
        && localStorage.getItem('tide_date_detection_mode') === 'manual') ? 'manual' : 'auto';

    useDateDetection({
        editor: editorInstance,
        enabled: dateDetectionEnabled && !!activeNoteId,
        mode: dateDetectionMode,
        onAcceptSuggestion: async ({ title, start, end, blockId }) => {
            // Create the event via existing flow
            const newId = await handleEventCreate(start, end, false, { title });
            if (!newId || !editorInstance) return;
            // Insert mention at end of the block identified by blockId.
            try {
                const { state } = editorInstance;
                let insertPos: number | null = null;
                state.doc.descendants((node: ProseMirrorNode, pos: number) => {
                    if ((node.attrs as any)?.blockId === blockId) {
                        insertPos = pos + node.nodeSize - 1; // end of the block, inside it
                        return false;
                    }
                    return true;
                });
                if (insertPos === null) {
                    // Fallback: append at end of document
                    insertPos = state.doc.content.size - 1;
                }
                editorInstance.chain()
                    .insertContentAt(insertPos, [
                        { type: 'text', text: ' ' },
                        { type: 'calendarEvent', attrs: { eventId: newId } },
                    ])
                    .run();
            } catch (err) {
                console.error('[useDateDetection] Failed to insert mention', err);
            }
        },
    });

    // Calendar drag-ghost click consumer.
    // When useDragGhost is active, the next click inside the editor area
    // inserts a CalendarEventMention at that ProseMirror position and clears
    // the ghost. ESC cancellation is handled inside EventDragGhost itself.
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const { active, snapshot, cancel } = useDragGhost.getState();
            if (!active || !snapshot) return;
            // Only consume clicks inside the editor's content area.
            const editorEl = (e.target as HTMLElement).closest?.('.ProseMirror');
            if (!editorEl) {
                // Click outside the editor → abort the pending insert.
                cancel();
                return;
            }
            if (!editorInstance) {
                cancel();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const coords = { left: e.clientX, top: e.clientY };
            const posInfo = editorInstance.view.posAtCoords(coords);
            if (!posInfo) {
                cancel();
                return;
            }
            try {
                editorInstance.chain().focus()
                    .insertContentAt(posInfo.pos, {
                        type: 'calendarEvent',
                        attrs: { eventId: snapshot.eventId },
                    })
                    .run();
            } catch (err) {
                console.error('[DragGhost] Failed to insert mention', err);
            }
            cancel();
        };
        window.addEventListener('click', handleClick, true); // capture phase
        return () => window.removeEventListener('click', handleClick, true);
    }, [editorInstance]);

    // Clear deletedBlockIds on active note change so stale deletions don't poison newly loaded notes
    useEffect(() => {
        setDeletedBlockIds([]);
    }, [activeNoteId]);

    const handleBlocksDeleted = useCallback((ids: string[]) => {
        setDeletedBlockIds(ids);
        // Clear after CanvasLayer processes orphan recovery so future blocks are not poisoned
        setTimeout(() => {
            setDeletedBlockIds([]);
        }, 1000);
    }, []);

    // Canvas rebind: when right-clicking an image and selecting "Change anchor",
    // CanvasLayer dispatches canvas:requestRebind. We enter binding mode so the
    // user can then click a text block to pick the new anchor.
    useEffect(() => {
        const handleRequestRebind = () => {
            setPendingBindBlockId('__pending_rebind__');
        };
        window.addEventListener('canvas:requestRebind', handleRequestRebind);
        return () => window.removeEventListener('canvas:requestRebind', handleRequestRebind);
    }, []);

    const handleDeleteEvent = async (id: string) => {
        if (!myId) return;

        const isOccurrence = id.includes('_');
        if (isOccurrence) {
            handleEventSave(id, { is_cancelled: true });
            return;
        }

        if (!confirm("Are you sure you want to delete this event?")) return;
        try {
            const currentEvents = useDataStore.getState().events;
            const targetEvt = currentEvents.find(e => e.id === id) as any;
            if (targetEvt?.linkedTaskId) {
                const remainingLinkedEvents = currentEvents.filter(e => e.id !== id && e.linkedTaskId === targetEvt.linkedTaskId);
                if (remainingLinkedEvents.length === 0) {
                    updateTask(targetEvt.linkedTaskId, { dueDate: undefined, scheduledDate: undefined });
                }
            }
            const res = await apiFetch(`/api/v1/files/${id}`, {
                method: "DELETE"
            });
            if (res.ok) {
                const state = useDataStore.getState();
                state.setEvents(state.events.filter(e => e.id !== id));
            }
        } catch (e) { console.error(e); }
    };

    // 5. Tab Management & Messages
    // -------------------------------------------------------------------------
    const lastActiveTabRef = useRef<{ id: string; type: Tab['type']; title?: string }>({ id: 'calendar', type: 'calendar', title: 'Calendar' });

    useEffect(() => {
        if (activeTabId && activeTabId !== 'todos') {
            const currentTab = openTabs.find(t => t.id === activeTabId);
            lastActiveTabRef.current = {
                id: activeTabId,
                type: (currentTab?.type || (activeTabId === 'calendar' ? 'calendar' : 'file')) as Tab['type'],
                title: currentTab?.title
            };
        }
    }, [activeTabId, openTabs]);

    const handleToggleTodos = () => {
        if (activeTabId === 'todos') {
            const prevTab = openTabs.find(t => t.id === lastActiveTabRef.current.id);
            if (prevTab) {
                switchTab(prevTab.id, prevTab.type, prevTab.title);
            } else {
                const fallbackTab = openTabs.find(t => t.id !== 'todos');
                if (fallbackTab) {
                    switchTab(fallbackTab.id, fallbackTab.type, fallbackTab.title);
                } else {
                    switchTab('calendar', 'calendar', 'Calendar');
                }
            }
        } else {
            switchTab('todos', 'todos', 'Todos');
        }
    };

    const handleTabSelect = (id: string, type: 'file' | 'calendar' | 'todos' | 'messages' | 'chat' | 'ext_finance' | 'profile' | 'social' | 'exams' | 'job_planner' | 'trash') => {
        if (id === 'todos' || type === 'todos') {
            switchTab('todos', 'todos', 'Todos');
            return;
        }
        if (type === 'social') {
            setActiveTabId('social');
            return;
        }
        if (type === 'trash') {
            setActiveTabId('trash');
            return;
        }
        switchTab(id, type as any);
    };

    const handleTabClose = (e: React.MouseEvent | null, id: string) => {
        if (e) e.stopPropagation();

        const currentIndex = openTabs.findIndex(t => t.id === id);
        const filtered = openTabs.filter(t => t.id !== id);
        setOpenTabs(filtered);

        if (activeTabId === id) {
            let nextTab: Tab | undefined;
            if (filtered.length > 0) {
                const targetIdx = Math.min(Math.max(0, currentIndex - 1), filtered.length - 1);
                nextTab = filtered[targetIdx] || filtered[filtered.length - 1];
            }
            const targetId = nextTab ? nextTab.id : 'calendar';
            const targetType = nextTab ? nextTab.type : 'calendar';
            switchTab(targetId, targetType, nextTab?.title);
        }
    };

    const handleMagicLinkClick = async (target: any) => {
        const targetIsEvent = target.type === 'event' || useDataStore.getState().events?.some((e: any) => e.id === target.id);
        if (targetIsEvent) {
            window.dispatchEvent(new CustomEvent('tide:select-event', { detail: { id: target.id } }));
            return;
        }

        if (target.id && target.id.startsWith('ghost-')) {
            const ghostId = target.id;
            const title = target.title || target.id.replace('ghost-', '');

            // 1. Create the new note
            const newId = await useDataStore.getState().createNote(title);

            // 2. Resolve the ghost link in the CURRENT editor (ensure the mention is updated to the real ID)
            if (activeNoteId && editorInstance) {
                const { tr } = editorInstance.state;
                let ghostOccurrences = 0;

                editorInstance.state.doc.descendants((node: ProseMirrorNode, pos: number) => {
                    if (node.type.name === 'mention' && node.attrs.id === ghostId) {
                        tr.setNodeMarkup(pos, null, { ...node.attrs, id: newId, isGhost: false });
                        ghostOccurrences++;
                    }
                });

                if (ghostOccurrences > 0) {
                    editorInstance.view.dispatch(tr);
                    const freshJson = editorInstance.getJSON();
                    // Local state update – but we'll also pass it to switchTab to avoid staleness
                    handleEditorChange(freshJson);

                    // 3. Navigate to the new identity, passing the fresh JSON to ensure Note A is saved correctly
                    switchTab(newId, 'file', title, null, freshJson);
                } else {
                    switchTab(newId, 'file', title);
                }
            } else {
                switchTab(newId, 'file', title);
            }

            useDataStore.getState().setActiveNoteId(newId);

        } else if (target.type === 'event') {
            window.dispatchEvent(new CustomEvent('tide:select-event', { detail: { id: target.id } }));
            return;

        } else if (target.type === 'task') {
            // Find the calendar event that was created from this task (via linkedTaskId)
            const linkedEvent = useDataStore.getState().events.find((e: any) => e.linkedTaskId === target.id);
            if (linkedEvent) {
                switchTab('calendar', 'calendar');
                setCalendarDate(new Date(linkedEvent.start));
                setActiveEventId(linkedEvent.id);
            }
            // If no linked event yet (task is still unscheduled), do nothing

        } else if (target.type === 'file' || target.type === 'note') {

            const targetFile = files.find(f => f.id === target.id);
            const title = target.title || targetFile?.title || "Untitled";

            switchTab(target.id, 'file', title);
            useDataStore.getState().setActiveNoteId(target.id);

        } else if (target.type === 'chat') {
            switchTab(target.id, 'chat', target.title);
        } else {
            switchTab(target.id, target.type as any);
        }
    };

    const handleOpenMessages = () => {
        if (activeTabId === 'messages') {
            const possibleLast = openTabs.length > 0 ? openTabs[openTabs.length - 1] : null;
            if (possibleLast) switchTab(possibleLast.id, possibleLast.type, possibleLast.title);
            else switchTab('calendar', 'calendar');
        } else {
            switchTab('messages', 'messages');
        }
    };




    const handleChatSelect = (partnerId: string, partnerName: string, partnerEmail: string) => {
        // Check if tab already exists
        const existingTab = openTabs.find(t => t.id === `chat-${partnerId}`);
        if (existingTab) {
            setActiveTabId(existingTab.id);
            return;
        }

        const newTab: Tab = {
            id: `chat-${partnerId}`,
            title: partnerName || partnerEmail || "Chat",
            type: 'chat',
            content: { id: partnerId, username: partnerName, email: partnerEmail } // Store chat info
        };

        setOpenTabs([...openTabs, newTab]);
        setActiveTabId(newTab.id);
    };

    if (status === "loading") return (
        <div className="flex flex-col items-center justify-center h-screen bg-white dark:bg-[#0F172A] gap-4">
            <div className="relative w-8 h-8">
                <div className="absolute inset-0 rounded-full border-2 border-gray-100 dark:border-white/10" />
                <div className="absolute inset-0 rounded-full border-2 border-t-gray-800 dark:border-t-white/60 animate-spin" />
            </div>
            <span className="text-[11px] font-semibold text-gray-300 dark:text-white/20 tracking-[0.3em] uppercase">tide</span>
        </div>
    );

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------
    return (
        <div className="flex h-[100dvh] w-full bg-[var(--background)] text-foreground overflow-hidden">
            <CloudStatusBanner />
            {/* Global drag ghost — rendered via Portal so it sits above sidebar/calendar/editor */}
            <EventDragGhost />
            <div className="hidden md:block">
            <SmartIsland
                onConfirm={(parsedData, text) => {
                    const now = new Date();
                    const startMins = parsedData.startMins !== null ? parsedData.startMins : (now.getHours() * 60 + now.getMinutes());
                    const endMins = parsedData.endMins !== null ? parsedData.endMins : startMins + 60;
                    
                    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(startMins / 60), startMins % 60);
                    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(endMins / 60), endMins % 60);
                    
                    handleEventCreate(start, end, false, { title: parsedData.title || text });
                }}
                onEdit={(parsedData, text) => {
                    const now = new Date();
                    const startMins = parsedData.startMins !== null ? parsedData.startMins : (now.getHours() * 60 + now.getMinutes());
                    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(startMins / 60), startMins % 60);
                    setScheduleInitialStart(start);
                    // Pass initial title via a state or just rely on a new feature? For now just open modal
                    setScheduleModalOpen(true);
                }}
            />
            </div>
            {/* Mobile Layout Wrapper */}
            <MobileLayout
                events={events}
                files={files.filter((f: any) => !f.isGroup && !(f.title || '').startsWith('.') && f.type !== 'event')}
                folders={files.filter((f: any) => f.type === 'folder' && !f.isGroup)}
                onNoteSelect={(id: string, title: string) => {
                    handleFileSelect(id, title);
                }}
                onNewNote={() => handleNewNote()}
                onDeleteNote={(id: string) => {
                    handleDeleteNote({ stopPropagation: () => { } } as any, id);
                }}
                activeNoteId={activeNoteId}
                activeNoteTitle={fileName}
                onNewEvent={(date: Date, endDate?: Date, meta?: { title?: string; color?: string; description?: string }) => {
                    const start = date;
                    const end = endDate || new Date(date.getTime() + 3_600_000);
                    handleEventCreate(start, end, false, meta || { title: 'Neuer Termin' });
                }}
                onEventClick={(id: string) => {
                    setActiveEventId(id);
                }}
                onEventUpdate={(id: string, newStart: Date, newEnd: Date) => {
                    handleEventUpdate(id, newStart, newEnd);
                }}
                onEventDelete={(id: string) => {
                    handleDeleteEvent(id);
                }}
                onTaskComplete={(id: string, completed: boolean) => {
                    useDataStore.setState((s: any) => ({
                        events: s.events.map((e: any) =>
                            e.id === id ? { ...e, is_completed: completed } : e
                        )
                    }));
                }}
                socialHubElement={
                    <SocialHub
                        compact={true}
                        onOpenProfile={(userId, username) => {}}
                        onOpenFile={(fileId, title, parentId) => {
                            handleFileSelect(fileId, title);
                        }}
                        onOpenCalendar={() => {
                            window.dispatchEvent(new CustomEvent('mobile_switch_calendar'));
                        }}
                        userProfile={userProfile}
                        privateKey={privateKey}
                    />
                }
                userProfile={userProfile}
                editorElement={
                    (() => {
                        const activeFileType = files.find(f => f.id === activeNoteId)?.type;

                        if (activeFileType === 'canvas') {
                            return canvasNoteData === null ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 h-[50vh] mt-20">
                                    <span className="font-medium text-sm">Lade...</span>
                                </div>
                            ) : (
                                <div className="flex-1 h-full overflow-hidden">
                                    <CanvasNoteEditor
                                        key={activeNoteId || ''}
                                        noteId={activeNoteId || ''}
                                        initialData={canvasNoteData}
                                        publicKey={publicKey}
                                        privateKey={privateKey}
                                        userId={myId}
                                        onChange={(data) => {
                                            setCanvasNoteData(data);
                                            setSaveStatus('unsaved');
                                        }}
                                    />
                                </div>
                            );
                        }

                        const currentAf = files.find(f => f.id === activeNoteId);
                        const isSharedNote = Boolean(currentAf && (
                            (currentAf as any).isShared ||
                            ((currentAf as any).owner_id && (currentAf as any).owner_id !== myId) ||
                            ((currentAf as any).share_status && (currentAf as any).share_status !== 'owner') ||
                            (() => {
                                try {
                                    const keys = typeof (currentAf as any).access_keys === 'string' ? JSON.parse((currentAf as any).access_keys) : (currentAf as any).access_keys;
                                    return keys && typeof keys === 'object' && Object.keys(keys).length > 1;
                                } catch { return false; }
                            })()
                        ));

                        return editorContent === null ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 h-[50vh] mt-20">
                                <span className="font-medium text-sm">Lade...</span>
                            </div>
                        ) : (
                            <Editor
                                key={activeTabId}
                                isShared={isSharedNote}
                                initialContent={editorContent}
                                editable={(() => {
                                    const af = files.find(f => f.id === activeNoteId);
                                    return (af as any)?.permission !== 'view';
                                })()}
                                onEditorReady={handleEditorReady}
                                onChange={handleEditorChange}
                                onLinkClick={handleMagicLinkClick}
                                onForceSave={(json) => {
                                    if (activeNoteId) {
                                        const currentFile = files.find(f => f.id === activeNoteId);
                                        if (currentFile) {
                                            setSaveStatus("saving");
                                            performSave(json, activeNoteId, activeFileKey, currentFile.visibility)
                                                .then(() => setSaveStatus("saved"))
                                                .catch(() => setSaveStatus("unsaved"));
                                        }
                                    }
                                }}
                                onActiveUsersChange={(users) => {
                                    // only show OTHER users
                                    const currentMyId = myId || useDataStore.getState().myId;
                                    setActiveCollaborators(currentMyId ? users.filter(u => u.id !== currentMyId) : []);
                                }}
                                userProfile={userProfile}
                                myId={myId}
                                onBlocksDeleted={handleBlocksDeleted}
                                onPopOut={(text, anchorBlockId) => {
                                    const widget: TextWidgetElement = {
                                        id: crypto.randomUUID(),
                                        type: 'text-widget',
                                        anchorBlockId,
                                        offsetX: 24,
                                        offsetY: 0,
                                        content: text,
                                        backgroundColor: 'transparent',
                                    };
                                    canvasSidecar.addElement(widget);
                                }}
                                onConnectImage={(blockId) => setPendingBindBlockId(blockId)}
                                onBlockHover={setHoveredBlockId}
                                onAbortLinking={() => {
                                    if (isLinkingMode) {
                                        setIsLinkingMode(false);
                                        setActiveLinkBlockId(null);
                                    }
                                }}
                                activeTabId={activeTabId}
                                onReturnToTab={(tabId) => setActiveTabId(tabId)}
                            />
                        );
                    })()
                }
            />

            {/* Left Sidebar Panel */}
            <div
                style={{ width: isSidebarOpen ? `${sidebarWidth}px` : '0px' }}
                className={`hidden md:flex flex-col h-full bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] shrink-0 z-[100] transition-[width,opacity] duration-300 ease-in-out relative ${
                    isSidebarOpen
                        ? 'opacity-100 overflow-visible'
                        : 'opacity-0 border-r-0 pointer-events-none overflow-hidden'
                }`}
            >
                <div style={{ width: `${sidebarWidth}px` }} className="h-full flex flex-col shrink-0">
                    <Sidebar
                        userProfile={userProfile || undefined}
                        files={sidebarFiles}
                        onFileSelect={handleFileSelect}
                        onNewNote={handleNewNote}
                        onNewCanvasNote={handleNewCanvasNote}
                        onDeleteNote={handleDeleteNote}
                        onRenameNote={handleRenameNote}
                        onToggleVisibility={handleToggleVisibility}
                        onShare={handleShare}
                        onOpenMessages={handleOpenMessages}
                        onChatSelect={handleChatSelect}
                        editingFileId={editingFileId}
                        onRenameSubmit={submitRename}
                        onCreateFolder={handleCreateFolder}
                        onMoveItem={handleMoveFile}
                        selectedDate={calendarDate}
                        onDateSelect={handleDateSelect}
                        hiddenThemeIds={hiddenThemeIds}
                        onToggleThemeVisibility={handleToggleThemeVisibility}
                        eventGroups={files?.filter(f => f.type === 'folder' && f.isGroup)}
                        onCreateEventGroup={handleCreateEventGroup}
                        onUpdateEventGroup={handleUpdateEventGroup}
                        enabledExtensions={enabledExtensions}
                        openTabs={openTabs}
                        activeTabId={activeTabId}
                        onTabSelect={handleTabSelect}
                        onTabClose={handleTabClose}
                        onTabsReorder={setOpenTabs}
                        onOpenCalendar={() => handleTabSelect('calendar', 'calendar')}
                        onOpenSocial={() => setActiveTabId('social')}
                        onOpenExams={() => handleTabSelect('job_planner', 'job_planner')}
                        onOpenTodos={handleToggleTodos}
                        isTodosActive={activeTabId === 'todos'}
                        onToggleTodos={handleToggleTodos}
                    />
                </div>
                {isSidebarOpen && (
                    <div
                        onMouseDown={startSidebarDrag}
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500/30 active:bg-indigo-500/50 transition-colors z-20"
                        title="Drag to resize sidebar"
                    />
                )}
            </div>

            {/* Right: Workspace */}
            <div className={`hidden md:flex flex-1 flex-col min-w-0 bg-[var(--background)] relative overflow-hidden`}>
                {/* Horizontal Browser Tab Bar */}
                <TabList
                    isSidebarOpen={isSidebarOpen}
                    onToggleSidebar={toggleSidebarCollapse}
                    tabs={openTabs}
                    activeTabId={activeTabId}
                    onTabSelect={handleTabSelect}
                    onTabClose={handleTabClose}
                    onTabsReorder={setOpenTabs}
                    onNewTab={() => handleNewNote()}
                    userProfile={userProfile}
                    myId={myId}
                    isAvatarMenuOpen={isAvatarMenuOpen}
                    setIsAvatarMenuOpen={setIsAvatarMenuOpen}
                    avatarMenuRef={avatarMenuRef}
                    onOpenSocial={() => setActiveTabId('social')}
                    onOpenSettings={() => useDataStore.getState().setSettingsModalOpen(true)}
                    onOpenTrash={() => setActiveTabId('trash')}
                    onLogout={() => {
                        setIsAvatarMenuOpen(false);
                        sessionStorage.clear();
                        localStorage.removeItem('tide_user_email');
                        localStorage.removeItem('tide_user_id');
                        localStorage.removeItem('tide_session_token');
                        window.location.reload();
                    }}
                />

                {/* Main Workspace Body */}
                <div 
                    className="flex-1 min-h-0 relative overflow-hidden flex flex-col"
                    /* onDoubleClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (
                            target.isContentEditable ||
                            target.closest('button, input, textarea, a, .ProseMirror, [role="button"], [role="dialog"], .cal-event, table, [data-prevent-dblclick]')
                        ) {
                            return;
                        }
                        handleNewNote();
                    }} */
                >
                    {/* Unscheduled Tasks Panel — bottom-right corner floating card, only when calendar is active */}
                    {activeTabId === 'calendar' && (!enabledExtensions || enabledExtensions.includes('todos')) && (() => {
                        const unscheduledTodos = (tasks || []).filter(t => !t.isCompleted && !t.dueDate && !t.scheduledDate && t.showInCalendar !== false);
                        if (unscheduledTodos.length === 0) return null;
                        return (
                            <div className="absolute right-6 bottom-6 z-[55] pointer-events-auto bg-white/90 dark:bg-[#1c1c1c]/95 backdrop-blur-md border border-gray-200/80 dark:border-white/10 rounded-2xl p-3 shadow-xl max-w-xs flex flex-col gap-2 max-h-[40vh] overflow-hidden">
                                <div className="flex items-center justify-between px-1">
                                    <div className="flex items-center gap-2">
                                        <ListTodo className="w-4 h-4 text-blue-500" />
                                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">Todos</span>
                                    </div>
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300">
                                        {unscheduledTodos.length}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1.5 overflow-y-auto pr-1">
                                    {unscheduledTodos.map(t => {
                                        const priorityColor = t.priority === 'high' ? 'bg-red-500' : t.priority === 'medium' ? 'bg-amber-500' : t.priority === 'low' ? 'bg-blue-400' : 'bg-gray-400';
                                        return (
                                            <div
                                                key={t.id}
                                                draggable
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('text/plain', t.id);
                                                    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'task', id: t.id }));
                                                }}
                                                className="rounded-xl px-3 py-2 bg-gray-50/80 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 border border-gray-200/60 dark:border-white/10 flex items-center gap-2 cursor-grab active:cursor-grabbing transition-all hover:scale-[1.02] hover:shadow-xs group"
                                            >
                                                <GripVertical className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                <span
                                                    className={`w-2 h-2 rounded-full shrink-0 ${t.color ? '' : priorityColor}`}
                                                    style={t.color ? { backgroundColor: t.color } : undefined}
                                                />
                                                <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1 font-medium">{t.title}</span>
                                                <button
                                                    type="button"
                                                    title="Delete task"
                                                    className="opacity-0 group-hover:opacity-100 ml-auto shrink-0 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-all"
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}
                <div
                    className={`absolute inset-0 z-10 bg-[var(--background)] transition-opacity duration-200 ${activeTabId === 'calendar' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                    onDragOver={(e) => {
                        if (calendarDropActive) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'copy';
                        }
                    }}
                    onDrop={(e) => {
                        if (!calendarDropActive) return;
                        e.preventDefault();
                        setCalendarDropActive(false);
                        const text = e.dataTransfer.getData('tide/text-to-calendar') || draggedText || '';
                        if (!text) return;
                        // Create event 1h from now with text as description
                        const start = new Date();
                        start.setMinutes(0, 0, 0);
                        start.setHours(start.getHours() + 1);
                        const end = new Date(start.getTime() + 60 * 60 * 1000);
                        handleEventCreate(start, end, false, { description: text, title: text.slice(0, 60) });
                        setDraggedText(null);
                    }}
                >
                    {/* Glowing "drop here" overlay when text is being dragged */}
                    {calendarDropActive && activeTabId === 'calendar' && (
                        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center"
                            style={{
                                background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.12) 100%)',
                                border: '3px dashed rgba(99,102,241,0.5)',
                                borderRadius: '12px',
                                backdropFilter: 'blur(2px)',
                                animation: 'calDropPulse 1.5s ease-in-out infinite',
                            }}
                        >
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
                                padding: '24px 40px', borderRadius: '16px',
                                background: 'rgba(255,255,255,0.85)',
                                boxShadow: '0 8px 40px rgba(99,102,241,0.25)',
                                backdropFilter: 'blur(8px)',
                            }}>
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                                    <line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/>
                                </svg>
                                <div style={{ fontSize: '15px', fontWeight: 700, color: '#6366f1' }}>Drop to create event</div>
                                <div style={{ fontSize: '12px', color: '#94a3b8', maxWidth: '200px', textAlign: 'center' }}>
                                    Your selected text will become the event description
                                </div>
                            </div>
                        </div>
                    )}
                    <style>{`
                        @keyframes calDropPulse {
                            0%, 100% { border-color: rgba(99,102,241,0.4); box-shadow: 0 0 0 0 rgba(99,102,241,0.1); }
                            50% { border-color: rgba(99,102,241,0.8); box-shadow: 0 0 0 12px rgba(99,102,241,0.05); }
                        }
                    `}</style>
                    <CalendarView
                        events={events.map(e => {
                            const parent = files?.find(f => f.id === e.parent_id);
                            return { ...e, effect: parent?.effect || 'none' };
                        }).filter(e => {
                            const gIds = getEventGroupIds(e);
                            if (gIds.length === 0) return !hiddenThemeIds.includes('general-theme');
                            return gIds.some(gid => !hiddenThemeIds.includes(gid));
                        })}
                        onEventCreate={handleEventCreate}
                        onEventUpdate={handleEventUpdate}
                        onEventDelete={handleDeleteEvent}
                        onEventRename={handleEventRename}
                        onEventSave={handleEventSave}
                        onEventClick={(id) => {
                            if (!id) return;
                            setActiveEventId(id);
                            setMinimizedEventIds(prev => prev.filter(mId => mId !== id));
                        }}
                        onEventShare={(e, id) => handleShare(e, id)}
                        editingEventId={activeEventId}
                        date={calendarDate}
                        onDateChange={handleDateSelect}
                        themes={files?.filter(f => f.type === 'folder' && f.isGroup).map(g => ({ id: g.id, title: g.title, effect: g.effect, color: (g as any).color }))}
                        onScheduleApply={handleScheduleApply}
                    />
                </div>




                <div className={`absolute inset-0 z-10 bg-[var(--background)] overflow-y-auto ${activeTabId.startsWith('profile:') ? 'block' : 'hidden'}`}>
                    {activeTabId.startsWith('profile:') && (
                        <ProfilePage
                            userId={activeTabId.split(':')[1]}
                            onOpenFile={(fileId, title) => switchTab(fileId, 'file', title)}
                            onMessage={(uId) => setActiveTabId('social')}
                        />
                    )}
                </div>

                <div className={`absolute inset-0 z-10 bg-[var(--background)] overflow-y-auto ${activeTabId === 'social' ? 'block' : 'hidden'}`}>
                    {activeTabId === 'social' && (
                        <SocialHub 
                            onOpenProfile={(userId, username) => switchTab(`profile:${userId}`, 'profile', username)}
                            onOpenFile={(fileId, title, parentId) => switchTab(fileId, 'file', title)}
                            onOpenCalendar={() => switchTab('calendar', 'calendar')}
                            userProfile={userProfile}
                            privateKey={privateKey}
                        />
                    )}
                </div>

                <JobsWorkspace
                    isActive={activeTabId === 'job_planner' || activeTabId === 'exams'}
                    onCreateGroup={handleCreateEventGroup}
                    onOpenCalendar={() => handleTabSelect('calendar', 'calendar')}
                    onOpenSettings={(tab?: any) => setSettingsModalOpen(true, tab || 'extensions')}
                />

                <div className={`absolute inset-0 z-10 bg-[var(--background)] overflow-y-auto ${activeTabId === 'todos' ? 'block' : 'hidden'}`}>
                    {activeTabId === 'todos' && (!enabledExtensions || enabledExtensions.includes('todos')) && <TodoList />}
                </div>

                <div className={`absolute inset-0 z-10 bg-[var(--background)] overflow-y-auto ${activeTabId === 'trash' ? 'block' : 'hidden'}`}>
                    {activeTabId === 'trash' && (
                        <TrashPanel />
                    )}
                </div>

                <CanvasWorkspace
                    activeTabId={activeTabId}
                    isLoadingContent={isLoadingContent}
                    noteLayout={noteLayout}
                    canvasSidecar={canvasSidecar}
                    publicKey={publicKey}
                    privateKey={privateKey}
                    myId={myId}
                    activeNoteId={activeNoteId}
                    deletedBlockIds={deletedBlockIds}
                    pendingBindBlockId={pendingBindBlockId}
                    setPendingBindBlockId={setPendingBindBlockId}
                    hoveredElementId={hoveredElementId}
                    setHoveredElementId={setHoveredElementId}
                    isLinkingMode={isLinkingMode}
                    setIsLinkingMode={setIsLinkingMode}
                    activeLinkBlockId={activeLinkBlockId}
                    setActiveLinkBlockId={setActiveLinkBlockId}
                    hoveredBlockId={hoveredBlockId}
                    setHoveredBlockId={setHoveredBlockId}
                    editorInstance={editorInstance}
                    editorVersion={editorVersion}
                    openTabs={openTabs}
                    setOpenTabs={setOpenTabs}
                    files={files}
                    editorContent={editorContent}
                    handleFileSelect={handleFileSelect}
                    activeCollaborators={activeCollaborators}
                    setActiveCollaborators={setActiveCollaborators}
                    fileName={fileName}
                    setFileName={setFileName}
                    saveStatus={saveStatus}
                    setSaveStatus={setSaveStatus}
                    submitRename={submitRename}
                    setShowBackups={setShowBackups}
                    handleShare={(e: any, id?: string) => { if (id) handleShare(e, id); }}
                    setNoteSecurityModalItem={setNoteSecurityModalItem}
                    handleDeleteNote={handleDeleteNote}
                    canvasNoteData={canvasNoteData}
                    setCanvasNoteData={setCanvasNoteData}
                    handleEditorReady={handleEditorReady}
                    handleEditorChange={handleEditorChange}
                    handleMagicLinkClick={handleMagicLinkClick}
                    activeFileKey={activeFileKey}
                    performSave={performSave}
                    handleBlocksDeleted={handleBlocksDeleted}
                    setActiveTabId={setActiveTabId}
                    userProfile={userProfile}
                />
                </div>
            </div>

            {/* Global Modals Host */}
            <GlobalModalsHost
                shareModalFile={shareModalFile}
                setShareModalFile={setShareModalFile}
                onCloseShareModal={() => setShareModalFile(null)}
                onShare={performShare}
                myId={myId}
                noteSecurityModalItem={noteSecurityModalItem}
                setNoteSecurityModalItem={setNoteSecurityModalItem}
                onCloseSecurityModal={() => setNoteSecurityModalItem(null)}
                userEmail={userProfile?.email}
                onSaveSecuritySettings={handleSaveNoteSecuritySettings}
                isSettingsModalOpen={isSettingsModalOpen}
                setSettingsModalOpen={(val) => setSettingsModalOpen(Boolean(typeof val === 'function' ? (val as any)(isSettingsModalOpen) : val))}
                onCloseSettingsModal={() => setSettingsModalOpen(false)}
                enabledExtensions={enabledExtensions}
                onToggleExtension={handleToggleExtension}
                userProfile={userProfile || undefined}
                onLogout={handleLogout}
                noteLayout={noteLayout}
                onSetNoteLayout={setNoteLayout}
                groups={files?.filter(f => f.type === 'folder' && f.isGroup).map(g => ({ id: g.id, title: g.title, effect: g.effect, color: (g as any).color })) || []}
                hiddenGroupIds={hiddenThemeIds}
                onToggleGroupVisibility={handleToggleThemeVisibility}
                onUpdateGroup={handleUpdateEventGroup}
                onShareGroup={handleShare}
                onDeleteGroup={(e: any, id: string) => {
                    const group = files.find(f => f.id === id);
                    const isPlannerActive = enabledExtensions.includes('job_planner');
                    const plannerGroupId = useJobPlannerStore.getState().pluginGroupId;
                    const isProtected = isPlannerActive && Boolean(plannerGroupId && id === plannerGroupId);
                    if (isProtected) {
                        alert("Diese Kategorie wird vom Job & Studienplaner verwendet und kann nicht gelöscht werden.");
                        return;
                    }
                    if (group && confirm(`Delete group "${group.title}"? This won't delete events in it.`)) {
                        handleDeleteNote(e, id);
                    }
                }}
                onCreateGroup={handleCreateEventGroup}
                scheduleModalOpen={scheduleModalOpen}
                setScheduleModalOpen={setScheduleModalOpen}
                onCloseScheduleModal={() => setScheduleModalOpen(false)}
                onApplySchedule={handleScheduleApply}
                existingThemes={files?.filter(f => f.type === 'folder' && f.isGroup).map(g => ({ id: g.id, title: g.title, effect: g.effect, color: (g as any).color })) || []}
                isSummaryOpen={isSummaryOpen}
                setIsSummaryOpen={setIsSummaryOpen}
                onCloseSummary={() => setIsSummaryOpen(false)}
                streak={streak}
                summaryStats={summaryStats}
                showBackups={showBackups}
                setShowBackups={setShowBackups}
                activeNoteId={activeNoteId}
                editorContent={editorContent}
                onCancelBackups={() => setShowBackups(false)}
                onRestoreBackup={(content) => {
                    window.dispatchEvent(new CustomEvent('editor:restore-content', { detail: content }));
                    setEditorContent(content);
                    initialContentRef.current = content;
                    userHasTypedRef.current = true;
                    setShowBackups(false);
                    const currentFile = activeNoteId ? files.find(f => f.id === activeNoteId) : null;
                    if (currentFile && activeNoteId) {
                        setSaveStatus("saving");
                        performSave(content, activeNoteId, activeFileKey, currentFile.visibility)
                            .then(() => {
                                setSaveStatus("saved");
                                setOpenTabs(prev => prev.map(tab =>
                                    tab.id === activeNoteId ? { ...tab, content, _saveStatus: 'saved' } : tab
                                ));
                            })
                            .catch(() => setSaveStatus("unsaved"));
                    }
                }}
                deleteConfirm={deleteConfirm}
                setDeleteConfirm={setDeleteConfirm}
                onConfirmDelete={executeDeleteNote}
                onCancelDelete={() => setDeleteConfirm(null)}
                deleteError={deleteError}
                setDeleteError={setDeleteError}
                onConfirmDeleteError={() => {
                    if (deleteError?.isCorrupt) {
                        useDataStore.getState().setNotes(files.filter(f => f.id !== deleteError.fileId) as any);
                        setOpenTabs(prev => {
                            const nextTabs = prev.filter(t => t.id !== deleteError.fileId);
                            localStorage.setItem("tide_open_tabs", JSON.stringify(nextTabs));
                            return nextTabs;
                        });
                        if (activeTabId === deleteError.fileId) {
                            handleTabClose(null as any, deleteError.fileId);
                        }
                    }
                    setDeleteError(null);
                    setDeleteConfirm(null);
                }}
                onCancelDeleteError={() => {
                    setDeleteError(null);
                    setDeleteConfirm(null);
                }}
            />

            {/* Search Overlay */}
            <SearchOverlay
                isOpen={isSearching}
                onClose={() => setIsSearching(false)}
                onOpen={() => setIsSearching(true)}
                onSelectResult={(target) => {
                    handleMagicLinkClick(target);
                }}
                privateKey={privateKey}
                publicKey={publicKey}
                myId={myId}
            />
        </div>
    );
}