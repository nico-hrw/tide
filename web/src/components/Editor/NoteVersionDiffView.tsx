'use client';

import React from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { DiffChange } from '@/lib/diff';
import { NoteBackupPoint } from '@/hooks/useNoteBackups';

export interface NoteVersionDiffViewProps {
    point: NoteBackupPoint | null;
    diffChanges: DiffChange[];
    isLoading?: boolean;
    error?: string | null;
    rawPlainText?: string;
}

export const NoteVersionDiffView: React.FC<NoteVersionDiffViewProps> = ({
    point,
    diffChanges,
    isLoading = false,
    error = null,
    rawPlainText,
}) => {
    // 1. Loading state
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 min-h-[220px] text-gray-500 dark:text-gray-400 select-none">
                <Loader2 className="w-6 h-6 animate-spin mb-3 text-blue-500" />
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
        const isEmpty = !liveText.trim();

        return (
            <div className="py-2">
                <div className="flex items-center gap-2 mb-4 px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-500/20 w-fit select-none">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    <span>Aktueller Stand (Live-Inhalt)</span>
                </div>

                {isEmpty ? (
                    <div className="text-sm italic text-gray-400 dark:text-gray-500 py-6 text-center select-none">
                        Diese Version ist leer.
                    </div>
                ) : (
                    <div className="w-full max-w-none prose prose-sm sm:prose-base dark:prose-invert font-sans leading-relaxed whitespace-pre-wrap select-text px-1 text-gray-800 dark:text-gray-200">
                        {liveText}
                    </div>
                )}
            </div>
        );
    }

    // 4. Historical point comparison view
    const dateLabel = [point?.formattedDate, point?.formattedTime].filter(Boolean).join(' ');
    const headerTitle = dateLabel
        ? `Vergleich: ${point?.label || 'Ausgewählte Version'} (${point?.formattedDate} ${point?.formattedTime}) im Vergleich zum aktuellen Stand`
        : `Vergleich: ${point?.label || 'Ausgewählte Version'} im Vergleich zum aktuellen Stand`;

    const isCompletelyEmpty =
        diffChanges.length === 0 ||
        diffChanges.every((c) => !c.text || c.text.trim().length === 0);

    return (
        <div className="py-2 space-y-4">
            {/* Header badge & Legend */}
            <div className="space-y-2 pb-3 border-b border-gray-200 dark:border-gray-800 select-none">
                <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {headerTitle}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-600/50">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Neuer Inhalt (seit diesem Stand)
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-600/50">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        Gelöschter Inhalt (in diesem Stand enthalten)
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500" />
                        Identischer Inhalt
                    </span>
                </div>
            </div>

            {/* Diff content or empty notice */}
            {isCompletelyEmpty ? (
                <div className="text-sm italic text-gray-400 dark:text-gray-500 py-6 text-center select-none">
                    Diese Version ist leer.
                </div>
            ) : (
                <div className="w-full max-w-none prose prose-sm sm:prose-base dark:prose-invert font-sans leading-relaxed whitespace-pre-wrap select-text px-1">
                    {diffChanges.map((change, i) => {
                        if (change.type === 'added') {
                            return (
                                <span
                                    key={i}
                                    className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-medium px-0.5 rounded border-b border-emerald-300 dark:border-emerald-600/50"
                                >
                                    {change.text}
                                </span>
                            );
                        }
                        if (change.type === 'removed') {
                            return (
                                <span
                                    key={i}
                                    className="bg-rose-500/15 text-rose-700 dark:text-rose-400 line-through px-0.5 rounded border-b border-rose-300 dark:border-rose-600/50"
                                >
                                    {change.text}
                                </span>
                            );
                        }
                        return (
                            <span key={i} className="text-gray-800 dark:text-gray-200">
                                {change.text}
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default NoteVersionDiffView;
