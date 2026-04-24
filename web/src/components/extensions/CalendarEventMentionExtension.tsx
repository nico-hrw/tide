import React, { useCallback } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { format } from 'date-fns';

// ── Node View ──────────────────────────────────────────────────────────────────

const CalendarEventNodeView: React.FC<NodeViewProps> = ({ node }) => {
    const { eventId, title, start, end, color } = node.attrs as {
        eventId: string;
        title: string;
        start: string;
        end: string;
        color?: string;
    };

    const accentColor = color || '#6366f1';

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
            return format(d, 'dd.MM.yyyy');
        } catch {
            return '';
        }
    };

    const startTime = formatTime(start);
    const endTime = formatTime(end);
    const dateLabel = formatDate(start);
    const timeLabel = startTime && endTime ? `${startTime} – ${endTime}` : '';

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
                    {title || 'Event'}
                </span>

                {/* Time pill */}
                {(dateLabel || timeLabel) && (
                    <span style={{
                        fontSize: '0.78em',
                        opacity: 0.75,
                        fontWeight: 400,
                        flexShrink: 0,
                    }}>
                        {timeLabel ? timeLabel : dateLabel}
                    </span>
                )}
            </span>
        </NodeViewWrapper>
    );
};

// ── Tiptap Extension ──────────────────────────────────────────────────────────

export const CalendarEventMentionExtension = Node.create({
    name: 'calendarEventMention',
    group: 'inline',
    inline: true,
    atom: true,
    draggable: false,

    addAttributes() {
        return {
            eventId: { default: null },
            title: { default: '' },
            start: { default: '' },
            end: { default: '' },
            color: { default: null },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-calendar-event-mention]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-calendar-event-mention': '' }), 0];
    },

    addNodeView() {
        return ReactNodeViewRenderer(CalendarEventNodeView);
    },
});

export default CalendarEventMentionExtension;
