'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

export interface SplitViewDragOptions {
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    collapseThreshold?: number;
    breakpoint?: number;
    storageKey?: string;
    onResize?: (width: number) => void;
    onCollapseChange?: (isCollapsed: boolean) => void;
}

export interface SplitViewDragReturn {
    width: number;
    isDragging: boolean;
    isCollapsed: boolean;
    startDragging: (e: React.MouseEvent | React.PointerEvent) => void;
    toggleCollapse: () => void;
    setIsCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
    setWidth: (width: number) => void;
    resetWidth: () => void;
}

/**
 * Handles sidebar drag-to-resize, toggle collapse, and responsive breakpoint behavior.
 */
export function useSplitViewDrag(options: SplitViewDragOptions = {}): SplitViewDragReturn {
    const {
        defaultWidth = 256,
        minWidth = 180,
        maxWidth = 480,
        collapseThreshold = 140,
        breakpoint = 768,
        storageKey,
        onResize,
        onCollapseChange,
    } = options;

    const [width, setWidthState] = useState<number>(() => {
        if (typeof window !== 'undefined' && storageKey) {
            const saved = Number(localStorage.getItem(storageKey));
            if (!Number.isNaN(saved) && saved >= minWidth && saved <= maxWidth) return saved;
        }
        return defaultWidth;
    });

    const [isDragging, setIsDragging] = useState(false);
    const [isCollapsed, setIsCollapsedState] = useState<boolean>(() => {
        return typeof window !== 'undefined' ? window.innerWidth < breakpoint : false;
    });

    const onResizeRef = useRef(onResize);
    const onCollapseRef = useRef(onCollapseChange);

    useEffect(() => {
        onResizeRef.current = onResize;
        onCollapseRef.current = onCollapseChange;
    });

    const setIsCollapsed = useCallback((action: boolean | ((prev: boolean) => boolean)) => {
        setIsCollapsedState(prev => {
            const next = typeof action === 'function' ? action(prev) : action;
            onCollapseRef.current?.(next);
            return next;
        });
    }, []);

    const setWidth = useCallback((newWidth: number) => {
        const clamped = Math.min(Math.max(newWidth, minWidth), maxWidth);
        setWidthState(clamped);
        onResizeRef.current?.(clamped);
        if (storageKey && typeof window !== 'undefined') {
            try { localStorage.setItem(storageKey, String(clamped)); } catch { /* ignore */ }
        }
    }, [minWidth, maxWidth, storageKey]);

    const resetWidth = useCallback(() => setWidth(defaultWidth), [defaultWidth, setWidth]);
    const toggleCollapse = useCallback(() => setIsCollapsed(prev => !prev), [setIsCollapsed]);

    const startDragging = useCallback((e: React.MouseEvent | React.PointerEvent) => {
        if ('button' in e && e.button !== 0) return;
        e.preventDefault();
        setIsDragging(true);
    }, []);

    // Responsive breakpoint listener
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleResize = () => {
            if (window.innerWidth < breakpoint) setIsCollapsed(true);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [breakpoint, setIsCollapsed]);

    // Pointer move & release during drag
    useEffect(() => {
        if (!isDragging || typeof window === 'undefined') return;
        const [origCursor, origSelect] = [document.body.style.cursor, document.body.style.userSelect];
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const handlePointerMove = (e: PointerEvent) => {
            if (e.clientX < collapseThreshold) {
                setIsCollapsed(true);
            } else {
                setIsCollapsed(false);
                setWidth(e.clientX);
            }
        };
        const handlePointerUp = () => setIsDragging(false);

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);

        return () => {
            document.body.style.cursor = origCursor;
            document.body.style.userSelect = origSelect;
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
        };
    }, [isDragging, collapseThreshold, setIsCollapsed, setWidth]);

    return { width, isDragging, isCollapsed, startDragging, toggleCollapse, setIsCollapsed, setWidth, resetWidth };
}

export default useSplitViewDrag;
