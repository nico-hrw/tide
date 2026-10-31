"use client";

import React from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { Calendar, Paperclip } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { formatEventTime } from './editorUtils';

export const MentionNodeView = ({ node }: any) => {
    const id = node.attrs.id || '';
    const label = node.attrs.label || 'Unknown';
    const isGhost = node.attrs.isGhost === true || node.attrs.isGhost === 'true' || String(id).startsWith('ghost-');

    // Dynamically look up live title
    const liveFile = useDataStore((s) => s.notes.find(f => f.id === id) || s.events.find(e => e.id === id)) as any;
    const title = liveFile?.title || label;
    const type = node.attrs.type || 'note';
    const isFile = type === 'file';
    const start = node.attrs.start;
    const isCompleted = liveFile?.is_completed || false;

    const isEvent = !isFile && (type === 'event' || !!useDataStore.getState().events?.find(e => e.id === id));
    const ev = !isFile ? useDataStore.getState().events?.find(e => e.id === id) : undefined;
    const eventMentionStyle = useDataStore((s) => s.eventMentionStyle) || useDataStore.getState().eventMentionStyle || 'blue';
    const eventMentionPreview = useDataStore((s) => s.eventMentionPreview) || useDataStore.getState().eventMentionPreview || 'hover';

    const isAlwaysBox = isEvent && eventMentionPreview === 'always';
    const eventDateStr = isEvent ? formatEventTime(ev?.start || start) : '';

    // Moderate rounding (not full-pill), inherit font size, tight horizontal padding
    const baseClass = isAlwaysBox
        ? 'inline-flex items-center gap-1.5 px-2.5 py-1 my-0.5 rounded-md font-normal cursor-pointer transition-all leading-snug align-middle border shadow-2xs'
        : 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium cursor-pointer transition-colors leading-snug align-middle border';

    let colorClass = '';
    let styleObj: any = {
        cursor: 'pointer',
        fontSize: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
    };

    if (isFile) {
        colorClass = 'bg-blue-50/80 text-blue-700 hover:bg-blue-100/90 border-blue-200/80 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/40 dark:hover:bg-blue-900/40';
    } else if (isGhost) {
        colorClass = 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600 border-gray-200 dark:border-slate-600';
    } else if (isEvent) {
        if (eventMentionStyle === 'calendar' && (ev?.color || liveFile?.color)) {
            const eventColor = ev?.color || liveFile?.color;
            styleObj = {
                ...styleObj,
                backgroundColor: `${eventColor}15`,
                borderColor: `${eventColor}40`,
                color: eventColor,
            };
        } else {
            colorClass = 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700/50';
        }
    } else {
        colorClass = 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/40';
    }

    if (isAlwaysBox) {
        styleObj = {
            ...styleObj,
            borderLeftWidth: '3px',
            borderLeftColor: (eventMentionStyle === 'calendar' && (ev?.color || liveFile?.color))
                ? (ev?.color || liveFile?.color)
                : '#3b82f6',
        };
    }

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
        window.dispatchEvent(new CustomEvent('editor:mention-click', { detail: { id, title, type: isEvent ? 'event' : type, start: ev?.start || start } }));
    };

    return (
        <NodeViewWrapper
            as="span"
            className={`${baseClass} ${colorClass} group relative`}
            data-type="mention"
            data-id={id}
            data-label={label}
            data-is-ghost={isGhost ? 'true' : 'false'}
            data-type-link={isFile ? 'file' : (isEvent ? 'event' : type)}
            data-start={ev?.start || start || ''}
            onClick={handleClick}
            style={styleObj}
            title={isFile ? 'Klicken zum Herunterladen' : (isEvent && eventMentionPreview === 'hover' && eventDateStr ? `${title} (${eventDateStr})` : undefined)}
        >
            {isFile ? (
                <>
                    <Paperclip className="w-3 h-3 shrink-0" />
                    <span>{label}</span>
                </>
            ) : isAlwaysBox ? (
                <>
                    <Calendar className="w-3.5 h-3.5 opacity-70 shrink-0" style={{ color: (eventMentionStyle === 'calendar' && (ev?.color || liveFile?.color)) ? (ev?.color || liveFile?.color) : undefined }} />
                    <span className="font-semibold text-xs truncate max-w-[160px]">{title}</span>
                    {eventDateStr && (
                        <span className="text-[11px] opacity-75 truncate border-l pl-1.5 border-current/20">
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
                            className="w-3.5 h-3.5 rounded-sm cursor-pointer border-blue-300 dark:border-blue-600 focus:ring-0 m-0"
                            style={(ev?.color || liveFile?.color) ? { accentColor: ev?.color || liveFile?.color, marginTop: '-1px' } : { marginTop: '-1px' }}
                        />
                    )}
                    <span className={isEvent && liveFile?.is_task && isCompleted ? 'line-through opacity-60' : ''}>
                        @{title}
                    </span>
                    {isEvent && eventMentionPreview === 'hover' && (
                        <span className="pointer-events-none invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 px-2.5 py-1 rounded-md bg-gray-900/90 dark:bg-gray-800/95 text-white text-xs shadow-lg whitespace-nowrap flex items-center gap-1.5 font-normal backdrop-blur-sm">
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
