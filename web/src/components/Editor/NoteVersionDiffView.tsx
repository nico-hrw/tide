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
        const isEmpty = !liveText || liveText.length === 0;

        return (
            <div className="w-full">
                {isEmpty ? (
                    <div className="text-sm italic text-gray-400 dark:text-gray-500 py-6 text-center select-none">
                        Diese Version ist leer.
                    </div>
                ) : (
                    <div className="w-full max-w-none prose prose-sm sm:prose-base dark:prose-invert font-sans leading-relaxed whitespace-pre-wrap select-text text-gray-800 dark:text-gray-200">
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

    return (
        <div className="w-full">
            {/* Diff content or empty notice */}
            {isCompletelyEmpty ? (
                <div className="text-sm italic text-gray-400 dark:text-gray-500 py-6 text-center select-none">
                    Diese Version ist leer.
                </div>
            ) : (
                <div className="w-full max-w-none prose prose-sm sm:prose-base dark:prose-invert font-sans leading-relaxed whitespace-pre-wrap select-text text-gray-800 dark:text-gray-200">
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
