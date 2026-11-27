"use client";

import { useEffect, useRef, type RefObject } from 'react';
import { defaultToastTimerConfig, initialToastTimer, stepToastTimer } from '@/lib/toastTimer';

// Last known mouse position (null until the mouse moved, e.g. touch devices), shared by all popups
let mousePos: { x: number; y: number } | null = null;
let listening = false;
function trackMouse() {
    if (listening || typeof window === 'undefined') return;
    listening = true;
    window.addEventListener('mousemove', (e) => { mousePos = { x: e.clientX, y: e.clientY }; }, { passive: true });
}

function distanceToRect(p: { x: number; y: number }, r: DOMRect): number {
    const dx = Math.max(r.left - p.x, 0, p.x - r.right);
    const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
    return Math.hypot(dx, dy);
}

export interface PopupAutoCloseOptions {
    enabled?: boolean;
    /** ms without the mouse near the popup until it closes (default 5000) */
    duration?: number;
}

/**
 * Position-based auto-close for popups (same timer as toasts, lib/toastTimer.ts): the mouse approaching extends the
 * time, near or on the popup it stands still, moving away makes it run faster. Stops for good once the user typed or
 * changed something inside, and never runs without a mouse (touch, keyboard).
 */
export function usePopupAutoClose(
    ref: RefObject<HTMLElement | null>,
    onClose: () => void,
    { enabled = true, duration = 5000 }: PopupAutoCloseOptions = {},
): void {
    // onClose is usually an inline arrow: keep it out of the effect deps so a re-render does not reset the timer
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; });

    useEffect(() => {
        if (!enabled) return;
        trackMouse();
        const root = ref.current;
        let touched = false;
        const markTouched = () => { touched = true; };
        root?.addEventListener('input', markTouched, true);
        root?.addEventListener('change', markTouched, true);

        const cfg = { ...defaultToastTimerConfig(duration), maxLifeFactor: Infinity, awayFactor: 3 };
        let state = initialToastTimer(duration);
        let last = performance.now();
        let raf = 0;
        const tick = (now: number) => {
            const dt = Math.min(now - last, 100);
            last = now;
            const rect = ref.current?.getBoundingClientRect();
            const focusInside = !!ref.current && ref.current.contains(document.activeElement)
                && document.activeElement instanceof HTMLElement
                && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
            if (touched) return;
            if (!rect || !mousePos || focusInside) {
                state = { ...state, lastDistance: null };
            } else {
                const r = stepToastTimer(state, dt, distanceToRect(mousePos, rect), cfg);
                state = r.state;
                if (r.expired) { onCloseRef.current(); return; }
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(raf);
            root?.removeEventListener('input', markTouched, true);
            root?.removeEventListener('change', markTouched, true);
        };
    }, [ref, enabled, duration]);
}
