import React from 'react';

interface NoteHeaderActionsProps {
    /** Only the owner sees the "last edited" label that opens the version history. */
    isOwner: boolean;
    historyLabel: React.ReactNode;
    /** Share, VarSheet, save state and options buttons. */
    actions: React.ReactNode;
    /** On the A4 sheet the cluster hangs in the top margin, right (desktop). */
    isA4: boolean;
}

/** Note header cluster: the "last edited" label on top, the icon buttons in a second row below it. */
export default function NoteHeaderActions({ isOwner, historyLabel, actions, isA4 }: NoteHeaderActionsProps) {
    return (
        <div className={`flex flex-col items-end gap-0.5 shrink-0 self-end mb-2 ${isA4 ? 'z-20 lg:absolute lg:bottom-full lg:right-0 lg:mb-3 lg:self-auto' : ''}`}>
            {isOwner && (
                <div data-testid="note-history-row" className="flex items-center justify-end">
                    {historyLabel}
                </div>
            )}
            <div data-testid="note-actions-row" className="flex items-center justify-end gap-1">
                {actions}
            </div>
        </div>
    );
}
