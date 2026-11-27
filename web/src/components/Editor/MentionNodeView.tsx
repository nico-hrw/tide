"use client";

import React from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { Calendar, Paperclip } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { formatEventTime } from './editorUtils';
import { ContactMentionChip } from './ContactMentionChip';

export const MentionNodeView = ({ node, ...rest }: any) => {
    // Contact mentions have their own chip (avatar + profile card)
    if (node.attrs.type === 'contact') return <ContactMentionChip node={node} {...rest} />;
    return <GenericMentionNodeView node={node} />;
};

const GenericMentionNodeView = ({ node }: any) => {
    const id = node.attrs.id || '';
    const label = node.attrs.label || 'Unknown';
    const isGhost = node.attrs.isGhost === true || node.attrs.isGhost === 'true' || String(id).startsWith('ghost-');

    // Retrieve active note and currentSafe
    const activeNoteId = useDataStore((s) => s.activeNoteId);
    const currentNote = useDataStore((s) => s.notes.find((n) => n.id === activeNoteId));
    const rawCurrentSafe = currentNote?.safe || currentNote?.metadata?.safe || 'main';
    const currentSafe = rawCurrentSafe === 'Standard' ? 'main' : rawCurrentSafe;

    // Dynamically look up live title
    const liveFile = useDataStore((s) => s.notes.find(f => f.id === id) || s.events.find(e => e.id === id)) as any;
    const title = liveFile?.title || label;
    const type = node.attrs.type || 'note';
    const isFile = type === 'file';
    const start = node.attrs.start;
    const isCompleted = liveFile?.is_completed || false;

    // Helper to normalize safe names
    const normalizeSafeName = (s?: string | null) => {
        if (!s) return null;
        const trimmed = s.trim();
        return trimmed === 'Standard' ? 'main' : trimmed;
    };

    // Cross-Safe link detection & safe indicator
    const rawSafe = (node.attrs.safe as string | undefined) || (liveFile?.safe as string | undefined) || ((liveFile?.metadata as Record<string, unknown> | undefined)?.safe as string | undefined);
    let targetSafe: string | null = normalizeSafeName(rawSafe);
    let displayTitle = title;

    if (!targetSafe && typeof label === 'string' && label.includes(':')) {
        const colonIdx = label.indexOf(':');
        targetSafe = normalizeSafeName(label.substring(0, colonIdx));
    }

    if (targetSafe) {
        if (displayTitle.startsWith(`${targetSafe}:`)) {
            displayTitle = displayTitle.substring(targetSafe.length + 1).trim();
        } else if (displayTitle.startsWith('Standard:')) {
            displayTitle = displayTitle.substring('Standard:'.length).trim();
        } else if (typeof label === 'string' && (label.startsWith(`${targetSafe}:`) || label.startsWith('Standard:'))) {
            const prefix = label.startsWith(`${targetSafe}:`) ? `${targetSafe}:` : 'Standard:';
            displayTitle = liveFile?.title || label.substring(prefix.length).trim();
        }
    }

    const showSafePrefix = targetSafe && targetSafe !== currentSafe;
    const safePrefix = showSafePrefix ? targetSafe : null;

    const isEvent = !isFile && (type === 'event' || !!useDataStore.getState().events?.find(e => e.id === id));
    const ev = !isFile ? useDataStore.getState().events?.find(e => e.id === id) : undefined;
    const eventMentionStyle = useDataStore((s) => s.eventMentionStyle) || useDataStore.getState().eventMentionStyle || 'blue';
    const eventMentionPreview = useDataStore((s) => s.eventMentionPreview) || useDataStore.getState().eventMentionPreview || 'hover';

    const isAlwaysBox = isEvent && eventMentionPreview === 'always';
    const eventDateStr = isEvent ? formatEventTime(ev?.start || start) : '';

    // Moderate rounding (not full-pill), inherit font size, tight horizontal padding
    // Flat chip: tinted background + matching text, no border, no accent bar.
    // Colour by kind: notes/files violet, tasks blue, events in their calendar colour.
    const baseClass = isAlwaysBox
        ? 'inline-flex items-center gap-1.5 px-2.5 py-1 my-0.5 rounded-md font-medium cursor-pointer transition-colors leading-snug align-middle'
        : 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium cursor-pointer transition-colors leading-snug align-middle';

    const eventColor: string | undefined = ev?.color || liveFile?.color;
    let tint = 'var(--mention-note)';
    if (isGhost) tint = 'var(--t2-ink-2)';
    else if (isEvent && liveFile?.is_task) tint = 'var(--mention-todo)';
    else if (isEvent) tint = eventMentionStyle === 'calendar' && eventColor ? eventColor : 'var(--mention-todo)';

    const colorClass = 'mention-chip';
    const styleObj: React.CSSProperties & Record<string, string | number> = {
        cursor: 'pointer',
        fontSize: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
        '--chip': tint,
    };

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (isFile) {
            window.dispatchEvent(new CustomEvent('editor:mention-click', { detail: { id, title: label, type: 'file' } }));
            return;
        }
        if (isEvent) {
            window.dispatchEvent(new CustomEvent('tide:select-event', { detail: { id, start: ev?.start || start } }));
            window.dispatchEvent(new CustomEvent('calendar:scroll-to', { detail: { id, start: ev?.start || start } }));
        }
        window.dispatchEvent(new CustomEvent('editor:mention-click', { 
            detail: { 
                id, 
                title: displayTitle, 
                type: isEvent ? 'event' : type, 
                start: ev?.start || start,
                safe: safePrefix || node.attrs.safe || liveFile?.safe || liveFile?.metadata?.safe
            } 
        }));
    };

    return (
        <NodeViewWrapper
            as="span"
            className={`${baseClass} ${colorClass} group relative`}
            data-type="mention"
            data-id={id}
            data-label={label}
            data-safe={safePrefix || undefined}
            data-is-ghost={isGhost ? 'true' : 'false'}
            data-type-link={isFile ? 'file' : (isEvent ? 'event' : type)}
            data-start={ev?.start || start || ''}
            onClick={handleClick}
            style={styleObj}
            title={
                isFile
                    ? 'Klicken zum Herunterladen'
                    : isEvent && eventMentionPreview === 'hover' && eventDateStr
                    ? `${title} (${eventDateStr})`
                    : safePrefix
                    ? `[Workspace: ${safePrefix}] ${displayTitle}`
                    : undefined
            }
        >
            {isFile ? (
                <>
                    <Paperclip className="w-3 h-3 shrink-0" />
                    <span>{label}</span>
                </>
            ) : isAlwaysBox ? (
                <>
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-semibold text-xs truncate max-w-[160px]">{title}</span>
                    {eventDateStr && (
                        <span className="text-[11px] opacity-70 truncate font-normal">
                            {eventDateStr}
                        </span>
                    )}
                </>
            ) : (
                <>
                    {isEvent && liveFile?.is_task && (
                        <input
                            type="checkbox"
                            checked={isCompleted}
                            onChange={(e) => {
                                e.stopPropagation();
                                window.dispatchEvent(new CustomEvent('event-task:toggle', { detail: { id, is_completed: !isCompleted } }));
                            }}
                            className="w-3.5 h-3.5 rounded-sm cursor-pointer border-t2-line  focus:ring-0 m-0"
                            style={(ev?.color || liveFile?.color) ? { accentColor: ev?.color || liveFile?.color, marginTop: '-1px' } : { marginTop: '-1px' }}
                        />
                    )}
                    <span className={isEvent && liveFile?.is_task && isCompleted ? 'line-through opacity-60' : ''}>
                        @{safePrefix ? (
                            <>
                                <span className="opacity-50 font-normal text-[0.9em] mr-0.5">{safePrefix}:</span>
                                <span>{displayTitle}</span>
                            </>
                        ) : (
                            displayTitle
                        )}
                    </span>
                    {isEvent && eventMentionPreview === 'hover' && (
                        <span className="pointer-events-none invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 px-2.5 py-1 rounded-md bg-[color-mix(in_srgb,var(--t2-ink)_90%,transparent)] text-t2-bg text-xs shadow-lg whitespace-nowrap flex items-center gap-1.5 font-normal backdrop-blur-sm">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ev?.color || liveFile?.color || '#3b82f6' }} />
                            <span className="font-medium">{title}</span>
                            {eventDateStr && <span className="opacity-75 text-[11px]">({eventDateStr})</span>}
                        </span>
                    )}
                </>
            )}
        </NodeViewWrapper>
    );
};

export default MentionNodeView;
