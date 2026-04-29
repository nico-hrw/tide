"use client";

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { useDragGhost } from '@/store/useDragGhost';

/**
 * Phase-2 ghost. Rendered via Portal to document.body so it always sits above
 * the sidebar, the calendar, and the editor regardless of the underlying
 * z-index stack. Position is updated via direct DOM mutation in a mousemove
 * listener — no React state per move, no re-renders, smooth at 60fps.
 *
 * The ghost stays visible until either:
 *   - The user clicks inside the editor (consumed in page.tsx click handler)
 *   - The user presses Escape (handled here)
 *   - The user clicks outside the editor (handled here)
 */
export function EventDragGhost() {
    const { active, snapshot, cancel } = useDragGhost();
    const ghostRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!active) return;

        const handleMove = (e: MouseEvent) => {
            const el = ghostRef.current;
            if (!el) return;
            // Offset slightly down-right of the cursor so the ghost doesn't intercept clicks visually.
            el.style.left = `${e.clientX + 14}px`;
            el.style.top = `${e.clientY + 14}px`;
        };

        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') cancel();
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('keydown', handleKey);

        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('keydown', handleKey);
        };
    }, [active, cancel]);

    if (!active || !snapshot || typeof document === 'undefined') return null;

    let timeLabel = '';
    try {
        const d = new Date(snapshot.start);
        if (!isNaN(d.getTime())) {
            timeLabel = `${format(d, 'dd.MM')} ${format(d, 'HH:mm')}`;
        }
    } catch { /* ignore */ }

    const accent = snapshot.color || '#6366f1';

    return createPortal(
        <div
            ref={ghostRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                zIndex: 9999,
                pointerEvents: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px 6px 8px',
                borderRadius: 8,
                background: `${accent}28`,
                border: `1.5px solid ${accent}90`,
                boxShadow: '0 8px 24px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.06) inset',
                backdropFilter: 'blur(8px)',
                fontSize: '0.85em',
                fontWeight: 600,
                color: accent,
                transition: 'opacity 0.15s ease',
                userSelect: 'none',
                whiteSpace: 'nowrap',
                maxWidth: 320,
            }}
        >
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    background: accent,
                    flexShrink: 0,
                }}
            >
                <svg width="10" height="10" viewBox="0 0 9 9" fill="none">
                    <rect x="0.5" y="1.5" width="8" height="7" rx="1.5" stroke="white" strokeWidth="1" />
                    <line x1="2.5" y1="0.5" x2="2.5" y2="2.5" stroke="white" strokeWidth="1" strokeLinecap="round" />
                    <line x1="6.5" y1="0.5" x2="6.5" y2="2.5" stroke="white" strokeWidth="1" strokeLinecap="round" />
                    <line x1="1.5" y1="4" x2="7.5" y2="4" stroke="white" strokeWidth="0.8" />
                </svg>
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                {snapshot.title || 'Untitled'}
            </span>
            {timeLabel && (
                <span style={{ fontSize: '0.78em', opacity: 0.75, fontWeight: 400 }}>
                    {timeLabel}
                </span>
            )}
            <span
                style={{
                    fontSize: '0.7em',
                    opacity: 0.55,
                    marginLeft: 4,
                    fontStyle: 'italic',
                }}
            >
                Klick zum Platzieren · Esc abbrechen
            </span>
        </div>,
        document.body,
    );
}

export default EventDragGhost;
