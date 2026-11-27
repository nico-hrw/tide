"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { EditorContent } from '@tiptap/react';
import * as Y from 'yjs';
import { YjsE2EEProvider } from '@/lib/yjsE2EEProvider';
import { isCryptoKey } from '@/lib/tabStorage';
import { setDocNote } from '@/lib/ydocRegistry';
import { useActiveNoteStore } from '@/store/activeNoteStore';

import type { EditorProps } from './Editor/types';
import { COLORS } from './Editor/editorConstants';
import { getCleanDocContent } from './Editor/editorUtils';
import { MentionNodeView } from './Editor/MentionNodeView';
import { TableContextMenu } from './Editor/TableContextMenu';
import { EditorBubbleMenu } from './Editor/EditorBubbleMenu';
import ReferenceEditPopover from './Editor/ReferenceEditPopover';
import { TableCellBar } from './Editor/TableCellBar';
import { FormatSearch } from './Editor/FormatSearch';
import { EditorInlineSearch } from './Editor/EditorInlineSearch';
import { MentionShareToast } from './Editor/MentionShareToast';
import { MENTION_SHARE_SKIP_META } from '@/lib/mentionShare';
import { useTipTapConfig } from './Editor/useTipTapConfig';
import {
    InkStroke, InkToolType, PencilInputMode, setEditorInkStrokes,
} from './extensions/PencilInkExtension';
import { PencilInkLayer } from './Canvas/PencilInkLayer';
import { PencilToolbox } from './Canvas/PencilToolbox';
import { useDataStore } from '@/store/useDataStore';
import { useLinkStore } from '@/store/useLinkStore';
import { apiFetch } from '../lib/api';
import { parseUnencryptedNoteContent } from '../hooks/autoSaveHelpers';

/** How long a loaded note stays hidden before it fades in. */
const REVEAL_DELAY_MS = 500;

export default function Editor(props: EditorProps) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    if (!mounted) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-t2-ink-3  h-[50vh] mt-20">
                <span className="font-medium text-sm">Lade Editor...</span>
            </div>
        );
    }

    return <CollaborativeEditor key={props.activeTabId || 'editor-default'} {...props} />;
}

function CollaborativeEditor(props: EditorProps) {
    const {
        initialContent, isShared = false, editable = true, onChange, onLinkClick,
        onForceSave, onPopOut, onBlocksDeleted, onConnectImage, onEditorReady,
        onBlockHover, onAbortLinking, activeTabId, onReturnToTab, onFileClick,
        onEventClick, onActiveUsersChange, userProfile, myId, dek, keyEpoch,
    } = props;
    const cleanInitial = useMemo(() => getCleanDocContent(initialContent), [initialContent]);
    const [pencilMode, setPencilMode] = useState<PencilInputMode>('text');
    const [activeInkTool, setActiveInkTool] = useState<InkToolType>('pen');
    const [inkColor, setInkColor] = useState<string>('#111827');
    const [inkSize, setInkSize] = useState<number>(4);
    const [inkStrokes, setInkStrokes] = useState<InkStroke[]>(() => cleanInitial?.attrs?.inkStrokes || (initialContent as any)?.attrs?.inkStrokes || []);
    const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);
    const [inkUndoStack, setInkUndoStack] = useState<InkStroke[][]>([]);
    const [inkRedoStack, setInkRedoStack] = useState<InkStroke[][]>([]);
    const [ydoc, setYdoc] = useState(() => new Y.Doc());
    const [provider, setProvider] = useState<YjsE2EEProvider | null>(null);
    const contentInitialized = useRef(false);
    const [isSynced, setIsSynced] = useState(false);
    const userHasTypedRef = useRef(false);

    useEffect(() => {
        useActiveNoteStore.getState().setActiveYDoc(ydoc);
        (window as any).__tideActiveYDoc = ydoc;
        return () => {
            if (useActiveNoteStore.getState().activeYDoc === ydoc) {
                useActiveNoteStore.getState().setActiveYDoc(null);
            }
            if ((window as any).__tideActiveYDoc === ydoc) {
                (window as any).__tideActiveYDoc = null;
            }
        };
    }, [ydoc]);

    const livePermission = useActiveNoteStore((s) => s.permission);
    const isEditable = editable && livePermission !== 'view';

    useEffect(() => { userHasTypedRef.current = false; }, [activeTabId]);

    const prevTabIdRef = useRef(activeTabId);
    useEffect(() => {
        if (prevTabIdRef.current !== activeTabId) {
            prevTabIdRef.current = activeTabId;
            if (providerRef.current) {
                (window as any).__tideWsConnected = false;
                providerRef.current.destroy();
                providerRef.current = null;
                setProvider(null);
            }
            ydocRef.current.destroy();
            const newDoc = new Y.Doc();
            ydocRef.current = newDoc;
            setYdoc(newDoc);
            contentInitialized.current = false;
            setIsSynced(false);
            userHasTypedRef.current = false;
        }
    }, [activeTabId]);

    // Owned imperatively (set where a provider is created/destroyed), NOT mirrored from state during
    // render: under StrictMode the effect re-runs before state commits and a render-time mirror would
    // read null, orphaning the first provider (live socket + focus/visibility listeners).
    const providerRef = useRef<YjsE2EEProvider | null>(null);
    const ydocRef = useRef<Y.Doc>(ydoc);
    ydocRef.current = ydoc;

    const storeDEK = useActiveNoteStore((s) => s.activeDEK);
    const storeEpoch = useActiveNoteStore((s) => s.keyEpoch);
    // Only a real CryptoKey can decrypt; a `{}` left by a JSON round trip must count as "no key yet".
    const dekCandidate = dek || storeDEK || useActiveNoteStore.getState().activeDEK || null;
    const activeDek = isCryptoKey(dekCandidate) ? dekCandidate : null;
    const activeEpoch = keyEpoch || storeEpoch || useActiveNoteStore.getState().keyEpoch || 1;
    const isNoteTab = Boolean(
        activeTabId &&
        !activeTabId.startsWith('chat-') &&
        !activeTabId.startsWith('profile:') &&
        !['calendar', 'messages', 'social', 'ext_finance'].includes(activeTabId)
    );

    const userProfileRef = useRef(userProfile);
    userProfileRef.current = userProfile;

    const createProvider = useCallback((key: CryptoKey, docToUse: Y.Doc) => {
        if (!activeTabId) return null;

        const userId = myId || useDataStore.getState().myId || 'anonymous';
        const token = sessionStorage.getItem('tide_session_token') || localStorage.getItem('tide_session_token') || '';
        const isLoggedIn = Boolean(token || (myId && myId !== 'anonymous') || useDataStore.getState().myId);

        setDocNote(docToUse, activeTabId);
        const e2eeProvider = new YjsE2EEProvider(activeTabId, docToUse, key, {
            keyEpoch: activeEpoch,
            token,
            onRoleChanged: (perm) => {
                useActiveNoteStore.getState().setLivePermission(perm);
            },
            onKeyRotated: async (newEpoch) => {
                try {
                    const res = await apiFetch(`/api/v1/files/${activeTabId}`, { offline: 'never' });
                    if (!res.ok) return;
                    const fileData = (await res.json().catch(() => null)) as {
                        access_keys?: string | Record<string, { wrapped_key?: string; pwd_iv?: string }>;
                        metadata?: string | { has_custom_password?: boolean };
                    } | null;
                    if (!fileData?.access_keys) return;
                    const accessKeys = typeof fileData.access_keys === 'string'
                        ? (JSON.parse(fileData.access_keys) as Record<string, { wrapped_key?: string; pwd_iv?: string }>)
                        : fileData.access_keys;
                    const metaObj = typeof fileData.metadata === 'string'
                        ? (JSON.parse(fileData.metadata) as { has_custom_password?: boolean })
                        : (fileData.metadata || {});
                    const entry = (userId && accessKeys[userId]) || Object.values(accessKeys)[0];
                    if (!entry?.wrapped_key || (metaObj.has_custom_password && entry.pwd_iv)) return;
                    const [{ getMasterKey }, { unwrapDEKData, importDEK }] = await Promise.all([
                        import('@/lib/keyStorage'),
                        import('@/lib/cryptoV2'),
                    ]);
                    const masterPrivKey = await getMasterKey();
                    if (!masterPrivKey) return;
                    const rawDek = await unwrapDEKData(entry.wrapped_key, masterPrivKey);
                    const rotatedDek = await importDEK(rawDek);
                    useActiveNoteStore.getState().setActiveDEK(rotatedDek);
                    useActiveNoteStore.getState().setKeyEpoch(newEpoch);
                    providerRef.current?.updateDEK(rotatedDek, newEpoch);
                } catch (rotErr) {
                    console.warn('[Editor] Failed to refresh rotated DEK:', rotErr);
                }
            },
        });

        const hash = Array.from(userId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const color = COLORS[hash % COLORS.length];

        const profile = userProfileRef.current;
        e2eeProvider.awareness.setLocalStateField('user', {
            name: profile?.username || (isLoggedIn ? 'User' : 'Gast'),
            color,
            id: userId,
            seed: profile?.avatar_seed || userId,
            avatar: profile?.avatar_url || profile?.avatar,
        });

        (window as any).__tideWsConnected = e2eeProvider.wsconnected;
        const handleWsStatus = (event: { status: string }) => {
            (window as any).__tideWsConnected = event.status === 'connected';
        };
        e2eeProvider.on('status', handleWsStatus);

        return e2eeProvider;
    }, [activeTabId, activeEpoch, myId]);

    useEffect(() => {
        if (!isNoteTab || !activeDek) {
            if (providerRef.current) {
                (window as any).__tideWsConnected = false;
                providerRef.current.destroy();
                providerRef.current = null;
                setProvider(null);
            }
            return;
        }

        let isCancelled = false;

        if (providerRef.current && providerRef.current.noteId !== activeTabId) {
            (window as any).__tideWsConnected = false;
            providerRef.current.destroy();
            providerRef.current = null;
            setProvider(null);
        }

        if (!providerRef.current) {
            const newProvider = createProvider(activeDek, ydocRef.current);
            if (newProvider) {
                if (isCancelled) {
                    newProvider.destroy();
                } else {
                    providerRef.current = newProvider;
                    setProvider(newProvider);
                }
            }
        } else {
            providerRef.current.updateDEK(activeDek, activeEpoch);
        }

        return () => {
            isCancelled = true;
        };
    }, [activeTabId, isNoteTab, activeDek, activeEpoch, createProvider]);

    useEffect(() => {
        return () => {
            if (providerRef.current) {
                (window as any).__tideWsConnected = false;
                providerRef.current.destroy();
                providerRef.current = null;
            }
            ydocRef.current.destroy();
            contentInitialized.current = false;
        };
    }, []);

    useEffect(() => {
        if (!provider) return;

        const handleSync = (synced: boolean) => {
            setIsSynced(synced);
        };
        provider.on('sync', handleSync);
        if (provider.synced) {
            setIsSynced(true);
        }

        const handleChange = () => {
            if (onActiveUsersChange) {
                const states = Array.from(provider.awareness.getStates().values());
                const users = states.map((s: any) => s.user).filter(Boolean);
                const unique = Array.from(new Map(users.map(u => [u.id, u])).values());
                onActiveUsersChange(unique);
            }
        };
        provider.awareness.on('change', handleChange);

        return () => {
            provider.off('sync', handleSync);
            provider.awareness.off('change', handleChange);
            setIsSynced(false);
        };
    }, [provider, onActiveUsersChange]);

    useEffect(() => {
        if (!provider?.awareness) return;
        const userId = myId || useDataStore.getState().myId || 'anonymous';
        const token = typeof window !== 'undefined' ? (sessionStorage.getItem('tide_session_token') || localStorage.getItem('tide_session_token')) : '';
        const isLoggedIn = Boolean(token || (myId && myId !== 'anonymous') || useDataStore.getState().myId);
        const hash = Array.from(userId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const color = COLORS[hash % COLORS.length];

        provider.awareness.setLocalStateField('user', {
            name: userProfile?.username || (isLoggedIn ? 'User' : 'Gast'),
            color,
            id: userId,
            seed: userProfile?.avatar_seed || userId,
            avatar: userProfile?.avatar_url || userProfile?.avatar,
        });
    }, [provider, userProfile?.username, userProfile?.avatar_seed, userProfile?.avatar_url, userProfile?.avatar, myId]);

    const onEventClickRef = useRef(onEventClick);
    useEffect(() => { onEventClickRef.current = onEventClick; }, [onEventClick]);
    const onLinkClickRef = useRef(onLinkClick);
    useEffect(() => { onLinkClickRef.current = onLinkClick; }, [onLinkClick]);

    const { editor } = useTipTapConfig({
        initialContent, editable: isEditable, isShared, provider, ydoc, isSynced,
        activeTabId, onBlocksDeleted, onChange, onLinkClick, onFileClick,
        onEventClick, onForceSave, setInkStrokes, userHasTypedRef, contentInitialized,
        userProfile, myId,
    });

    useEffect(() => {
        (window as any).__tideEditor = editor;
        return () => {
            if ((window as any).__tideEditor === editor) {
                (window as any).__tideEditor = null;
            }
        };
    }, [editor]);

    useEffect(() => {
        const strokes = cleanInitial?.attrs?.inkStrokes || (initialContent as any)?.attrs?.inkStrokes;
        if (strokes && Array.isArray(strokes)) {
            setInkStrokes(strokes);
        } else if (editor?.state?.doc?.attrs?.inkStrokes && Array.isArray(editor.state.doc.attrs.inkStrokes) && editor.state.doc.attrs.inkStrokes.length > 0) {
            setInkStrokes(editor.state.doc.attrs.inkStrokes);
        }
    }, [cleanInitial, initialContent, editor]);

    const propsRef = useRef(props);
    propsRef.current = props;

    // Handle restore-content custom event
    useEffect(() => {
        if (!editor) return;
        const handleRestore = (e: Event) => {
            if (!editor || editor.isDestroyed) return;
            const content = (e as CustomEvent).detail;
            if (!content) return;
            try {
                const jsonContent = typeof content === 'string' ? JSON.parse(content) : content;
                const cleanJson = (jsonContent && jsonContent.__yjs) ? (({ __yjs, ...rest }) => rest)(jsonContent) : jsonContent;
                if (ydoc) {
                    const xmlFragment = ydoc.getXmlFragment('prosemirror');
                    let syncedViaYjs = false;
                    ydoc.transact(() => {
                        while (xmlFragment.length > 0) xmlFragment.delete(0, 1);
                        try {
                            const doc = editor.schema.nodeFromJSON(cleanJson);
                            const { prosemirrorToYXmlFragment } = require('@tiptap/y-tiptap');
                            // BUG-10 fix: NEVER mutate client ID to a static value!
                            prosemirrorToYXmlFragment(doc, xmlFragment);
                            syncedViaYjs = true;
                        } catch (_) {
                            // Fallback handled by setContent below
                        }
                    });
                    if (!syncedViaYjs) {
                        editor.commands.setContent(cleanJson, { emitUpdate: false });
                    }
                } else {
                    editor.chain().setMeta(MENTION_SHARE_SKIP_META, true).setContent(cleanJson).run();
                }
                const restoredStrokes = cleanJson?.attrs?.inkStrokes || [];
                setInkStrokes(restoredStrokes);
                setEditorInkStrokes(editor, restoredStrokes);
                userHasTypedRef.current = true;
                onChange?.(cleanJson);
                (propsRef.current as any)?.onContentChange?.(cleanJson);
            } catch (err) {
                console.error('Failed to restore via Yjs/setContent:', err);
                try {
                    editor.chain().setMeta(MENTION_SHARE_SKIP_META, true).setContent(content).run();
                    const parsedFallback = typeof content === 'string' ? JSON.parse(content) : content;
                    const fallbackStrokes = parsedFallback?.attrs?.inkStrokes || [];
                    setInkStrokes(fallbackStrokes);
                    setEditorInkStrokes(editor, fallbackStrokes);
                    userHasTypedRef.current = true;
                    onChange?.(parsedFallback);
                    (propsRef.current as any)?.onContentChange?.(parsedFallback);
                } catch (fallbackErr) {
                    console.error('Fallback setContent failed:', fallbackErr);
                }
            }
        };
        window.addEventListener('editor:restore-content', handleRestore);
        return () => window.removeEventListener('editor:restore-content', handleRestore);
    }, [editor, ydoc, provider, onChange]);

    // Refresh editor content when an external note update arrives
    useEffect(() => {
        if (!editor || !activeTabId) return;
        let cancelled = false;

        const handleExternalNoteUpdated = (event: Event) => {
            if ((event as CustomEvent<{ fileId?: string }>).detail?.fileId !== activeTabId) return;
            if (!editor || editor.isDestroyed || !activeTabId) return;

            void (async () => {
                try {
                    const res = await apiFetch(`/api/v1/files/${activeTabId}/download`);
                    if (cancelled || !res.ok || !editor || editor.isDestroyed) return;
                    const rawText = await res.text();
                    if (cancelled || !editor || editor.isDestroyed) return;
                    const parsedStr = parseUnencryptedNoteContent(rawText);
                    const doc = JSON.parse(parsedStr) as Parameters<typeof editor.commands.setContent>[0];
                    if (!cancelled && editor && !editor.isDestroyed) {
                        editor.chain().setMeta(MENTION_SHARE_SKIP_META, true).setContent(doc).run();
                    }
                } catch (err) {
                    console.warn('[Editor] Failed to refresh external note update:', err);
                }
            })();
        };

        window.addEventListener('tide:external_note_updated', handleExternalNoteUpdated);
        return () => {
            cancelled = true;
            window.removeEventListener('tide:external_note_updated', handleExternalNoteUpdated);
        };
    }, [editor, activeTabId]);

    // Resize image & mention click hooks
    useEffect(() => {
        if (!editor) return;

        const handleResizeImage = (e: CustomEvent) => {
            if (!editor || editor.isDestroyed) return;
            const { src, width, height } = e.detail;
            try {
                editor.state.doc.descendants((node, pos) => {
                    if (node.type.name === 'image' && node.attrs.src === src) {
                        editor.chain().setNodeSelection(pos).updateAttributes('image', { width, height }).run();
                    }
                });
            } catch (_) {}
        };
        window.addEventListener('canvas:resize-tiptap-image', handleResizeImage as EventListener);

        const handleMentionClick = (e: CustomEvent) => {
            const { id, title, type, start } = e.detail;
            const isEvent = type === 'event' || !!useDataStore.getState().events?.find(item => item.id === id);
            const ev = useDataStore.getState().events?.find(item => item.id === id);
            const eventStart = ev?.start || start;

            if (isEvent) {
                if (onEventClickRef.current) onEventClickRef.current(id);
                window.dispatchEvent(new CustomEvent('calendar:scroll-to', { detail: { id, start: eventStart } }));
                window.dispatchEvent(new CustomEvent('tide:select-event', { detail: { id, start: eventStart } }));
                return;
            }

            if (type === 'file') {
                // Notify onLinkClick listener if provided
                if (onLinkClickRef.current) {
                    onLinkClickRef.current({ id, type: 'file', title });
                }
                // Also trigger file download directly
                let downloadUrl = '';
                if (typeof window !== 'undefined' && window.location.pathname.startsWith('/notes/')) {
                    const slug = window.location.pathname.replace('/notes/', '').split('/')[0].split('?')[0];
                    downloadUrl = `/api/v1/quicknotes/${encodeURIComponent(slug)}/files/${encodeURIComponent(id)}`;
                } else {
                    downloadUrl = `/api/v1/files/${encodeURIComponent(id)}/download`;
                }
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = title || 'attachment';
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                return;
            }

            if (onLinkClickRef.current) onLinkClickRef.current({ id, type: type || 'note', title });
            useDataStore.getState().setActiveNoteId(id);
        };
        window.addEventListener('editor:mention-click', handleMentionClick as EventListener);

        const handleCalEventMentionClick = (e: CustomEvent) => {
            const { eventId, start } = e.detail;
            const ev = useDataStore.getState().events?.find(item => item.id === eventId);
            const eventStart = ev?.start || start;
            if (onEventClickRef.current) onEventClickRef.current(eventId);
            window.dispatchEvent(new CustomEvent('calendar:scroll-to', { detail: { id: eventId, start: eventStart } }));
            window.dispatchEvent(new CustomEvent('tide:select-event', { detail: { id: eventId, start: eventStart } }));
        };
        window.addEventListener('calendarEventMention:click', handleCalEventMentionClick as EventListener);

        if (onEditorReady) onEditorReady(editor);

        const stored = useLinkStore.getState().pendingLink;
        let timer: any = null;
        if (stored) {
            useLinkStore.getState().clearPendingLink();
            timer = setTimeout(() => {
                if (!editor || editor.isDestroyed) return;
                const insertPos = editor.state.selection.from;
                editor.chain().focus().insertContentAt(insertPos, {
                    type: 'mention', attrs: { id: stored.targetId, label: stored.title }
                }).insertContentAt(insertPos + 1, ' ').run();

                if (stored.range && stored.range.from > 0) {
                    try { editor.commands.deleteRange(stored.range); } catch (e) { }
                }

                try {
                    if ((editor as any).editorView) {
                        editor.view.dispatch(editor.state.tr);
                    }
                } catch (_) {}
                if (onForceSave) onForceSave(editor.getJSON());
            }, 50);
        }
        return () => {
            window.removeEventListener('canvas:resize-tiptap-image', handleResizeImage as EventListener);
            window.removeEventListener('editor:mention-click', handleMentionClick as EventListener);
            window.removeEventListener('calendarEventMention:click', handleCalEventMentionClick as EventListener);
            if (timer) clearTimeout(timer);
        };
    }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

    // Pin System Hover Delegation
    useEffect(() => {
        if (!editor || editor.isDestroyed || !onBlockHover) return;
        let dom: HTMLElement | null = null;
        try {
            dom = (editor as any).editorView ? editor.view.dom : null;
        } catch {
            return;
        }
        if (!dom) return;

        const handleMouseMove = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const block = target.closest('[data-block-id]');
            onBlockHover(block?.getAttribute('data-block-id') || null);
        };
        const handleMouseLeave = () => onBlockHover(null);

        dom.addEventListener('mousemove', handleMouseMove);
        dom.addEventListener('mouseleave', handleMouseLeave);
        return () => {
            dom.removeEventListener('mousemove', handleMouseMove);
            dom.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, [editor, onBlockHover]);

    // Track block ID at cursor
    const currentBlockIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (!editor) return;
        const updateBlock = () => {
            try {
                const { $to } = editor.state.selection;
                let foundId = null;
                for (let d = $to.depth; d >= 0; d--) {
                    const node = $to.node(d);
                    if (node.attrs?.blockId) {
                        foundId = node.attrs.blockId as string;
                        break;
                    }
                }
                currentBlockIdRef.current = foundId;
            } catch {
                currentBlockIdRef.current = null;
            }
        };
        editor.on('selectionUpdate', updateBlock);
        editor.on('transaction', updateBlock);
        return () => {
            editor.off('selectionUpdate', updateBlock);
            editor.off('transaction', updateBlock);
        };
    }, [editor]);

    const [tableMenuData, setTableMenuData] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const handleGlobalClick = () => setTableMenuData(null);
        window.addEventListener('click', handleGlobalClick);
        return () => window.removeEventListener('click', handleGlobalClick);
    }, []);

    const handleInkStrokesChange = useCallback((nextStrokes: InkStroke[]) => {
        setInkUndoStack((prev) => [...prev.slice(-49), inkStrokes]);
        setInkRedoStack([]);
        setInkStrokes(nextStrokes);
        userHasTypedRef.current = true;
        setEditorInkStrokes(editor, nextStrokes);
    }, [editor, inkStrokes]);

    const handleInkUndo = useCallback(() => {
        if (inkUndoStack.length === 0) return;
        const previous = inkUndoStack[inkUndoStack.length - 1];
        setInkUndoStack((prev) => prev.slice(0, -1));
        setInkRedoStack((prev) => [...prev, inkStrokes]);
        setInkStrokes(previous);
        setSelectedStrokeIds([]);
        userHasTypedRef.current = true;
        setEditorInkStrokes(editor, previous);
    }, [editor, inkUndoStack, inkStrokes]);

    const handleInkRedo = useCallback(() => {
        if (inkRedoStack.length === 0) return;
        const next = inkRedoStack[inkRedoStack.length - 1];
        setInkRedoStack((prev) => prev.slice(0, -1));
        setInkUndoStack((prev) => [...prev, inkStrokes]);
        setInkStrokes(next);
        setSelectedStrokeIds([]);
        userHasTypedRef.current = true;
        setEditorInkStrokes(editor, next);
    }, [editor, inkRedoStack, inkStrokes]);

    const handleDeleteSelectedStrokes = useCallback(() => {
        if (selectedStrokeIds.length === 0) return;
        const selectedSet = new Set(selectedStrokeIds);
        const remaining = inkStrokes.filter((s) => !selectedSet.has(s.id));
        setSelectedStrokeIds([]);
        handleInkStrokesChange(remaining);
    }, [selectedStrokeIds, inkStrokes, handleInkStrokesChange]);

    // The note is rendered right away but only shown after a short hold, so it fades in as one piece instead of building up on screen.
    const ready = Boolean(editor) && (!provider || isSynced);
    const [revealed, setRevealed] = useState(false);
    useEffect(() => {
        if (!ready) { setRevealed(false); return; }
        const timer = setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);
        return () => clearTimeout(timer);
    }, [ready]);

    if (isNoteTab && !activeDek) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[200px] text-muted-foreground/60 text-sm gap-2">
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <span>Lade Schlüssel für verschlüsselte Notiz...</span>
            </div>
        );
    }

    if (!editor) {
        if (provider && !isSynced) {
            return (
                <div className="flex flex-col items-center justify-center min-h-[200px] text-muted-foreground/60 text-sm gap-2">
                    <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <span>Synchronisiere Notiz...</span>
                </div>
            );
        }
        return null;
    }

    return (
        <div className="editor-container w-full max-w-full overflow-x-hidden relative">
            {!revealed && (
                <div className="absolute inset-x-0 top-0 flex justify-center pt-24 pointer-events-none" aria-hidden>
                    <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
            )}
            <div
                className={`transition-opacity duration-300 ease-out ${revealed ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                style={{ willChange: revealed ? undefined : 'opacity' }}
            >
            <FormatSearch editor={editor} />
            <TableCellBar editor={editor} />
            <EditorBubbleMenu
                editor={editor}
                activeTabId={activeTabId}
                onPopOut={onPopOut}
                onConnectImage={onConnectImage}
                currentBlockIdRef={currentBlockIdRef}
            />
            <ReferenceEditPopover editor={editor} />

            <div
                className="min-h-[500px] w-full max-w-full overflow-x-hidden relative"
                onContextMenu={(e) => {
                    if (editor?.isActive('table')) {
                        e.preventDefault();
                        setTableMenuData({ x: e.clientX, y: e.clientY });
                    }
                }}
                onDragOver={(e) => e.preventDefault()}
                onClick={(e) => {
                    if (!editor || !editable) return;
                    const target = e.target as HTMLElement;
                    if (target.classList.contains('ProseMirror')) {
                        try {
                            if ((editor as any).editorView && editor.view?.dom) {
                                const lastChild = editor.view.dom.lastElementChild as HTMLElement;
                                if (lastChild) {
                                    const rect = lastChild.getBoundingClientRect();
                                    if (e.clientY > rect.bottom + 20) {
                                        const diff = e.clientY - rect.bottom;
                                        const linesToAdd = Math.floor(diff / 28);
                                        if (linesToAdd > 0) {
                                            let html = '';
                                            for (let i = 0; i < linesToAdd; i++) html += '<p></p>';
                                            editor.chain().focus('end').insertContent(html).run();
                                        } else {
                                            editor.chain().focus('end').run();
                                        }
                                    }
                                }
                            }
                        } catch (_) {}
                    }
                }}
            >
                {provider && !isSynced ? (
                    <div className="flex flex-col items-center justify-center min-h-[200px] text-muted-foreground/60 text-sm gap-2">
                        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <span>Synchronisiere Notiz...</span>
                    </div>
                ) : (
                    <EditorContent editor={editor} className="w-full max-w-full" />
                )}
                <PencilInkLayer
                    strokes={inkStrokes}
                    onStrokesChange={handleInkStrokesChange}
                    mode={pencilMode}
                    activeTool={activeInkTool}
                    strokeColor={inkColor}
                    strokeSize={inkSize}
                    selectedStrokeIds={selectedStrokeIds}
                    onSelectedStrokeIdsChange={setSelectedStrokeIds}
                    editable={editable}
                />
            </div>

            {editable && (
                <PencilToolbox
                    mode={pencilMode}
                    onModeChange={(nextMode) => {
                        setPencilMode(nextMode);
                        if (nextMode === 'text') setSelectedStrokeIds([]);
                    }}
                    activeTool={activeInkTool}
                    onToolChange={setActiveInkTool}
                    strokeColor={inkColor}
                    onColorChange={setInkColor}
                    strokeSize={inkSize}
                    onSizeChange={setInkSize}
                    canUndo={inkUndoStack.length > 0}
                    canRedo={inkRedoStack.length > 0}
                    onUndo={handleInkUndo}
                    onRedo={handleInkRedo}
                    selectedCount={selectedStrokeIds.length}
                    onDeleteSelected={handleDeleteSelectedStrokes}
                    strokeCount={inkStrokes.length}
                />
            )}

            {tableMenuData && (
                <TableContextMenu editor={editor} position={tableMenuData} onClose={() => setTableMenuData(null)} />
            )}

            <EditorInlineSearch editor={editor} />
            <MentionShareToast editor={editor} fileId={activeTabId} />
            </div>
        </div>
    );
}

export type { EditorProps };
export { MentionNodeView };
