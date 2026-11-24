"use client";

import { useEffect, useRef } from 'react';
import { useDataStore } from '@/store/useDataStore';

interface UseTextCollectorOptions {
    enabledExtensions: string[];
    /** Unused since the unified island creates notes itself; kept so existing callers stay valid. */
    setOpenTabs?: unknown;
    setActiveTabId?: unknown;
}

/** True while the user is typing into something (input, editor, dialog...): then nothing is collected. */
function isTypingElsewhere(): boolean {
    const el = document.activeElement as HTMLElement | null;
    if (el) {
        const tag = el.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
        if (el.isContentEditable || el.closest('.ProseMirror')) return true;
    }
    return !!document.querySelector('[role="dialog"], #active-event-popover');
}

/**
 * Start typing anywhere and the Smart Island catches it: the first printable key opens the island's quick capture
 * with the text so far. The capture field takes the focus right away and handles everything after that.
 * Does nothing when no island is on screen (the key is then not swallowed).
 */
export function useTextCollector({ enabledExtensions }: UseTextCollectorOptions) {
    const bufferRef = useRef('');
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!enabledExtensions.includes('smart_island')) return;

        const reset = () => {
            bufferRef.current = '';
            if (idleTimer.current) clearTimeout(idleTimer.current);
            idleTimer.current = null;
        };

        const handler = (e: KeyboardEvent) => {
            if (e.defaultPrevented || e.isComposing) return;
            if (isTypingElsewhere()) { reset(); return; }
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const printable = e.key.length === 1;
            if (!printable && !(e.key === 'Backspace' && bufferRef.current)) return;
            // Only when an island is actually visible; otherwise leave the key alone
            if (!document.querySelector('[data-island-state]')) return;

            e.preventDefault();
            bufferRef.current = e.key === 'Backspace' ? bufferRef.current.slice(0, -1) : bufferRef.current + e.key;
            // Keys that arrive before the capture field has the focus end up in the buffer and are handed over together.
            if (bufferRef.current) useDataStore.getState().setSmartIsland({ show: true, text: bufferRef.current, searchFirst: true });
            if (idleTimer.current) clearTimeout(idleTimer.current);
            idleTimer.current = setTimeout(reset, 1500);
        };

        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
            reset();
        };
    }, [enabledExtensions]);
}
