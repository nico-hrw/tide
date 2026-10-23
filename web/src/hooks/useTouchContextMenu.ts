import { useEffect, useRef } from 'react';

export interface TouchContextMenuOptions {
    /**
     * Delay in milliseconds before firing contextmenu. Defaults to 450ms.
     */
    delay?: number;
    /**
     * Movement threshold in pixels. Movement beyond this cancels the timer. Defaults to 10px.
     */
    threshold?: number;
    /**
     * Whether the touch context menu detection is currently active. Defaults to true.
     */
    enabled?: boolean;
}

/**
 * Checks if the event target is inside an input, textarea, contenteditable container, or rich-text editor.
 */
function isEditableElement(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Element)) {
        return false;
    }
    return Boolean(
        target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .ProseMirror')
    );
}

/**
 * A hook that enables long-press context menus across touch devices
 * (especially iPadOS/iOS Safari where holding does not reliably fire `contextmenu`).
 *
 * - On `touchstart` (single touch):
 *   - Checks if target is inside an input, textarea, or contenteditable editor. If so, ignores.
 *   - Records touch coordinates and target element.
 *   - Starts a timer (default 450ms).
 * - On `touchmove`:
 *   - If the touch moves more than threshold (default 10px), cancels the timer.
 * - On `touchend` or `touchcancel`:
 *   - Cancels the timer.
 * - When the timer fires:
 *   - Intercepts and cancels any pending trailing click event.
 *   - Triggers subtle haptic vibration (navigator.vibrate(35)).
 *   - Dispatches a synthetic `contextmenu` MouseEvent on the target element.
 */
export function useTouchContextMenu(options: TouchContextMenuOptions = {}): void {
    const { delay = 450, threshold = 10, enabled = true } = options;

    const timerRef = useRef<number | null>(null);
    const startXRef = useRef<number>(0);
    const startYRef = useRef<number>(0);
    const targetRef = useRef<Element | null>(null);

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') {
            return;
        }

        const clearTimer = () => {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length !== 1) {
                clearTimer();
                return;
            }

            const target = e.target;
            if (isEditableElement(target)) {
                return;
            }

            const touch = e.touches[0];
            clearTimer();
            startXRef.current = touch.clientX;
            startYRef.current = touch.clientY;
            targetRef.current = target instanceof Element ? target : null;

            timerRef.current = window.setTimeout(() => {
                timerRef.current = null;
                const currentTarget = targetRef.current;
                if (!currentTarget) return;

                // Intercept and prevent the subsequent click event triggered when releasing the touch
                const preventClick = (clickEvent: MouseEvent) => {
                    clickEvent.preventDefault();
                    clickEvent.stopPropagation();
                    window.removeEventListener('click', preventClick, true);
                };
                window.addEventListener('click', preventClick, true);
                window.setTimeout(() => {
                    window.removeEventListener('click', preventClick, true);
                }, 500);

                // Subtle haptic vibration where supported
                if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
                    try {
                        navigator.vibrate(35);
                    } catch {
                        // Ignore potential permission/device errors
                    }
                }

                // Dispatch synthetic contextmenu MouseEvent on target element
                const evt = new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: startXRef.current,
                    clientY: startYRef.current,
                    button: 2
                });
                currentTarget.dispatchEvent(evt);
            }, delay);
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (timerRef.current === null) return;

            if (e.touches.length !== 1) {
                clearTimer();
                return;
            }

            const touch = e.touches[0];
            const dx = touch.clientX - startXRef.current;
            const dy = touch.clientY - startYRef.current;

            if (Math.hypot(dx, dy) > threshold) {
                clearTimer();
            }
        };

        const handleTouchEnd = () => {
            clearTimer();
        };

        const handleTouchCancel = () => {
            clearTimer();
        };

        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
        window.addEventListener('touchend', handleTouchEnd, { passive: true });
        window.addEventListener('touchcancel', handleTouchCancel, { passive: true });

        return () => {
            clearTimer();
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
            window.removeEventListener('touchcancel', handleTouchCancel);
        };
    }, [delay, threshold, enabled]);
}
