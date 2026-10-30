'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
    Share2, FolderInput, Check, Loader2, AlertCircle, X,
    Paperclip, UploadCloud, Key, Download,
} from 'lucide-react';
import Editor from '@/components/Editor';
import Avatar from '@/components/Profile/Avatar';
import {
    deriveQuicknoteKey, fetchQuicknote, fetchQuicknoteTree, saveQuicknote,
    fetchQuicknoteFiles, uploadQuicknoteFile, getQuicknoteFileDownloadUrl,
    saveKnownQuicknote, saveKnownQuicknotes, StorageLimitError,
    type QuicknoteData, type QuicknoteTreeNode, type QuicknoteAttachment,
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
        <svg className="w-3.5 h-5 text-gray-300/80 dark:text-neutral-700/80 absolute -left-3.5 top-0 pointer-events-none" viewBox="0 0 14 20" fill="none">
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
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 dark:text-gray-100 truncate py-0.5" title={node.title}>
                        <span className="w-1 h-1 rounded-full bg-neutral-400 dark:bg-neutral-500 shrink-0" />
                        <span className="truncate">{node.title}</span>
                    </div>
                ) : (
                    <Link
                        href={`/notes/${encodeURIComponent(node.slug)}${rootSlug ? `?root=${encodeURIComponent(rootSlug)}` : ''}`}
                        className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 truncate transition-colors py-0.5 max-w-full"
                        title={node.title}
                    >
                        <span className="truncate">{node.title}</span>
                    </Link>
                )}
            </div>
            {node.children.length > 0 && (
                <div className="relative ml-3.5 pl-3.5 border-l border-gray-300/80 dark:border-neutral-700/80 space-y-1 mt-1">
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

    // File attachments & upload state
    const [attachments, setAttachments] = useState<QuicknoteAttachment[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [showTokenModal, setShowTokenModal] = useState(false);
    const [tokenInput, setTokenInput] = useState('');
    const [uploadError, setUploadError] = useState<string | null>(null);

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
        if (slug) void loadAttachments();
    }, [slug, loadAttachments]);

    useEffect(() => {
        if (slug && title) saveKnownQuicknote({ slug, title });
    }, [slug, title]);

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

        const initNote = async () => {
            try {
                const key = await deriveQuicknoteKey(slug);
                if (!isMounted) return;
                setQuicknoteKey(key);

                let data: QuicknoteData | null = null;
                try {
                    data = await fetchQuicknote(slug);
                } catch {
                    data = null;
                }
                if (!isMounted) return;

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
            } catch (err) {
                console.error('Failed to initialize quicknote:', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        void initNote();
        return () => { isMounted = false; };
    }, [slug]);

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
        if (!slug) return;
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
    }, [slug, rootSlug]);

    useEffect(() => {
        if (!slug || linkedNotes.length === 0) return;
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
    }, [slug, rootSlug, linkedNotes, treeNodes]);

    const handleUpload = useCallback(async (files: File[]) => {
        if (!slug || files.length === 0) return;
        setIsUploading(true);
        setUploadError(null);
        const storedToken = typeof window !== 'undefined' ? localStorage.getItem('tide_quicknote_token') || undefined : undefined;
        try {
            for (const file of files) {
                try {
                    await uploadQuicknoteFile(slug, file, storedToken);
                } catch (err) {
                    if (err instanceof StorageLimitError) {
                        setUploadError(err.message || 'Speicherlimit von 250MB überschritten.');
                        if (typeof window !== 'undefined') {
                            setTokenInput(localStorage.getItem('tide_quicknote_token') || '');
                        }
                        setShowTokenModal(true);
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
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(true);
            }}
            onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setIsDragging(false);
                }
            }}
            onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) void handleUpload(files);
            }}
        >
            {/* Visual drop overlay */}
            {isDragging && (
                <div className="fixed inset-4 z-50 backdrop-blur-sm bg-blue-50/80 dark:bg-neutral-900/80 border-2 border-dashed border-blue-500 rounded-2xl flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150">
                    <UploadCloud className="w-12 h-12 text-blue-500 mb-3 animate-bounce" />
                    <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">Dateien hier ablegen zum Hochladen</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Dateien werden direkt an diese Notiz angehängt</p>
                </div>
            )}
            {/* Left Directory Hierarchy (Baumstruktur mit Ästen) */}
            <aside
                aria-label="Notizhierarchie"
                className="hidden xl:block fixed left-8 top-16 w-56 select-none z-20"
            >
                {rootNode && (
                    <>
                        {rootNode.slug === slug ? (
                            <div className="flex items-center gap-2 font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                                <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500 shrink-0" />
                                <span className="truncate" title={rootNode.title}>{rootNode.title}</span>
                            </div>
                        ) : (
                            <Link
                                href={`/notes/${encodeURIComponent(rootNode.slug)}${rootSlug ? `?root=${encodeURIComponent(rootSlug)}` : ''}`}
                                className="flex items-center gap-2 font-medium text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 truncate transition-colors group"
                                title={rootNode.title}
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-600 shrink-0 group-hover:bg-neutral-500 transition-colors" />
                                <span className="truncate">{rootNode.title}</span>
                            </Link>
                        )}

                        <div className="relative ml-2 pl-3.5 border-l border-gray-300/80 dark:border-neutral-700/80 space-y-1 mt-2">
                            {rootNode.children.length > 0 ? (
                                rootNode.children.map((child) => (
                                    <TreeNodeItemView key={child.slug} node={child} activeSlug={slug} rootSlug={rootSlug} />
                                ))
                            ) : (
                                <div className="relative flex items-center min-h-[22px]">
                                    <BranchCurve />
                                    <span className="text-[11px] text-gray-400 dark:text-neutral-500 italic select-none">
                                        Tippe @ um Notizen zu verlinken
                                    </span>
                                </div>
                            )}
                        </div>
                    </>
                )}
                {/* Outline: Files / Attachments */}
                <div className="mt-8 pt-4 border-t border-gray-200/80 dark:border-neutral-800/80">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 flex items-center gap-1.5">
                            Dateien ({attachments.length})
                            {isUploading && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                                {(attachments.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(1)} MB / 250 MB
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    if (typeof window !== 'undefined') {
                                        setTokenInput(localStorage.getItem('tide_quicknote_token') || '');
                                    }
                                    setShowTokenModal(true);
                                }}
                                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-0.5 rounded transition-colors"
                                title="Speicherlimit erweitern"
                            >
                                <Key className="w-3 h-3" />
                            </button>
                        </div>
                    </div>

                    {attachments.length > 0 ? (
                        <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                            {attachments.map((att) => (
                                <button
                                    key={att.id}
                                    type="button"
                                    onClick={() => window.open(getQuicknoteFileDownloadUrl(slug, att.id), '_blank')}
                                    className="w-full flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left group"
                                    title={`Herunterladen: ${att.name}`}
                                >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <Paperclip className="w-3.5 h-3.5 text-neutral-400 group-hover:text-blue-500 shrink-0" />
                                        <span className="truncate">{att.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0 text-[10px] text-neutral-400">
                                        <span>
                                            {att.size < 1024 * 1024
                                                ? `${Math.round(att.size / 1024)} KB`
                                                : `${(att.size / (1024 * 1024)).toFixed(1)} MB`}
                                        </span>
                                        <Download className="w-3 h-3 opacity-0 group-hover:opacity-100 text-blue-500 transition-opacity" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="text-[11px] text-neutral-400 dark:text-neutral-500 italic">
                            Dateien hierher ziehen zum Teilen
                        </p>
                    )}
                </div>
            </aside>

            {/* Notification / Toast Banner */}
            {toast && (
                <aside aria-label="Benachrichtigung" className="fixed bottom-20 right-6 z-50 max-w-md bg-[var(--card,var(--surface-card,#ffffff))] border border-[var(--border,var(--border-color,#e5e7eb))] text-[var(--foreground)] shadow-xl rounded-xl p-4 flex items-start gap-3">
                    {toast.type === 'auth' && <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
                    {toast.type === 'success' && <Check className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />}
                    {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />}
                    <div className="flex-1 text-sm">
                        <p className="leading-snug">{toast.text}</p>
                        {toast.authLink && (
                            <Link href={toast.authLink} className="inline-block mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                                Jetzt anmelden &rarr;
                            </Link>
                        )}
                    </div>
                    <button type="button" onClick={() => setToast(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5 rounded transition-colors" aria-label="Schließen">
                        <X className="w-4 h-4" />
                    </button>
                </aside>
            )}

            {/* Main Editor Body */}
            <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-10 sm:py-16">
                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-slate-500 min-h-[50vh]">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
                        <span className="font-medium text-sm">Lade Quicknote...</span>
                    </div>
                ) : (
                    <>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => handleTitleChange(e.target.value)}
                            placeholder="Notiztitel..."
                            className="text-4xl sm:text-5xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-700 pb-2 leading-tight w-full mb-6 focus:ring-0"
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
                                    window.open(getQuicknoteFileDownloadUrl(slug, id), '_blank');
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
                {/* Share Button */}
                <div className="relative">
                    {copied && (
                        <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 rounded-lg bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900 text-xs font-medium shadow-md whitespace-nowrap select-none pointer-events-none">
                            Link kopiert! ✓
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={handleShare}
                        className="w-11 h-11 rounded-full flex items-center justify-center bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 shadow-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-neutral-800 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                        title="Link teilen"
                        aria-label="Link teilen"
                    >
                        <Share2 className="w-5 h-5" />
                    </button>
                </div>

                {/* Profile Circle (when logged in) */}
                {isLoggedIn && (
                    <div className="relative" ref={profileMenuRef}>
                        <button
                            type="button"
                            onClick={() => setProfileMenuOpen((prev) => !prev)}
                            className="w-11 h-11 rounded-full overflow-hidden shadow-lg border-2 border-white dark:border-neutral-800 hover:scale-105 active:scale-95 transition-transform flex items-center justify-center bg-gray-100 dark:bg-neutral-800 cursor-pointer"
                            title="Profil & Optionen"
                            aria-label="Profil und Optionen"
                        >
                            <Avatar seed={myId || 'user'} size={44} />
                        </button>

                        {profileMenuOpen && (
                            <div className="absolute bottom-full right-0 mb-3 w-52 rounded-xl bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border border-gray-200 dark:border-neutral-800 shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                                <button
                                    type="button"
                                    onClick={() => { setProfileMenuOpen(false); void handleCopyToVault(); }}
                                    disabled={copyStatus === 'copying'}
                                    className="w-full px-3.5 py-2.5 text-left text-sm flex items-center gap-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                    {copyStatus === 'copying' ? <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" /> : copyStatus === 'success' ? <Check className="w-4 h-4 text-emerald-500 shrink-0" /> : <FolderInput className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />}
                                    <span className="font-medium">Für mich speichern</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Token Modal */}
            {showTokenModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                                <Key className="w-5 h-5 text-blue-500" />
                                Speicherlimit erweitern
                            </h3>
                            <button
                                type="button"
                                onClick={() => { setShowTokenModal(false); setUploadError(null); }}
                                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1 rounded-lg"
                                aria-label="Schließen"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {uploadError && (
                            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>{uploadError}</span>
                            </div>
                        )}

                        <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                            Für mehr als 250MB Speicher pro Notiz melde dich an oder gib ein Zugriffs-Token ein. Ein Token kannst du mit einem regulären Account unter Einstellungen &gt; Zugriff erstellen.
                        </p>

                        <div>
                            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                                Zugriffs-Token
                            </label>
                            <input
                                type="text"
                                value={tokenInput}
                                onChange={(e) => setTokenInput(e.target.value)}
                                placeholder="tide_pat_..."
                                className="w-full px-3 py-2 text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => { setShowTokenModal(false); setUploadError(null); }}
                                className="px-4 py-2 text-sm font-medium rounded-xl text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                            >
                                Abbrechen
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (typeof window !== 'undefined') {
                                        localStorage.setItem('tide_quicknote_token', tokenInput.trim());
                                    }
                                    setShowTokenModal(false);
                                    setUploadError(null);
                                    setToast({ type: 'success', text: 'Token gespeichert!' });
                                }}
                                className="px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
                            >
                                Speichern &amp; Freischalten
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
