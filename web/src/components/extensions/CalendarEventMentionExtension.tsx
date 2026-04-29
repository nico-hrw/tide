import React, { useCallback } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { format } from 'date-fns';
import { useDataStore } from '@/store/useDataStore';

// ── Node View ──────────────────────────────────────────────────────────────────

const CalendarEventNodeView: React.FC<NodeViewProps> = ({ node }) => {
    const { eventId } = node.attrs as { eventId: string };
    
    // Dynamically fetch event data from the global store
    const liveEvent = useDataStore((s) => s.events.find(e => e.id === eventId)) as any;

    const isDeleted = !liveEvent;
    const title = liveEvent?.title || 'gelöschter Termin';
    const start = liveEvent?.start || '';
    const end = liveEvent?.end || '';
    const color = isDeleted ? '#94a3b8' : (liveEvent?.color || '#6366f1');
    const accentColor = color;

    const formatTime = (iso: string) => {
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            return format(d, 'HH:mm');
        } catch {
            return '';
        }
    };

    const formatDate = (iso: string) => {
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            return format(d, 'dd.MM');
        } catch {
            return '';
        }
    };

    const startTime = formatTime(start);
    const dateLabel = formatDate(start);
    // Compact format: "dd.MM HH:mm"
    const timeLabel = [dateLabel, startTime].filter(Boolean).join(' ');

    const handleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('calendarEventMention:click', {
            detail: { eventId, title, start, end }
        }));
    }, [eventId, title, start, end]);

    return (
        <NodeViewWrapper style={{ display: 'inline' }}>
            <span
                contentEditable={false}
                onClick={handleClick}
                title={`Open in Calendar: ${title}`}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '2px 10px 2px 6px',
                    borderRadius: '6px',
                    background: `${accentColor}18`,
                    border: `1px solid ${accentColor}40`,
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontSize: '0.88em',
                    fontWeight: 500,
                    color: accentColor,
                    verticalAlign: 'middle',
                    transition: 'background 0.15s, border-color 0.15s',
                    whiteSpace: 'nowrap',
                    maxWidth: '340px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}
                onMouseEnter={e => {
                    (e.currentTarget as HTMLSpanElement).style.background = `${accentColor}28`;
                    (e.currentTarget as HTMLSpanElement).style.borderColor = `${accentColor}80`;
                }}
                onMouseLeave={e => {
                    (e.currentTarget as HTMLSpanElement).style.background = `${accentColor}18`;
                    (e.currentTarget as HTMLSpanElement).style.borderColor = `${accentColor}40`;
                }}
            >
                {/* Calendar icon dot */}
                <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '16px',
                    height: '16px',
                    borderRadius: '4px',
                    background: accentColor,
                    flexShrink: 0,
                }}>
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                        <rect x="0.5" y="1.5" width="8" height="7" rx="1.5" stroke="white" strokeWidth="1"/>
                        <line x1="2.5" y1="0.5" x2="2.5" y2="2.5" stroke="white" strokeWidth="1" strokeLinecap="round"/>
                        <line x1="6.5" y1="0.5" x2="6.5" y2="2.5" stroke="white" strokeWidth="1" strokeLinecap="round"/>
                        <line x1="1.5" y1="4" x2="7.5" y2="4" stroke="white" strokeWidth="0.8"/>
                    </svg>
                </span>

                {/* Title */}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                    {title}
                </span>

                {/* Date + time compact label */}
                {timeLabel && (
                    <span style={{
                        fontSize: '0.78em',
                        opacity: 0.75,
                        fontWeight: 400,
                        flexShrink: 0,
                    }}>
                        {timeLabel}
                    </span>
                )}
                {isDeleted && (
                    <span style={{ fontSize: '0.7em', opacity: 0.6, fontStyle: 'italic' }}>
                        (entfernt)
                    </span>
                )}
            </span>
        </NodeViewWrapper>
    );
};

// ── Tiptap Extension ──────────────────────────────────────────────────────────

export const CalendarEventMentionExtension = Node.create({
    name: 'calendarEvent', // Changed name from calendarEventMention to calendarEvent as requested
    group: 'inline',
    inline: true,
    atom: true,
    draggable: false,

    addAttributes() {
        return {
            eventId: { default: null },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-calendar-event]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-calendar-event': '' }), 0];
    },

    addNodeView() {
        return ReactNodeViewRenderer(CalendarEventNodeView);
    },
});

export default CalendarEventMentionExtension;
