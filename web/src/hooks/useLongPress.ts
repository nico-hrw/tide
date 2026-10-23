import React, { useCallback, useEffect, useRef } from 'react';

export type LongPressEvent<T = Element> = React.TouchEvent<T> | React.MouseEvent<T>;

export interface UseLongPressOptions<T = Element> {
    /**
     * Delay in milliseconds before firing the long press action. Defaults to 450ms.
     */
    delay?: number;
    /**
     * Distance in pixels that the pointer can move before cancelling the long press. Defaults to 10px.
     */
    threshold?: number;
    /**
     * Optional callback fired when the press starts.
     */
    onStart?: (event: LongPressEvent<T>) => void;
    /**
     * Optional callback fired when the long press completes successfully.
     */
    onFinish?: (event: LongPressEvent<T>) => void;
    /**
     * Optional callback fired when the press is cancelled before completing.
     */
    onCancel?: (event: LongPressEvent<T>) => void;
}

export interface UseLongPressResult<T = Element> {
    onTouchStart: (e: React.TouchEvent<T>) => void;
    onTouchMove: (e: React.TouchEvent<T>) => void;
    onTouchEnd: (e: React.TouchEvent<T>) => void;
    onTouchCancel: (e: React.TouchEvent<T>) => void;
    onMouseDown: (e: React.MouseEvent<T>) => void;
    onMouseMove: (e: React.MouseEvent<T>) => void;
    onMouseUp: (e: React.MouseEvent<T>) => void;
    onMouseLeave: (e: React.MouseEvent<T>) => void;
    onClick: (e: React.MouseEvent<T>) => void;
}

/**
 * A reusable component-level hook that provides touch and mouse event handlers
 * for elements that require custom long-press actions.
 *
 * @param callback The function to execute when a long-press is recognized.
 * @param options Configuration options for delay, threshold, and lifecycle callbacks.
 */
export function useLongPress<T extends Element = HTMLElement>(
    callback: (event: LongPressEvent<T>) => void,
    options: UseLongPressOptions<T> = {}
): UseLongPressResult<T> {
    const { delay = 450, threshold = 10, onStart, onFinish, onCancel } = options;

    const timerRef = useRef<number | null>(null);
    const startXRef = useRef<number>(0);
    const startYRef = useRef<number>(0);
    const isLongPressTriggeredRef = useRef<boolean>(false);
    const savedEventRef = useRef<LongPressEvent<T> | null>(null);

    const callbackRef = useRef(callback);
    const onStartRef = useRef(onStart);
    const onFinishRef = useRef(onFinish);
    const onCancelRef = useRef(onCancel);

    useEffect(() => {
        callbackRef.current = callback;
        onStartRef.current = onStart;
        onFinishRef.current = onFinish;
        onCancelRef.current = onCancel;
    });

    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const cancelPress = useCallback((e: LongPressEvent<T>) => {
        if (timerRef.current !== null) {
            clearTimer();
            onCancelRef.current?.(e);
        }
    }, [clearTimer]);

    const startPress = useCallback((e: LongPressEvent<T>, clientX: number, clientY: number) => {
        clearTimer();
        isLongPressTriggeredRef.current = false;
        startXRef.current = clientX;
        startYRef.current = clientY;
        savedEventRef.current = e;

        onStartRef.current?.(e);

        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            isLongPressTriggeredRef.current = true;

            // Optional subtle haptic feedback
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
                try {
                    navigator.vibrate(35);
                } catch {
                    // Ignore device vibration errors
                }
            }

            if (savedEventRef.current) {
                callbackRef.current(savedEventRef.current);
                onFinishRef.current?.(savedEventRef.current);
            }
        }, delay);
    }, [clearTimer, delay]);

    // Touch events
    const onTouchStart = useCallback((e: React.TouchEvent<T>) => {
        if (e.touches.length !== 1) {
            cancelPress(e);
            return;
        }
        const touch = e.touches[0];
        startPress(e, touch.clientX, touch.clientY);
    }, [cancelPress, startPress]);

    const onTouchMove = useCallback((e: React.TouchEvent<T>) => {
        if (timerRef.current === null) return;
        if (e.touches.length !== 1) {
            cancelPress(e);
            return;
        }
        const touch = e.touches[0];
        const dx = touch.clientX - startXRef.current;
        const dy = touch.clientY - startYRef.current;
        if (Math.hypot(dx, dy) > threshold) {
            cancelPress(e);
        }
    }, [cancelPress, threshold]);

    const onTouchEnd = useCallback((e: React.TouchEvent<T>) => {
        if (timerRef.current !== null) {
            cancelPress(e);
        } else if (isLongPressTriggeredRef.current) {
            // Keep flag active temporarily to suppress trailing click event
            window.setTimeout(() => {
                isLongPressTriggeredRef.current = false;
            }, 300);
        }
    }, [cancelPress]);

    const onTouchCancel = useCallback((e: React.TouchEvent<T>) => {
        cancelPress(e);
    }, [cancelPress]);

    // Mouse events
    const onMouseDown = useCallback((e: React.MouseEvent<T>) => {
        if (e.button !== 0) return; // Only trigger for primary left click
        startPress(e, e.clientX, e.clientY);
    }, [startPress]);

    const onMouseMove = useCallback((e: React.MouseEvent<T>) => {
        if (timerRef.current === null) return;
        const dx = e.clientX - startXRef.current;
        const dy = e.clientY - startYRef.current;
        if (Math.hypot(dx, dy) > threshold) {
            cancelPress(e);
        }
    }, [cancelPress, threshold]);

    const onMouseUp = useCallback((e: React.MouseEvent<T>) => {
        if (timerRef.current !== null) {
            cancelPress(e);
        } else if (isLongPressTriggeredRef.current) {
            window.setTimeout(() => {
                isLongPressTriggeredRef.current = false;
            }, 300);
        }
    }, [cancelPress]);

    const onMouseLeave = useCallback((e: React.MouseEvent<T>) => {
        cancelPress(e);
    }, [cancelPress]);

    // Trailing click suppression
    const onClick = useCallback((e: React.MouseEvent<T>) => {
        if (isLongPressTriggeredRef.current) {
            e.preventDefault();
            e.stopPropagation();
            isLongPressTriggeredRef.current = false;
        }
    }, []);

    // Clean up timer on unmount
    useEffect(() => {
        return () => {
            clearTimer();
        };
    }, [clearTimer]);

    return {
        onTouchStart,
        onTouchMove,
        onTouchEnd,
        onTouchCancel,
        onMouseDown,
        onMouseMove,
        onMouseUp,
        onMouseLeave,
        onClick
    };
}
