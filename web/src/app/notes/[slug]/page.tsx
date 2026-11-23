'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
    Share2, FolderInput, Check, Loader2, AlertCircle, X,
    Paperclip, UploadCloud, Download, Trash2, Plus,
    Lock, Unlock, ShieldCheck, Clock, LogIn, RefreshCw, Users, UserCheck, UserX,
} from 'lucide-react';
import Editor from '@/components/Editor';
import Avatar from '@/components/Profile/Avatar';
import {
    deriveQuicknoteKey, fetchQuicknote, fetchQuicknoteTree, saveQuicknote,
    fetchQuicknoteFiles, uploadQuicknoteFile, getQuicknoteFileDownloadUrl,
    deleteQuicknoteFile,
    saveKnownQuicknote, saveKnownQuicknotes, StorageLimitError,
    QuicknoteAccessError, setQuicknoteAccessMode, requestQuicknoteAccess,
    fetchQuicknoteAccessRequests, resolveQuicknoteAccessRequest,
    type QuicknoteData, type QuicknoteTreeNode, type QuicknoteAttachment,
    type QuicknoteAccessRequest, type QuicknoteAccessMode, type QuicknoteAccessGateStatus,
} from '@/lib/quicknotesApi';
import { useDataStore } from '@/store/useDataStore';

interface ToastState {
    type: 'success' | 'auth' | 'error';
    text: string;
    authLink?: string;
}

interface LinkedNoteItem {
    id: string;
    label: string;
}

function extractLinkedNotes(doc: unknown): LinkedNoteItem[] {
    const results: LinkedNoteItem[] = [];
    const seen = new Set<string>();
    function traverse(node: unknown) {
        if (!node || typeof node !== 'object') return;
        const n = node as Record<string, unknown>;
        if (n.type === 'mention' && n.attrs && typeof n.attrs === 'object') {
            const attrs = n.attrs as Record<string, unknown>;
            if (attrs.type === 'note' || !attrs.type) {
                const id = typeof attrs.id === 'string' ? attrs.id : '';
                const label = typeof attrs.label === 'string' ? attrs.label.trim() : '';
                if (id && !seen.has(id)) {
                    seen.add(id);
                    results.push({ id, label: label || id || 'Notiz' });
                }
            }
        }
        if (Array.isArray(n.content)) for (const child of n.content) traverse(child);
    }
    traverse(doc);
    return results;
}

interface TreeItem {
    slug: string;
    parent_slug?: string;
    title: string;
    depth: number;
    children: TreeItem[];
}

function BranchCurve() {
    return (
        <svg className="w-3.5 h-5 text-t2-ink-3  absolute -left-3.5 top-0 pointer-events-none" viewBox="0 0 14 20" fill="none">
            <path d="M 0 0 V 10 Q 0 16 6 16 H 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

function buildTree(
    nodes: QuicknoteTreeNode[],
    currentSlug: string,
    currentTitle: string,
    pending: LinkedNoteItem[] = []
): TreeItem | null {
    if (nodes.length === 0 && !currentSlug) return null;
    const map = new Map<string, TreeItem>();
    for (const n of nodes) {
        map.set(n.slug, {
            slug: n.slug,
            parent_slug: n.parent_slug || undefined,
            title: n.slug === currentSlug && currentTitle.trim() ? currentTitle.trim() : (n.title || n.slug),
            depth: n.depth,
            children: [],
        });
    }
    if (currentSlug && !map.has(currentSlug)) {
        map.set(currentSlug, { slug: currentSlug, title: currentTitle.trim() || currentSlug, depth: 0, children: [] });
    }
    for (const p of pending) {
        if (!map.has(p.id)) {
            const parent = map.get(currentSlug);
            map.set(p.id, {
                slug: p.id,
                parent_slug: currentSlug,
                title: p.label || p.id,
                depth: parent ? parent.depth + 1 : 1,
                children: [],
            });
        }
    }
    let root: TreeItem | null = null;
    for (const item of Array.from(map.values())) {
        if (item.parent_slug && map.has(item.parent_slug) && item.parent_slug !== item.slug) {
            const parent = map.get(item.parent_slug)!;
            if (!parent.children.some((c) => c.slug === item.slug)) parent.children.push(item);
        } else if (item.depth === 0 && !root) {
            root = item;
        }
    }
    return root || Array.from(map.values()).sort((a, b) => a.depth - b.depth)[0] || null;
}

function TreeNodeItemView({ node, activeSlug, rootSlug }: { node: TreeItem; activeSlug: string; rootSlug?: string }) {
    const isActive = node.slug === activeSlug;
    return (
        <div className="relative flex flex-col">
            <div className="relative flex items-center min-h-[22px]">
                <BranchCurve />
                {isActive ? (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-t2-ink  truncate py-0.5" title={node.title}>
                        <span className="w-1 h-1 rounded-full bg-t2-ink-3  shrink-0" />
                        <span className="truncate">{node.title}</span>
                    </div>
                ) : (
                    <Link
                        href={`/notes/${encodeURIComponent(node.slug)}${rootSlug ? `?root=${encodeURIComponent(rootSlug)}` : ''}`}
                        className="flex items-center gap-1.5 text-xs text-t2-ink-2  hover:text-t2-ink  truncate transition-colors py-0.5 max-w-full"
                        title={node.title}
                    >
                        <span className="truncate">{node.title}</span>
                    </Link>
                )}
            </div>
            {node.children.length > 0 && (
                <div className="relative ml-3.5 pl-3.5 border-l border-t2-line  space-y-1 mt-1">
                    {node.children.map((child) => (
                        <TreeNodeItemView key={child.slug} node={child} activeSlug={activeSlug} rootSlug={rootSlug} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function QuicknotePage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const rawSlug = typeof params?.slug === 'string' ? params.slug : Array.isArray(params?.slug) ? params.slug[0] : '';
    const slug = useMemo(() => {
        try { return decodeURIComponent(rawSlug || ''); } catch { return rawSlug || ''; }
    }, [rawSlug]);
    const rootSlug = searchParams?.get('root') || slug;

    const myId = useDataStore((s) => s.myId);
    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

    useEffect(() => {
        const token = typeof window !== 'undefined'
            ? (sessionStorage.getItem('tide_session_token') || localStorage.getItem('tide_session_token'))
            : null;
        setIsLoggedIn(Boolean(myId || token));
    }, [myId]);

    const [loading, setLoading] = useState<boolean>(true);
    const [title, setTitle] = useState<string>('');
    const [content, setContent] = useState<unknown>(null);
    const [initialContent, setInitialContent] = useState<unknown>(null);
    const [quicknoteKey, setQuicknoteKey] = useState<CryptoKey | null>(null);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'success'>('idle');
    const [toast, setToast] = useState<ToastState | null>(null);
    const [treeNodes, setTreeNodes] = useState<QuicknoteTreeNode[]>([]);
    const [copied, setCopied] = useState<boolean>(false);
    const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [profileMenuOpen, setProfileMenuOpen] = useState<boolean>(false);
    const profileMenuRef = useRef<HTMLDivElement | null>(null);

    // Access control state
    const [accessMode, setAccessMode] = useState<QuicknoteAccessMode>('open');
    const [isOwner, setIsOwner] = useState<boolean>(false);
    const [ownerId, setOwnerId] = useState<string | null>(null);
    const [accessGate, setAccessGate] = useState<{ status: QuicknoteAccessGateStatus; title: string } | null>(null);
    const [accessRequests, setAccessRequests] = useState<QuicknoteAccessRequest[]>([]);
    const [accessActionLoading, setAccessActionLoading] = useState<boolean>(false);
    const [requestsPanelOpen, setRequestsPanelOpen] = useState<boolean>(false);
    const requestsPanelRef = useRef<HTMLDivElement | null>(null);

    // File attachments & upload state
    const [attachments, setAttachments] = useState<QuicknoteAttachment[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const loadAttachments = useCallback(async () => {
        if (!slug) return;
        try {
            const files = await fetchQuicknoteFiles(slug);
            setAttachments(files);
            if (typeof window !== 'undefined') {
                (window as unknown as { __tide_active_attachments?: QuicknoteAttachment[] }).__tide_active_attachments = files;
            }
        } catch (err) {
            console.error('Failed to load attachments:', err);
        }
    }, [slug]);

    useEffect(() => {
        if (slug && !loading && !accessGate) void loadAttachments();
    }, [slug, loading, accessGate, loadAttachments]);

    useEffect(() => {
        if (slug && title && !accessGate) saveKnownQuicknote({ slug, title });
    }, [slug, title, accessGate]);

    const titleRef = useRef<string>('');
    titleRef.current = title;
    const contentRef = useRef<unknown>(null);
    contentRef.current = content;
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!profileMenuOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
                setProfileMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [profileMenuOpen]);

    useEffect(() => {
        if (!requestsPanelOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (requestsPanelRef.current && !requestsPanelRef.current.contains(e.target as Node)) {
                setRequestsPanelOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [requestsPanelOpen]);

    const applyQuicknoteData = useCallback((data: QuicknoteData | null) => {
        setAccessGate(null);
        setAccessMode(data?.access_mode === 'approval_required' ? 'approval_required' : 'open');
        setIsOwner(Boolean(data?.is_owner));
        setOwnerId(data?.owner_id ?? null);

        const loadedTitle = data?.title || slug;
        setTitle(loadedTitle);
        titleRef.current = loadedTitle;

        let loadedContent: unknown = null;
        if (data?.content) {
            try {
                loadedContent = JSON.parse(data.content);
            } catch {
                loadedContent = data.content;
            }
        }
        setContent(loadedContent);
        setInitialContent(loadedContent);
        contentRef.current = loadedContent;
    }, [slug]);

    const debouncedSave = useCallback((newContent: unknown, newTitle?: string) => {
        if (!slug) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        const currentTitle = newTitle ?? titleRef.current ?? slug;
        contentRef.current = newContent;

        saveTimerRef.current = setTimeout(async () => {
            try {
                const serialized = typeof newContent === 'string' ? newContent : JSON.stringify(newContent ?? '');
                await saveQuicknote(slug, currentTitle, serialized);
            } catch (err) {
                console.error('Failed to auto-save quicknote:', err);
            }
        }, 800);
    }, [slug]);

    const handleTitleChange = (newTitle: string) => {
        setTitle(newTitle);
        titleRef.current = newTitle;
        debouncedSave(contentRef.current, newTitle);
    };

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (!slug) return;
        let isMounted = true;
        setLoading(true);
        setAccessGate(null);
        setAccessMode('open');
        setIsOwner(false);
        setOwnerId(null);
        setAccessRequests([]);
        setRequestsPanelOpen(false);

        const initNote = async () => {
            try {
                const key = await deriveQuicknoteKey(slug);
                if (!isMounted) return;
                setQuicknoteKey(key);

                let data: QuicknoteData | null = null;
                try {
                    data = await fetchQuicknote(slug);
                } catch (err) {
                    if (!isMounted) return;
                    if (err instanceof QuicknoteAccessError) {
                        setAccessGate({
                            status: err.accessStatus,
                            title: err.noteTitle || slug,
                        });
                        setAccessMode('approval_required');
                        setIsOwner(false);
                        setOwnerId(null);
                        return;
                    }
                    data = null;
                }
                if (!isMounted) return;

                applyQuicknoteData(data);
            } catch (err) {
                console.error('Failed to initialize quicknote:', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        void initNote();
        return () => { isMounted = false; };
    }, [slug, applyQuicknoteData]);

    const checkQuicknoteStatus = useCallback(async (showSpinner = false) => {
        if (!slug) return;
        if (showSpinner) setAccessActionLoading(true);
        try {
            const data = await fetchQuicknote(slug);
            applyQuicknoteData(data);
        } catch (err) {
            if (err instanceof QuicknoteAccessError) {
                setAccessGate({
                    status: err.accessStatus,
                    title: err.noteTitle || slug,
                });
            } else if (showSpinner) {
                const msg = err instanceof Error ? err.message : 'Status konnte nicht geprüft werden.';
                setToast({ type: 'error', text: msg });
            }
        } finally {
            if (showSpinner) setAccessActionLoading(false);
        }
    }, [slug, applyQuicknoteData]);

    useEffect(() => {
        if (!slug || accessGate?.status !== 'pending') return;
        const interval = setInterval(() => {
            void checkQuicknoteStatus(false);
        }, 5000);
        return () => clearInterval(interval);
    }, [slug, accessGate?.status, checkQuicknoteStatus]);

    const loadAccessRequests = useCallback(async () => {
        if (!slug || !isLoggedIn || accessGate || !isOwner || accessMode !== 'approval_required') return;
        try {
            const list = await fetchQuicknoteAccessRequests(slug);
            setAccessRequests(list);
        } catch (err) {
            console.error('Failed to load quicknote access requests:', err);
        }
    }, [slug, isLoggedIn, accessGate, isOwner, accessMode]);

    useEffect(() => {
        if (!slug || !isLoggedIn || accessGate || !isOwner || accessMode !== 'approval_required') {
            setAccessRequests([]);
            return;
        }
        void loadAccessRequests();
        const interval = setInterval(() => {
            void loadAccessRequests();
        }, 5000);
        return () => clearInterval(interval);
    }, [slug, isLoggedIn, accessGate, isOwner, accessMode, loadAccessRequests]);

    const pendingRequests = useMemo(
        () => accessRequests.filter((req) => req.status === 'pending'),
        [accessRequests]
    );

    const handleRequestAccess = async () => {
        if (!slug || accessActionLoading) return;
        setAccessActionLoading(true);
        try {
            const res = await requestQuicknoteAccess(slug);
            if (res.status === 'approved') {
                await checkQuicknoteStatus(false);
            } else {
                setAccessGate((prev) =>
                    prev ? { ...prev, status: res.status === 'denied' ? 'denied' : 'pending' } : prev
                );
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Zugriffsanfrage fehlgeschlagen.';
            setToast({ type: 'error', text: msg });
        } finally {
            setAccessActionLoading(false);
        }
    };

    const handleSetAccessMode = async (nextMode: QuicknoteAccessMode) => {
        if (!slug || accessActionLoading) return;
        setAccessActionLoading(true);
        try {
            const updated = await setQuicknoteAccessMode(slug, nextMode);
            const resolvedMode: QuicknoteAccessMode =
                updated.access_mode === 'approval_required' ? 'approval_required' : 'open';
            setAccessMode(resolvedMode);
            setIsOwner(Boolean(updated.is_owner ?? true));
            setOwnerId(updated.owner_id ?? myId ?? null);
            if (resolvedMode === 'open') {
                setAccessRequests([]);
                setRequestsPanelOpen(false);
            }
            setToast({
                type: 'success',
                text:
                    resolvedMode === 'approval_required'
                        ? 'Besitzer-Freigabe aktiviert. Nur freigegebene Nutzer haben Zugriff.'
                        : 'Quicknote ist wieder für alle mit dem Link offen.',
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Zugriffsmodus konnte nicht geändert werden.';
            setToast({ type: 'error', text: msg });
        } finally {
            setAccessActionLoading(false);
        }
    };

    const handleResolveAccessRequest = async (userId: string, action: 'approve' | 'deny') => {
        if (!slug || accessActionLoading) return;
        setAccessActionLoading(true);
        try {
            await resolveQuicknoteAccessRequest(slug, userId, action);
            setAccessRequests((prev) =>
                prev.map((req) =>
                    req.user_id === userId
                        ? { ...req, status: action === 'approve' ? 'approved' : 'denied' }
                        : req
                )
            );
            await loadAccessRequests();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Anfrage konnte nicht bearbeitet werden.';
            setToast({ type: 'error', text: msg });
        } finally {
            setAccessActionLoading(false);
        }
    };

    const linkedNotes = useMemo<LinkedNoteItem[]>(() => {
        let parsed: unknown = content;
        if (typeof content === 'string') {
            try {
                parsed = JSON.parse(content);
            } catch {
                parsed = null;
            }
        }
        return extractLinkedNotes(parsed);
    }, [content]);

    useEffect(() => {
        if (!slug || loading || accessGate) return;
        let isMounted = true;
        const loadTree = async () => {
            try {
                const nodes = await fetchQuicknoteTree(rootSlug || slug);
                if (isMounted && nodes.length > 0) {
                    setTreeNodes(nodes);
                    saveKnownQuicknotes(nodes);
                }
            } catch (err) {
                console.error('Failed to fetch quicknote tree:', err);
            }
        };
        void loadTree();
        return () => { isMounted = false; };
    }, [slug, rootSlug, loading, accessGate]);

    useEffect(() => {
        if (!slug || loading || accessGate || linkedNotes.length === 0) return;
        const knownSlugs = new Set(treeNodes.map((n) => n.slug));
        if (linkedNotes.some((item) => !knownSlugs.has(item.id))) {
            const timer = setTimeout(() => {
                fetchQuicknoteTree(rootSlug || slug)
                    .then((nodes) => {
                        if (nodes.length > 0) {
                            setTreeNodes(nodes);
                            saveKnownQuicknotes(nodes);
                        }
                    })
                    .catch(() => {});
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [slug, rootSlug, loading, accessGate, linkedNotes, treeNodes]);

    const handleUpload = useCallback(async (files: File[]) => {
        if (!slug || files.length === 0) return;
        setIsUploading(true);
        try {
            for (const file of files) {
                try {
                    await uploadQuicknoteFile(slug, file);
                } catch (err) {
                    if (err instanceof StorageLimitError) {
                        setToast({ type: 'error', text: 'Speicherlimit von 250MB für diese Notiz erreicht.' });
                        break;
                    } else {
                        const msg = err instanceof Error ? err.message : 'Fehler beim Hochladen der Datei.';
                        setToast({ type: 'error', text: msg });
                    }
                }
            }
        } finally {
            setIsUploading(false);
            await loadAttachments();
        }
    }, [slug, loadAttachments]);

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            void handleUpload(Array.from(e.target.files));
        }
        e.target.value = '';
    };

    const handleDeleteAttachment = async (fileId: string) => {
        try {
            const ok = await deleteQuicknoteFile(slug, fileId);
            if (ok) {
                setAttachments(prev => prev.filter(f => f.id !== fileId));
                if (typeof window !== 'undefined') {
                    const win = window as unknown as { __tide_active_attachments?: QuicknoteAttachment[] };
                    if (Array.isArray(win.__tide_active_attachments)) {
                        win.__tide_active_attachments = win.__tide_active_attachments.filter(
                            (f) => f.id !== fileId
                        );
                    }
                }
            }
        } catch (err) {
            console.error('Failed to delete attachment:', err);
        }
    };

    const rootNode = useMemo(() => {
        return buildTree(treeNodes, slug, title, linkedNotes);
    }, [treeNodes, slug, title, linkedNotes]);

    const handleShare = async () => {
        try {
            if (typeof window !== 'undefined') {
                await navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
                copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
            }
        } catch (err) {
            console.error('Failed to copy share link:', err);
        }
    };

    const handleCopyToVault = async () => {
        if (copyStatus === 'copying') return;
        const currentMyId = useDataStore.getState().myId;
        const token = typeof window !== 'undefined'
            ? (sessionStorage.getItem('tide_session_token') || localStorage.getItem('tide_session_token'))
            : null;
        if (!currentMyId && !token) {
            setToast({
                type: 'auth',
                text: 'Melde dich an, um Notizen in deinem privaten Notizbuch zu speichern',
                authLink: `/auth?redirect=/notes/${encodeURIComponent(slug)}`,
            });
            return;
        }
        try {
            setCopyStatus('copying');
            const noteTitle = title.trim() || slug;
            await useDataStore.getState().createNote(noteTitle, contentRef.current ?? content);
            setCopyStatus('success');
            setToast({ type: 'success', text: 'Notiz erfolgreich in dein persönliches Verzeichnis kopiert!' });
            setTimeout(() => setCopyStatus('idle'), 3000);
        } catch (err) {
            console.error('Failed to copy note to personal directory:', err);
            setCopyStatus('idle');
            setToast({ type: 'error', text: 'Fehler beim Kopieren der Notiz in dein Verzeichnis.' });
        }
    };

    return (
        <div
            className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)] relative"
            onDragOver={(e) => {
                if (accessGate) return;
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(true);
            }}
            onDragLeave={(e) => {
                if (accessGate) return;
                e.preventDefault();
                e.stopPropagation();
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setIsDragging(false);
                }
            }}
            onDrop={async (e) => {
                if (accessGate) return;
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) void handleUpload(files);
            }}
        >
            {/* Hidden file input for mobile, tablet & click upload */}
            <input
                type="file"
                ref={fileInputRef}
                multiple
                onChange={handleFileInputChange}
                className="hidden"
            />
            {/* Visual drop overlay */}
            {isDragging && !accessGate && (
                <div className="fixed inset-4 z-50 backdrop-blur-sm bg-t2-sub  border-2 border-dashed border-t2-accent rounded-2xl flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150">
                    <UploadCloud className="w-12 h-12 text-t2-accent mb-3 animate-bounce" />
                    <p className="text-lg font-semibold text-t2-accent ">Dateien hier ablegen zum Hochladen</p>
                    <p className="text-xs text-t2-ink-2  mt-1">Dateien werden direkt an diese Notiz angehängt</p>
                </div>
            )}
            {/* Left Directory Hierarchy (Baumstruktur mit Ästen) */}
            {!accessGate && (
            <aside
                aria-label="Notizhierarchie"
                className="hidden xl:block fixed left-8 top-16 w-56 select-none z-20"
            >
                {rootNode && (
                    <>
                        {rootNode.slug === slug ? (
                            <div className="flex items-center gap-2 font-semibold text-sm text-t2-ink  truncate">
                                <span className="w-1.5 h-1.5 rounded-full bg-t2-ink-3  shrink-0" />
                                <span className="truncate" title={rootNode.title}>{rootNode.title}</span>
                            </div>
                        ) : (
                            <Link
                                href={`/notes/${encodeURIComponent(rootNode.slug)}${rootSlug ? `?root=${encodeURIComponent(rootSlug)}` : ''}`}
                                className="flex items-center gap-2 font-medium text-sm text-t2-ink-2  hover:text-t2-ink  truncate transition-colors group"
                                title={rootNode.title}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-t2-line  shrink-0 group-hover:bg-t2-ink-3 transition-colors" />
                                <span className="truncate">{rootNode.title}</span>
                            </Link>
                        )}

                        <div className="relative ml-2 pl-3.5 border-l border-t2-line  space-y-1 mt-2">
                            {rootNode.children.length > 0 ? (
                                rootNode.children.map((child) => (
                                    <TreeNodeItemView key={child.slug} node={child} activeSlug={slug} rootSlug={rootSlug} />
                                ))
                            ) : (
                                <div className="relative flex items-center min-h-[22px]">
                                    <BranchCurve />
                                    <span className="text-[11px] text-t2-ink-3  italic select-none">
                                        Tippe @ um Notizen zu verlinken
                                    </span>
                                </div>
                            )}
                        </div>
                    </>
                )}
                {/* Outline: Files / Attachments */}
                <div className="mt-8 pt-4 border-t border-t2-line ">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-t2-ink-3  flex items-center gap-1.5">
                                Dateien ({attachments.length})
                                {isUploading && <Loader2 className="w-3 h-3 animate-spin text-t2-accent" />}
                            </span>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="text-[11px] font-medium text-t2-accent  hover:text-t2-accent  flex items-center gap-0.5 transition-colors cursor-pointer disabled:opacity-50"
                                title="Datei hinzufügen"
                            >
                                <Plus className="w-3 h-3" />
                                <span>Datei hinzufügen</span>
                            </button>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-t2-ink-3 ">
                                {(attachments.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(1)} MB / 250 MB
                            </span>
                        </div>
                    </div>

                    {attachments.length > 0 ? (
                        <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                            {attachments.map((att) => (
                                <div
                                    key={att.id}
                                    className="w-full flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg text-xs text-t2-ink  hover:bg-t2-hover  transition-colors group"
                                >
                                    <button
                                        type="button"
                                        onClick={() => window.open(getQuicknoteFileDownloadUrl(slug, att.id), '_blank', 'noopener,noreferrer')}
                                        className="flex-1 flex items-center justify-between gap-1.5 min-w-0 text-left hover:text-t2-accent  transition-colors cursor-pointer"
                                        title={`Herunterladen: ${att.name}`}
                                    >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <Paperclip className="w-3.5 h-3.5 text-t2-ink-3 group-hover:text-t2-accent shrink-0" />
                                            <span className="truncate">{att.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 text-[11px] text-t2-ink-3">
                                            <span>
                                                {att.size < 1024 * 1024
                                                    ? `${Math.round(att.size / 1024)} KB`
                                                    : `${(att.size / (1024 * 1024)).toFixed(1)} MB`}
                                            </span>
                                            <Download className="w-3 h-3 opacity-0 group-hover:opacity-100 text-t2-accent transition-opacity" />
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleDeleteAttachment(att.id); }}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 text-t2-ink-3  rounded transition-opacity shrink-0 cursor-pointer"
                                        title="Löschen"
                                        aria-label="Löschen"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full text-left py-2 px-2.5 rounded-lg border border-dashed border-t2-line  hover:border-t2-accent  text-[11px] text-t2-ink-3  hover:text-t2-accent  transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                            <Paperclip className="w-3 h-3" />
                            <span>Dateien hier ablegen oder klicken</span>
                        </button>
                    )}
                </div>
            </aside>
            )}

            {/* Notification / Toast Banner */}
            {toast && (
                <aside aria-label="Benachrichtigung" className="fixed bottom-20 right-6 z-50 max-w-md bg-[var(--card,var(--surface-card,#ffffff))] border border-[var(--border,var(--border-color,#e5e7eb))] text-[var(--foreground)] shadow-xl rounded-xl p-4 flex items-start gap-3">
                    {toast.type === 'auth' && <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
                    {toast.type === 'success' && <Check className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />}
                    {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />}
                    <div className="flex-1 text-sm">
                        <p className="leading-snug">{toast.text}</p>
                        {toast.authLink && (
                            <Link href={toast.authLink} className="inline-block mt-2 text-xs font-semibold text-t2-accent  hover:underline">
                                Jetzt anmelden &rarr;
                            </Link>
                        )}
                    </div>
                    <button type="button" onClick={() => setToast(null)} className="text-t2-ink-3 hover:text-t2-ink-2  p-0.5 rounded transition-colors" aria-label="Schließen">
                        <X className="w-4 h-4" />
                    </button>
                </aside>
            )}

            {/* Main Editor Body */}
            <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-10 sm:py-16">
                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-t2-ink-3  min-h-[50vh]">
                        <Loader2 className="w-8 h-8 animate-spin text-t2-accent mb-3" />
                        <span className="font-medium text-sm">Lade Quicknote...</span>
                    </div>
                ) : accessGate ? (
                    <div className="flex-1 flex items-center justify-center min-h-[60vh]">
                        <div className="w-full max-w-md rounded-2xl bg-t2-surface border border-t2-line shadow-xl p-6 sm:p-8 text-center">
                            <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-t2-sub border border-t2-line flex items-center justify-center text-t2-accent">
                                {accessGate.status === 'pending' ? (
                                    <Clock className="w-6 h-6" />
                                ) : (
                                    <Lock className="w-6 h-6" />
                                )}
                            </div>
                            <h1 className="text-xl font-bold text-t2-ink truncate mb-2" title={accessGate.title || slug}>
                                {accessGate.title || slug}
                            </h1>

                            {accessGate.status === 'auth_required' && (
                                <>
                                    <p className="text-sm text-t2-ink-2 mb-6 leading-relaxed">
                                        Diese Quicknote erfordert eine Besitzer-Freigabe.
                                    </p>
                                    <Link
                                        href={`/auth?redirect=/notes/${encodeURIComponent(slug)}`}
                                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-t2-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                                    >
                                        <LogIn className="w-4 h-4" />
                                        <span>Anmelden</span>
                                    </Link>
                                </>
                            )}

                            {accessGate.status === 'none' && (
                                <>
                                    <p className="text-sm text-t2-ink-2 mb-6 leading-relaxed">
                                        Diese Quicknote erfordert eine Besitzer-Freigabe.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => void handleRequestAccess()}
                                        disabled={accessActionLoading}
                                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-t2-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                                    >
                                        {accessActionLoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Lock className="w-4 h-4" />
                                        )}
                                        <span>Zugriff anfragen</span>
                                    </button>
                                </>
                            )}

                            {accessGate.status === 'pending' && (
                                <>
                                    <p className="text-sm text-t2-ink-2 mb-6 leading-relaxed">
                                        Zugriffsanfrage ausstehend – warte auf Freigabe durch den Besitzer.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => void checkQuicknoteStatus(true)}
                                        disabled={accessActionLoading}
                                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-t2-sub border border-t2-line text-t2-ink text-sm font-semibold hover:bg-t2-hover transition-colors disabled:opacity-50 cursor-pointer"
                                    >
                                        {accessActionLoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin text-t2-accent" />
                                        ) : (
                                            <RefreshCw className="w-4 h-4 text-t2-accent" />
                                        )}
                                        <span>Status prüfen</span>
                                    </button>
                                </>
                            )}

                            {accessGate.status === 'denied' && (
                                <>
                                    <p className="text-sm text-t2-ink-2 mb-6 leading-relaxed">
                                        Zugriffsanfrage wurde abgelehnt.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => void handleRequestAccess()}
                                        disabled={accessActionLoading}
                                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-t2-sub border border-t2-line text-t2-ink text-sm font-semibold hover:bg-t2-hover transition-colors disabled:opacity-50 cursor-pointer"
                                    >
                                        {accessActionLoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin text-t2-accent" />
                                        ) : (
                                            <RefreshCw className="w-4 h-4 text-t2-accent" />
                                        )}
                                        <span>Erneut anfragen</span>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => handleTitleChange(e.target.value)}
                            placeholder="Notiztitel..."
                            className="text-4xl sm:text-5xl font-bold bg-transparent border-none outline-none text-t2-ink  placeholder-t2-ink-3  pb-2 leading-tight w-full mb-6 focus:ring-0"
                        />
                        <Editor
                            activeTabId={`quicknote:${slug}`}
                            dek={quicknoteKey}
                            keyEpoch={1}
                            isShared={true}
                            editable={true}
                            initialContent={initialContent}
                            onLinkClick={({ id, type }) => {
                                if (type === 'file') {
                                    window.open(getQuicknoteFileDownloadUrl(slug, id), '_blank', 'noopener,noreferrer');
                                } else {
                                    router.push('/notes/' + encodeURIComponent(id) + (rootSlug ? '?root=' + encodeURIComponent(rootSlug) : ''));
                                }
                            }}
                            onChange={(newContent: unknown) => {
                                setContent(newContent);
                                debouncedSave(newContent);
                            }}
                        />
                    </>
                )}
            </main>

            {/* Bottom-Right Controls (Floating Actions) */}
            <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3">
                {/* Mobile / Tablet Upload Button */}
                {!accessGate && (
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="xl:hidden w-11 h-11 rounded-full flex items-center justify-center bg-t2-surface  border border-t2-line  shadow-lg text-t2-ink  hover:bg-t2-sub  hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        title="Datei hinzufügen"
                        aria-label="Datei hinzufügen"
                    >
                        {isUploading ? <Loader2 className="w-5 h-5 animate-spin text-t2-accent" /> : <Paperclip className="w-5 h-5" />}
                    </button>
                )}

                {/* Owner Access Requests Floating Button & Popover */}
                {isLoggedIn && !accessGate && isOwner && accessMode === 'approval_required' && (
                    <div className="relative" ref={requestsPanelRef}>
                        <button
                            type="button"
                            onClick={() => setRequestsPanelOpen((prev) => !prev)}
                            className="relative w-11 h-11 rounded-full flex items-center justify-center bg-t2-surface border border-t2-line shadow-lg text-t2-ink hover:bg-t2-sub hover:scale-105 active:scale-95 transition-all cursor-pointer"
                            title="Zugriffsanfragen verwalten"
                            aria-label="Zugriffsanfragen verwalten"
                        >
                            <Users className="w-5 h-5" />
                            {pendingRequests.length > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-t2-accent text-white text-[11px] font-bold flex items-center justify-center shadow">
                                    {pendingRequests.length}
                                </span>
                            )}
                        </button>

                        {requestsPanelOpen && (
                            <div className="absolute bottom-full right-0 mb-3 w-80 max-w-[calc(100vw-3rem)] rounded-xl bg-t2-surface backdrop-blur-md border border-t2-line shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
                                <div className="px-3.5 py-2.5 border-b border-t2-line flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck className="w-4 h-4 text-t2-accent shrink-0" />
                                        <span className="text-xs font-semibold text-t2-ink">Zugriffsanfragen</span>
                                    </div>
                                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-t2-sub text-t2-ink-2 border border-t2-line">
                                        {pendingRequests.length} offen
                                    </span>
                                </div>

                                <div className="max-h-64 overflow-y-auto divide-y divide-t2-line">
                                    {pendingRequests.length > 0 ? (
                                        pendingRequests.map((req) => (
                                            <div key={req.user_id} className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-t2-ink truncate">
                                                        {req.username || req.user_id}
                                                    </p>
                                                    <p className="text-[11px] text-t2-ink-3 truncate">
                                                        Wartet auf Freigabe
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleResolveAccessRequest(req.user_id, 'approve')}
                                                        disabled={accessActionLoading}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-t2-accent text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                                                        title="Freigeben"
                                                    >
                                                        <UserCheck className="w-3.5 h-3.5" />
                                                        <span>Freigeben</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleResolveAccessRequest(req.user_id, 'deny')}
                                                        disabled={accessActionLoading}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-t2-sub border border-t2-line text-t2-ink-2 hover:text-red-500 hover:bg-t2-hover text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                                                        title="Ablehnen"
                                                    >
                                                        <UserX className="w-3.5 h-3.5" />
                                                        <span>Ablehnen</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="px-3.5 py-5 text-center text-xs text-t2-ink-3">
                                            Aktuell keine offenen Zugriffsanfragen.
                                        </div>
                                    )}
                                </div>

                                <div className="p-2 border-t border-t2-line bg-t2-sub">
                                    <button
                                        type="button"
                                        onClick={() => void handleSetAccessMode('open')}
                                        disabled={accessActionLoading}
                                        className="w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 text-t2-ink hover:bg-t2-hover border border-t2-line bg-t2-surface transition-colors disabled:opacity-50 cursor-pointer"
                                    >
                                        <Unlock className="w-3.5 h-3.5 text-t2-ink-2" />
                                        <span>Für alle öffnen</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Share Button */}
                <div className="relative">
                    {copied && (
                        <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 rounded-lg bg-t2-ink text-white  dark:text-neutral-900 text-xs font-medium shadow-md whitespace-nowrap select-none pointer-events-none">
                            Link kopiert! ✓
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={handleShare}
                        className="w-11 h-11 rounded-full flex items-center justify-center bg-t2-surface  border border-t2-line  shadow-lg text-t2-ink  hover:bg-t2-sub  hover:scale-105 active:scale-95 transition-all cursor-pointer"
                        title="Link teilen"
                        aria-label="Link teilen"
                    >
                        <Share2 className="w-5 h-5" />
                    </button>
                </div>

                {/* Profile Circle (when logged in) */}
                {isLoggedIn && !accessGate && (
                    <div className="relative" ref={profileMenuRef}>
                        <button
                            type="button"
                            onClick={() => setProfileMenuOpen((prev) => !prev)}
                            className="w-11 h-11 rounded-full overflow-hidden shadow-lg border-2 border-t2-line  hover:scale-105 active:scale-95 transition-transform flex items-center justify-center bg-t2-hover  cursor-pointer"
                            title="Profil & Optionen"
                            aria-label="Profil und Optionen"
                        >
                            <Avatar seed={myId || 'user'} size={44} />
                        </button>

                        {profileMenuOpen && (
                            <div className="absolute bottom-full right-0 mb-3 w-64 rounded-xl bg-t2-surface  backdrop-blur-md border border-t2-line  shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                                <button
                                    type="button"
                                    onClick={() => { setProfileMenuOpen(false); void handleCopyToVault(); }}
                                    disabled={copyStatus === 'copying'}
                                    className="w-full px-3.5 py-2.5 text-left text-sm flex items-center gap-2.5 text-t2-ink  hover:bg-t2-hover  transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                    {copyStatus === 'copying' ? <Loader2 className="w-4 h-4 animate-spin text-t2-accent shrink-0" /> : copyStatus === 'success' ? <Check className="w-4 h-4 text-emerald-500 shrink-0" /> : <FolderInput className="w-4 h-4 text-t2-ink-2  shrink-0" />}
                                    <span className="font-medium">Für mich speichern</span>
                                </button>
                                {(isOwner || !ownerId) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setProfileMenuOpen(false);
                                            void handleSetAccessMode(accessMode === 'open' ? 'approval_required' : 'open');
                                        }}
                                        disabled={accessActionLoading}
                                        className="w-full px-3.5 py-2.5 text-left text-sm flex items-center gap-2.5 text-t2-ink hover:bg-t2-hover transition-colors disabled:opacity-50 cursor-pointer"
                                    >
                                        {accessMode === 'approval_required' ? (
                                            <Lock className="w-4 h-4 text-t2-accent shrink-0" />
                                        ) : (
                                            <Unlock className="w-4 h-4 text-t2-ink-2 shrink-0" />
                                        )}
                                        <span className="font-medium">
                                            {accessMode === 'approval_required'
                                                ? 'Zugriff: Besitzer-Freigabe'
                                                : 'Zugriff: Offen für alle'}
                                        </span>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
