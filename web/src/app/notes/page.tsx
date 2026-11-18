'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
    FileText,
    Sparkles,
    ArrowRight,
    ArrowLeft,
    Clock,
    Globe,
    ExternalLink,
} from 'lucide-react';
import { getHomePath } from '@/lib/routeUtils';

interface RecentNote {
    slug: string;
    title: string;
    updatedAt?: number;
}

function cleanSlug(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss')
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function generateRandomSlug(): string {
    return `note-${Date.now().toString(36)}`;
}

export default function NotesIndexPage() {
    const router = useRouter();
    const pathname = usePathname();
    const [noteName, setNoteName] = useState('');
    const [recentNotes, setRecentNotes] = useState<RecentNote[]>([]);
    const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

    const basePath = pathname?.startsWith('/tide') ? '/tide' : '';
    const homePath = getHomePath(pathname);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = localStorage.getItem('tide_known_quicknotes');
            if (!raw) return;
            const parsed: unknown = JSON.parse(raw);
            if (!Array.isArray(parsed)) return;

            const loaded: RecentNote[] = [];
            for (const item of parsed) {
                if (typeof item === 'string' && item.trim()) {
                    const slug = item.trim();
                    loaded.push({ slug, title: slug });
                } else if (item && typeof item === 'object') {
                    const record = item as Record<string, unknown>;
                    if (typeof record.slug === 'string' && record.slug.trim()) {
                        const slug = record.slug.trim();
                        const title = typeof record.title === 'string' && record.title.trim()
                            ? record.title.trim()
                            : slug;
                        const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : undefined;
                        loaded.push({ slug, title, updatedAt });
                    }
                }
            }

            loaded.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

            const seen = new Set<string>();
            const deduped: RecentNote[] = [];
            for (const note of loaded) {
                if (!seen.has(note.slug)) {
                    seen.add(note.slug);
                    deduped.push(note);
                }
            }

            setRecentNotes(deduped);
        } catch (err) {
            console.error('Failed to load recent notes:', err);
        }
    }, []);

    const cleanedPreview = useMemo(() => cleanSlug(noteName), [noteName]);

    const navigateToNote = (slug: string) => {
        const cleaned = cleanSlug(slug);
        if (!cleaned) {
            setHasAttemptedSubmit(true);
            return;
        }
        router.push(`${basePath}/notes/${encodeURIComponent(cleaned)}`);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        navigateToNote(noteName);
    };

    const handleRandomName = () => {
        const random = generateRandomSlug();
        setNoteName(random);
        setHasAttemptedSubmit(false);
    };

    return (
        <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)] selection:bg-t2-sub">
            {/* Top Bar Navigation */}
            <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between z-10">
                <Link
                    href={homePath}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium text-t2-ink-2  hover:text-t2-ink  hover:bg-t2-hover  transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Zurück zu Tide</span>
                </Link>

                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-t2-sub  border border-t2-line  text-[11px] font-semibold text-t2-accent ">
                    <Globe className="w-3 h-3" />
                    <span>Öffentlicher Bereich</span>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-16 flex flex-col items-center justify-center">
                {/* Header / Hero */}
                <div className="text-center mb-8 sm:mb-10 w-full max-w-xl">
                    <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-t2-sub  border border-t2-line  shadow-sm text-t2-accent  mb-5">
                        <FileText className="w-7 h-7 sm:w-8 sm:h-8" />
                    </div>

                    <span className="text-xs font-bold tracking-[0.3em] uppercase text-t2-ink-3  block mb-2">
                        TIDE QUICKNOTES
                    </span>

                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-t2-ink  mb-3 sm:mb-4">
                        Quicknotes
                    </h1>

                    <p className="text-sm sm:text-base text-t2-ink-2  leading-relaxed">
                        Öffentliche Notizen ohne Login erstellen und teilen.
                    </p>
                </div>

                {/* Entry Card */}
                <div className="w-full bg-t2-surface  border border-t2-line  rounded-2xl p-5 sm:p-7 shadow-lg shadow-neutral-200/50 dark:shadow-none mb-10">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label
                                htmlFor="note-name-input"
                                className="block text-xs font-semibold text-t2-ink  mb-2"
                            >
                                Notizname oder Thema
                            </label>

                            <div className="relative">
                                <input
                                    id="note-name-input"
                                    type="text"
                                    value={noteName}
                                    onChange={(e) => {
                                        setNoteName(e.target.value);
                                        if (hasAttemptedSubmit) setHasAttemptedSubmit(false);
                                    }}
                                    placeholder="Notizname eingeben (z. B. hallo, meeting-notizen)..."
                                    autoFocus
                                    className={`w-full px-4 py-3 sm:py-3.5 rounded-xl bg-t2-sub  border text-sm sm:text-base text-t2-ink  placeholder-t2-ink-3  outline-none transition-all ${
                                        hasAttemptedSubmit && !cleanedPreview
                                            ? 'border-red-500 focus:border-red-500 ring-2 ring-red-500/20'
                                            : 'border-t2-line  focus:border-t2-accent  focus:ring-2 focus:ring-t2-accent'
                                    }`}
                                />
                            </div>

                            {/* Cleaned slug live preview */}
                            {cleanedPreview && (
                                <p className="mt-2 text-xs text-t2-ink-2  flex items-center gap-1 truncate">
                                    <span>Ziel-URL:</span>
                                    <span className="font-mono text-t2-accent ">
                                        /notes/{cleanedPreview}
                                    </span>
                                </p>
                            )}

                            {hasAttemptedSubmit && !cleanedPreview && (
                                <p className="mt-2 text-xs text-red-500">
                                    Bitte gib einen gültigen Notiznamen ein.
                                </p>
                            )}
                        </div>

                        {/* Buttons */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
                            <button
                                type="submit"
                                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-t2-accent hover:opacity-90 active:scale-[0.99] text-t2-accent-ink font-medium text-sm shadow-sm transition-all cursor-pointer"
                            >
                                <span>Notiz öffnen / erstellen</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>

                            <button
                                type="button"
                                onClick={handleRandomName}
                                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-t2-hover hover:bg-t2-stage   active:scale-[0.99] text-t2-ink  font-medium text-sm border border-t2-line  transition-all cursor-pointer"
                                title="Zufälligen Namen generieren"
                            >
                                <Sparkles className="w-4 h-4 text-t2-accent" />
                                <span>Zufälligen Namen generieren</span>
                            </button>
                        </div>
                    </form>

                    <div className="mt-5 pt-4 border-t border-t2-line-soft ">
                        <p className="text-xs text-t2-ink-2 ">
                            💡 <strong>Tipp:</strong> Jede Adresse wie{' '}
                            <code className="px-1.5 py-0.5 rounded bg-t2-hover  text-t2-ink  font-mono text-[11px]">
                                /notes/hallo
                            </code>{' '}
                            ist sofort als Notiz verfügbar. Jeder mit dem Link kann den Inhalt lesen und bearbeiten.
                        </p>
                    </div>
                </div>

                {/* Recently Viewed Notes */}
                {recentNotes.length > 0 && (
                    <section aria-labelledby="recent-notes-title" className="w-full">
                        <div className="flex items-center gap-2 mb-3 px-1">
                            <Clock className="w-4 h-4 text-t2-ink-3 " />
                            <h2
                                id="recent-notes-title"
                                className="text-xs font-semibold uppercase tracking-wider text-t2-ink-2 "
                            >
                                Kürzlich geöffnete Notizen
                            </h2>
                            <span className="text-xs text-t2-ink-3 ">
                                ({recentNotes.length})
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {recentNotes.map((note) => (
                                <Link
                                    key={note.slug}
                                    href={`${basePath}/notes/${encodeURIComponent(note.slug)}`}
                                    className="group flex items-center justify-between gap-3 p-3.5 rounded-xl bg-t2-surface  border border-t2-line  hover:border-t2-accent  hover:shadow-sm transition-all"
                                >
                                    <div className="min-w-0 flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-t2-hover  flex items-center justify-center text-t2-ink-2  group-hover:text-t2-accent shrink-0 transition-colors">
                                            <FileText className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-t2-ink  truncate group-hover:text-t2-accent  transition-colors">
                                                {note.title || note.slug}
                                            </p>
                                            <p className="text-[11px] font-mono text-t2-ink-3  truncate">
                                                /notes/{note.slug}
                                            </p>
                                        </div>
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-t2-ink-3  opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </Link>
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}
