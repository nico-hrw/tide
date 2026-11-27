'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { distanceToRect, getMousePos, trackMouse } from '@/lib/mousePosition';
import { defaultToastTimerConfig, initialToastTimer, stepToastTimer, toastTimerProgress, type ToastTimerState } from '@/lib/toastTimer';

/** Same time as the undo toasts (lib/todoUndo.ts TODO_UNDO_MS). */
export const POPUP_TIMER_MS = 3000;

interface UsePopupTimerOptions {
    /** The popup element(s). Flyouts inside them mark themselves with `data-popup-part` and count as part of the popup. */
    refs: RefObject<HTMLElement | null>[];
    /** Called once when the time has run out. */
    onExpire: () => void;
    enabled?: boolean;
    /** ms until the popup closes while the mouse is away */
    duration?: number;
}

function isTextField(el: Element | null): boolean {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

/** Flyouts and open lists inside a popup belong to it, even where they reach beyond its box. */
const PART_SELECTOR = '[data-popup-part],[role="listbox"],[role="menu"]';

function rectsOf(el: HTMLElement): DOMRect[] {
    const parts = Array.from(el.querySelectorAll<HTMLElement>(PART_SELECTOR));
    return [el.getBoundingClientRect(), ...parts.map((p) => p.getBoundingClientRect())];
}

/**
 * Position based close timer for a popup, the same timer as the undo toasts (lib/toastTimer.ts): it runs down while
 * the mouse is away from the popup, refills while it is near and wins time back while the mouse heads towards it.
 * Put `fillRef` / `restRef` on the two segments of <PopupTimerBar>; they are updated every frame without
 * re-rendering. Holds while a text field inside the popup has focus, and never expires without a mouse (touch).
 */
export function usePopupTimer({ refs, onExpire, enabled = true, duration = POPUP_TIMER_MS }: UsePopupTimerOptions) {
    const fillRef = useRef<HTMLDivElement>(null);
    const restRef = useRef<HTMLDivElement>(null);
    const latest = useRef({ refs, onExpire });
    useEffect(() => {
        latest.current = { refs, onExpire };
    });

    useEffect(() => {
        if (!enabled) return;
        trackMouse();
        const cfg = defaultToastTimerConfig(duration);
        let state: ToastTimerState = initialToastTimer(duration);
        let shown = 1; // eased bar value, so it glides instead of jumping
        let last = performance.now();
        let raf = 0;
        const tick = (now: number) => {
            const dt = Math.min(now - last, 100); // a background tab must not burn the timer in one step
            last = now;
            const els = latest.current.refs.map((r) => r.current).filter((el): el is HTMLElement => el !== null);
            const mouse = getMousePos();
            let distance: number | null = null;
            if (mouse && els.length > 0) {
                distance = Math.min(...els.flatMap(rectsOf).map((r) => distanceToRect(mouse, r)));
            }
            const active = document.activeElement;
            const hold = els.some((el) => active !== null && el.contains(active) && isTextField(active));
            if (hold || distance === null) {
                // Held open (text field focused) or no mouse: full timer, never expires
                state = { ...initialToastTimer(duration), lastDistance: distance };
            } else {
                const r = stepToastTimer(state, dt, distance, cfg);
                state = r.state;
                if (r.expired) {
                    // Closing may be refused (e.g. a question is pending); then the timer starts over instead of freezing.
                    latest.current.onExpire();
                    state = initialToastTimer(duration);
                    shown = 1;
                }
            }
            const target = toastTimerProgress(state, cfg);
            shown += (target - shown) * (1 - Math.exp(-dt / 120));
            if (fillRef.current) fillRef.current.style.flexGrow = String(shown);
            if (restRef.current) restRef.current.style.flexGrow = String(1 - shown);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [enabled, duration]);

    return { fillRef, restRef };
}
