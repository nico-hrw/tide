import React, { useState, useRef, useCallback } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import { InputRule } from '@tiptap/core';
import { useDataStore } from '@/store/useDataStore';
import { format, isSameDay, parseISO } from 'date-fns';
import { getEventsForDate } from '@/lib/calendarUtils';

// ── Date Parsing Helpers ──────────────────────────────────────────────────────

const GERMAN_MONTHS: Record<string, number> = {
    januar: 0, jan: 0, january: 0,
    februar: 1, feb: 1, february: 1,
    märz: 2, mar: 2, march: 2,
    april: 3, apr: 3,
    mai: 4, may: 4,
    juni: 5, jun: 5, june: 5,
    juli: 6, jul: 6, july: 6,
    august: 7, aug: 7,
    september: 8, sep: 8,
    oktober: 9, okt: 9, oct: 9, october: 9,
    november: 10, nov: 10,
    dezember: 11, dez: 11, dec: 11, december: 11,
};

function parseDate(raw: string): Date | null {
    // DD.MM. or DD.MM.YY or DD.MM.YYYY
    const dotMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{2}|\d{4})?$/);
    if (dotMatch) {
        let year = dotMatch[3] ? parseInt(dotMatch[3], 10) : new Date().getFullYear();
        if (year > 0 && year < 100) year += 2000;
        const d = new Date(year, parseInt(dotMatch[2], 10) - 1, parseInt(dotMatch[1], 10));
        if (!isNaN(d.getTime())) return d;
    }

    // DD. Month [YYYY]  or  DD Month [YYYY]
    const wordMatch = raw.match(/^(\d{1,2})\.?\s+([A-Za-zÄäÖöÜü]+)\s*(\d{4})?$/);
    if (wordMatch) {
        const day = parseInt(wordMatch[1], 10);
        const monthKey = wordMatch[2].toLowerCase();
        const month = GERMAN_MONTHS[monthKey];
        if (month !== undefined) {
            const yearMatch = wordMatch[3];
            const parsedYear = yearMatch ? parseInt(yearMatch) : new Date().getFullYear();
            const d = new Date(parsedYear, month, day);
            if (!isNaN(d.getTime())) return d;
        }
    }

    return null;
}

function formatDateLabel(date: Date): string {
    return format(date, 'dd.MM.yyyy');
}

// ── Regex patterns for InputRules ─────────────────────────────────────────────
// Matches: 3.4. / 3.4 / 13.03.26 / 13.03.2026 / 13. März / 13. März 2026 / 13 March 2026
// Followed by a space or end of line (using word boundary check at the end of capture block to prevent partial matching like 20266)
const DATE_REGEX = /(?:^|\s)(\d{1,2}\.\d{1,2}\.?(?:\d{2,4})?(?!\d)|\d{1,2}\.?\s+[A-Za-zÄÖÜäöü]+(?:\s+\d{4})?(?!\d))(\s)$/;

// ── DateMentionNodeView (React Component) ─────────────────────────────────────

const DateMentionNodeView: React.FC<NodeViewProps> = ({ node }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
    const containerRef = useRef<HTMLSpanElement>(null);
    const hideTimeout = useRef<NodeJS.Timeout | null>(null);

    const isoDate = node.attrs.isoDate as string;
    const label = node.attrs.label as string;

    const events = useDataStore(s => s.events);

    const parsedDate = isoDate ? new Date(isoDate) : null;

    const dayEvents = parsedDate ? getEventsForDate(parsedDate, events as any) : [];

    const handleMouseEnter = useCallback(() => {
        if (hideTimeout.current) clearTimeout(hideTimeout.current);
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setPopoverPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
        }
        setIsHovered(true);
    }, []);

    const handleMouseLeave = useCallback(() => {
        hideTimeout.current = setTimeout(() => setIsHovered(false), 200);
    }, []);

    const handleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!parsedDate) return;
        // Navigate to calendar with this date
        window.dispatchEvent(new CustomEvent('dateMention:click', { detail: { isoDate } }));
    }, [isoDate, parsedDate]);

    return (
        <NodeViewWrapper style={{ display: 'inline' }}>
            <span
                ref={containerRef}
                contentEditable={false}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onClick={handleClick}
                className="cursor-pointer underline decoration-gray-400 decoration-dotted underline-offset-4 hover:decoration-gray-600 transition-colors"
                style={{
                    display: 'inline',
                    fontSize: 'inherit',
                    fontWeight: 'inherit',
                    color: 'inherit',
                    userSelect: 'none',
                }}
                title={parsedDate ? `Navigate to ${formatDateLabel(parsedDate)} in Calendar` : label}
            >
                {label}
            </span>

            {/* Popover Timeline */}
            {isHovered && parsedDate && (
                <span
                    onMouseEnter={() => { if (hideTimeout.current) clearTimeout(hideTimeout.current); }}
                    onMouseLeave={handleMouseLeave}
                    style={{
                        position: 'fixed',
                        top: popoverPos?.top ?? 0,
                        left: popoverPos?.left ?? 0,
                        zIndex: 9999,
                        background: 'var(--popover-bg, #fff)',
                        border: '1px solid rgba(99,102,241,0.2)',
                        borderRadius: '12px',
                        boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                        minWidth: '230px',
                        maxWidth: '280px',
                        padding: '12px',
                        fontFamily: 'inherit',
                        pointerEvents: 'auto',
                    }}
                >
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.85em', color: '#6366f1' }}>
                            {format(parsedDate, 'EEEE, dd. MMMM yyyy')}
                        </span>
                        <span style={{
                            fontSize: '0.7em', color: '#6366f1',
                            background: 'rgba(99,102,241,0.1)', borderRadius: '4px',
                            padding: '1px 5px',
                        }}>
                            {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Timeline */}
                    {dayEvents.length === 0 ? (
                        <div style={{ fontSize: '0.78em', color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>
                            No events on this day
                        </div>
                    ) : (
                        <div style={{ position: 'relative', paddingLeft: '20px' }}>
                            {/* Vertical line */}
                            <div style={{
                                position: 'absolute', left: '7px', top: '4px', bottom: '4px',
                                width: '2px', background: 'linear-gradient(to bottom, #6366f1, rgba(99,102,241,0.1))',
                                borderRadius: '1px',
                            }} />

                            {dayEvents.slice(0, 6).map((ev, i) => {
                                const evStart = new Date(ev.start as string);
                                const evEnd = new Date(ev.end as string);
                                const timeStr = format(evStart, 'HH:mm') + ' – ' + format(evEnd, 'HH:mm');
                                const colorMap: Record<string, string> = {
                                    sky: '#0ea5e9', green: '#22c55e', orange: '#f97316',
                                };
                                const dotColor = colorMap[(ev as any).effect || ''] || '#6366f1';

                                return (
                                    <div key={ev.id || i} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '8px', gap: '8px' }}>
                                        {/* Dot */}
                                        <div style={{
                                            position: 'absolute', left: '4px',
                                            marginTop: '4px',
                                            width: '8px', height: '8px',
                                            borderRadius: '50%', background: dotColor,
                                            border: '2px solid white',
                                            boxShadow: `0 0 0 1px ${dotColor}`,
                                            flexShrink: 0,
                                        }} />
                                        <div style={{ paddingLeft: '4px' }}>
                                            <div style={{ fontSize: '0.78em', fontWeight: 600, color: 'var(--text-primary, #111827)', lineHeight: 1.3 }}>
                                                {(ev.title as string) || 'Untitled'}
                                            </div>
                                            <div style={{ fontSize: '0.7em', color: '#9ca3af', marginTop: '1px' }}>
                                                {timeStr}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {dayEvents.length > 6 && (
                                <div style={{ fontSize: '0.72em', color: '#9ca3af', paddingLeft: '4px' }}>
                                    +{dayEvents.length - 6} more…
                                </div>
                            )}
                        </div>
                    )}

                    {/* Open Calendar CTA */}
                    <div
                        onClick={handleClick}
                        style={{
                            marginTop: '10px', padding: '6px', borderRadius: '8px',
                            background: 'rgba(99,102,241,0.08)', textAlign: 'center',
                            fontSize: '0.75em', color: '#6366f1', fontWeight: 600,
                            cursor: 'pointer', transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.16)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.08)')}
                    >
                        Open in Calendar →
                    </div>
                </span>
            )}
        </NodeViewWrapper>
    );
};

// ── Tiptap Extension ──────────────────────────────────────────────────────────

export const DateMentionExtension = Node.create({
    name: 'dateMention',
    group: 'inline',
    inline: true,
    atom: true,

    addAttributes() {
        return {
            isoDate: { default: null },
            label: { default: '' },
        };
    },

    parseHTML() {
        return [{ tag: 'span[data-date-mention]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-date-mention': '' }), 0];
    },

    addNodeView() {
        return ReactNodeViewRenderer(DateMentionNodeView);
    },

    addInputRules() {
        return [
            new InputRule({
                find: DATE_REGEX,
                handler: ({ state, range, match, chain }) => {
                    const rawDate = match[1]?.trim();
                    if (!rawDate) return null;

                    const parsed = parseDate(rawDate);
                    if (!parsed) return null;

                    const isoDate = parsed.toISOString();
                    const label = formatDateLabel(parsed);

                    // Compute the exact text range to replace
                    const matchedText = match[0];
                    const trailingSpace = match[2] || ' ';
                    const leadingSpaceLength = matchedText.length - match[1].length - match[2].length;
                    const fromPos = range.from + leadingSpaceLength;

                    chain()
                        .deleteRange({ from: fromPos, to: range.to })
                        .insertContentAt(fromPos, [
                            {
                                type: 'dateMention',
                                attrs: { isoDate, label },
                            },
                            {
                                type: 'text',
                                text: trailingSpace,
                            }
                        ])
                        .run();
                },
            }),
        ];
    },
});

export default DateMentionExtension;
