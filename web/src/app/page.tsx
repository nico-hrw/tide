"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import * as cryptoLib from "@/lib/crypto";
import * as cryptoV2 from "@/lib/cryptoV2";
import { apiFetch, getApiBase } from "@/lib/api";
import ChatPanel from "@/components/Chat/ChatPanel";
import Sidebar from "@/components/Layout/Sidebar";
import TabList, { Tab } from "@/components/Layout/TabList";
import CalendarView from "@/components/Calendar/CalendarView";
import WeekView from "@/components/Calendar/WeekView";
import ShareModal from "@/components/ShareModal";
import SettingsModal from "@/components/Settings/SettingsModal";
import ProfilePage from "@/components/Profile/ProfilePage";
import SocialHub from "@/components/Social/SocialHub";
import dynamic from 'next/dynamic';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { ScheduleModal, ScheduleEventData } from "@/components/Calendar/ScheduleModal";

const Editor = dynamic(() => import('@/components/Editor'), {
    ssr: false,
    loading: () => <div className="min-h-[500px] w-full animate-pulse bg-gray-50 dark:bg-gray-800/50 rounded-lg"></div>
});

const CanvasLayer = dynamic(() => import('@/components/Canvas/CanvasLayer'), {
    ssr: false
});

const CanvasNoteEditor = dynamic(() => import('@/components/Canvas/CanvasNoteEditor'), { ssr: false });

import DailySummary from "@/components/Calendar/DailySummary";
import MobileLayout from "@/components/Layout/MobileLayout";
import BackupHistory from "@/components/BackupHistory";
import { Clock, Settings, LogOut, Users } from 'lucide-react';
import Avatar from "@/components/Profile/Avatar";
import SmartIsland from "@/components/SmartIsland";


const FinanceDashboard = dynamic(() => import('@/components/Finance/FinanceDashboard'), {
    loading: () => <div className="flex-1 flex items-center justify-center p-8 text-gray-400">Loading module...</div>
});
import EditorGutter from "@/components/Canvas/EditorGutter";
import ShareManagementPanel from "@/components/ShareManagementPanel";
import { useStyleFile } from "@/components/Canvas/useStyleFile";
import { TextWidgetElement } from "@/types/canvas";
import { useHighlight } from "@/components/HighlightContext";
import { CheckCircle2, Loader2, Plus, ChevronDown, Share, Download } from 'lucide-react';
import { useIslandStore } from '@/components/extensions/smart_island/useIslandStore';
import { isSameDay } from 'date-fns';
import { useDataStore, DataItem } from "@/store/useDataStore";
import { useDragGhost } from "@/store/useDragGhost";
import EventDragGhost from "@/components/Calendar/EventDragGhost";
import { useDateDetection, DateDetectionMode } from "@/hooks/useDateDetection";

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
}



const ThemeItem = ({ group, hiddenThemeIds, onToggleVisibility, onUpdate, onShare, onDelete }: any) => {
    const [localTitle, setLocalTitle] = useState(group.title);

    useEffect(() => {
        setLocalTitle(group.title);
    }, [group.title]);

    const handleBlur = () => {
        if (localTitle !== group.title) {
            onUpdate(group.id, { title: localTitle });
        }
    };

    return (
        <div className="group relative flex flex-col gap-2.5 p-3 rounded-xl bg-gray-50/50 hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-100 transition-all">
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={!(hiddenThemeIds || []).includes(group.id)}
                    onChange={() => onToggleVisibility(group.id)}
                    className="w-4 h-4 rounded-md border-gray-300 text-indigo-600 focus:ring-indigo-500/20 bg-white cursor-pointer"
                    title="Toggle Visibility"
                />
                <input
                    type="text"
                    value={localTitle}
                    onChange={(e) => setLocalTitle(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
                    className="bg-transparent border-none p-0 text-[13px] font-semibold focus:ring-0 outline-none text-gray-800 flex-1 placeholder:text-gray-400"
                    placeholder="Theme name..."
                />
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    <button
                        onClick={(e) => onShare(e, group.id)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-indigo-600 transition-all"
                        title="Share Theme"
                    >
                        <Share size={12} />
                    </button>
                    <button
                        onClick={(e) => onDelete(e, group.id, group.title)}
                        className="p-1.5 hover:bg-rose-50 rounded-lg text-gray-400 hover:text-rose-500 transition-all font-semibold"
                        title="Delete Theme"
                    >
                        ✗
                    </button>
                </div>
            </div>
            <div className="flex flex-col gap-2.5 pl-6">
                {/* Pattern picker — themes convey texture/pattern only, not individual color */}
                <div className="flex flex-wrap gap-1.5">
                    {([
                        { id: 'none',    label: 'Solid'   },
                        { id: 'stripes', label: 'Streifen' },
                        { id: 'waves',   label: 'Wellen'  },
                        { id: 'dots',    label: 'Punkte'  },
                        { id: 'chess',   label: 'Karo'    },
                        { id: 'diamonds',label: 'Diamant' },
                        { id: 'gradient',label: 'Verlauf' },
                        { id: 'bars',    label: 'Balken'  },
                        { id: 'dimmed',  label: 'Gedimmt' },
                    ] as const).map(({ id, label }) => {
                        const active = (group.effect || 'none') === id;
                        const swatchColor = (group as any).color || '#6366f1';
                        return (
                            <button
                                key={id}
                                onClick={() => onUpdate(group.id, { effect: id })}
                                title={label}
                                className={`flex flex-col items-center gap-0.5 p-0.5 rounded-lg border-2 transition-all ${active ? 'border-indigo-500 scale-105 shadow-sm' : 'border-transparent hover:border-gray-300'}`}
                            >
                                <div
                                    className={`w-8 h-5 rounded-md ${id !== 'none' ? `effect-${id}` : ''}`}
                                    style={{
                                        backgroundColor: swatchColor,
                                        opacity: id === 'dimmed' ? 0.55 : 1,
                                    }}
                                />
                                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wide">{label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default function Dashboard() {
    // -------------------------------------------------------------------------
    // 0. State & Initialization
    // -------------------------------------------------------------------------

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
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [userProfile, setUserProfile] = useState<{ username: string; email: string; avatar_seed?: string; avatar_salt?: string; avatar_style?: string; bio?: string; title?: string; is_verified?: boolean; profile_status?: number; id?: string; user_id?: string } | null>(null);
    const [streak, setStreak] = useState(0);
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);
    const [summaryStats, setSummaryStats] = useState({ events: 0, tasks: 0 });
    const [showBackups, setShowBackups] = useState(false);

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

    const files = storeFiles as unknown as DecryptedFile[];
    const events = storeEvents as unknown as CalendarEvent[];
    const tasks = storeTasks as any[];

    // Editor & File State
    const [editorContent, setEditorContent] = useState<any>(null);
    const [canvasNoteData, setCanvasNoteData] = useState<import('@/types/canvasNote').CanvasNoteData | null>(null);
    const [isLoadingContent, setIsLoadingContent] = useState(false);
    const [activeFileKey, setActiveFileKey] = useState<CryptoKey | null>(null);
    const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "saving">("saved");
    const [fileName, setFileName] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showSharePanel, setShowSharePanel] = useState(false);
    const [activeCollaborators, setActiveCollaborators] = useState<any[]>([]);
    const [editorInstance, setEditorInstance] = useState<any>(null);
    const editorInstanceRef = useRef<any>(null);
    const [editorVersion, setEditorVersion] = useState(0);
    const lastLoadIdRef = useRef<string | null>(null);

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
    const [shareModalFile, setShareModalFile] = useState<{ id: string, title: string, type?: string } | null>(null);

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
    const activeNoteId = (activeTabIdStr !== 'calendar' && activeTabIdStr !== 'messages' && !activeTabIdStr.startsWith('chat-'))
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

    const handleEditorChange = useCallback((json: any) => {
        // console.log("[Pulse] Editor changed, scheduling save...");
        setEditorContent(json);
        setSaveStatus("unsaved");
        setEditorVersion(v => v + 1);
    }, []);

    // ── Auto-Save ──────────────────────────────────────────────────────────────────────
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeNoteIdRef = useRef<string | null>(null);
    const activeFileKeyRef = useRef<CryptoKey | null>(null);
    // Refs always have the latest value — safe to use inside setTimeout callbacks
    const editorContentRef = useRef<any>(null);
    const canvasNoteDataRef = useRef<any>(null);
    const saveStatusRef = useRef<string>('saved');
    const fileNameRef = useRef<string>("");
    // Per-note in-flight lock: prevents parallel save calls on the same noteId
    // (avoids IV mismatch when two saves race each other on the same file).
    const isSavingRef = useRef<Set<string>>(new Set());
    const initialContentRef = useRef<any>(null);

    useEffect(() => { activeNoteIdRef.current = activeNoteId ?? null; }, [activeNoteId]);
    useEffect(() => { activeFileKeyRef.current = activeFileKey; }, [activeFileKey]);
    useEffect(() => { editorContentRef.current = editorContent; }, [editorContent]);
    useEffect(() => { canvasNoteDataRef.current = canvasNoteData; }, [canvasNoteData]);
    useEffect(() => { saveStatusRef.current = saveStatus; }, [saveStatus]);
    useEffect(() => { fileNameRef.current = fileName; }, [fileName]);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
                setIsAvatarMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Always-current ref to performSave so triggerSave (stable useCallback) never
    // calls a stale closure where privateKey / publicKey / files are still null.
    // Declared here (before triggerSave) so it can be referenced inside.
    const performSaveRef = useRef<((content: any, fileId: string, fileKey: CryptoKey | null, visibility: string) => Promise<void>) | null>(null);

    // Core save function — calls performSaveRef.current so it always uses the
    // latest closure (fresh privateKey, publicKey, files, etc.) even though
    // triggerSave itself is a stable useCallback with [] deps.
    const triggerSave = useCallback(async (noteId: string, fileKey: CryptoKey | null, content: any) => {
        if (!noteId || !content) return;
        if (noteId === 'calendar' || noteId === 'messages' || noteId.startsWith('chat-')) return;

        // [FIX-1] In-flight lock: if a save is already running, schedule a retry so we
        // don't silently drop the latest changes. The retry fires after the in-flight save
        // completes, using the then-current content from editorContentRef.
        if (isSavingRef.current.has(noteId)) {
            console.log(`[AutoSave] Save in-flight for ${noteId} — scheduling retry`);
            // Only schedule one pending retry at a time
            if (!(triggerSave as any)._pendingRetry) {
                (triggerSave as any)._pendingRetry = true;
                const retryContent = editorContentRef.current;
                const retryKey = activeFileKeyRef.current;
                // Wait for in-flight save to finish by polling
                const waitAndRetry = async () => {
                    while (isSavingRef.current.has(noteId)) {
                        await new Promise(r => setTimeout(r, 200));
                    }
                    (triggerSave as any)._pendingRetry = false;
                    if (saveStatusRef.current === 'unsaved') {
                        triggerSave(noteId, retryKey, editorContentRef.current || retryContent);
                    }
                };
                waitAndRetry();
            }
            return;
        }

        // Broaden search to all files and events to ensure items like event-notes are saved
        const allFiles = useDataStore.getState().notes;
        const allEvents = useDataStore.getState().events;
        const currentFile = allFiles.find((f: any) => f.id === noteId) || allEvents.find((e: any) => e.id === noteId);

        if (!currentFile) {
            console.warn(`[AutoSave] Aborting save: File ${noteId} not found in store.`);
            return;
        }
        
        // Safety check: Don't save if content is null or an empty doc shell that might
        // be a side-effect of a component unmount or state transition.
        if (!content || (content.type === 'doc' && (!content.content || content.content.length === 0))) {
            console.warn(`[AutoSave] Aborted: Content is null or empty doc shell. Possible race condition during tab switch.`);
            return;
        }

        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        if (contentStr === 'decrypting' || contentStr.includes('DECRYPTION ERROR') || contentStr.includes('V2 DECRYPTION ERROR')) {
            console.warn(`[AutoSave] Aborted: Refusing to save decrypting or errored content`);
            return;
        }

        // Only save if content has actually changed from what was initially loaded.
        // This is the primary protection against phantom-empty overwrites: if the editor
        // fires onChange during initial content set (e.g. when decryption fails and an
        // empty doc is set), we must NOT save — that would overwrite real server content.
        const initialStr = typeof initialContentRef.current === 'string' ? initialContentRef.current : JSON.stringify(initialContentRef.current);
        if (contentStr === initialStr) {
            setSaveStatus('saved');
            return;
        }

        if (!performSaveRef.current) {
            console.warn("[AutoSave] Aborting save: performSaveRef.current is null.");
            return;
        }

        console.log(`[AutoSave] Triggering save for ${noteId} ("${(currentFile as any).title || 'Untitled'}")`);
        isSavingRef.current.add(noteId);
        setSaveStatus('saving');
        try {
            await performSaveRef.current(content, noteId, fileKey, (currentFile as any).visibility ?? 'private');
            console.log(`[AutoSave] Successfully saved ${noteId}`);
            
            // Only transition to 'saved' if the user didn't type again while saving.
            const currentContentStr = typeof editorContentRef.current === 'string' ? editorContentRef.current : JSON.stringify(editorContentRef.current);
            const savedContentStr = typeof content === 'string' ? content : JSON.stringify(content);

            if (currentContentStr === savedContentStr) {
                setSaveStatus('saved');
                // [FIX-1b] Update the cached _saveStatus on the open tab so that
                // switching away and returning does not lose the 'saved' state.
                setOpenTabs(prev => prev.map(tab =>
                    tab.id === noteId ? { ...tab, _saveStatus: 'saved' } : tab
                ));
            } else {
                console.log(`[AutoSave] Content changed during save for ${noteId}. Leaving as unsaved.`);
                // Ensure saveStatus is 'unsaved' to re-trigger the debouncer
                if (saveStatusRef.current !== 'unsaved') {
                    setSaveStatus('unsaved');
                }
            }
        } catch (e) {
            console.error(`[AutoSave] Save FAILED for ${noteId}:`, e);
            const errMsg = String((e as any)?.message || '');
            if (errMsg.includes('403') || errMsg.includes('status 403')) {
                // View-only file — silently ignore the save failure
                setSaveStatus('saved');
            } else {
                setSaveStatus('unsaved');
            }
        } finally {
            isSavingRef.current.delete(noteId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Debounced auto-save: 3s after last content change, or when saveStatus flips back to
    // 'unsaved' after a failed save attempt (so it retries without requiring further edits).
    useEffect(() => {
        const content = editorContent ?? canvasNoteData;
        if (saveStatus !== 'unsaved' || !content) return;

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

        saveTimerRef.current = setTimeout(() => {
            // Use refs here — closures would be stale by the time the timer fires
            const content = editorContentRef.current ?? canvasNoteDataRef.current;
            const noteId = activeNoteIdRef.current;
            const fileKey = activeFileKeyRef.current;

            if (saveStatusRef.current !== 'unsaved') {
                console.log("[AutoSave] 1s idle timer fired but status is no longer 'unsaved'. skipping.");
                return;
            }

            // Skip save for view-only shared files — backend would reject with 403
            if (noteId) {
                const liveFile = [...useDataStore.getState().notes, ...useDataStore.getState().events].find((f: any) => f.id === noteId) as any;
                const perm = liveFile?.permission;
                if (perm === 'view' || (liveFile?.share_status === 'shared' && perm && perm !== 'edit' && perm !== 'share')) {
                    console.log(`[AutoSave] Skipping save for view-only file ${noteId}`);
                    setSaveStatus('saved');
                    return;
                }
            }

            console.log(`[AutoSave] 1s idle detected for ${noteId}. Starting save pulse...`);
            triggerSave(noteId!, fileKey, content);
        }, 1000);

        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editorContent, canvasNoteData, saveStatus]);

    // Save immediately when switching away from a note with unsaved changes
    const prevNoteIdRef = useRef<string | null>(null);
    useEffect(() => {
        const prev = prevNoteIdRef.current;
        prevNoteIdRef.current = activeNoteId ?? null;

        if (!prev || prev === activeNoteId) return;
        if (saveStatusRef.current !== 'unsaved') return;

        // User switched away — save previous note's content RIGHT NOW (don't wait for timer)
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        console.log(`[Lifecycle] Tab switched from ${prev}. Flushing save...`);
        triggerSave(prev, activeFileKeyRef.current, editorContentRef.current ?? canvasNoteDataRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeNoteId]);

    // ULTIMATE PROTECTION: Save when the window is hidden (e.g. user switches browser tab)
    // or when the window is about to be closed.
    useEffect(() => {
        const flushUnsavedToDisk = () => {
            if (saveStatusRef.current === 'unsaved' && activeNoteIdRef.current) {
                console.log(`[Lifecycle] Window/Tab losing focus. EMERGENCY FLUSH for ${activeNoteIdRef.current}`);
                triggerSave(activeNoteIdRef.current, activeFileKeyRef.current, editorContentRef.current ?? canvasNoteDataRef.current);
            }
        };

        const handleVisibilityChange = () => { if (document.visibilityState === 'hidden') flushUnsavedToDisk(); };
        const handleBeforeUnload = (e: BeforeUnloadEvent) => { flushUnsavedToDisk(); };

        window.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [triggerSave]); // Stable triggerSave
    // ────────────────────────────────────────────────────────────────────────────

    // -------------------------------------------------------------------------
    // 1. Core Actions & Tab Management
    // -------------------------------------------------------------------------

    const handleNewNote = async () => {
        try {
            const { createNote, activeParentId } = useDataStore.getState();
            const newFileId = await createNote("Untitled", undefined, activeParentId);
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

    const performSave = async (content: any, fileId: string, fileKey: CryptoKey | null, visibility: string) => {
        if (!fileId || !content) return;

        try {
            const contentString = typeof content === 'string' ? content : JSON.stringify(content);

            // --- PUBLIC: Upload unencrypted ---
            if (visibility === 'public') {
                const blob = new Blob([contentString], { type: 'application/json' });
                await apiFetch(`/api/v1/files/${fileId}/upload`, { method: 'POST', body: blob });
                const allPublicFiles = [...useDataStore.getState().notes, ...useDataStore.getState().events] as any[];
                const publicFileRecord = allPublicFiles.find((f: any) => f.id === fileId);
                const title = publicFileRecord?.title || fileNameRef.current || 'Untitled';
                await apiFetch(`/api/v1/files/${fileId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ public_meta: { title } })
                });
                useDataStore.getState().updateFileRaw(fileId, { public_meta: { title }, title });
                try { localStorage.removeItem(`tide_backup_${fileId}`); } catch (_) {}
                return;
            }

            // --- PRIVATE: V2 Envelope Encryption ---
            const freshState = useDataStore.getState();
            const freshPrivKey = freshState.privateKey;
            const freshPubKey = freshState.publicKey;
            const freshMyId = freshState.myId;
            if (!freshPubKey || !freshPrivKey || !freshMyId) {
                throw new Error('[V2-Save] RSA master keys not available — cannot encrypt');
            }

            // Locate current file record to check existing V2 access_keys
            const allFiles = [...freshState.notes, ...freshState.events] as any[];
            const currentFile = allFiles.find(f => f.id === fileId);

            let dek: CryptoKey | null = null;
            let accessKeysMap: Record<string, { wrapped_key: string }> = {};

            // STRATEGY: Reuse the existing DEK so all recipients' wrapped keys stay valid.
            if (currentFile?.version >= 2 && currentFile?.access_keys) {
                const existingKeys = typeof currentFile.access_keys === 'string'
                    ? JSON.parse(currentFile.access_keys)
                    : (currentFile.access_keys || {});
                const myAccess = existingKeys[freshMyId];
                if (myAccess?.wrapped_key) {
                    try {
                        const rawDek = await cryptoV2.unwrapDEKData(myAccess.wrapped_key, freshPrivKey);
                        dek = await cryptoV2.importDEK(rawDek);
                        // Preserve ALL wrapped keys (owner + all recipients) unchanged
                        accessKeysMap = existingKeys;
                        console.log(`[V2-Save] Reusing existing DEK for ${fileId}`);
                    } catch (_) {
                        console.warn('[V2-Save] DEK reuse failed — generating new DEK (shared recipients must be re-invited)');
                    }
                } else {
                    // Has V2 structure but missing our own key — treat as new
                    accessKeysMap = existingKeys;
                }
            }

            if (!dek) {
                // New file, V1→V2 migration, or DEK recovery failure: create a fresh DEK
                dek = await cryptoV2.generateDEK();
                const rawDek = await window.crypto.subtle.exportKey('raw', dek);
                const wrapped = await cryptoV2.wrapDEKData(rawDek, freshPubKey);
                accessKeysMap = { ...accessKeysMap, [freshMyId]: { wrapped_key: wrapped.ciphertext } };
                console.log(`[V2-Save] Generated new DEK for ${fileId}`);
            }

            // Encrypt content with DEK + fresh IV
            const contentIv = window.crypto.getRandomValues(new Uint8Array(12));
            const contentBuffer = new TextEncoder().encode(contentString);
            const encryptedContent = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: contentIv },
                dek,
                contentBuffer
            );
            const contentCiphertext = JSON.stringify({
                data: cryptoLib.arrayBufferToBase64(encryptedContent),
                iv:   cryptoLib.arrayBufferToBase64(contentIv.buffer as ArrayBuffer)
            });

            const fileRecord = allFiles.find(f => f.id === fileId);
            if (!fileRecord) console.warn(`[V2-Save] File ${fileId} not found in store, falling back to fileNameRef`);
            const title = fileRecord?.title || fileNameRef.current || 'Untitled';

            // Re-encrypt secured_meta with RSA so fetchDirectory can decrypt the
            // title on the next reload without hitting an OperationError from a
            // stale V1-format secured_meta (which was written by handleNewNote).
            let freshSecuredMeta: string | undefined;
            try {
                freshSecuredMeta = await cryptoLib.encryptMetadata({ title }, freshPubKey);
            } catch (smErr) {
                console.warn('[V2-Save] Could not encrypt secured_meta — title will fall back to metadata.title on reload', smErr);
            }

            // Single atomic PUT: writes blob to BlobStore and updates metadata
            const isOwner = (currentFile?.share_status || 'owner') === 'owner';

            // Stamp BEFORE the PUT so the SSE cooldown activates even if SSE arrives
            // before the HTTP response (server sends SSE immediately after processing).
            if (typeof (window as any).__tideSaveTimestamp === 'function') {
                (window as any).__tideSaveTimestamp();
            }

            const putRes = await apiFetch(`/api/v1/files/${fileId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    version: 2,
                    content_ciphertext: contentCiphertext,
                    ...(isOwner ? { access_keys: accessKeysMap } : {}),
                    metadata: { has_custom_password: false, title },
                    ...(freshSecuredMeta ? { secured_meta: freshSecuredMeta } : {}),
                })
            });
            if (!putRes.ok) throw new Error(`[V2-Save] PUT failed with status ${putRes.status}`);

            useDataStore.getState().updateFileRaw(fileId, {
                title,
                version: 2,
                access_keys: accessKeysMap,
                metadata: { has_custom_password: false, title }
            });

            // (timestamp already stamped before PUT — see above)

            try { localStorage.removeItem(`tide_backup_${fileId}`); } catch (_) {}

        } catch (err) {
            console.error(`[V2-Save FAILED] ID: ${fileId}:`, err);
            throw err;
        }
    };
    // Keep the ref in sync with the latest render's closure so triggerSave
    // (which is a stable useCallback) always calls the CURRENT performSave
    // and never a stale version with empty privateKey / publicKey / files.
    performSaveRef.current = performSave;

    const loadNoteContent = async (fileId: string, titleFn: string, passedFile?: any) => {
        if (!privateKey) return;
        const loadId = crypto.randomUUID();
        lastLoadIdRef.current = loadId;
        setIsLoadingContent(true);
        setEditorContent(null);
        // Only set placeholder if we don't know the real title yet.
        // Avoid stamping 'Locked Note (Decrypting...)' as the displayed title.
        if (titleFn && !titleFn.includes('Locked')) setFileName(titleFn);
        setSaveStatus("saved");

        try {
            let recoveredBackup: any = null;
            // RECOVERY ON LOAD: Check localStorage for a backup of that ID before fetching
            try {
                const backupStr = localStorage.getItem(`tide_backup_${fileId}`);
                if (backupStr) {
                    console.warn(`[RECOVERY] Found unsaved local backup for ${fileId}. Restoring content, but still loading keys.`);
                    recoveredBackup = JSON.parse(backupStr);
                    setEditorContent(recoveredBackup);
                    setSaveStatus("unsaved");
                    // We DO NOT return here anymore. We need to load the metadata to get the FileKey,
                    // otherwise subsequent saves will fail due to missing keys.
                }
            } catch (backupErr) {
                console.error("Failed to recover local backup:", backupErr);
            }

            // [FIX-2] Always read the CURRENT store state (not the React-state snapshot
            // captured at the last render). On F5, `files` (React state) may still be []
            // while the store already has data from a concurrent fetchDirectory call.
            const freshStoreNotes = useDataStore.getState().notes;
            const freshStoreEvents = useDataStore.getState().events;
            let target = passedFile
                || freshStoreNotes.find((f: any) => f.id === fileId)
                || freshStoreEvents.find((e: any) => e.id === fileId)
                || files.find(f => f.id === fileId)
                || events.find(e => e.id === fileId) as any;
            if (!target) {
                const res = await apiFetch(`/api/v1/files/${fileId}`);
                if (res.status === 404) {
                    // File no longer exists on the server — remove from store + close tab
                    useDataStore.getState().setNotes(useDataStore.getState().notes.filter((n: any) => n.id !== fileId));
                    setOpenTabs(prev => prev.filter(t => t.id !== fileId));
                    const fallbackTab = openTabs.find(t => t.id !== fileId);
                    if (fallbackTab) switchTab(fallbackTab.id, fallbackTab.type, fallbackTab.title);
                    throw new Error(`[loadNoteContent] File ${fileId} not found on server (404) — removed from store`);
                }
                if (res.ok) target = await res.json().catch(() => null);
            }
            if (!target) throw new Error("File not found");

            let contentText = "";
            let meta: any = null;

            if (target.visibility === 'public') {
                const resBlob = await apiFetch(`/api/v1/files/${fileId}/download`);
                if (resBlob.status === 404) {
                    setOpenTabs(prev => prev.filter(t => t.id !== fileId));
                    useDataStore.getState().setNotes(useDataStore.getState().notes.filter(n => n.id !== fileId));
                    throw new Error("File not found on server (404)");
                }
                if (resBlob.ok) contentText = await resBlob.text();
            } else if ((target.version ?? 1) >= 2 && target.access_keys) {
                // ── [V2-LOAD] Envelope Encryption V2 path ──────────────────────────────
                const accessKeys = typeof target.access_keys === 'string'
                    ? JSON.parse(target.access_keys)
                    : (target.access_keys || {});
                const myAccess = accessKeys[myId];
                if (!myAccess?.wrapped_key) {
                    throw new Error(`[V2-Load] No access key found for user ${myId}. Cannot decrypt file ${fileId}.`);
                }

                // Unwrap DEK with RSA private key, then import for AES-GCM
                const rawDek = await cryptoV2.unwrapDEKData(myAccess.wrapped_key, privateKey);
                const dek = await cryptoV2.importDEK(rawDek);
                setActiveFileKey(dek);

                let v2Title = (target.metadata as any)?.title || target.title;
                if (target.secured_meta) {
                    try {
                        // Attempt DEK (AES-GCM) decryption first
                        const metaPayload = JSON.parse(target.secured_meta);
                        if (metaPayload.data && metaPayload.iv) {
                            const mIvBuf = cryptoLib.base64ToArrayBuffer(metaPayload.iv);
                            const mDataBuf = cryptoLib.base64ToArrayBuffer(metaPayload.data);
                            const mDecrypted = await window.crypto.subtle.decrypt(
                                { name: 'AES-GCM', iv: mIvBuf },
                                dek,
                                mDataBuf
                            );
                            const mDecoded = new TextDecoder().decode(mDecrypted);
                            const parsedMeta = JSON.parse(mDecoded);
                            if (parsedMeta.title) v2Title = parsedMeta.title;
                        } else {
                            // Fallback to RSA decryption
                            const meta = await cryptoLib.decryptMetadata(target.secured_meta, privateKey, `load-v2-${fileId}`);
                            if (meta.title) v2Title = meta.title as string;
                        }
                    } catch (e) {
                        try {
                            const meta = await cryptoLib.decryptMetadata(target.secured_meta, privateKey, `load-v2-${fileId}`);
                            if (meta.title) v2Title = meta.title as string;
                        } catch (err2) {
                            console.warn("[V2-Load] Metadata decryption failed", err2);
                        }
                    }
                }

                if (v2Title) {
                    if (!v2Title.includes('Locked Note')) {
                        setFileName(v2Title);
                        useDataStore.getState().updateFileRaw(fileId, { title: v2Title, isLocked: false });
                    } else {
                        useDataStore.getState().updateFileRaw(fileId, { isLocked: false });
                    }
                }

                if (recoveredBackup) {
                    console.log('[RECOVERY] V2: Skipping server download, using recovered local backup.');
                } else {
                    const resBlob = await apiFetch(`/api/v1/files/${fileId}/download`);
                    if (resBlob.status === 404) {
                        setOpenTabs(prev => prev.filter(t => t.id !== fileId));
                        useDataStore.getState().setNotes(useDataStore.getState().notes.filter(n => n.id !== fileId));
                        throw new Error("File not found on server (404)");
                    }
                    if (resBlob.ok) {
                        const blobText = await resBlob.text();
                        if (blobText) {
                            try {
                                const payload = JSON.parse(blobText);
                                if (payload.data && payload.iv) {
                                    const ivBuf   = cryptoLib.base64ToArrayBuffer(payload.iv);
                                    const dataBuf = cryptoLib.base64ToArrayBuffer(payload.data);
                                    const decrypted = await window.crypto.subtle.decrypt(
                                        { name: 'AES-GCM', iv: ivBuf },
                                        dek,
                                        dataBuf
                                    );
                                    contentText = new TextDecoder().decode(decrypted);
                                }
                            } catch (decryptErr) {
                                console.error(`[V2-Load] DECRYPTION FAILURE | ID: ${fileId}`, decryptErr);
                                contentText = JSON.stringify({
                                    type: 'doc',
                                    content: [{ type: 'paragraph', content: [
                                        { type: 'text', marks: [{ type: 'bold' }], text: '⚠️ V2 DECRYPTION ERROR: ' },
                                        { type: 'text', text: 'Content corrupted or DEK mismatch.' }
                                    ]}]
                                });
                            }
                        }
                    }
                }
            } else {
                // ── [V1-LOAD] Legacy path (secured_meta contains file key + IV) ────────
                if (!target.secured_meta) throw new Error("Missing metadata");
                meta = await cryptoLib.decryptMetadata(target.secured_meta, privateKey, `load-${fileId}`);

                // Resolve "Locked Note" title once decrypted
                if (meta.title && (target.title !== meta.title || target.isLocked)) {
                    console.log(`[Crypto] Decrypted real title for ${fileId}: "${meta.title}"`);
                    setFileName(meta.title as string);
                    useDataStore.getState().updateFileRaw(fileId, { title: meta.title, isLocked: false });
                }

                if (!meta.fileKey || typeof meta.fileKey !== 'object' || !(meta.fileKey as any).kty) {
                    console.error("Invalid or missing JWK fileKey");
                    throw new Error("Invalid or missing FileKey structure.");
                }

                const importedFileKey = await window.crypto.subtle.importKey(
                    "jwk", meta.fileKey as JsonWebKey, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]
                );
                setActiveFileKey(importedFileKey);

                if (recoveredBackup) {
                    console.log("[RECOVERY] V1: Skipping server blob download, using recovered backup.");
                } else {
                    const resBlob = await apiFetch(`/api/v1/files/${fileId}/download`);
                    if (resBlob.status === 404) {
                        setOpenTabs(prev => prev.filter(t => t.id !== fileId));
                        useDataStore.getState().setNotes(useDataStore.getState().notes.filter(n => n.id !== fileId));
                        throw new Error("File not found on server (404)");
                    }
                    if (resBlob.ok) {
                        const blob = await resBlob.blob();
                        if (blob.size > 0) {
                            try {
                                const decryptedBlob = await cryptoLib.decryptFile(blob, meta.iv as string, importedFileKey, fileId);
                                contentText = await decryptedBlob.text();
                            } catch (decryptErr) {
                                console.error(`[CRYPTO-AUDIT] DECRYPTION FAILURE | ID: ${fileId}`, decryptErr);
                                contentText = JSON.stringify({
                                    type: 'doc',
                                    content: [{
                                        type: 'paragraph',
                                        content: [{ type: 'text', marks: [{ type: 'bold' }], text: "⚠️ DECRYPTION ERROR: " }, { type: 'text', text: "Content corrupted or key mismatch." }]
                                    }]
                                });
                            }
                        }
                    }
                }
            }

            if (lastLoadIdRef.current !== loadId) return;

            if (contentText) {
                try {
                    const parsed = JSON.parse(contentText);
                    // Detect canvas note content
                    if (parsed?.version === 1 && Array.isArray(parsed?.items) && typeof parsed?.canvasWidth === 'number') {
                        setCanvasNoteData(parsed);
                        initialContentRef.current = parsed;
                        setEditorContent(null);
                    } else {
                        setEditorContent(parsed);
                        initialContentRef.current = parsed;
                    }
                }
                catch (e) {
                    setEditorContent(contentText);
                    initialContentRef.current = contentText;
                }
            } else {
                const emptyDoc = {
                    type: 'doc',
                    content: [{ type: 'paragraph', attrs: { blockId: crypto.randomUUID() } }]
                };
                setEditorContent(emptyDoc);
                initialContentRef.current = emptyDoc;
            }
        } catch (err) {
            if (lastLoadIdRef.current === loadId) console.error("Failed to load note:", err);
        } finally {
            if (lastLoadIdRef.current === loadId) setIsLoadingContent(false);
        }
    };

    const switchTab = async (newId: string, type: string, forcedTitle?: string, fallbackData?: any, currentOverride?: any) => {
        if (!newId) return;
        const currentContentToUse = currentOverride || editorContent || canvasNoteData;
        const currentTabId = useDataStore.getState().activeNoteId || activeTabId; // Use ref-like safety

        const isOldAFile = currentTabId !== 'calendar' && currentTabId !== 'messages' && !currentTabId.startsWith('chat-');

        if (isOldAFile && (saveStatus === 'unsaved' || currentOverride) && currentContentToUse) {
            console.log(`[Lifecycle] Tab switch: Forcing final save of ${currentTabId}`);
            // Use triggerSave for the latest logic and keys
            triggerSave(currentTabId, activeFileKeyRef.current, currentContentToUse);
        }

        setOpenTabs(prev => {
            let nextTabs = [...prev];
            if (isOldAFile) {
                nextTabs = nextTabs.map(t => t.id === activeTabId ? {
                    ...t, content: currentContentToUse, _fileKey: activeFileKey, _saveStatus: 'saved'
                } : t);
            }
            const existingTab = nextTabs.find(t => t.id === newId);
            nextTabs = nextTabs.filter(t => t.id !== newId);
            if (type === 'file') {
                nextTabs.unshift({ ...(existingTab || {}), id: newId, title: forcedTitle || existingTab?.title || "Untitled", type: 'file' });
            } else if (existingTab) {
                nextTabs.unshift(existingTab);
            } else {
                nextTabs.unshift({ id: newId, title: forcedTitle || "Untitled", type: type as any });
            }
            return nextTabs.length > 5 ? nextTabs.slice(0, 5) : nextTabs;
        });

        setActiveTabId(newId);
        setEditorContent(null);
        setCanvasNoteData(null);
        setActiveFileKey(null);
        setSaveStatus("saved");

        if (type === 'file') {
            useDataStore.getState().setActiveNoteId(newId);
            const existingTab = openTabs.find(t => t.id === newId);
            const finalTitle = forcedTitle || existingTab?.title || "";
            setFileName(finalTitle);
            if (existingTab && existingTab.content) {
                setEditorContent(existingTab.content);
                if (existingTab._fileKey) setActiveFileKey(existingTab._fileKey);
                setSaveStatus(existingTab._saveStatus || 'saved');
            } else {
                loadNoteContent(newId, finalTitle, fallbackData);
            }
        } else {
            useDataStore.getState().setActiveNoteId(null);
        }
    };

    const handleFileSelect = async (fileId: string, title: string, fileData?: any) => {
        if (fileId === 'ext_finance') {
            switchTab('ext_finance', 'ext_finance', 'Finance Tracker', fileData);
        } else {
            switchTab(fileId, 'file', title, fileData);
        }
    };

    // -------------------------------------------------------------------------
    // 2. Continuous Hooks (Effects)
    // -------------------------------------------------------------------------

    // SSE Effect — robust reconnect with exponential backoff
    useEffect(() => {
        if (!myId) return;
        const token = sessionStorage.getItem("tide_session_token") || localStorage.getItem("tide_session_token");
        if (!token) return;

        // [FIX-4] Throttle: track when WE last saved so SSE-triggered fetchDirectory
        // doesn't immediately overwrite our optimistic updates while the EventPopover
        // debounce (800ms) or note autosave timer (1000ms) is still running.
        let lastOwnSaveTime = 0;
        const OWN_SAVE_COOLDOWN_MS = 3000;

        // Expose a setter so performSave and handleEventSave can stamp the time
        (window as any).__tideSaveTimestamp = () => { lastOwnSaveTime = Date.now(); };

        // [FIX-2] Exponential backoff reconnect so a proxy timeout (common with Nginx)
        // doesn't spam the server with rapid reconnections every 3s.
        let retryDelay = 2000; // start at 2s
        const MAX_RETRY = 30000; // cap at 30s
        let eventSource: EventSource | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let isClosed = false;

        const connect = () => {
            if (isClosed) return;
            const base = getApiBase();
            eventSource = new EventSource(`${base}/api/v1/events?user_id=${myId}&token=${token}`);

            eventSource.onopen = () => {
                retryDelay = 2000; // reset backoff on successful connect
            };

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (['file_created', 'file_updated', 'file_deleted', 'file_shared'].includes(data.type)) {
                        const msSinceOwnSave = Date.now() - lastOwnSaveTime;
                        if (data.type === 'file_updated' && msSinceOwnSave < OWN_SAVE_COOLDOWN_MS) {
                            console.log(`[SSE] Suppressing own file_updated refetch (${msSinceOwnSave}ms since last save)`);
                            setTimeout(() => {
                                // Use metadataCache (no forceRefresh) so optimistic updates survive
                                useDataStore.setState({ loadedDirectories: new Set() });
                                useDataStore.getState().fetchDirectory(null);
                            }, OWN_SAVE_COOLDOWN_MS - msSinceOwnSave);
                            return;
                        }
                        // No forceRefresh: the metadataCache protects in-flight optimistic updates
                        // from being overwritten by server data that hasn't caught up yet.
                        useDataStore.setState({ loadedDirectories: new Set() });
                        const fetchPromise = useDataStore.getState().fetchDirectory(null) as Promise<void> | undefined;

                        // If a file update arrives and we have a note open, reload its content
                        // AFTER fetchDirectory finishes (so access_keys in store are fresh).
                        if (data.type === 'file_updated') {
                            const currentActiveId = useDataStore.getState().activeNoteId;
                            const fileIdMatch = data.file_id ? data.file_id === currentActiveId : !!currentActiveId;
                            if (fileIdMatch && currentActiveId) {
                                const dispatch = () => {
                                    const activeFile = [...useDataStore.getState().notes, ...useDataStore.getState().events].find((f: any) => f.id === currentActiveId) as any;
                                    if (!activeFile) return;
                                    // Never reload public files (unencrypted content, no DEK path)
                                    if (activeFile.visibility === 'public') return;
                                    // Never reload own non-shared notes — any file_updated is from our own save
                                    const ak = activeFile.access_keys;
                                    const akObj = ak ? (typeof ak === 'string' ? (() => { try { return JSON.parse(ak); } catch { return {}; } })() : ak) : {};
                                    const isSharedWithOthers = Object.keys(akObj).length > 1 || activeFile.share_status === 'shared';
                                    if (!isSharedWithOthers) return;
                                    window.dispatchEvent(new CustomEvent('tide:sse_reload', { detail: { fileId: currentActiveId } }));
                                };
                                if (fetchPromise?.then) { fetchPromise.then(dispatch); } else { dispatch(); }
                            }
                        }
                    }
                } catch (e) { console.error("SSE Parse Error", e); }
            };

            eventSource.onerror = () => {
                // Close the broken connection and schedule reconnect
                eventSource?.close();
                if (!isClosed) {
                    console.warn(`[SSE] Connection lost. Reconnecting in ${retryDelay / 1000}s…`);
                    retryTimer = setTimeout(() => {
                        retryDelay = Math.min(retryDelay * 2, MAX_RETRY);
                        connect();
                    }, retryDelay);
                }
            };
        };

        connect();

        return () => {
            isClosed = true;
            if (retryTimer) clearTimeout(retryTimer);
            eventSource?.close();
            delete (window as any).__tideSaveTimestamp;
        };
    }, [myId]);

    // SSE content-reload: when another client updates a file we have open, silently update content
    useEffect(() => {
        const handler = async (e: Event) => {
            const { fileId } = (e as CustomEvent).detail;
            if (fileId !== activeNoteId || isLoadingContent || editorContent === null) return;
            // Never overwrite unsaved local changes — user is mid-edit
            if (saveStatusRef.current === 'unsaved') {
                console.log('[SSE] Skipping reload — user has unsaved changes');
                return;
            }
            const ed = editorInstanceRef.current;
            if (!ed) return;

            console.log('[SSE] Silent content reload for open note:', fileId);
            try {
                const freshState = useDataStore.getState();
                if (!freshState.privateKey || !freshState.myId) return;
                const allFiles = [...freshState.notes, ...freshState.events] as any[];
                const target = allFiles.find((f: any) => f.id === fileId);
                if (!target || (target.version ?? 1) < 2 || !target.access_keys) return;

                const cryptoV2 = await import('@/lib/cryptoV2');
                const cryptoLib = await import('@/lib/crypto');
                const accessKeys = typeof target.access_keys === 'string'
                    ? JSON.parse(target.access_keys) : (target.access_keys || {});
                const myAccess = accessKeys[freshState.myId];
                if (!myAccess?.wrapped_key) return;

                const rawDek = await cryptoV2.unwrapDEKData(myAccess.wrapped_key, freshState.privateKey);
                const dek = await cryptoV2.importDEK(rawDek);
                const res = await (await import('@/lib/api')).apiFetch(`/api/v1/files/${fileId}/download`);
                if (!res.ok) return;
                const blobText = await res.text();
                const payload = JSON.parse(blobText);
                if (!payload.data || !payload.iv) return;

                const ivBuf = cryptoLib.base64ToArrayBuffer(payload.iv);
                const dataBuf = cryptoLib.base64ToArrayBuffer(payload.data);
                const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, dek, dataBuf);
                const contentText = new TextDecoder().decode(decrypted);
                const parsed = JSON.parse(contentText);
                // Update editor content in-place — no blank flash
                ed.commands.setContent(parsed, false);
            } catch (err) {
                console.warn('[SSE] Silent reload failed, falling back to full reload:', err);
                loadNoteContent(fileId, fileName);
            }
        };
        window.addEventListener('tide:sse_reload', handler as EventListener);
        return () => window.removeEventListener('tide:sse_reload', handler as EventListener);
    }, [activeNoteId, fileName, isLoadingContent, editorContent]);


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
                                // [FIX] rebuildIndex encrypts a new DEK via RSA-OAEP, which requires
                                // the PUBLIC key (encrypt usage). Passing privateKey here caused
                                // InvalidAccessError: key.usages does not permit this operation.
                                await rebuildIndex(items, publicKey, myId);
                            }
                        } catch (e) {
                            console.error("Index initialization failed", e);
                        }
                    }
                });
            });
        }
    }, [privateKey, publicKey, myId, setKeys, fetchDirectory]);

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

    // Island Welcome Effect
    useEffect(() => {
        if (!enabledExtensions.includes('smart_island')) return;
        if (events.length === 0) return;
        const booted = sessionStorage.getItem('island_boot_done');
        if (booted) return;
        sessionStorage.setItem('island_boot_done', '1');

        const today = new Date();
        const todayEvents = events.filter(e => { try { return isSameDay(new Date(e.start), today); } catch { return false; } });
        const upcomingEvents = todayEvents.filter(e => new Date(e.start) > today).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
        const nextEvent = upcomingEvents[0] ?? null;

        const userName = (() => {
            const sName = sessionStorage.getItem('tide_user_name');
            if (sName) return sName;

            const email = sessionStorage.getItem('tide_user_email') || localStorage.getItem('tide_user_email');
            if (!email) return undefined;
            const rec = localStorage.getItem('tide_user_' + email);
            if (rec) { try { const p = JSON.parse(rec); if (p.username) return p.username as string; } catch { } }
            return email.split('@')[0];
        })();

        if (typeof document !== 'undefined') document.title = `tide - ${userName || 'User'}`;

        const hour = today.getHours();
        let realVariant = 'morning';
        if (hour >= 17) realVariant = 'evening';
        else if (sessionStorage.getItem('tide_returned_today')) realVariant = 'return';
        sessionStorage.setItem('tide_returned_today', '1');

        setTimeout(() => {
            if (enabledExtensions.includes('smart_island') && enabledExtensions.includes('summary')) {
                islandPush({ type: 'welcome', payload: { userName, eventCount: todayEvents.length, variant: realVariant } });
                setTimeout(() => islandPush({ type: 'timeline', payload: { events: todayEvents.map(e => ({ title: e.title, start: e.start })), duration: 5000 } }), 100);
                if (nextEvent) setTimeout(() => islandPush({ type: 'next_event', payload: { event: { title: nextEvent.title, start: nextEvent.start } } }), 200);
            }
        }, 1500);
    }, [events, enabledExtensions, islandPush]);

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

    // ── Text Collector (Sammelbecken): catch typing outside notes ──────────
    const collectorBufferRef = useRef('');
    const collectorActiveRef = useRef(false); // whether the island view is already showing
    const collectorIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { dismiss: islandDismiss } = useIslandStore();

    useEffect(() => {
        if (!enabledExtensions.includes('smart_island')) return;

        const isInputFocused = () => {
            const el = document.activeElement;
            if (!el) return false;
            const tag = el.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
            if ((el as HTMLElement).isContentEditable) return true;
            if (el.closest('.ProseMirror')) return true;
            return false;
        };

        const clearCollector = () => {
            collectorBufferRef.current = '';
            collectorActiveRef.current = false;
            if (collectorIdleTimerRef.current) clearTimeout(collectorIdleTimerRef.current);
            islandDismiss();
        };

        const createNoteFromText = async (noteText: string) => {
            const id = await useDataStore.getState().createNote(
                "",
                {
                    type: 'doc',
                    content: noteText.split('\n').map(line => ({
                        type: 'paragraph',
                        attrs: { blockId: crypto.randomUUID() },
                        content: line ? [{ type: 'text', text: line }] : undefined
                    }))
                }
            );
            
            setOpenTabs(prev => {
                if (prev.find(t => t.id === id)) return prev;
                return [...prev, { id, title: "Untitled", type: 'file' }];
            });
            setActiveTabId(id);

            useDataStore.getState().fetchDirectory(null, true);
            clearCollector();
        };

        const handler = (e: KeyboardEvent) => {
            if (isInputFocused()) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key.length !== 1 && e.key !== 'Backspace' && e.key !== ' ') return;

            e.preventDefault();

            if (e.key === 'Backspace') {
                collectorBufferRef.current = collectorBufferRef.current.slice(0, -1);
                if (collectorBufferRef.current.length === 0) {
                    clearCollector();
                    return;
                }
            } else {
                collectorBufferRef.current += e.key;
            }

            const currentText = collectorBufferRef.current;

            // Push island view on first char (if not already active)
            if (!collectorActiveRef.current && currentText.trim().length >= 1) {
                collectorActiveRef.current = true;
                islandPush({
                    type: 'text_collector',
                    priority: 'DEFAULT',
                    payload: {
                        text: currentText,
                        duration: 120_000, // 2 min idle timeout
                        onCreateNote: createNoteFromText,
                        onCreateEvent: (eventData: { title: string; start: Date; end: Date }) => {
                            window.dispatchEvent(new CustomEvent('tide:collector-create-event', { detail: eventData }));
                            clearCollector();
                        },
                        onDismiss: clearCollector,
                    },
                });
            }

            // Fire real-time update event so the view updates instantly
            window.dispatchEvent(new CustomEvent('tide:collector-update', {
                detail: { text: currentText }
            }));

            // Reset idle timer: if no typing for 60s, auto-dismiss
            if (collectorIdleTimerRef.current) clearTimeout(collectorIdleTimerRef.current);
            collectorIdleTimerRef.current = setTimeout(() => {
                if (collectorBufferRef.current.trim().length === 0) {
                    clearCollector();
                }
            }, 60_000);
        };

        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
            if (collectorIdleTimerRef.current) clearTimeout(collectorIdleTimerRef.current);
        };
    }, [enabledExtensions, islandPush, islandDismiss]);

    // Store Event Listener
    useEffect(() => {
        const h = () => handleNewNote();
        window.addEventListener('dataStore:createNote', h);
        return () => window.removeEventListener('dataStore:createNote', h);
    }, [handleNewNote]);

    const handleLogout = () => {
        sessionStorage.clear();
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
            const privKeyJwkStr = sessionStorage.getItem("tide_session_key") || localStorage.getItem("tide_session_key");
            const token = sessionStorage.getItem("tide_session_token") || localStorage.getItem("tide_session_token");

            if (!email || !userId || !privKeyJwkStr || !token) {
                console.warn("[STATE-AUDIT] Session missing or incomplete.");
                setStatus("ready");
                if (window.location.pathname !== '/auth' && window.location.pathname !== '/login') {
                    sessionStorage.clear();
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
                localStorage.removeItem("tide_session_key");
                localStorage.removeItem("tide_session_token");
                router.push("/auth");
                return;
            }

            try {
                const privKey = await window.crypto.subtle.importKey(
                    "jwk",
                    JSON.parse(privKeyJwkStr),
                    { name: "RSA-OAEP", hash: "SHA-256" },
                    true,
                    ["decrypt"]
                );

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
                            // Initialize content load for ALL open file tabs to ensure they are ready
                            parsed.forEach((t: any) => {
                                if (t.type === 'file' && !t.content && t.id !== activeIdToSet) {
                                    setTimeout(() => {
                                        loadNoteContent(t.id, t.title);
                                    }, 100);
                                }
                            });

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

    useEffect(() => {
        if (!enabledExtensions.includes('smart_island')) return;
        if (events.length === 0) return; // Wait until events are loaded
        const booted = sessionStorage.getItem('island_boot_done');
        if (booted) return;
        sessionStorage.setItem('island_boot_done', '1');

        const today = new Date();
        const todayEvents = events.filter(e => {
            try { return isSameDay(new Date(e.start), today); } catch { return false; }
        });
        const upcomingEvents = todayEvents
            .filter(e => new Date(e.start) > today)
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
        const nextEvent = upcomingEvents[0] ?? null;

        const userName = (() => {
            const email = sessionStorage.getItem('tide_user_email') || localStorage.getItem('tide_user_email');
            if (!email) return undefined;
            const rec = localStorage.getItem('tide_user_' + email);
            if (rec) { try { const p = JSON.parse(rec); if (p.username) return p.username as string; } catch { } }
            return email.split('@')[0];
        })();

        if (typeof document !== 'undefined') {
            document.title = `tide - ${userName || 'User'}`;
        }

        // Calculate real variant for production
        const hour = today.getHours();
        let realVariant = 'morning';
        if (hour >= 17) realVariant = 'evening';
        else if (sessionStorage.getItem('tide_returned_today')) realVariant = 'return';
        sessionStorage.setItem('tide_returned_today', '1');

        // Push only the relevant welcome message
        setTimeout(() => {
            islandPush({ type: 'welcome', payload: { userName, eventCount: todayEvents.length, variant: realVariant } });

            // Next: Timeline (first time only 5s)
            setTimeout(() => {
                islandPush({ type: 'timeline', payload: { events: todayEvents.map(e => ({ title: e.title, start: e.start })), duration: 5000 } });
            }, 100);

            // Finally: Next Event (if any)
            if (nextEvent) {
                setTimeout(() => {
                    islandPush({ type: 'next_event', payload: { event: { title: nextEvent.title, start: nextEvent.start } } });
                }, 200);
            }
        }, 1500);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events, enabledExtensions]);


    const handleDeleteNote = async (e: React.MouseEvent, fileId: string) => {
        e.stopPropagation();
        if (!confirm("Delete this note?")) return;
        try {
            const res = await apiFetch(`/api/v1/files/${fileId}`, { method: "DELETE" });
            if (!res.ok && res.status !== 404) throw new Error("Backend failed to delete note");
            useDataStore.getState().setNotes(files.filter(f => f.id !== fileId) as any);
            
            setOpenTabs(prev => {
                const nextTabs = prev.filter(t => t.id !== fileId);
                localStorage.setItem("tide_open_tabs", JSON.stringify(nextTabs));
                return nextTabs;
            });
            
            if (activeTabId === fileId) {
                handleTabClose(e, fileId);
            }
        } catch (err) { alert("Failed to delete"); }
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

                if (isV2 || target.type === 'folder') {
                    // V2/Folders: direct re-encrypt — no legacy field preservation needed
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

        setShareModalFile({ id: baseId, title: file.title, type: (file as any).type });
    };

    const performShare = async (recipientId: string, recipientEmail: string, recipientPubKeySpki: string, permission: 'view' | 'edit' | 'share' = 'view') => {
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
            );
        }

        // Refresh the directory so the shared file reflects updated state immediately
        useDataStore.getState().fetchDirectory(null);
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
                    useDataStore.getState().setEvents([...useDataStore.getState().events, { id: newFile.id, title, start: meta.start, end: meta.end, allDay: isAllDay, is_task: extraMeta.is_task, linkedTaskId: extraMeta.linkedTaskId }] as any);
                    setActiveEventId(newFile.id);
                    return newFile.id;
                }
            }
        } catch (e) { console.error(e); }
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
                recurrence_rule: ev.recurrence !== 'none' ? `FREQ=${ev.recurrence.toUpperCase()};INTERVAL=1` : undefined
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
                tags: (event as any).tags
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
                linkedTaskId: (event as any).linkedTaskId,
                tags: updates.tags !== undefined ? updates.tags : (event as any).tags
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
                    if (updates.parent_id !== undefined) evt.parent_id = updates.parent_id;
                    return evt;
                }
                return e;
            }));

            // Also update the metadata cache
            useDataStore.getState().updateSpecificMetadataCache(baseId, meta);

            // If theme changed
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

    const switchTabRef = useLatestRef(switchTab);

    useEffect(() => {
        const handleNavigate = (e: Event) => {
            const { noteId } = (e as CustomEvent).detail;
            if (noteId) {
                switchTabRef.current(noteId, 'file');
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
    const handleTabSelect = (id: string, type: 'file' | 'calendar' | 'messages' | 'chat' | 'ext_finance' | 'profile' | 'social') => {
        if (type === 'social') {
            setActiveTabId('social');
            return;
        }
        switchTab(id, type);
    };

    const handleTabClose = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();

        let nextTarget: Tab | null = null;

        setOpenTabs(prev => {
            const filtered = prev.filter(t => t.id !== id);
            if (activeTabId === id) {
                nextTarget = filtered.length > 0 ? filtered[filtered.length - 1] : null;
            }
            return filtered;
        });

        if (activeTabId === id) {
            const targetId = nextTarget ? (nextTarget as Tab).id : 'calendar';
            const targetType = nextTarget ? (nextTarget as Tab).type : 'calendar';
            setActiveTabId(targetId);

            if (targetType === 'file' && nextTarget) {
                setFileName((nextTarget as Tab).title);
                if ((nextTarget as Tab).content) {
                    setEditorContent((nextTarget as Tab).content);
                    setActiveFileKey((nextTarget as Tab)._fileKey || null);
                    setSaveStatus((nextTarget as Tab)._saveStatus || 'saved');
                } else {
                    loadNoteContent(targetId, (nextTarget as Tab).title);
                }
            }
        }
    };

    const handleMagicLinkClick = async (target: any) => {
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
            switchTab('calendar', 'calendar');
            const targetEvent = events.find(e => e.id === target.id);
            if (targetEvent) {
                setCalendarDate(new Date(targetEvent.start));
                setActiveEventId(target.id);
            }

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
        <div className="flex h-screen w-full bg-[var(--background)] text-foreground overflow-hidden">
            {/* Global drag ghost — rendered via Portal so it sits above sidebar/calendar/editor */}
            <EventDragGhost />
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
                onNewEvent={(date: Date) => {
                    setScheduleInitialStart(date);
                    setScheduleModalOpen(true);
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

                        return editorContent === null ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 h-[50vh] mt-20">
                                <span className="font-medium text-sm">Lade...</span>
                            </div>
                        ) : (
                            <Editor
                                key={activeTabId}
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
                                    setActiveCollaborators(users.filter(u => u.id !== myId));
                                }}
                                userProfile={userProfile}
                                onBlocksDeleted={(ids) => setDeletedBlockIds(ids)}
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
            <div className={`hidden md:flex flex-col h-full bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] shrink-0 z-[100] transition-all duration-300 w-64`}>
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
                    onOpenFinance={() => handleFileSelect('ext_finance', 'Finance Tracker')}
                />
            </div>

            {/* Right: Workspace */}
            <div className={`hidden md:flex flex-1 flex-col min-w-0 bg-[var(--background)] relative overflow-hidden`}>

                {/* Avatar-Button oben rechts */}
                <div ref={avatarMenuRef} className="absolute top-4 right-4 z-[150]">
                    <button
                        onClick={() => setIsAvatarMenuOpen(o => !o)}
                        className="w-8 h-8 rounded-full overflow-hidden hover:ring-2 hover:ring-blue-400 transition-all hover:scale-105 active:scale-95"
                        title="Profil"
                    >
                        <Avatar
                            seed={(userProfile?.avatar_seed || userProfile?.user_id || userProfile?.id || myId || 'default') + (userProfile?.avatar_salt || '')}
                            size={32}
                        />
                    </button>

                    {isAvatarMenuOpen && (
                        <div className="absolute right-0 top-10 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-100">
                            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{userProfile?.username || 'User'}</p>
                                <p className="text-xs text-gray-400 truncate">{userProfile?.email || ''}</p>
                            </div>
                            <div className="py-1 px-1">
                                <button
                                    onClick={() => { setIsAvatarMenuOpen(false); setActiveTabId('social'); }}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                >
                                    <Users size={15} className="text-gray-400" />
                                    <span>Social</span>
                                </button>
                                <button
                                    onClick={() => { setIsAvatarMenuOpen(false); useDataStore.getState().setSettingsModalOpen(true); }}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                >
                                    <Settings size={15} className="text-gray-400" />
                                    <span>Einstellungen</span>
                                </button>
                                <div className="h-px bg-gray-100 dark:bg-gray-800 my-1" />
                                <button
                                    onClick={() => {
                                        setIsAvatarMenuOpen(false);
                                        sessionStorage.clear();
                                        localStorage.removeItem('tide_user_email');
                                        localStorage.removeItem('tide_user_id');
                                        localStorage.removeItem('tide_session_token');
                                        window.location.reload();
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                                >
                                    <LogOut size={15} className="text-rose-400" />
                                    <span>Abmelden</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Unscheduled Tasks Panel — top-left corner, below calendar toolbar, only when calendar is active */}
                {activeTabId === 'calendar' && tasks && tasks.filter(t => !t.isCompleted && !t.scheduledDate).length > 0 && (
                    <div className="absolute left-16 top-[52px] z-[55] pointer-events-none flex flex-col max-h-[calc(100%-60px)]">
                        <div className="flex flex-col gap-1.5 p-2 overflow-y-auto pointer-events-none max-h-full">
                            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 px-1 pointer-events-none">Tasks</h3>
                            {tasks.filter(t => !t.isCompleted && !t.scheduledDate).map(t => (
                                <div
                                    key={t.id}
                                    draggable
                                    className="bg-white/90 dark:bg-[#1c1c1c]/95 backdrop-blur-sm border border-gray-200/80 dark:border-white/10 px-2.5 py-1.5 rounded-xl shadow-sm cursor-grab active:cursor-grabbing flex gap-1.5 items-center transition-all hover:shadow-md hover:-translate-y-0.5 pointer-events-auto w-48 group"
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', t.id);
                                        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'task', id: t.id }));
                                    }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" className="shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" /></svg>
                                    <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 leading-tight truncate flex-1">{t.title}</span>
                                    <button
                                        title="Delete task"
                                        className="opacity-0 group-hover:opacity-100 ml-auto shrink-0 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-all"
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); deleteTask(t.id); }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
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
                            const parentId = e.parent_id || 'general-theme';
                            if (!e.parent_id) return !hiddenThemeIds.includes('general-theme');
                            return !hiddenThemeIds.includes(parentId);
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
                        onCreateEventGroup={handleCreateEventGroup}
                        onScheduleApply={handleScheduleApply}
                        onOpenScheduleThemes={() => setIsThemeMenuOpen(v => !v)}
                    />
                </div>



                <div className={`absolute inset-0 z-10 bg-[var(--background)] ${activeTabId === 'ext_finance' ? 'block' : 'hidden'}`}>
                    {enabledExtensions.includes('finance') ? <FinanceDashboard /> : null}
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

                <div className={`flex-1 min-h-0 relative overflow-y-auto ${activeTabId === 'calendar' || activeTabId === 'messages' || activeTabId === 'social' || activeTabId.startsWith('chat-') || activeTabId === 'ext_finance' || activeTabId.startsWith('profile:') ? 'hidden' : 'block'}`}>
                    {isLoadingContent ? (
                        <div className="flex items-center justify-center h-full text-gray-400">Loading content...</div>
                    ) : (
                        <div className={`mx-auto min-h-[500px] py-12 px-8 lg:px-24 transition-all duration-300 ${noteLayout === 'thin' ? 'max-w-2xl' :
                                noteLayout === 'normal' ? 'max-w-4xl' :
                                    noteLayout === 'wide' ? 'max-w-6xl' : 'max-w-full'
                            }`}>
                            <CanvasLayer
                                elements={canvasSidecar.elements}
                                isLoaded={canvasSidecar.isLoaded}
                                publicKey={publicKey}
                                privateKey={privateKey}
                                userId={myId}
                                noteId={activeNoteId}
                                deletedBlockIds={deletedBlockIds}
                                pendingBindBlockId={pendingBindBlockId}
                                onBindingComplete={() => setPendingBindBlockId(null)}
                                onElementMove={(id, ox, oy) => canvasSidecar.updateElement(id, { offsetX: ox, offsetY: oy })}
                                onElementAdd={canvasSidecar.addElement}
                                onElementRemove={canvasSidecar.removeElement}
                                onUpdate={canvasSidecar.updateElement}
                                onSaveAll={canvasSidecar.save}
                                hoveredElementId={hoveredElementId}
                                setHoveredElementId={setHoveredElementId}
                                isLinkingMode={isLinkingMode}
                                activeLinkBlockId={activeLinkBlockId}
                                onLinkingComplete={() => {
                                    setIsLinkingMode(false);
                                    setActiveLinkBlockId(null);
                                }}
                                onInsertAnchor={(x, y) => {
                                    if (!editorInstance) return null;
                                    try {
                                        // Attempt to find the nearest valid position in the document
                                        const pos = editorInstance.view.posAtCoords({ left: x, top: y });
                                        if (!pos) return null;

                                        const anchorId = crypto.randomUUID();

                                        // Focus the editor to ensure the transaction applies correctly
                                        editorInstance.commands.focus();

                                        editorInstance.chain()
                                            .insertContentAt(pos.pos, {
                                                type: 'anchor',
                                                attrs: { anchorId }
                                            })
                                            .run();

                                        return anchorId;
                                    } catch (e) {
                                        console.error("[Canvas] Failed to insert anchor", e);
                                        return null;
                                    }
                                }}
                            >
                                <div className={`w-full mx-auto flex flex-row items-start min-h-[500px] py-12 px-4 sm:px-8 note-layout-${noteLayout || 'normal'}`}>
                                    <EditorGutter
                                        elements={canvasSidecar.elements}
                                        onPinClick={(bid) => {
                                            if (isLinkingMode && activeLinkBlockId === bid) {
                                                setIsLinkingMode(false);
                                                setActiveLinkBlockId(null);
                                            } else {
                                                setIsLinkingMode(true);
                                                setActiveLinkBlockId(bid);
                                            }
                                        }}
                                        activeLinkBlockId={activeLinkBlockId}
                                        hoveredElementId={hoveredElementId}
                                        hoveredBlockId={hoveredBlockId}
                                        isLinkingMode={isLinkingMode}
                                        contentVersion={editorVersion}
                                    />
                                    <div className="flex-1 min-w-0 flex flex-col">
                                        {activeNoteId && openTabs.find(t => t.id === activeNoteId && t.type === 'file') && (
                                            <>
                                                {(() => {
                                                    const af = files.find(f => f.id === activeNoteId) as any;
                                                    if (af && af.permission === 'view') {
                                                        return (
                                                            <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs py-2 px-4 rounded-lg flex items-center justify-center gap-2 mb-4 animate-in fade-in slide-in-from-top-4">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                                                Du hast nur Lesezugriff auf dieses Dokument
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                                
                                                {/* Active Collaborators Avatars */}
                                                {activeCollaborators.length > 0 && (
                                                    <div className="flex items-center gap-2 mb-2">
                                                        {activeCollaborators.map(u => (
                                                            <div key={u.id} className="relative group" title={`${u.name} (Aktiv)`}>
                                                                <div className="w-8 h-8 rounded-full border-2 overflow-hidden shadow-sm transition-transform hover:scale-110" style={{ borderColor: u.color }}>
                                                                    <Avatar seed={u.seed} size={28} />
                                                                </div>
                                                                <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-50">
                                                                    {u.name}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                <div className="flex items-center gap-2 mb-6">
                                                    <input
                                                        type="text"
                                                        autoFocus
                                                        value={fileName}
                                                        onChange={(e) => {
                                                            const newTitle = e.target.value;
                                                            setFileName(newTitle);
                                                            // Mark as unsaved so the debounced triggerSave fires
                                                            // and writes the new title into secured_meta + content blob
                                                            setSaveStatus('unsaved');
                                                            if (activeNoteId) {
                                                                useDataStore.getState().setNotes(useDataStore.getState().notes.map(f => f.id === activeNoteId ? { ...f, title: newTitle } as any : f));
                                                                // Keep openTabs (Recent) in sync with every keystroke
                                                                setOpenTabs(prev => prev.map(t => t.id === activeNoteId ? { ...t, title: newTitle } : t));
                                                            }
                                                        }}
                                                        onBlur={(e) => {
                                                            if (activeNoteId) {
                                                                // Fast-path: update only secured_meta immediately on blur
                                                                // Full content save is handled by the debounced auto-save above
                                                                submitRename(activeNoteId, e.target.value);
                                                            }
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                editorInstance?.commands.focus();
                                                            }
                                                        }}
                                                        placeholder="Untitled Note"
                                                        className="text-4xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-700 pb-1 leading-normal overflow-visible flex-1"
                                                    />
                                                    <div className="flex items-center gap-1 shrink-0 self-end mb-2">
                                                        <button
                                                            onClick={() => setShowBackups(true)}
                                                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400 hover:text-indigo-600 transition-colors"
                                                            title="Versionsverlauf / Backups"
                                                        >
                                                            <Clock size={16} />
                                                        </button>
                                                        <button
                                                            onClick={handleExportNote}
                                                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400 hover:text-indigo-600 transition-colors"
                                                            title="Exportieren (.md)"
                                                        >
                                                            <Download size={16} />
                                                        </button>
                                                        {/* Save status indicator */}
                                                        <div className="relative flex items-center justify-center">
                                                            <button
                                                                onClick={() => {
                                                                    const af = files.find(f => f.id === activeNoteId) as any;
                                                                    const isRecipient = af?.share_status === 'shared';
                                                                    const ak = af?.access_keys;
                                                                    const akObj = ak ? (typeof ak === 'string' ? JSON.parse(ak) : ak) : {};
                                                                    const isSharedByOwner = Object.keys(akObj).length > 1;
                                                                    const isShared = isRecipient || isSharedByOwner;
                                                                    if (isShared) {
                                                                        setShowSharePanel(!showSharePanel);
                                                                    }
                                                                }}
                                                                title={saveStatus === 'saved' ? (() => { const af = files.find(f => f.id === activeNoteId) as any; const ak = af?.access_keys; const akObj = ak ? (typeof ak === 'string' ? JSON.parse(ak) : ak) : {}; return (af?.share_status === 'shared' || Object.keys(akObj).length > 1) ? 'Synced - Klick für Zugriff' : 'Gespeichert'; })() : saveStatus === 'saving' ? 'Wird gespeichert…' : 'Nicht gespeichert'}
                                                                className={`p-1.5 rounded-lg transition-colors ${saveStatus === 'saved' && (() => { const af = files.find(f => f.id === activeNoteId) as any; const ak = af?.access_keys; const akObj = ak ? (typeof ak === 'string' ? JSON.parse(ak) : ak) : {}; return (af?.share_status === 'shared' || Object.keys(akObj).length > 1); })() ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800' : 'cursor-default'}`}
                                                            >
                                                                {saveStatus === 'saved' && (() => {
                                                                    const af = files.find(f => f.id === activeNoteId) as any;
                                                                    const isRecipient = af?.share_status === 'shared';
                                                                    const ak = af?.access_keys;
                                                                    const akObj = ak ? (typeof ak === 'string' ? JSON.parse(ak) : ak) : {};
                                                                    const isSharedByOwner = Object.keys(akObj).length > 1;
                                                                    const isShared = isRecipient || isSharedByOwner;
                                                                    return (
                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isShared ? "text-sky-400 opacity-70 hover:opacity-100" : "text-green-400 opacity-60"}>
                                                                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                                                            <polyline points="22 4 12 14.01 9 11.01" />
                                                                        </svg>
                                                                    );
                                                                })()}
                                                                {saveStatus === 'saving' && (
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400 opacity-60 animate-spin">
                                                                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                                                    </svg>
                                                                )}
                                                                {saveStatus === 'unsaved' && (
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 opacity-70">
                                                                        <circle cx="12" cy="12" r="10" />
                                                                        <line x1="12" y1="8" x2="12" y2="12" />
                                                                        <line x1="12" y1="16" x2="12.01" y2="16" />
                                                                    </svg>
                                                                )}
                                                            </button>
                                                            {showSharePanel && <ShareManagementPanel fileId={activeNoteId} onClose={() => setShowSharePanel(false)} />}
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {(() => {
                                            const activeFileType = files.find(f => f.id === activeNoteId)?.type;

                                            if (activeFileType === 'canvas') {
                                                return (
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

                                            return (
                                                <Editor
                                                    key={activeTabId}
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
                                                    onBlocksDeleted={(ids) => setDeletedBlockIds(ids)}
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
                                        })()}
                                    </div>
                                </div>
                            </CanvasLayer>
                        </div>
                    )}
                </div>
            </div>            {/* Theme Menu Dropdown — appears from top-right near toolbar when triggered from CalendarView */}
            {activeTabId === 'calendar' && isThemeMenuOpen && (
                <div 
                    className="hidden md:block fixed top-16 right-6 z-[500] w-72 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-100 p-4 animate-in fade-in slide-in-from-top-2 duration-200"
                    onMouseLeave={() => setIsThemeMenuOpen(false)}
                >
                    <div className="flex items-center justify-between mb-4 px-1">
                        <span className="font-semibold text-gray-900 text-sm tracking-tight">Schedule Themes</span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => handleCreateEventGroup()}
                                className="p-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg transition-all"
                                title="New Theme"
                            >
                                <Plus size={16} strokeWidth={2.5} />
                            </button>
                            <button
                                onClick={() => setIsThemeMenuOpen(false)}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-col gap-3 max-h-80 overflow-y-auto no-scrollbar pr-1">
                        {files.filter(f => f.type === 'folder' && f.isGroup).map(group => (
                            <ThemeItem
                                key={group.id}
                                group={group}
                                hiddenThemeIds={hiddenThemeIds}
                                onToggleVisibility={handleToggleThemeVisibility}
                                onUpdate={handleUpdateEventGroup}
                                onShare={handleShare}
                                onDelete={(e: any, id: string, title: string) => {
                                    if (confirm(`Delete theme "${title}"? This won't delete events in it.`)) {
                                        handleDeleteNote(e, id);
                                    }
                                }}
                            />
                        ))}
                        {files.filter(f => f.type === 'folder' && f.isGroup).length === 0 && (
                            <div className="text-xs text-gray-400 text-center py-6 leading-relaxed">
                                No themes defined.<br />Create one to group subjects!
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Share Modal */}
            {shareModalFile && (
                <ShareModal
                    fileId={shareModalFile.id}
                    fileName={shareModalFile.title}
                    onClose={() => setShareModalFile(null)}
                    onShare={performShare}
                    myId={myId}
                />
            )}

            <SettingsModal
                isOpen={isSettingsModalOpen}
                onClose={() => setSettingsModalOpen(false)}
                enabledExtensions={enabledExtensions}
                onToggleExtension={handleToggleExtension}
                userProfile={userProfile || undefined}
                onLogout={handleLogout}
                noteLayout={noteLayout}
                onSetNoteLayout={setNoteLayout}
            />

            <ScheduleModal
                isOpen={scheduleModalOpen}
                onClose={() => setScheduleModalOpen(false)}
                onApply={handleScheduleApply}
                existingThemes={files?.filter(f => f.type === 'folder' && f.isGroup).map(g => ({ id: g.id, title: g.title, effect: g.effect, color: (g as any).color })) || []}
            />

            <DailySummary
                isOpen={isSummaryOpen}
                onClose={() => setIsSummaryOpen(false)}
                streak={streak}
                eventsToday={summaryStats.events}
                completedTasksToday={summaryStats.tasks}
            />

            {showBackups && activeNoteId && (
                <BackupHistory
                    fileId={activeNoteId}
                    onCancel={() => setShowBackups(false)}
                    onRestore={(content) => {
                        editorInstance?.commands.setContent(content);
                        setShowBackups(false);
                        // Trigger a save with the restored content
                        const currentFile = files.find(f => f.id === activeNoteId);
                        if (currentFile) {
                            setSaveStatus("saving");
                            performSave(content, activeNoteId, activeFileKey, currentFile.visibility)
                                .then(() => setSaveStatus("saved"))
                                .catch(() => setSaveStatus("unsaved"));
                        }
                    }}
                />
            )}
        </div>

    );
}