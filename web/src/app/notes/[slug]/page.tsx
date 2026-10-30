'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Share2, FolderInput, Check, Loader2, AlertCircle, X } from 'lucide-react';
import Editor from '@/components/Editor';
import Avatar from '@/components/Profile/Avatar';
import { deriveQuicknoteKey, fetchQuicknote, saveQuicknote, type QuicknoteData } from '@/lib/quicknotesApi';
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
    const seenIds = new Set<string>();

    function traverse(node: unknown) {
        if (!node || typeof node !== 'object') return;
        const n = node as Record<string, unknown>;

        if (n.type === 'mention' && n.attrs && typeof n.attrs === 'object') {
            const attrs = n.attrs as Record<string, unknown>;
            const type = attrs.type;
            if (type === 'note' || !type) {
                const id = typeof attrs.id === 'string' ? attrs.id : '';
                const rawLabel = typeof attrs.label === 'string' ? attrs.label.trim() : '';
                const label = rawLabel || id || 'Notiz';
                if (id && !seenIds.has(id)) {
                    seenIds.add(id);
                    results.push({ id, label });
                }
            }
        }

        if (Array.isArray(n.content)) {
            for (const child of n.content) {
                traverse(child);
            }
        }
    }

    traverse(doc);
    return results;
}

export default function QuicknotePage() {
    const params = useParams();
    const router = useRouter();
    const rawSlug = typeof params?.slug === 'string'
        ? params.slug
        : Array.isArray(params?.slug)
            ? params.slug[0]
            : '';
    const slug = useMemo(() => {
        try {
            return decodeURIComponent(rawSlug || '');
        } catch {
            return rawSlug || '';
        }
    }, [rawSlug]);

    const myId = useDataStore((s) => s.myId);
    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

    useEffect(() => {
        const sessionToken = typeof window !== 'undefined'
            ? (sessionStorage.getItem('tide_session_token') || localStorage.getItem('tide_session_token'))
            : null;
        setIsLoggedIn(Boolean(myId || sessionToken));
    }, [myId]);

    const [loading, setLoading] = useState<boolean>(true);
    const [title, setTitle] = useState<string>('');
    const [content, setContent] = useState<unknown>(null);
    const [initialContent, setInitialContent] = useState<unknown>(null);
    const [quicknoteKey, setQuicknoteKey] = useState<CryptoKey | null>(null);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'success'>('idle');
    const [toast, setToast] = useState<ToastState | null>(null);

    const [copied, setCopied] = useState<boolean>(false);
    const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [profileMenuOpen, setProfileMenuOpen] = useState<boolean>(false);
    const profileMenuRef = useRef<HTMLDivElement | null>(null);

    const titleRef = useRef<string>('');
    titleRef.current = title;
    const contentRef = useRef<unknown>(null);
    contentRef.current = content;
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Close profile floating menu on click outside
    useEffect(() => {
        if (!profileMenuOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setProfileMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [profileMenuOpen]);

    const debouncedSave = useCallback((newContent: unknown, newTitle?: string) => {
        if (!slug) return;
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }

        const currentTitle = newTitle ?? titleRef.current ?? slug;
        contentRef.current = newContent;

        saveTimerRef.current = setTimeout(async () => {
            try {
                const serialized = typeof newContent === 'string'
                    ? newContent
                    : JSON.stringify(newContent ?? '');
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
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
            if (copyTimeoutRef.current) {
                clearTimeout(copyTimeoutRef.current);
            }
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
                    // Note might be new and not yet persisted
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
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        void initNote();

        return () => {
            isMounted = false;
        };
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

    const handleShare = async () => {
        try {
            if (typeof window !== 'undefined') {
                await navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                if (copyTimeoutRef.current) {
                    clearTimeout(copyTimeoutRef.current);
                }
                copyTimeoutRef.current = setTimeout(() => {
                    setCopied(false);
                }, 2000);
            }
        } catch (err) {
            console.error('Failed to copy share link:', err);
        }
    };

    const handleCopyToVault = async () => {
        if (copyStatus === 'copying') return;

        const currentMyId = useDataStore.getState().myId;
        const sessionToken = typeof window !== 'undefined'
            ? (sessionStorage.getItem('tide_session_token') || localStorage.getItem('tide_session_token'))
            : null;
        const loggedIn = Boolean(currentMyId || sessionToken);

        if (!loggedIn) {
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
            const currentContent = contentRef.current ?? content;
            await useDataStore.getState().createNote(noteTitle, currentContent);
            setCopyStatus('success');
            setToast({
                type: 'success',
                text: 'Notiz erfolgreich in dein persönliches Verzeichnis kopiert!',
            });
            setTimeout(() => {
                setCopyStatus('idle');
            }, 3000);
        } catch (err) {
            console.error('Failed to copy note to personal directory:', err);
            setCopyStatus('idle');
            setToast({
                type: 'error',
                text: 'Fehler beim Kopieren der Notiz in dein Verzeichnis.',
            });
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)] relative">
            {/* Left Directory Hierarchy (Baumstruktur mit Ästen) */}
            <aside
                aria-label="Notizhierarchie"
                className="hidden xl:block fixed left-8 top-16 w-56 select-none z-20"
            >
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 mb-6 group text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                    title="Zurück zu Tide"
                >
                    <div className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
                        <svg
                            className="w-3 h-3 fill-none stroke-currentColor stroke-2"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 15C6 15 7.5 9 10.5 9C13.5 9 15 15 18 15C20 15 21 12 21 12" />
                        </svg>
                    </div>
                    <span className="font-semibold text-xs tracking-tight text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-100 transition-colors">Tide</span>
                </Link>

                {/* Root item: Current note title */}
                <div className="flex items-center gap-2 font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    <span className="truncate" title={title.trim() || slug || 'Notiz'}>
                        {title.trim() || slug || 'Notiz'}
                    </span>
                </div>

                {/* Tree branches (Äste) */}
                <div className="relative ml-2 pl-3.5 border-l-2 border-gray-300/80 dark:border-neutral-700/80 space-y-2 mt-2">
                    {linkedNotes.length > 0 ? (
                        linkedNotes.map((item) => (
                            <div
                                key={item.id}
                                className="relative before:content-[''] before:absolute before:-left-3.5 before:top-3 before:w-3.5 before:h-px before:bg-gray-300/80 dark:before:bg-neutral-700/80 flex items-center gap-1.5"
                            >
                                <Link
                                    href={`/notes/${encodeURIComponent(item.id)}`}
                                    className="text-xs text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 truncate transition-colors py-0.5 inline-block max-w-full"
                                    title={item.label}
                                >
                                    {item.label}
                                </Link>
                            </div>
                        ))
                    ) : (
                        <div className="relative before:content-[''] before:absolute before:-left-3.5 before:top-3 before:w-3.5 before:h-px before:bg-gray-300/80 dark:before:bg-neutral-700/80 flex items-center gap-1.5">
                            <span className="text-[11px] text-gray-400 dark:text-neutral-500 italic select-none">
                                Tippe @ um Notizen zu verlinken
                            </span>
                        </div>
                    )}
                </div>
            </aside>

            {/* Notification / Toast Banner */}
            {toast && (
                <aside
                    aria-label="Benachrichtigung"
                    className="fixed bottom-20 right-6 z-50 max-w-md bg-[var(--card,var(--surface-card,#ffffff))] border border-[var(--border,var(--border-color,#e5e7eb))] text-[var(--foreground)] shadow-xl rounded-xl p-4 flex items-start gap-3"
                >
                    {toast.type === 'auth' && (
                        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    )}
                    {toast.type === 'success' && (
                        <Check className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    )}
                    {toast.type === 'error' && (
                        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 text-sm">
                        <p className="leading-snug">{toast.text}</p>
                        {toast.authLink && (
                            <Link
                                href={toast.authLink}
                                className="inline-block mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                Jetzt anmelden &rarr;
                            </Link>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setToast(null)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5 rounded transition-colors"
                        aria-label="Schließen"
                    >
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
                            onLinkClick={({ id }) => router.push('/notes/' + encodeURIComponent(id))}
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
                        <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 rounded-lg bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900 text-xs font-medium shadow-md whitespace-nowrap animate-in fade-in slide-in-from-bottom-1 duration-150 select-none pointer-events-none">
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
                                    onClick={() => {
                                        setProfileMenuOpen(false);
                                        void handleCopyToVault();
                                    }}
                                    disabled={copyStatus === 'copying'}
                                    className="w-full px-3.5 py-2.5 text-left text-sm flex items-center gap-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                    {copyStatus === 'copying' ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
                                    ) : copyStatus === 'success' ? (
                                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                                    ) : (
                                        <FolderInput className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />
                                    )}
                                    <span className="font-medium">Für mich speichern</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
