
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import * as cryptoLib from "@/lib/crypto";
import Editor from "@/components/Editor";
import ChatPanel from "@/components/Chat/ChatPanel";
import Sidebar from "@/components/Layout/Sidebar";
import TabList, { Tab } from "@/components/Layout/TabList";
import CalendarView from "@/components/Calendar/CalendarView";
import WeekView from "@/components/Calendar/WeekView";
import ShareModal from "@/components/ShareModal";
import CanvasLayer from "@/components/Canvas/CanvasLayer";
import SettingsModal from "@/components/Settings/SettingsModal";
import dynamic from 'next/dynamic';
import DailySummary from "@/components/Calendar/DailySummary";


const FinanceDashboard = dynamic(() => import('@/components/Finance/FinanceDashboard'), {
    loading: () => <div className="flex-1 flex items-center justify-center p-8 text-gray-400">Loading module...</div>
});
import EditorGutter from "@/components/Canvas/EditorGutter";
import { useStyleFile } from "@/components/Canvas/useStyleFile";
import { TextWidgetElement } from "@/types/canvas";
import { useHighlight } from "@/components/HighlightContext";
import { CheckCircle2, Loader2, Plus, ChevronDown, Share } from 'lucide-react';
import { useIslandStore } from '@/components/extensions/smart_island/useIslandStore';
import { isSameDay } from 'date-fns';
import { useDataStore } from "@/store/useDataStore";

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



export default function Dashboard() {
    // -------------------------------------------------------------------------
    // 0. State & Initialization
    // -------------------------------------------------------------------------

    // Auth State
    const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
    const [publicKey, setPublicKey] = useState<CryptoKey | null>(null);
    const [myId, setMyId] = useState<string>("");
    const [userEmail, setUserEmail] = useState<string>("");
    const router = useRouter();
    const [status, setStatus] = useState<"loading" | "ready">("loading");

    // UI/Navigation State
    const [openTabs, setOpenTabs] = useState<Tab[]>([{ id: 'calendar', title: 'Calendar', type: 'calendar' }]);
    const [activeTabId, setActiveTabId] = useState<string>('calendar');

    // Sync tabs layout changes to localStorage
    useEffect(() => {
        if (status === 'ready' && openTabs.length > 0) {
            const minifiedTabs = openTabs.map(t => ({ id: t.id, type: t.type, title: t.title }));
            localStorage.setItem('tide_open_tabs', JSON.stringify(minifiedTabs));
            localStorage.setItem('tide_active_tab_id', activeTabId);
        }
    }, [openTabs, activeTabId, status]);

    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // Extensions & Settings
    const [enabledExtensions, setEnabledExtensions] = useState<string[]>([]);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [userProfile, setUserProfile] = useState<{ username: string; email: string } | null>(null);

    const handleLogout = () => {
        sessionStorage.clear();
        localStorage.removeItem("tide_session_key");
        localStorage.removeItem("tide_user_id");
        localStorage.removeItem("tide_user_email");
        router.push("/auth");
    };

    // Hydrate extension state immediately to prevent layout jumps
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('tide_enabled_extensions');
            if (saved) {
                try {
                    setEnabledExtensions(JSON.parse(saved));
                } catch (e) { }
            }
        }
    }, []);

    useEffect(() => {
        if (!myId) return;
        const fetchExtensions = async () => {
            try {
                const res = await fetch("/api/v1/user/extensions", {
                    headers: { "X-User-ID": myId }
                });
                if (res.ok) {
                    const data = await res.json();
                    const exts = data.enabled_extensions || [];
                    setEnabledExtensions(exts);
                    localStorage.setItem('tide_enabled_extensions', JSON.stringify(exts));
                }
            } catch (e) {
                console.error("Failed to load extensions", e);
            }
        };
        fetchExtensions();
    }, [myId]);

    const handleToggleExtension = async (extensionId: string, enabled: boolean) => {
        // Optimistic UI update
        setEnabledExtensions(prev => {
            const next = enabled ? [...prev, extensionId] : prev.filter(e => e !== extensionId);
            localStorage.setItem('tide_enabled_extensions', JSON.stringify(next));
            return next;
        });

        // Cleanup open tabs if disabled
        if (!enabled) {
            if (activeTabId === `ext_${extensionId}`) {
                setActiveTabId('calendar');
            }
            setOpenTabs(prev => prev.filter(t => t.id !== `ext_${extensionId}`));
        }

        try {
            await fetch("/api/v1/user/extensions", {
                method: "PUT",
                headers: { "Content-Type": "application/json", "X-User-ID": myId },
                body: JSON.stringify({ extension: extensionId, enabled })
            });
        } catch (e) {
            console.error("Failed to toggle extension", e);
        }
    };

    // Share Modal State
    const [shareModalFile, setShareModalFile] = useState<{ id: string, title: string } | null>(null);

    // Data State
    const [files, setFiles] = useState<DecryptedFile[]>([]);
    const [calendarDate, setCalendarDate] = useState(new Date());

    // Streak & Summary State
    const [streak, setStreak] = useState(0);
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);
    const [summaryStats, setSummaryStats] = useState({ events: 0, tasks: 0 });
    const [events, setEvents] = useState<CalendarEvent[]>([]);


    useEffect(() => {
        if (status !== 'ready') return;

        const lastVisit = localStorage.getItem('tide_last_visit');
        const today = new Date().toISOString().split('T')[0];
        const savedStreak = parseInt(localStorage.getItem('tide_streak') || '0');

        if (lastVisit === today) {
            setStreak(savedStreak);
        } else {
            let nextStreak = 1;
            if (lastVisit) {
                const lastDate = new Date(lastVisit);
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];

                if (lastVisit === yesterdayStr) {
                    nextStreak = savedStreak + 1;
                }
            }

            localStorage.setItem('tide_last_visit', today);
            localStorage.setItem('tide_streak', nextStreak.toString());
            setStreak(nextStreak);

            // Calculate stats for summary
            const todayEvents = events.filter(e => {
                const start = new Date(e.start);
                return start.toISOString().split('T')[0] === today;
            }).length;
            setSummaryStats({ events: todayEvents, tasks: 0 }); // Tasks can be added later

            // Show summary if extension enabled
            if (enabledExtensions.includes('summary')) {
                setIsSummaryOpen(true);
            }
        }
    }, [status, enabledExtensions, events]);



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

            const res = await fetch("/api/v1/files", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-User-ID": myId },
                body: JSON.stringify({
                    type: "folder",
                    parent_id: parentId,
                    public_meta: {},
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

            setFiles(prev => [...prev, decFolder]);
            setEditingFileId(newFolder.id); // Rename immediately

        } catch (e) {
            console.error(e);
            alert("Failed to create folder");
        }
    };

    const handleCreateEventGroup = async () => {
        if (!privateKey || !publicKey) return;
        const title = "New Group";
        const effect = "none";
        try {
            const meta = { title, isGroup: true, effect };
            const securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);

            const res = await fetch("/api/v1/files", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-User-ID": myId },
                body: JSON.stringify({
                    type: "folder",
                    parent_id: null,
                    public_meta: {},
                    secured_meta: Array.from(new Uint8Array(cryptoLib.base64ToArrayBuffer(securedMeta))),
                    visibility: 'private'
                })
            });

            if (!res.ok) throw new Error("Failed to create event group");
            const newFolder = await res.json();

            const decFolder: DecryptedFile = {
                id: newFolder.id,
                title: title,
                type: 'folder',
                size: 0,
                updated_at: new Date().toISOString(),
                secured_meta: newFolder.secured_meta,
                share_status: 'owner',
                visibility: 'private',
                parent_id: null,
                isGroup: true,
                effect: effect
            };

            setFiles(prev => [...prev, decFolder]);
        } catch (e) {
            console.error(e);
            alert("Failed to create event group");
        }
    };

    const handleUpdateEventGroup = async (id: string, updates: { title?: string, effect?: string }) => {
        if (!privateKey || !publicKey) return;
        try {
            const group = files.find(f => f.id === id);
            if (!group || !group.secured_meta) return;

            const meta = await cryptoLib.decryptMetadata(group.secured_meta, privateKey);
            if (updates.title !== undefined) meta.title = updates.title;
            if (updates.effect !== undefined) meta.effect = updates.effect;

            const encryptedMeta = await cryptoLib.encryptMetadata(meta, publicKey);

            await fetch(`/api/v1/files/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "X-User-ID": myId },
                body: JSON.stringify({ secured_meta: Array.from(new Uint8Array(cryptoLib.base64ToArrayBuffer(encryptedMeta))) })
            });

            setFiles(prev => prev.map(f => f.id === id ? { ...f, title: meta.title as string, effect: meta.effect as string } : f));
        } catch (e) {
            console.error("Failed to update group", e);
        }
    };

    const handleMoveFile = async (fileId: string, newParentId: string | null) => {
        // Optimistic
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, parent_id: newParentId } : f));

        try {
            await fetch(`/api/v1/files/${fileId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "X-User-ID": myId },
                body: JSON.stringify({ parent_id: newParentId || "" })
            });
        } catch (e) {
            console.error("Move failed", e);
            alert("Failed to move item");
            loadFilesAndEvents();
        }
    };



    // Layout State
    // (activeTabId and openTabs moved to top level for sync hook)

    // Removed Link Selection Routing at user request

    // Editor State
    const [editorContent, setEditorContent] = useState<any>(null);
    const [isLoadingContent, setIsLoadingContent] = useState(false);
    const [activeFileKey, setActiveFileKey] = useState<CryptoKey | null>(null);
    const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "saving">("saved");
    const [fileName, setFileName] = useState("");

    // Theme Visibility State
    const [hiddenThemeIds, setHiddenThemeIds] = useState<string[]>([]);
    const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

    // Event Dock State
    const [activeEventId, setActiveEventId] = useState<string | null>(null);
    const [pinnedEventIds, setPinnedEventIds] = useState<string[]>([]);
    const [minimizedEventIds, setMinimizedEventIds] = useState<string[]>([]);

    // Canvas / Sidecar state
    const [deletedBlockIds, setDeletedBlockIds] = useState<string[]>([]);
    const [editorInstance, setEditorInstance] = useState<any>(null);

    useEffect(() => {
        const handleInsertMention = (e: any) => {
            const { noteId, targetId, title } = e.detail;
            if (editorInstance && activeTabId === noteId) {
                editorInstance.chain()
                    .focus()
                    .insertContent({
                        type: 'mention',
                        attrs: { id: targetId, label: title }
                    })
                    .insertContent(' ')
                    .run();
                console.log(`[CrossLink] Inserted mention of ${targetId} into note ${noteId}`);
            }
        };
        window.addEventListener('dataStore:insertMention', handleInsertMention);
        return () => window.removeEventListener('dataStore:insertMention', handleInsertMention);
    }, [editorInstance, activeTabId]);
    const activeNoteId = (activeTabId !== 'calendar' && activeTabId !== 'messages' && !activeTabId.startsWith('chat-'))
        ? activeTabId
        : null;
    const canvasSidecar = useStyleFile({
        noteId: activeNoteId,
        userId: myId,
        privateKey,
        publicKey,
    });

    const [pendingBindBlockId, setPendingBindBlockId] = useState<string | null>(null);

    // Pin System Pivot State
    const [isLinkingMode, setIsLinkingMode] = useState(false);
    const [activeLinkBlockId, setActiveLinkBlockId] = useState<string | null>(null);
    const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
    const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
    const [editorVersion, setEditorVersion] = useState(0);

    // Abort Linking Mode logic
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isLinkingMode) {
                setIsLinkingMode(false);
                setActiveLinkBlockId(null);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isLinkingMode]);

    // Listen for right-click "Change anchor" requests from canvas elements
    useEffect(() => {
        const handler = (e: Event) => {
            // elementId is available in detail but we don't need it here;
            // binding mode is activated and the user then selects text → Connect
            setPendingBindBlockId('__pending_rebind__');
        };
        window.addEventListener('canvas:requestRebind', handler);
        return () => window.removeEventListener('canvas:requestRebind', handler);
    }, []);

    const handleToggleThemeVisibility = (themeId: string) => {
        setHiddenThemeIds(prev => prev.includes(themeId) ? prev.filter(id => id !== themeId) : [...prev, themeId]);
    };

    // -------------------------------------------------------------------------
    // 1. Session & Initialization
    // -------------------------------------------------------------------------
    useEffect(() => {
        const restoreSession = async () => {
            // 1. Retrieve Config (Try Session first, then Local)
            const email = sessionStorage.getItem("tide_user_email") || localStorage.getItem("tide_user_email");
            const userId = sessionStorage.getItem("tide_user_id") || localStorage.getItem("tide_user_id");
            const privKeyJwkStr = sessionStorage.getItem("tide_session_key") || localStorage.getItem("tide_session_key");

            if (!email || !userId || !privKeyJwkStr) {
                if (window.location.pathname !== '/auth') {
                    router.push("/auth");
                }
                return;
            }

            // 2. Retrieve Public Key (from User Record)
            let pubKeySpkiStr = "";
            try {
                // Try localStorage first (Persistent)
                const userRecordStr = localStorage.getItem("tide_user_" + email);
                if (userRecordStr) {
                    const record = JSON.parse(userRecordStr);
                    pubKeySpkiStr = record.public_key;
                }

                // Fallback: Check sessionStorage (Ephemeral from Login)
                if (!pubKeySpkiStr) {
                    const sessionPubKey = sessionStorage.getItem("tide_user_public_key");
                    if (sessionPubKey) pubKeySpkiStr = sessionPubKey;
                }
            } catch (e) { console.error("Error reading user record", e); }

            if (!pubKeySpkiStr) {
                console.error("Public key not found for user", email);
                router.push("/auth");
                return;
            }

            try {
                // 3. Import Keys
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
                setMyId(userId);
                setUserEmail(email);
                setUserProfile({ username: email.split('@')[0], email: email }); // Default for now
                setStatus("ready");

                // Persistence: Restore tabs
                const savedTabs = localStorage.getItem("tide_open_tabs");
                const savedActiveId = localStorage.getItem("tide_active_tab_id");

                if (savedTabs) {
                    try {
                        if (savedTabs === 'undefined' || savedTabs === 'null' || savedTabs === '[object Object]') throw new Error("Corrupt tabs payload");

                        const parsed = JSON.parse(savedTabs);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            // Validate with server
                            fetch('/api/v1/tabs/validate', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'X-User-ID': userId
                                },
                                body: JSON.stringify(parsed)
                            })
                                .then(res => res.json())
                                .then(validTabs => {
                                    if (validTabs && validTabs.length > 0) {
                                        setOpenTabs(validTabs);

                                        // Check if active tab is still valid
                                        const validActive = validTabs.find((t: any) => t.id === savedActiveId);
                                        if (validActive) {
                                            setActiveTabId(validActive.id);
                                        } else {
                                            setActiveTabId(validTabs[0].id);
                                        }
                                    } else {
                                        // Server returned empty array (validation failed for all)
                                        console.warn("All tabs failed validation, falling back to empty state.");
                                        setOpenTabs([]);
                                        setActiveTabId('calendar');
                                        localStorage.removeItem('tide_open_tabs');
                                        localStorage.removeItem('tide_active_tab_id');
                                    }
                                })
                                .catch(e => {
                                    console.error("Validation API failed, falling back", e);
                                    // On offline/network error, we still try to load them 
                                    // (Decryption will naturally fail if unauthorized)
                                    setOpenTabs(parsed);
                                    if (savedActiveId) setActiveTabId(savedActiveId);
                                });
                        }
                    } catch (e) {
                        console.error("Critical Error: Corrupted JSON in tide_open_tabs, resetting UI.", e);
                        localStorage.removeItem('tide_open_tabs');
                        localStorage.removeItem('tide_active_tab_id');
                        setOpenTabs([]);
                        setActiveTabId('calendar');
                    }
                }

                const savedDate = localStorage.getItem("tide_calendar_date");
                if (savedDate) {
                    try { setCalendarDate(new Date(savedDate)); }
                    catch (e) { console.error("Restore date failed", e); }
                }

            } catch (e) {
                console.error("Session restore failed:", e);
                router.push("/auth");
            }
        };

        restoreSession();
    }, [router]);

    // ...

    // -------------------------------------------------------------------------
    // 2. Data Loading (Files & Events)
    // -------------------------------------------------------------------------
    const loadFilesAndEvents = useCallback(async () => {
        if (!privateKey) return;
        try {
            const finalId = myId;
            const url = finalId ? `/api/v1/files?user_id=${finalId}&recursive=true` : "/api/v1/files?recursive=true";
            const res = await fetch(url);
            if (!res.ok) throw new Error("Failed to fetch files");

            interface RawFile {
                id: string;
                visibility?: string;
                parent_id?: string | null;
                public_meta?: { title?: string };
                secured_meta?: string;
                type: string;
                updated_at: string;
                size: number;
                owner_id: string;
                owner_email?: string;
                share_status?: string;
                is_task?: boolean | number;
                is_completed?: boolean | number;
            }
            const allFiles = await res.json() as RawFile[];

            if (!Array.isArray(allFiles)) {
                setFiles([]);
                setEvents([]);
                return;
            }

            const decryptedFiles: DecryptedFile[] = [];
            const decryptedEvents: CalendarEvent[] = [];

            for (const f of allFiles) {
                try {
                    let title = "Untitled";
                    let visibility = f.visibility || 'private';
                    let meta: Record<string, unknown> = {};
                    const parentId = f.parent_id || null; // Capture ParentID
                    let color: string | undefined = undefined;

                    // Decrypt Metadata
                    if (visibility === 'public') {
                        if (f.public_meta && f.public_meta.title) title = f.public_meta.title;
                    } else if (f.secured_meta) {
                        // ... (Decrypt)
                        try {
                            meta = await cryptoLib.decryptMetadata(f.secured_meta, privateKey);
                            if (typeof meta.title === 'string') title = meta.title;
                            if (typeof meta.color === 'string') color = meta.color;
                        } catch (e) {
                            console.warn("Failed to decrypt meta for", f.id);
                        }
                    }

                    if (f.type === 'event') {
                        decryptedEvents.push({
                            id: f.id,
                            title,
                            start: (meta.start as string) || new Date().toISOString(),
                            end: (meta.end as string) || new Date().toISOString(),
                            color: meta.color as string | undefined,
                            description: meta.description as string | undefined,
                            secured_meta: f.secured_meta,
                            share_status: f.share_status || 'owner',
                            parent_id: parentId,
                            allDay: meta.allDay as boolean | undefined,
                            // is_task / is_completed are DB-level (not encrypted), read directly from API
                            is_task: !!f.is_task,
                            is_completed: !!f.is_completed,
                        });
                    } else {
                        decryptedFiles.push({
                            id: f.id,
                            title,
                            type: f.type,
                            size: f.size,
                            updated_at: f.updated_at,
                            secured_meta: f.secured_meta,
                            share_status: f.share_status || 'owner',
                            visibility,
                            parent_id: parentId,
                            color,
                            isGroup: meta.isGroup as boolean | undefined,
                            effect: meta.effect as string | undefined
                        });
                    }
                } catch (e) { console.warn("Error processing file", f.id, e); }
            }

            // Filter out pending shares from main view
            const visibleFiles = decryptedFiles.filter(f => (f.share_status || 'owner') !== 'pending');
            const visibleEvents = decryptedEvents.filter(e => (e.share_status || 'owner') !== 'pending');
            setFiles(visibleFiles);
            setEvents(visibleEvents);
        } catch (e) {
            console.error("Load failed", e);
        }
    }, [privateKey, myId]);


    useEffect(() => {
        if (privateKey) {
            loadFilesAndEvents();
            // Load sidebar order
            if (myId) {
                fetch('/api/v1/files/sidebar_order.info', {
                    headers: { 'X-User-ID': myId }
                })
                    .then(res => {
                        if (!res.ok) return null;
                        return res.json();
                    })
                    .then(data => {
                        if (data && data.order) {
                            const { setOrderedNoteIds } = (require('@/store/useDataStore') as typeof import('@/store/useDataStore')).useDataStore.getState();
                            setOrderedNoteIds(data.order);
                        }
                    })
                    .catch(e => console.error("Failed to load sidebar order", e));
            }
        }
    }, [privateKey, loadFilesAndEvents, myId]);

    useEffect(() => {
        const { setNotes: storeSetNotes, setEvents: storeSetEvents } = (require('@/store/useDataStore') as typeof import('@/store/useDataStore')).useDataStore.getState();
        storeSetNotes(files.filter(f => f.type === 'note').map(f => ({ id: f.id, title: f.title, type: 'note' })));
        storeSetEvents(events.map(e => ({ id: e.id, title: e.title, type: 'event' })));
    }, [files, events]);

    const { push: islandPush, setIdlePayload, clearAll: islandClearAll } = useIslandStore();

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

    // SSE Listener
    useEffect(() => {
        if (!myId) return;
        const eventSource = new EventSource(`http://localhost:8080/api/v1/events?user_id=${myId}`);

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (['file_created', 'file_updated', 'file_deleted', 'file_shared'].includes(data.type)) {
                    if (privateKey) loadFilesAndEvents();
                }

                // The messenger notification logic was moved to ChatPanel.tsx to utilize its contacts state and avoid duplicate pushes.
            } catch (e) {
                console.error("SSE Parse Error", e);
            }
        };

        return () => eventSource.close();
    }, [myId, privateKey, loadFilesAndEvents, enabledExtensions, islandPush]);


    // Trigger initial load for restored tabs if needed
    useEffect(() => {
        if (activeTabId && files.length > 0 && !isLoadingContent && !editorContent) {
            const isNote = activeTabId !== 'calendar' && activeTabId !== 'messages' && !activeTabId.startsWith('chat-');
            if (isNote) {
                const tab = openTabs.find(t => t.id === activeTabId);
                if (tab && tab.type === 'file' && !tab.content) {
                    loadNoteContent(activeTabId, tab.title);
                }
            }
        }
    }, [activeTabId, files, isLoadingContent, editorContent, openTabs]); // eslint-disable-line react-hooks/exhaustive-deps


    // -------------------------------------------------------------------------
    // 3. File Operations (Open, Save, Create, Delete...)
    // -------------------------------------------------------------------------

    // Unified Tab Switcher
    const switchTab = (newId: string, type: 'file' | 'calendar' | 'messages' | 'chat' | 'ext_finance', forcedTitle?: string, fallbackData?: any) => {
        if (activeTabId === newId) return;
        try { islandClearAll(); } catch (e) { } // Dismiss Smart Island views on navigation!

        // 1. Teardown OLD Tab
        const isOldAFile = activeTabId !== 'calendar' && activeTabId !== 'messages' && !activeTabId.startsWith('chat-');
        if (isOldAFile) {
            if (saveStatus === 'unsaved' && editorContent) {
                const oldFile = files.find(f => f.id === activeTabId);
                if (oldFile) performSave(editorContent, activeTabId, activeFileKey, oldFile.visibility).catch(console.error);
            }
        }

        setOpenTabs(prev => {
            let nextTabs = [...prev];
            // Flush state to the old tab
            if (isOldAFile) {
                nextTabs = nextTabs.map(t => t.id === activeTabId ? {
                    ...t, content: editorContent, _fileKey: activeFileKey, _saveStatus: 'saved'
                } : t);
            }
            // Move activated tab to the front for MRU sorting
            const existingTab = nextTabs.find(t => t.id === newId);
            nextTabs = nextTabs.filter(t => t.id !== newId);

            if (type === 'file') {
                nextTabs.unshift({ ...(existingTab || {}), id: newId, title: forcedTitle || existingTab?.title || "Untitled", type: 'file' });
            } else if (existingTab) {
                nextTabs.unshift(existingTab);
            } else {
                nextTabs.unshift({ id: newId, title: forcedTitle || "Untitled", type });
            }

            // Limit to max 5 tabs
            if (nextTabs.length > 5) {
                nextTabs = nextTabs.slice(0, 5);
            }

            return nextTabs;
        });

        // 2. Setup NEW Tab
        setActiveTabId(newId);

        if (type === 'file') {
            const existingTab = openTabs.find(t => t.id === newId);
            const finalTitle = forcedTitle || existingTab?.title || "";
            setFileName(finalTitle);

            if (existingTab && existingTab.content) {
                // If the Editor was mounted in the background for this exact file, editorContent is ALREADY the most up-to-date.
                // Overwriting it with existingTab.content would destroy any changes made while it was backgrounded (e.g. Magic Links).
                const backgroundEditorId = (activeTabId !== 'calendar' && activeTabId !== 'messages' && !activeTabId.startsWith('chat-'))
                    ? activeTabId
                    : (openTabs.find(t => t.type === 'file')?.id);

                if (newId !== backgroundEditorId) {
                    setEditorContent(existingTab.content);
                    setSaveStatus(existingTab._saveStatus || 'saved');
                }
                setActiveFileKey(existingTab._fileKey || null);
                setIsLoadingContent(false);
            } else {
                loadNoteContent(newId, finalTitle, fallbackData);
            }
        }
    };

    // Open Note -> Add to Tabs & Activate
    const handleFileSelect = async (fileId: string, title: string, fileData?: any) => {
        if (fileId === 'ext_finance') {
            switchTab('ext_finance', 'ext_finance', 'Finance Tracker', fileData);
        } else {
            switchTab(fileId, 'file', title, fileData);
        }
    };

    const loadNoteContent = async (fileId: string, titleFn: string, passedFile?: any) => {
        if (!privateKey) return;
        setIsLoadingContent(true);
        setEditorContent(null);
        setFileName(titleFn);
        setSaveStatus("saved");

        try {
            // Use passedFile if available (fix race condition), else find in state
            let target = passedFile || files.find(f => f.id === fileId);

            // Final fallback: try to find in events if it's an event being opened as a note (rare but possible)
            if (!target) target = events.find(e => e.id === fileId) as any;

            if (!target) {
                console.warn("[loadNoteContent] Target not found for", fileId);
                // Instead of throwing, we can try to fetch the file metadata directly
                const res = await fetch(`/api/v1/files/${fileId}`, { headers: { "X-User-ID": myId } });
                if (res.ok) {
                    target = await res.json();
                } else {
                    throw new Error("File not found in state or backend");
                }
            }

            let contentText = "";
            let meta: any = null;

            if (target.visibility === 'public') {
                const resBlob = await fetch(`/api/v1/files/${fileId}/download`, { headers: { "X-User-ID": myId } });
                if (resBlob.ok) contentText = await resBlob.text();
            } else {
                if (!target.secured_meta) throw new Error("Missing metadata");
                meta = await cryptoLib.decryptMetadata(target.secured_meta, privateKey);

                const importedFileKey = await window.crypto.subtle.importKey(
                    "jwk", meta.fileKey,
                    { name: "AES-GCM" },
                    true, ["encrypt", "decrypt"]
                );
                setActiveFileKey(importedFileKey);

                const resBlob = await fetch(`/api/v1/files/${fileId}/download`, { headers: { "X-User-ID": myId } });
                if (resBlob.ok) {
                    const blob = await resBlob.blob();
                    if (blob.size > 0) {
                        const decryptedBlob = await cryptoLib.decryptFile(blob, meta.iv, importedFileKey);
                        contentText = await decryptedBlob.text();
                    }
                }
            }

            if (contentText) {
                try { setEditorContent(JSON.parse(contentText)); }
                catch (e) { setEditorContent(contentText); }
            } else {
                setEditorContent({ type: 'doc', content: [] });
            }
        } catch (err) {
            console.error("Failed to load note:", err);
            // alert("Failed to load note content.");
        } finally {
            setIsLoadingContent(false);
        }
    };

    // Save Logic
    const performSave = async (content: any, fileId: string, fileKey: CryptoKey | null, visibility: string) => {
        try {
            const contentString = JSON.stringify(content);
            const blob = new Blob([contentString], { type: "application/json" });
            let dataToUpload: Blob;
            let iv: any = null;
            let activeKey = fileKey;

            if (visibility === 'public') {
                dataToUpload = blob;
            } else {
                // Recover key if lost due to serialization (localStorage)
                if (!activeKey || !(activeKey instanceof CryptoKey)) {
                    console.log("[Save] Recovering key for", fileId);
                    const currentFile = files.find(f => f.id === fileId);
                    if (currentFile?.secured_meta && privateKey) {
                        try {
                            const meta = await cryptoLib.decryptMetadata(currentFile.secured_meta, privateKey);
                            activeKey = await window.crypto.subtle.importKey(
                                "jwk", meta.fileKey as JsonWebKey,
                                { name: "AES-GCM" },
                                true, ["encrypt", "decrypt"]
                            );
                            if (fileId === activeTabId) setActiveFileKey(activeKey);
                        } catch (e) {
                            console.error("[Save] Key recovery failed", e);
                        }
                    }
                }

                if (!activeKey || !(activeKey instanceof CryptoKey)) {
                    throw new Error("Encryption key missing or invalid");
                }

                const encrypted = await cryptoLib.encryptFile(blob, activeKey);
                dataToUpload = encrypted.ciphertext;
                iv = encrypted.iv;
            }

            // Upload Content
            await fetch(`/api/v1/files/${fileId}/upload`, {
                method: "POST",
                headers: { "X-User-ID": myId },
                body: dataToUpload
            });

            // Update Metadata (Title etc)
            const currentFile = files.find(f => f.id === fileId);
            const title = fileName || currentFile?.title || "Untitled";

            if (visibility === 'public') {
                await fetch(`/api/v1/files/${fileId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", "X-User-ID": myId },
                    body: JSON.stringify({ public_meta: { title: title } })
                });
            } else {
                if (!publicKey || !activeKey) throw new Error("Keys missing");
                const fileKeyJwk = await window.crypto.subtle.exportKey("jwk", activeKey);
                const metaPayload = { title: title, fileKey: fileKeyJwk, iv: iv };
                const encryptedMeta = await cryptoLib.encryptMetadata(metaPayload, publicKey);
                await fetch(`/api/v1/files/${fileId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", "X-User-ID": myId },
                    body: JSON.stringify({ secured_meta: encryptedMeta })
                });
            }
        } catch (err) {
            console.error("Save failed:", err);
            throw err;
        }
    };

    // Auto-Save Effect
    useEffect(() => {
        if (saveStatus === "unsaved" && activeTabId !== 'calendar' && activeTabId !== 'messages' && activeTabId && editorContent) {
            const currentFile = files.find(f => f.id === activeTabId);
            if (!currentFile) return;

            const canSave = currentFile.visibility === 'public' || activeFileKey;
            if (canSave) {
                const timer = setTimeout(async () => {
                    setSaveStatus("saving");
                    try {
                        await performSave(editorContent, activeTabId, activeFileKey, currentFile.visibility);
                        setSaveStatus("saved");
                    } catch { setSaveStatus("unsaved"); }
                }, 1000);
                return () => clearTimeout(timer);
            }
        }
    }, [editorContent, saveStatus, activeTabId, activeFileKey, files]);


    const handleNewNote = async () => {
        if (!publicKey || !privateKey) return;
        try {
            const fileKey = await cryptoLib.generateFileKey();
            const fileKeyJwk = await window.crypto.subtle.exportKey("jwk", fileKey);
            const emptyDoc = { type: 'doc', content: [] };
            const blob = new Blob([JSON.stringify(emptyDoc)], { type: 'application/json' });
            const { iv, ciphertext } = await cryptoLib.encryptFile(blob, fileKey);

            const metaPayload = {
                title: "",
                fileKey: fileKeyJwk,
                iv: iv
            };
            const encryptedMeta = await cryptoLib.encryptMetadata(metaPayload, publicKey);

            const res = await fetch("/api/v1/files", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-User-ID": myId },
                body: JSON.stringify({
                    type: "note",
                    size: blob.size,
                    public_meta: {},
                    secured_meta: encryptedMeta
                })
            });

            if (res.ok) {
                const newFile = await res.json();
                await fetch(`/api/v1/files/${newFile.id}/upload`, { method: "POST", body: ciphertext });

                // Add optimistic local representation and auto-open
                const newFileObj = {
                    ...newFile,
                    title: "",
                    type: "note",
                    secured_meta: encryptedMeta,
                    isGroup: false,
                    parent_id: null
                };
                setFiles(prev => [...prev, newFileObj]);
                switchTab(newFile.id, 'file', "");
            }
        } catch (e) {
            console.error(e);
            alert("Error creating note");
        }
    };

    useEffect(() => {
        const handleStoreCreate = () => {
            handleNewNote();
        };
        window.addEventListener('dataStore:createNote', handleStoreCreate);
        return () => window.removeEventListener('dataStore:createNote', handleStoreCreate);
    }, [handleNewNote]);

    const handleDeleteNote = async (e: React.MouseEvent, fileId: string) => {
        e.stopPropagation();
        if (!confirm("Delete this note?")) return;
        try {
            await fetch(`/api/v1/files/${fileId}`, { method: "DELETE", headers: { "X-User-ID": myId } });
            setFiles(prev => prev.filter(f => f.id !== fileId));
            if (activeTabId === fileId) {
                handleTabClose(e, fileId);
            }
        } catch (e) { alert("Failed to delete"); }
    };

    // Rename File
    const [editingFileId, setEditingFileId] = useState<string | null>(null);

    const handleRenameNote = (e: React.MouseEvent, fileId: string, currentTitle: string) => {
        e.stopPropagation();
        setEditingFileId(fileId);
    };

    const submitRename = async (fileId: string, newTitle: string) => {
        setEditingFileId(null);

        // Optimistic
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, title: newTitle } : f));
        setEvents(prev => prev.map(e => e.id === fileId ? { ...e, title: newTitle } : e));
        setOpenTabs(prev => prev.map(t => t.id === fileId ? { ...t, title: newTitle } : t));
        if (activeTabId === fileId) setFileName(newTitle);
        try {
            const target = files.find(f => f.id === fileId) || events.find(e => e.id === fileId);
            if (!target) return;

            const isPublic = 'visibility' in target && target.visibility === 'public';

            if (isPublic) {
                await fetch(`/api/v1/files/${fileId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", "X-User-ID": myId },
                    body: JSON.stringify({ public_meta: { title: newTitle } })
                });
            } else {
                if (!publicKey || !privateKey) return;

                // 1. Get current metadata (Prefer state to avoid fetching owner's encrypted data if shared)
                let currentSecuredMeta = target.secured_meta;

                // Fallback: Fetch fresh meta if missing in state (shouldn't happen with new logic)
                if (!currentSecuredMeta) {
                    const res = await fetch(`/api/v1/files/${fileId}`, {
                        headers: { "X-User-ID": myId } // Pass X-User-ID to get correct share meta!
                    });
                    const freshFile = await res.json();
                    currentSecuredMeta = freshFile.secured_meta;
                }

                if (!currentSecuredMeta) throw new Error("Missing metadata");

                // 2. Decrypt, Update, Re-encrypt
                const meta = await cryptoLib.decryptMetadata(currentSecuredMeta, privateKey);
                meta.title = newTitle;
                const encryptedMeta = await cryptoLib.encryptMetadata(meta, publicKey);

                // 3. Perform update
                await fetch(`/api/v1/files/${fileId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", "X-User-ID": myId },
                    body: JSON.stringify({ secured_meta: Array.from(new Uint8Array(cryptoLib.base64ToArrayBuffer(encryptedMeta))) })
                });
            }

            // Refresh state
            loadFilesAndEvents();
        } catch (e) {
            console.error("Rename failed", e);
            alert("Rename failed");
            loadFilesAndEvents();
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
        setFiles(prev => prev.map(f => f.id === fileId ? { ...f, visibility: newVisibility } : f));

        try {
            let contentBlob: Blob | null = null;
            let currentMeta: any = null;

            // 1. Get decrypted metadata & content (if currently encrypted)
            if (prevVisibility !== 'public') {
                if (!file.secured_meta) throw new Error("Missing secured metadata");
                currentMeta = await cryptoLib.decryptMetadata(file.secured_meta, privateKey);

                if (!isFolder) {
                    const resBlob = await fetch(`/api/v1/files/${fileId}/download`, { headers: { "X-User-ID": myId } });
                    if (resBlob.ok) {
                        const blob = await resBlob.blob();
                        const fileKey = await window.crypto.subtle.importKey(
                            "jwk", currentMeta.fileKey,
                            { name: "AES-GCM" },
                            true, ["encrypt", "decrypt"]
                        );
                        contentBlob = await cryptoLib.decryptFile(blob, currentMeta.iv, fileKey);
                    }
                }
            } else {
                currentMeta = { title: file.title || "Untitled" };
                if (!isFolder) {
                    const resBlob = await fetch(`/api/v1/files/${fileId}/download`, { headers: { "X-User-ID": myId } });
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
                    const fileKey = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
                    const encrypted = await cryptoLib.encryptFile(contentBlob || new Blob([]), fileKey);
                    uploadBlob = encrypted.ciphertext;
                    const fileKeyJwk = await window.crypto.subtle.exportKey("jwk", fileKey);
                    const metaPayload = { title: currentMeta.title, fileKey: fileKeyJwk, iv: encrypted.iv };
                    updatePayload.secured_meta = await cryptoLib.encryptMetadata(metaPayload, publicKey);
                    currentMeta = metaPayload; // For following re-encryption
                }
                updatePayload.public_meta = {};
            }

            // 3. Upload (if needed)
            if (uploadBlob) {
                await fetch(`/api/v1/files/${fileId}/upload`, {
                    method: "POST",
                    headers: { "X-User-ID": myId },
                    body: uploadBlob
                });
            }

            // 4. Update Main Metadata
            const updateRes = await fetch(`/api/v1/files/${fileId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "X-User-ID": myId },
                body: JSON.stringify(updatePayload)
            });
            if (!updateRes.ok) throw new Error("Failed to update visibility");

            // 5. If "Contacts" visibility, perform bulk share
            if (newVisibility === 'contacts') {
                const contactsRes = await fetch("/api/v1/contacts", { headers: { "X-User-ID": myId } });
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
                            await fetch(`/api/v1/files/${fileId}/share`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json", "X-User-ID": myId },
                                body: JSON.stringify({
                                    email: contact.partner.email,
                                    secured_meta: Array.from(new Uint8Array(cryptoLib.base64ToArrayBuffer(reEncMeta)))
                                })
                            });
                        } catch (e) { console.error("Failed to share with contact", contact.partner.email, e); }
                    }
                }
            }

            loadFilesAndEvents();
        } catch (err) {
            console.error("Visibility toggle failed:", err);
            alert("Failed to change visibility");
            setFiles(prev => prev.map(f => f.id === fileId ? { ...f, visibility: prevVisibility } : f));
        }
    };
    const handleShare = async (e: React.MouseEvent, fileId: string) => {
        e.stopPropagation();

        const file = files.find(f => f.id === fileId) || events.find(e => e.id === fileId);
        if (!file) {
            console.error("File/Event not found for sharing:", fileId);
            return;
        }

        setShareModalFile({ id: fileId, title: file.title });
    };

    const performShare = async (recipientEmail: string, recipientPubKeySpki: string) => {
        if (!shareModalFile || !privateKey || !publicKey) return;

        // Rule 3: Push upload progress for outgoing share
        if (enabledExtensions.includes('smart_island')) {
            islandPush({
                type: 'upload_progress',
                payload: { fileName: shareModalFile.title }
            });
        }

        await (await import('@/lib/shareLogic')).performMessengerShare(
            shareModalFile,
            myId,
            privateKey,
            publicKey,
            events,
            recipientEmail,
            recipientPubKeySpki
        );
    };


    // -------------------------------------------------------------------------
    // 4. Calendar Logic
    // -------------------------------------------------------------------------
    const handleEventCreate = async (start: Date, end: Date, isAllDay: boolean = false) => {
        if (!privateKey || !publicKey) return;
        const title = "New Event";
        try {
            const meta = { title, start: start.toISOString(), end: end.toISOString(), allDay: isAllDay };
            const securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);

            const res = await fetch("/api/v1/files", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-User-ID": myId },
                body: JSON.stringify({
                    type: "event",
                    parent_id: null,
                    public_meta: {},
                    secured_meta: Array.from(new Uint8Array(cryptoLib.base64ToArrayBuffer(securedMeta)))
                })
            });
            if (res.ok) {
                const newFile = await res.json();
                setEvents(prev => [...prev, { id: newFile.id, title, start: meta.start, end: meta.end, allDay: isAllDay }]);
                setActiveEventId(newFile.id);
            }
        } catch (e) { console.error(e); }
    };

    const handleEventUpdate = async (id: string, start: Date, end: Date) => {
        if (!privateKey || !publicKey) return;
        try {
            const event = events.find(e => e.id === id);
            if (!event) return;
            const meta = { title: event.title, start: start.toISOString(), end: end.toISOString(), color: event.color, description: event.description };
            const securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);

            await fetch(`/api/v1/files/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "X-User-ID": myId },
                body: JSON.stringify({ secured_meta: Array.from(new Uint8Array(cryptoLib.base64ToArrayBuffer(securedMeta))) })
            });

            setEvents(prev => prev.map(e => e.id === id ? { ...e, start: meta.start, end: meta.end } : e));
        } catch (e) { console.error(e); }
    };

    const handleEventRename = async (id: string, newTitle: string) => {
        if (!privateKey || !publicKey) return;
        try {
            const event = events.find(e => e.id === id);
            if (!event) return;
            const meta = { title: newTitle, start: event.start, end: event.end, color: event.color, description: event.description };
            const securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);
            await fetch(`/api/v1/files/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "X-User-ID": myId },
                body: JSON.stringify({ secured_meta: Array.from(new Uint8Array(cryptoLib.base64ToArrayBuffer(securedMeta))) })
            });
            setEvents(prev => prev.map(e => e.id === id ? { ...e, title: newTitle } : e));
        } catch (e) { console.error(e); }
    };

    const handleEventSave = async (id: string, updates: any) => {
        if (!privateKey || !publicKey) return;
        try {
            const event = events.find(e => e.id === id);
            if (!event) return;

            // 1. Prepare Metadata
            const meta = {
                title: updates.title || event.title,
                start: updates.start || event.start,
                end: updates.end || event.end,
                description: updates.description !== undefined ? updates.description : event.description,
                color: updates.color || event.color,
                allDay: updates.allDay !== undefined ? updates.allDay : event.allDay
            };

            const securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);

            // 2. Build body — task flags are top-level columns (not encrypted)
            const body: any = {
                secured_meta: Array.from(new Uint8Array(cryptoLib.base64ToArrayBuffer(securedMeta)))
            };

            // 3. Handle Theme Change (Move)
            if (updates.parent_id !== undefined) {
                body.parent_id = updates.parent_id;
            }

            // 4. Handle Task flags
            if (updates.is_task !== undefined) {
                body.is_task = updates.is_task;
            }
            if (updates.is_completed !== undefined) {
                body.is_completed = updates.is_completed;
            }

            await fetch(`/api/v1/files/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "X-User-ID": myId },
                body: JSON.stringify(body)
            });

            // 5. Update local state
            setEvents(prev => prev.map(e => e.id === id ? { ...e, ...meta, ...(updates.is_task !== undefined ? { is_task: updates.is_task } : {}), ...(updates.is_completed !== undefined ? { is_completed: updates.is_completed } : {}) } : e));

            // If theme changed, update files state as well
            if (updates.parent_id !== undefined) {
                setFiles(prev => prev.map(f => f.id === id ? { ...f, parent_id: updates.parent_id } : f));
            }

        } catch (e) { console.error(e); }
    };

    const handleDeleteEvent = async (id: string) => {
        if (!myId) return;
        if (!confirm("Are you sure you want to delete this event?")) return;
        try {
            const res = await fetch(`/api/v1/files/${id}`, {
                method: "DELETE",
                headers: { "X-User-ID": myId }
            });
            if (res.ok) {
                setEvents(prev => prev.filter(e => e.id !== id));
            }
        } catch (e) { console.error(e); }
    };


    // -------------------------------------------------------------------------
    // 5. Tab Management & Messages
    // -------------------------------------------------------------------------
    const handleTabSelect = (id: string, type: 'file' | 'calendar' | 'messages' | 'chat' | 'ext_finance') => {
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

    const handleMagicLinkClick = (target: any) => {
        if (target.id && target.id.startsWith('ghost-')) {
            const title = target.title || target.id.replace('ghost-', '');

            const newId = useDataStore.getState().createNote(title);
            switchTab(newId, 'file', title);
            useDataStore.getState().setActiveNoteId(newId);

        } else if (target.type === 'event') {
            switchTab('calendar', 'calendar');
            const targetEvent = events.find(e => e.id === target.id);
            if (targetEvent) {
                setCalendarDate(new Date(targetEvent.start));
                setActiveEventId(target.id);
            }

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

    if (status === "loading") return <div className="flex items-center justify-center h-screen bg-rose-50 dark:bg-gray-900 text-rose-500">Loading Tide...</div>;

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------
    return (
        <div className="flex h-screen w-full bg-[var(--background)] text-foreground overflow-hidden">
            {/* Left Sidebar Panel */}
            <div className={`flex flex-col h-full bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] shrink-0 z-[100] transition-all duration-300 w-64`}>
                <Sidebar
                    files={files.filter(f => !f.isGroup && !f.title.startsWith('.'))}
                    onFileSelect={handleFileSelect}
                    onNewNote={handleNewNote}
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
                    eventGroups={files.filter(f => f.type === 'folder' && f.isGroup)}
                    onCreateEventGroup={handleCreateEventGroup}
                    onUpdateEventGroup={handleUpdateEventGroup}
                    enabledExtensions={enabledExtensions}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                />
            </div>

            {/* Right: Workspace */}
            <div className={`flex-1 flex flex-col min-w-0 bg-[var(--background)] relative overflow-hidden`}>
                <div
                    className={`absolute inset-0 z-10 bg-[var(--background)] transition-opacity duration-200 ${activeTabId === 'calendar' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                >
                    <CalendarView
                        events={events.map(e => {
                            const parent = files.find(f => f.id === e.parent_id);
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
                            setActiveEventId(id);
                            setMinimizedEventIds(prev => prev.filter(mId => mId !== id));

                            const clickedEvent = events.find(e => e.id === id);
                            if (clickedEvent && enabledExtensions.includes('smart_island')) {
                                islandPush({ type: 'event_preview', payload: { event: clickedEvent } });
                            }
                        }}
                        onEventShare={(e, id) => handleShare(e, id)}
                        editingEventId={activeEventId}
                        date={calendarDate}
                        onDateChange={handleDateSelect}
                        themes={files.filter(f => f.type === 'folder' && f.isGroup)}
                    />
                </div>

                <div className={`absolute inset-0 z-10 bg-transparent ${activeTabId === 'messages' || activeTabId.startsWith('chat-') ? 'block' : 'hidden'}`}>
                    {enabledExtensions.includes('messenger') ? (
                        <ChatPanel
                            privateKey={privateKey}
                            onOpenFile={handleFileSelect}
                            onOpenCalendar={() => switchTab('calendar', 'calendar')}
                            onFileCreated={(newFile: DecryptedFile) => {
                                setFiles(prev => [...prev, newFile]);
                            }}
                            onAccept={() => loadFilesAndEvents()}
                        />
                    ) : (
                        <div className="flex bg-[var(--background)] h-full w-full items-center justify-center text-gray-500 flex-col gap-4">
                            <p>Messenger is disabled.</p>
                            <button className="px-4 py-2 border dark:border-white/20 border-black/20 text-[var(--foreground)] rounded-md hover:bg-black/5 dark:hover:bg-white/5" onClick={() => setIsSettingsOpen(true)}>Enable in Settings</button>
                        </div>
                    )}
                </div>

                <div className={`absolute inset-0 z-10 bg-[var(--background)] ${activeTabId === 'ext_finance' ? 'block' : 'hidden'}`}>
                    {enabledExtensions.includes('finance') ? <FinanceDashboard /> : null}
                </div>

                <div className={`flex-1 min-h-0 relative overflow-y-auto ${activeTabId === 'calendar' || activeTabId === 'messages' || activeTabId.startsWith('chat-') || activeTabId === 'ext_finance' ? 'hidden' : 'block'}`}>
                    {isLoadingContent ? (
                        <div className="flex items-center justify-center h-full text-gray-400">Loading content...</div>
                    ) : (
                        <div className="max-w-5xl mx-auto min-h-[500px] py-12 px-8 lg:px-24">
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
                                                attrs: { anchorId },
                                                content: [{ type: 'text', text: '⚓' }]
                                            })
                                            .run();

                                        return anchorId;
                                    } catch (e) {
                                        console.error("[Canvas] Failed to insert anchor", e);
                                        return null;
                                    }
                                }}
                            >
                                <div className="w-full max-w-screen-lg mx-auto flex flex-row items-start min-h-[500px] py-12 px-4 sm:px-8">
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
                                        {activeNoteId && files.find(f => f.id === activeNoteId) && (
                                            <input
                                                type="text"
                                                autoFocus
                                                value={fileName}
                                                onChange={(e) => {
                                                    const newTitle = e.target.value;
                                                    setFileName(newTitle);
                                                    setFiles(prev => prev.map(f => f.id === activeNoteId ? { ...f, title: newTitle } : f));
                                                }}
                                                onBlur={(e) => {
                                                    if (activeNoteId) {
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
                                                className="text-4xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-700 mb-6 pb-1 leading-normal overflow-visible"
                                            />
                                        )}

                                        <Editor
                                            key={activeNoteId || 'fallback'}
                                            initialContent={editorContent}
                                            onEditorReady={(ed) => setTimeout(() => setEditorInstance(ed), 0)}
                                            onChange={(json) => {
                                                setEditorContent(json);
                                                setSaveStatus("unsaved");
                                                setEditorVersion(v => v + 1);
                                            }}
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
                                                    backgroundColor: 'rgba(99,102,241,0.15)',
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
                                    </div>
                                </div>
                            </CanvasLayer>
                        </div>
                    )}
                </div>
            </div>

            {/* FAB Theme Menu */}
            {activeTabId === 'calendar' && (
                <div className="fixed bottom-6 right-6 z-[80]">
                    <button
                        onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                        className="w-12 h-12 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800 hover:scale-105 transition-all focus:outline-none"
                        title="Manage Themes"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                    </button>

                    {isThemeMenuOpen && (
                        <div className="absolute bottom-16 right-0 w-64 bg-white rounded-lg shadow-xl shadow-gray-200/50 border border-gray-200 p-4 animate-in slide-in-from-bottom-2 fade-in duration-200">
                            <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                                <span className="font-semibold text-gray-800 text-sm">Themes</span>
                                <button onClick={handleCreateEventGroup} className="p-1 hover:bg-gray-100 rounded text-gray-500 transition-colors">
                                    <Plus size={14} />
                                </button>
                            </div>
                            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto no-scrollbar">
                                {files.filter(f => f.type === 'folder' && f.isGroup).map(group => (
                                    <div key={group.id} className="group flex flex-col gap-2 p-2 rounded hover:bg-gray-50 transition-colors border-l-2 border-transparent">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={!(hiddenThemeIds || []).includes(group.id)}
                                                onChange={() => handleToggleThemeVisibility(group.id)}
                                                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-500 focus:ring-blue-500/20 bg-transparent cursor-pointer"
                                                title="Toggle Visibility"
                                            />
                                            <input
                                                type="text"
                                                value={group.title}
                                                onChange={(e) => handleUpdateEventGroup(group.id, { title: e.target.value })}
                                                className="bg-transparent border-none p-0 text-[13px] font-medium focus:ring-0 outline-none text-gray-700 flex-1"
                                            />
                                            <button
                                                onClick={(e) => handleShare(e, group.id)}
                                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded text-gray-500 transition-all ml-1"
                                                title="Share Theme"
                                            >
                                                <Share size={14} />
                                            </button>
                                        </div>
                                        <div className="flex items-center px-5 relative">
                                            <select
                                                value={group.effect || 'none'}
                                                onChange={(e) => handleUpdateEventGroup(group.id, { effect: e.target.value })}
                                                className="appearance-none w-full bg-white border border-gray-200 hover:border-gray-300 rounded px-2 py-1 text-[11px] font-medium text-gray-600 outline-none cursor-pointer transition-all focus:ring-1 focus:ring-blue-500"
                                            >
                                                <option value="none">Default Color</option>
                                                <option value="sky">Sky</option>
                                                <option value="green">Green</option>
                                                <option value="orange">Orange</option>
                                            </select>
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                <ChevronDown size={10} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {files.filter(f => f.type === 'folder' && f.isGroup).length === 0 && (
                                    <div className="text-xs text-gray-400 text-center py-2">No themes created yet.</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Bottom Dock Navigation */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[60] pointer-events-none flex flex-col items-center">
                <TabList
                    tabs={openTabs}
                    activeTabId={activeTabId}
                    onTabSelect={handleTabSelect}
                    onTabClose={handleTabClose}
                    onTabsReorder={setOpenTabs}
                    enabledExtensions={enabledExtensions}
                    onOpenMessages={handleOpenMessages}
                    onOpenFinance={() => handleFileSelect('ext_finance', 'Finance Tracker')}
                />
            </div>

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
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                enabledExtensions={enabledExtensions}
                onToggleExtension={handleToggleExtension}
                userProfile={userProfile || undefined}
                onLogout={handleLogout}
            />

            <DailySummary
                isOpen={isSummaryOpen}
                onClose={() => setIsSummaryOpen(false)}
                streak={streak}
                eventsToday={summaryStats.events}
                completedTasksToday={summaryStats.tasks}
            />
        </div>

    );
}
