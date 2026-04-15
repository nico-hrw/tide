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
import DailySummary from "@/components/Calendar/DailySummary";
import MobileLayout from "@/components/Layout/MobileLayout";
import BackupHistory from "@/components/BackupHistory";
import { Clock } from 'lucide-react';


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
import { useDataStore, DataItem } from "@/store/useDataStore";

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
                <div className="flex flex-wrap gap-1.5">
                    {['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#64748b'].map(c => (
                        <button
                            key={c}
                            onClick={() => onUpdate(group.id, { color: c })}
                            className={`w-4 h-4 rounded-full transition-all border-2 ${(group as any).color === c ? 'border-white ring-2 ring-indigo-500 scale-110 shadow-sm' : 'border-transparent hover:scale-110'}`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>
                <div className="relative group/select w-full">
                    <select
                        value={group.effect || 'none'}
                        onChange={(e) => onUpdate(group.id, { effect: e.target.value })}
                        className="appearance-none w-full bg-white dark:bg-black/20 border border-gray-200 group-hover/select:border-indigo-200 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-gray-600 outline-none cursor-pointer transition-all focus:ring-1 focus:ring-indigo-500"
                    >
                        <option value="none">Solid Finish</option>
                        <option value="stripes">Striped Texture</option>
                        <option value="waves">Wave Pattern</option>
                        <option value="dots">Dotted Grain</option>
                        <option value="chess">Chess Board</option>
                        <option value="dimmed">Soft Dimmed</option>
                    </select>
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover/select:text-indigo-400 transition-colors">
                        <ChevronDown size={12} />
                    </div>
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
    const [isLoadingContent, setIsLoadingContent] = useState(false);
    const [activeFileKey, setActiveFileKey] = useState<CryptoKey | null>(null);
    const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "saving">("saved");
    const [fileName, setFileName] = useState("");
    const [editorInstance, setEditorInstance] = useState<any>(null);
    const [editorVersion, setEditorVersion] = useState(0);
    const lastLoadIdRef = useRef<string | null>(null);

    // Sidebar & Reordering State
    const [editingFileId, setEditingFileId] = useState<string | null>(null);
    const [hiddenThemeIds, setHiddenThemeIds] = useState<string[]>([]);
    const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

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

    // Share Modal State
    const [shareModalFile, setShareModalFile] = useState<{ id: string, title: string } | null>(null);

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
        setTimeout(() => setEditorInstance(ed), 0);
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
    const saveStatusRef = useRef<string>('saved');
    const fileNameRef = useRef<string>("");
    const initialContentRef = useRef<any>(null);

    useEffect(() => { activeNoteIdRef.current = activeNoteId ?? null; }, [activeNoteId]);
    useEffect(() => { activeFileKeyRef.current = activeFileKey; }, [activeFileKey]);
    useEffect(() => { editorContentRef.current = editorContent; }, [editorContent]);
    useEffect(() => { saveStatusRef.current = saveStatus; }, [saveStatus]);
    useEffect(() => { fileNameRef.current = fileName; }, [fileName]);

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

        // Broaden search to all files and events to ensure items like event-notes are saved
        const allFiles = useDataStore.getState().notes;
        const allEvents = useDataStore.getState().events;
        const currentFile = allFiles.find((f: any) => f.id === noteId) || allEvents.find((e: any) => e.id === noteId);

        if (!currentFile) {
            console.warn(`[AutoSave] Aborting save: File ${noteId} not found in store.`);
            return;
        }

        const title = (currentFile as any).title || fileNameRef.current;
        if (title && title.includes('Locked')) {
            console.warn(`[AutoSave] Aborted: Refusing to overwrite a Locked Note/Task`);
            return;
        }
        
        // [TASK 2] Safety check: Don't save if content is null or an empty doc shell that might
        // be a side-effect of a component unmount or state transition.
        if (!content || (content.type === 'doc' && (!content.content || content.content.length === 0))) {
            console.warn(`[AutoSave] Aborted: Content is null or empty doc shell. Possible race condition during tab switch.`);
            return;
        }

        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        if (contentStr === 'decrypting' || contentStr.includes('DECRYPTION ERROR') || (currentFile as any)._decryptionFailed) {
            console.warn(`[AutoSave] Aborted: Refusing to save decrypting or errored content`);
            return;
        }

        // Only save if content has actually changed from what was initially loaded
        const initialStr = typeof initialContentRef.current === 'string' ? initialContentRef.current : JSON.stringify(initialContentRef.current);
        if (contentStr === initialStr && saveStatusRef.current !== 'unsaved') {
            // We skip saving if the content hasn't changed from the initial load AND hasn't been modified by the user.
            // This is the primary protection against "Phantom-Leere" overwriting data.
            return;
        }

        if (!performSaveRef.current) {
            console.warn("[AutoSave] Aborting save: performSaveRef.current is null.");
            return;
        }

        console.log(`[AutoSave] Triggering save for ${noteId} ("${(currentFile as any).title || 'Untitled'}")`);
        setSaveStatus('saving');
        try {
            await performSaveRef.current(content, noteId, fileKey, (currentFile as any).visibility ?? 'private');
            console.log(`[AutoSave] Successfully saved ${noteId}`);
            setSaveStatus('saved');
        } catch (e) {
            console.error(`[AutoSave] Save FAILED for ${noteId}:`, e);
            setSaveStatus('unsaved');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Debounced auto-save: 3s after last content change, or when saveStatus flips back to
    // 'unsaved' after a failed save attempt (so it retries without requiring further edits).
    useEffect(() => {
        if (saveStatus !== 'unsaved' || !editorContent) return;

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

        saveTimerRef.current = setTimeout(() => {
            // Use refs here — closures would be stale by the time the timer fires
            const content = editorContentRef.current;
            const noteId = activeNoteIdRef.current;
            const fileKey = activeFileKeyRef.current;

            if (saveStatusRef.current !== 'unsaved') {
                console.log("[AutoSave] 1s idle timer fired but status is no longer 'unsaved'. skipping.");
                return;
            }

            console.log(`[AutoSave] 1s idle detected for ${noteId}. Starting save pulse...`);
            triggerSave(noteId!, fileKey, content);
        }, 1000);

        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editorContent, saveStatus]);

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
        triggerSave(prev, activeFileKeyRef.current, editorContentRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeNoteId]);

    // ULTIMATE PROTECTION: Save when the window is hidden (e.g. user switches browser tab)
    // or when the window is about to be closed.
    useEffect(() => {
        const flushUnsavedToDisk = () => {
            if (saveStatusRef.current === 'unsaved' && activeNoteIdRef.current) {
                console.log(`[Lifecycle] Window/Tab losing focus. EMERGENCY FLUSH for ${activeNoteIdRef.current}`);
                triggerSave(activeNoteIdRef.current, activeFileKeyRef.current, editorContentRef.current);
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
        if (!publicKey || !privateKey) return;
        try {
            const fileKey = await cryptoLib.generateFileKey();
            const fileKeyJwk = await window.crypto.subtle.exportKey("jwk", fileKey);
            const emptyDoc = {
                type: 'doc',
                content: [{ type: 'paragraph', attrs: { blockId: crypto.randomUUID() } }]
            };
            const blob = new Blob([JSON.stringify(emptyDoc)], { type: 'application/json' });
            const { iv, ciphertext } = await cryptoLib.encryptFile(blob, fileKey);

            const metaPayload = { title: "", fileKey: fileKeyJwk, iv: iv };
            const encryptedMeta = await cryptoLib.encryptMetadata(metaPayload, publicKey);

            const res = await apiFetch("/api/v1/files", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "note",
                    size: blob.size,
                    public_meta: {},
                    secured_meta: encryptedMeta
                })
            });

            if (res.ok) {
                const newFile = await res.json();
                await apiFetch(`/api/v1/files/${newFile.id}/upload`, { method: "POST", body: ciphertext });
                const newFileObj = {
                    ...newFile, title: "", type: "note",
                    secured_meta: encryptedMeta, isGroup: false, parent_id: null
                };
                useDataStore.getState().appendFiles([newFileObj as any], []);
                switchTab(newFile.id, 'file', "");
            }
        } catch (e) {
            console.error(e);
            alert("Error creating note");
        }
    };

    const performSave = async (content: any, fileId: string, fileKey: CryptoKey | null, visibility: string) => {
        if (!fileId || !content) return;

        try {
            const contentString = typeof content === 'string' ? content : JSON.stringify(content);

            // --- PUBLIC: Upload unencrypted ---
            if (visibility === 'public') {
                const blob = new Blob([contentString], { type: 'application/json' });
                await apiFetch(`/api/v1/files/${fileId}/upload`, { method: 'POST', body: blob });
                const title = fileNameRef.current || 'Untitled';
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

            const title = fileNameRef.current || 'Untitled';

            // Single atomic PUT: writes blob to BlobStore and updates metadata
            const putRes = await apiFetch(`/api/v1/files/${fileId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    version: 2,
                    content_ciphertext: contentCiphertext,
                    access_keys: accessKeysMap,
                    metadata: { has_custom_password: false, title },
                })
            });
            if (!putRes.ok) throw new Error(`[V2-Save] PUT failed with status ${putRes.status}`);

            useDataStore.getState().updateFileRaw(fileId, {
                title,
                version: 2,
                access_keys: accessKeysMap,
                metadata: { has_custom_password: false, title }
            });

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
        setFileName(titleFn);
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

            let target = passedFile || files.find(f => f.id === fileId);
            if (!target) target = events.find(e => e.id === fileId) as any;
            if (!target) {
                const res = await apiFetch(`/api/v1/files/${fileId}`);
                if (res.ok) target = await res.json().catch(() => null);
            }
            if (!target) throw new Error("File not found");

            let contentText = "";
            let meta: any = null;

            if (target.visibility === 'public') {
                const resBlob = await apiFetch(`/api/v1/files/${fileId}/download`);
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

                // Title is stored as plaintext in metadata for V2 files — update store if stale
                const v2Title = (target.metadata as any)?.title || target.title;
                if (v2Title && v2Title !== 'Locked Note (Decrypting...)') {
                    setFileName(v2Title);
                    useDataStore.getState().updateFileRaw(fileId, { title: v2Title, _decryptionFailed: false });
                }

                if (recoveredBackup) {
                    console.log('[RECOVERY] V2: Skipping server download, using recovered local backup.');
                } else {
                    const resBlob = await apiFetch(`/api/v1/files/${fileId}/download`);
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
                if (meta.title && (target.title !== meta.title || target._decryptionFailed)) {
                    console.log(`[Crypto] Decrypted real title for ${fileId}: "${meta.title}"`);
                    setFileName(meta.title as string);
                    useDataStore.getState().updateFileRaw(fileId, { title: meta.title, _decryptionFailed: false });
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
                    setEditorContent(parsed);
                    initialContentRef.current = parsed;
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
        const currentContentToUse = currentOverride || editorContent;
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

    // SSE Effect
    useEffect(() => {
        if (!myId) return;
        const token = sessionStorage.getItem("tide_session_token") || localStorage.getItem("tide_session_token");
        if (!token) return;

        const base = getApiBase();
        const eventSource = new EventSource(`${base}/api/v1/events?user_id=${myId}&token=${token}`);
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (['file_created', 'file_updated', 'file_deleted', 'file_shared'].includes(data.type)) {
                    useDataStore.getState().loadedDirectories.clear();
                    useDataStore.getState().fetchDirectory(null);
                }
            } catch (e) { console.error("SSE Parse Error", e); }
        };
        return () => eventSource.close();
    }, [myId]);

    // Auto-Save Effect — intentionally removed: the ref-based triggerSave system above
    // (lines 297-363) is the single, canonical auto-save path. Having a second effect
    // that also depends on `files` caused a race condition: every successful save fired
    // an SSE `file_updated` event → fetchDirectory() updated `files` → this effect
    // re-ran, sometimes spawning a new 1500ms timer on stale content that overwrote the
    // recently saved version. All auto-save is now handled by triggerSave + its effects.

    // Data Load Effect
    useEffect(() => {
        if (privateKey && publicKey && myId) {
            setKeys(privateKey, publicKey, myId);
            fetchDirectory(null, true);
            apiFetch('/api/v1/files/sidebar_order.info')
                .then(res => res.ok ? res.json() : null)
                .then(data => { if (data?.order) useDataStore.getState().setOrderedNoteIds(data.order); })
                .catch(() => { });

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
                                await rebuildIndex(items, privateKey, myId);
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
        if (!privateKey || !publicKey) return;
        const title = forcedTitle || "New Group";
        const effect = forcedEffect || "none";
        const color = forcedColor || undefined;
        try {
            const meta = { title, isGroup: true, effect, color };
            const securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);

            const res = await apiFetch("/api/v1/files", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "folder",
                    parent_id: null,
                    public_meta: {},
                    secured_meta: securedMeta,
                    visibility: 'private'
                })
            });

            if (!res.ok) throw new Error("Failed to create event group");
            const newFolder = await res.json();

            // Fetch latest root so the UI updates natively 
            useDataStore.getState().loadedDirectories.delete('root');
            useDataStore.getState().fetchDirectory(null);

            return newFolder.id;

        } catch (e) {
            console.error(e);
            alert("Failed to create event group");
        }
    };

    const handleUpdateEventGroup = async (id: string, updates: { title?: string, effect?: string, color?: string }) => {
        if (!privateKey || !publicKey) return;
        try {
            // Optimistic Update
            const currentFiles = useDataStore.getState().notes;
            useDataStore.getState().setNotes(currentFiles.map(f => f.id === id ? { ...f, ...updates } as any : f));

            const group = currentFiles.find(f => f.id === id);
            if (!group || !group.secured_meta) return;

            const meta = await cryptoLib.decryptMetadata(group.secured_meta, privateKey);
            if (updates.title !== undefined) meta.title = updates.title;
            if (updates.effect !== undefined) meta.effect = updates.effect;
            if (updates.color !== undefined) meta.color = updates.color;

            const encryptedMeta = await cryptoLib.encryptMetadata(meta, publicKey);

            await apiFetch(`/api/v1/files/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ secured_meta: encryptedMeta })
            });

            // Re-fetch root to ensure consistency, but optimistic update already made it smooth
            useDataStore.getState().loadedDirectories.delete('root');
            useDataStore.getState().fetchDirectory(null);
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
                    const sessionPubKey = sessionStorage.getItem("tide_user_public_key");
                    if (sessionPubKey) pubKeySpkiStr = sessionPubKey;
                }
            } catch (e) { console.error("Error reading user record", e); }

            if (!pubKeySpkiStr) {
                console.error("Public key not found for user", email);
                setStatus("ready");
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

            // Load sidebar order (silently handle 404/not found)
            apiFetch('/api/v1/files/sidebar_order.info')
                .then(async res => {
                    if (res.status === 404) return null;
                    if (!res.ok) return null;
                    return res.json().catch(() => null);
                })
                .then(data => {
                    if (data && data.order) {
                        const { setOrderedNoteIds } = useDataStore.getState();
                        setOrderedNoteIds(data.order);
                    }
                })
                .catch(() => { /* Silent proceed */ });
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
            await apiFetch(`/api/v1/files/${fileId}`, { method: "DELETE" });
            useDataStore.getState().setNotes(files.filter(f => f.id !== fileId) as any);
            if (activeTabId === fileId) {
                handleTabClose(e, fileId);
            }
        } catch (e) { alert("Failed to delete"); }
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

                let currentSecuredMeta = target.secured_meta;
                if (!currentSecuredMeta) {
                    const res = await apiFetch(`/api/v1/files/${fileId}`);
                    const freshFile = await res.json();
                    currentSecuredMeta = freshFile.secured_meta;
                }

                if (!currentSecuredMeta) throw new Error("Missing metadata");

                const meta = await cryptoLib.decryptMetadata(currentSecuredMeta, privateKey);
                meta.title = newTitle;
                const encryptedMeta = await cryptoLib.encryptMetadata(meta, publicKey);

                await apiFetch(`/api/v1/files/${fileId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ secured_meta: encryptedMeta })
                });
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
                if (!file.secured_meta) throw new Error("Missing secured metadata");
                currentMeta = await cryptoLib.decryptMetadata(file.secured_meta, privateKey);

                if (!isFolder) {
                    const resBlob = await apiFetch(`/api/v1/files/${fileId}/download`);
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

            fetchDirectory(null);
        } catch (err) {
            console.error("Visibility toggle failed:", err);
            alert("Failed to change visibility");
            useDataStore.getState().setNotes(files.map(f => f.id === fileId ? { ...f, visibility: prevVisibility } as any : f));
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
    const handleEventCreate = async (start: Date, end: Date, isAllDay: boolean = false, extraMeta: any = {}) => {
        if (!privateKey || !publicKey) return;
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
                }
            }
        } catch (e) { console.error(e); }
    };

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
            const securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);

            // 4. Build body
            const body: any = {
                secured_meta: securedMeta,
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
            } catch (e) {
                console.error("V2 encryption failed for save", e);
                body.metadata = meta; // fallback
            }

            // 5. Handle Theme Change
            if (updates.parent_id !== undefined) {
                body.parent_id = updates.parent_id;
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

    if (status === "loading") return <div className="flex items-center justify-center h-screen bg-rose-50 dark:bg-gray-900 text-rose-500">Loading Tide...</div>;

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------
    return (
        <div className="flex h-screen w-full bg-[var(--background)] text-foreground overflow-hidden">
            {/* Mobile Layout Wrapper */}
            <MobileLayout
                events={events}
                files={files.filter((f: any) => !f.isGroup && !(f.title || '').startsWith('.'))}
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
                userProfile={userProfile}
                editorElement={
                    editorContent === null ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 h-[50vh] mt-20">
                            <span className="font-medium text-sm">Lade...</span>
                        </div>
                    ) : (
                        <Editor
                            key={activeTabId}
                            initialContent={editorContent}
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
                    )
                }
            />

            {/* Left Sidebar Panel */}
            <div className={`hidden md:flex flex-col h-full bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] shrink-0 z-[100] transition-all duration-300 w-64`}>
                <Sidebar
                    userProfile={userProfile || undefined}
                    files={sidebarFiles}
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
                    eventGroups={files?.filter(f => f.type === 'folder' && f.isGroup)}
                    onCreateEventGroup={handleCreateEventGroup}
                    onUpdateEventGroup={handleUpdateEventGroup}
                    enabledExtensions={enabledExtensions}
                />
            </div>

            {/* Right: Workspace */}
            <div className={`hidden md:flex flex-1 flex-col min-w-0 bg-[var(--background)] relative overflow-hidden`}>

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
                >
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
                    />
                </div>

                <div className={`absolute inset-0 z-10 bg-transparent ${activeTabId === 'messages' || activeTabId.startsWith('chat-') ? 'block' : 'hidden'}`}>
                    {enabledExtensions.includes('messenger') ? (
                        <ChatPanel
                            privateKey={privateKey}
                            onOpenFile={handleFileSelect}
                            onOpenCalendar={() => switchTab('calendar', 'calendar')}
                            onOpenProfile={(userId, username) => switchTab(`profile:${userId}`, 'profile', username)}
                            onFileCreated={(newFile: DecryptedFile) => {
                                useDataStore.getState().appendFiles([newFile as any], []);
                            }}
                            onAccept={() => {
                                useDataStore.getState().loadedDirectories.clear();
                                useDataStore.getState().fetchDirectory(null);
                            }}
                        />
                    ) : (
                        <div className="flex bg-[var(--background)] h-full w-full items-center justify-center text-gray-500 flex-col gap-4">
                            <p>Messenger is disabled.</p>
                            <button className="px-4 py-2 border dark:border-white/20 border-black/20 text-[var(--foreground)] rounded-md hover:bg-black/5 dark:hover:bg-white/5" onClick={() => setSettingsModalOpen(true)}>Enable in Settings</button>
                        </div>
                    )}
                </div>

                <div className={`absolute inset-0 z-10 bg-[var(--background)] ${activeTabId === 'ext_finance' ? 'block' : 'hidden'}`}>
                    {enabledExtensions.includes('finance') ? <FinanceDashboard /> : null}
                </div>

                <div className={`absolute inset-0 z-10 bg-[var(--background)] overflow-y-auto ${activeTabId.startsWith('profile:') ? 'block' : 'hidden'}`}>
                    {activeTabId.startsWith('profile:') && (
                        <ProfilePage
                            userId={activeTabId.split(':')[1]}
                            onOpenFile={(fileId, title) => switchTab(fileId, 'file', title)}
                            onMessage={(uId) => switchTab(`chat-${uId}`, 'chat')}
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
                                        {activeNoteId && files.find(f => f.id === activeNoteId) && (
                                            <>
                                                <div className="flex items-center gap-2 mb-6">
                                                    <input
                                                        type="text"
                                                        autoFocus
                                                        value={fileName}
                                                        onChange={(e) => {
                                                            const newTitle = e.target.value;
                                                            setFileName(newTitle);
                                                            if (activeNoteId) {
                                                                useDataStore.getState().setNotes(files.map(f => f.id === activeNoteId ? { ...f, title: newTitle } : f) as any);
                                                            }
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
                                                        {/* Save status indicator */}
                                                        <span
                                                            title={saveStatus === 'saved' ? 'Gespeichert' : saveStatus === 'saving' ? 'Wird gespeichert…' : 'Nicht gespeichert'}
                                                            className="shrink-0 transition-all duration-300"
                                                        >
                                                            {saveStatus === 'saved' && (
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400 opacity-60">
                                                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                                                    <polyline points="22 4 12 14.01 9 11.01" />
                                                                </svg>
                                                            )}
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
                                                        </span>
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        <Editor
                                            key={activeTabId}
                                            initialContent={editorContent}
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
                                    </div>
                                </div>
                            </CanvasLayer>
                        </div>
                    )}
                </div>
            </div>            {/* FAB Theme Menu */}
            {activeTabId === 'calendar' && (
                <div className="hidden md:block fixed bottom-6 right-6 z-[80]">
                    <button
                        onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                        className={`w-12 h-12 rounded-full bg-white shadow-xl border border-gray-100 flex items-center justify-center transition-all focus:outline-none ${isThemeMenuOpen ? 'rotate-45 text-rose-500 scale-110' : 'text-gray-900 hover:scale-110'}`}
                        title="Manage Themes"
                    >
                        {isThemeMenuOpen ? (
                            <Plus size={24} />
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                        )}
                    </button>

                    {isThemeMenuOpen && (
                        <div className="absolute bottom-16 right-0 w-72 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl shadow-indigo-200/40 border border-gray-100 p-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
                            <div className="flex items-center justify-between mb-4 px-1">
                                <span className="font-semibold text-gray-900 text-sm tracking-tight">Schedule Themes</span>
                                <button
                                    onClick={() => handleCreateEventGroup()}
                                    className="p-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-all"
                                    title="New Theme"
                                >
                                    <Plus size={16} strokeWidth={3} />
                                </button>
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
                </div>
            )}

            {/* Bottom Dock Navigation */}
            <div className="hidden md:flex absolute bottom-6 left-1/2 -translate-x-1/2 z-[60] pointer-events-none flex-col items-center">
                <TabList
                    tabs={openTabs}
                    activeTabId={activeTabId}
                    onTabSelect={handleTabSelect}
                    onTabClose={handleTabClose}
                    onTabsReorder={setOpenTabs}
                    enabledExtensions={enabledExtensions}
                    onOpenMessages={handleOpenMessages}
                    onOpenFinance={() => handleFileSelect('ext_finance', 'Finance Tracker')}
                    onOpenSocial={() => setActiveTabId('social')}
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