'use client';

import React, { useState, useMemo } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { DiffChange, computeDiffStats } from '@/lib/diff';
import { NoteBackupPoint } from '@/hooks/useNoteBackups';

export interface NoteVersionDiffViewProps {
    point: NoteBackupPoint | null;
    diffChanges: DiffChange[];
    isLoading?: boolean;
    error?: string | null;
    rawPlainText?: string;
}

function renderHighlightedChange(change: DiffChange, keyPrefix: number): React.ReactNode {
    if (change.type === 'equal') {
        return (
            <span key={keyPrefix} className="text-t2-ink">
                {change.text}
            </span>
        );
    }

    const isAdded = change.type === 'added';
    const lines = change.text.split('\n');

    return (
        <React.Fragment key={keyPrefix}>
            {lines.map((seg, lineIdx) => {
                const isWhitespaceOnly = seg.length > 0 && /^[ \t]+$/.test(seg);
                const segClass = isWhitespaceOnly
                    ? isAdded
                        ? 'bg-emerald-500/25 border-b-2 border-emerald-500/70 rounded-[2px]'
                        : 'bg-rose-500/25 border-b-2 border-rose-500/70 line-through rounded-[2px]'
                    : isAdded
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-medium rounded-[2px] border-b border-emerald-400/60 dark:border-emerald-500/50'
                      : 'bg-rose-500/15 text-rose-700 dark:text-rose-400 line-through rounded-[2px] border-b border-rose-400/60 dark:border-rose-500/50';

                return (
                    <React.Fragment key={`${keyPrefix}-${lineIdx}`}>
                        {seg.length > 0 && (
                            <span
                                title={
                                    isWhitespaceOnly
                                        ? isAdded
                                            ? 'Leerzeichen hinzugefügt'
                                            : 'Leerzeichen entfernt'
                                        : undefined
                                }
                                className={segClass}
                            >
                                {seg}
                            </span>
                        )}
                        {lineIdx < lines.length - 1 && (
                            <>
                                <span
                                    className={
                                        isAdded
                                            ? 'select-none text-[11px] align-middle mx-0.5 px-1 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                                            : 'select-none text-[11px] align-middle mx-0.5 px-1 rounded bg-rose-500/20 text-rose-700 dark:text-rose-400'
                                    }
                                    aria-hidden="true"
                                    title={isAdded ? 'Zeilenumbruch hinzugefügt' : 'Zeilenumbruch entfernt'}
                                >
                                    ↵
                                </span>
                                {'\n'}
                            </>
                        )}
                    </React.Fragment>
                );
            })}
        </React.Fragment>
    );
}

export const NoteVersionDiffView: React.FC<NoteVersionDiffViewProps> = ({
    point,
    diffChanges,
    isLoading = false,
    error = null,
    rawPlainText,
}) => {
    const [viewMode, setViewMode] = useState<'diff' | 'snapshot'>('diff');

    const stats = useMemo(() => computeDiffStats(diffChanges), [diffChanges]);
    const snapshotText = useMemo(
        () => diffChanges.filter((c) => c.type !== 'added').map((c) => c.text).join(''),
        [diffChanges]
    );

    // 1. Loading state
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 min-h-[220px] text-t2-ink-2 select-none">
                <Loader2 className="w-6 h-6 animate-spin mb-3 text-t2-accent" />
                <p className="text-sm">Speicherstand wird geladen und entschlüsselt...</p>
            </div>
        );
    }

    // 2. Error state
    if (error) {
        return (
            <div className="p-4 my-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 text-rose-800 dark:text-rose-200 flex items-start gap-3 select-none">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <div className="text-sm">
                    <p className="font-medium">Fehler beim Laden der Version</p>
                    <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{error}</p>
                    <p className="text-xs text-rose-600/80 dark:text-rose-400/80 mt-1">
                        Bitte wähle einen anderen Speicherstand oder versuche es erneut.
                    </p>
                </div>
            </div>
        );
    }

    // Check if viewing current live version
    const isCurrent = Boolean(point?.isCurrent);

    // 3. Current Live View
    if (isCurrent) {
        const liveText = rawPlainText ?? diffChanges.map((c) => (c.type !== 'removed' ? c.text : '')).join('');
        const isEmpty = !liveText || liveText.length === 0;

        return (
            <div className="w-full">
                {isEmpty ? (
                    <div className="text-sm italic text-t2-ink-3 py-6 text-center select-none">
                        Diese Version ist leer.
                    </div>
                ) : (
                    <div className="w-full max-w-none prose prose-sm sm:prose-base dark:prose-invert font-sans leading-relaxed whitespace-pre-wrap select-text text-t2-ink">
                        {liveText}
                    </div>
                )}
            </div>
        );
    }

    // 4. Historical point comparison view
    const isCompletelyEmpty =
        diffChanges.length === 0 ||
        diffChanges.every((c) => !c.text || c.text.length === 0);
    const isSnapshotEmpty = snapshotText.length === 0;

    return (
        <div className="w-full">
            <div className="mb-4 pb-2.5 border-b border-t2-line flex flex-wrap items-center justify-between gap-2 text-xs select-none">
                <div className="flex flex-wrap items-center gap-1.5">
                    {!stats.hasChanges ? (
                        <span className="text-t2-ink-3">
                            Keine Textänderungen gegenüber dem aktuellen Stand
                        </span>
                    ) : (
                        <>
                            {stats.addedWords > 0 ? (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-medium">
                                    +{stats.addedWords} {stats.addedWords === 1 ? 'Wort' : 'Wörter'}
                                </span>
                            ) : stats.addedChars > 0 ? (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-medium">
                                    +{stats.addedChars} Zeichen
                                </span>
                            ) : null}
                            {stats.removedWords > 0 ? (
                                <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-400 font-medium">
                                    −{stats.removedWords} {stats.removedWords === 1 ? 'Wort' : 'Wörter'}
                                </span>
                            ) : stats.removedChars > 0 ? (
                                <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-400 font-medium">
                                    −{stats.removedChars} Zeichen
                                </span>
                            ) : null}
                        </>
                    )}
                </div>

                <div
                    className="inline-flex items-center rounded-md border border-t2-line bg-t2-surface p-0.5"
                    role="group"
                    aria-label="Ansichtsmodus"
                >
                    <button
                        type="button"
                        onClick={() => setViewMode('diff')}
                        aria-pressed={viewMode === 'diff'}
                        className={`px-2 py-0.5 rounded transition-colors ${
                            viewMode === 'diff'
                                ? 'bg-t2-hover text-t2-ink font-medium'
                                : 'text-t2-ink-2 hover:text-t2-ink'
                        }`}
                    >
                        Vergleich
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewMode('snapshot')}
                        aria-pressed={viewMode === 'snapshot'}
                        className={`px-2 py-0.5 rounded transition-colors ${
                            viewMode === 'snapshot'
                                ? 'bg-t2-hover text-t2-ink font-medium'
                                : 'text-t2-ink-2 hover:text-t2-ink'
                        }`}
                    >
                        Version
                    </button>
                </div>
            </div>

            {viewMode === 'snapshot' ? (
                isSnapshotEmpty ? (
                    <div className="text-sm italic text-t2-ink-3 py-6 text-center select-none">
                        Diese Version ist leer.
                    </div>
                ) : (
                    <div className="w-full max-w-none prose prose-sm sm:prose-base dark:prose-invert font-sans leading-relaxed whitespace-pre-wrap select-text text-t2-ink">
                        {snapshotText}
                    </div>
                )
            ) : isCompletelyEmpty ? (
                <div className="text-sm italic text-t2-ink-3 py-6 text-center select-none">
                    Diese Version ist leer.
                </div>
            ) : (
                <div className="w-full max-w-none prose prose-sm sm:prose-base dark:prose-invert font-sans leading-relaxed whitespace-pre-wrap select-text text-t2-ink">
                    {diffChanges.map((change, i) => renderHighlightedChange(change, i))}
                </div>
            )}
        </div>
    );
};

export default NoteVersionDiffView;
