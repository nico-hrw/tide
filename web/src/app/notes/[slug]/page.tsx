'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FolderInput, Check, Loader2, AlertCircle, X } from 'lucide-react';
import Editor from '@/components/Editor';
import { deriveQuicknoteKey, fetchQuicknote, saveQuicknote, type QuicknoteData } from '@/lib/quicknotesApi';
import { useDataStore } from '@/store/useDataStore';

interface ToastState {
    type: 'success' | 'auth' | 'error';
    text: string;
    authLink?: string;
}

export default function QuicknotePage() {
    const params = useParams();
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

    const [loading, setLoading] = useState<boolean>(true);
    const [title, setTitle] = useState<string>('');
    const [content, setContent] = useState<unknown>(null);
    const [initialContent, setInitialContent] = useState<unknown>(null);
    const [quicknoteKey, setQuicknoteKey] = useState<CryptoKey | null>(null);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'success'>('idle');
    const [toast, setToast] = useState<ToastState | null>(null);

    const titleRef = useRef<string>('');
    titleRef.current = title;
    const contentRef = useRef<unknown>(null);
    contentRef.current = content;
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const handleCopyToVault = async () => {
        if (copyStatus === 'copying') return;

        const myId = useDataStore.getState().myId;
        const sessionToken = typeof window !== 'undefined'
            ? (sessionStorage.getItem('tide_session_token') || localStorage.getItem('tide_session_token'))
            : null;
        const isLoggedIn = Boolean(myId || sessionToken);

        if (!isLoggedIn) {
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
        <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)]">
            {/* Minimalist Top Bar */}
            <header className="sticky top-0 z-30 w-full border-b border-[var(--border,var(--border-color))] bg-[var(--background)]/90 backdrop-blur-md px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    {/* Tide branding/logo linking to / */}
                    <Link
                        href="/"
                        className="flex items-center gap-2 group select-none text-[var(--foreground)] shrink-0"
                        title="Zurück zu Tide"
                    >
                        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20 group-hover:scale-105 transition-transform">
                            <svg
                                className="w-4 h-4 fill-none stroke-currentColor stroke-2"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 15C6 15 7.5 9 10.5 9C13.5 9 15 15 18 15C20 15 21 12 21 12" />
                            </svg>
                        </div>
                        <span className="font-bold text-base tracking-tight hidden xs:inline">Tide</span>
                    </Link>

                    <div className="h-4 w-px bg-[var(--border,var(--border-color))] shrink-0" />

                    {/* Editable Quicknote Title */}
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => handleTitleChange(e.target.value)}
                        placeholder="Notiztitel..."
                        aria-label="Quicknote Titel"
                        className="bg-transparent border-b border-transparent hover:border-[var(--border,var(--border-color))] focus:border-blue-500 font-semibold text-sm sm:text-base text-[var(--foreground)] px-1.5 py-0.5 rounded outline-none transition-colors max-w-[150px] sm:max-w-xs md:max-w-md truncate"
                    />
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    {/* Live indicator badge */}
                    <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 select-none">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        <span>Live synchronisiert</span>
                    </div>

                    {/* In mein Verzeichnis kopieren Button */}
                    <button
                        type="button"
                        onClick={handleCopyToVault}
                        disabled={copyStatus === 'copying'}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm transition-colors disabled:opacity-50 cursor-pointer select-none"
                    >
                        {copyStatus === 'copying' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : copyStatus === 'success' ? (
                            <Check className="w-4 h-4" />
                        ) : (
                            <FolderInput className="w-4 h-4" />
                        )}
                        <span className="hidden sm:inline">In mein Verzeichnis kopieren</span>
                        <span className="inline sm:hidden">Kopieren</span>
                    </button>
                </div>
            </header>

            {/* Notification / Toast Banner */}
            {toast && (
                <aside
                    aria-label="Benachrichtigung"
                    className="fixed bottom-6 right-6 z-50 max-w-md bg-[var(--card,var(--surface-card,#ffffff))] border border-[var(--border,var(--border-color,#e5e7eb))] text-[var(--foreground)] shadow-xl rounded-xl p-4 flex items-start gap-3"
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
            <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-6">
                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-slate-500 min-h-[50vh]">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
                        <span className="font-medium text-sm">Lade Quicknote...</span>
                    </div>
                ) : (
                    <Editor
                        activeTabId={`quicknote:${slug}`}
                        dek={quicknoteKey}
                        keyEpoch={1}
                        isShared={true}
                        editable={true}
                        initialContent={initialContent}
                        onChange={(newContent: unknown) => {
                            setContent(newContent);
                            debouncedSave(newContent);
                        }}
                    />
                )}
            </main>
        </div>
    );
}
