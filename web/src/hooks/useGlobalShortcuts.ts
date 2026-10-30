'use client';

import { useEffect, useRef } from 'react';

export interface GlobalShortcutsHandlers {
    onNewNote?: () => void;
    onSave?: () => void;
    onToggleSidebar?: () => void;
    onOpenSearch?: () => void;
    onToggleTodos?: () => void;
    onOpenCalendar?: () => void;
    onCloseModals?: () => void;
}

export interface UseGlobalShortcutsOptions {
    enabled?: boolean;
}

/**
 * Registers global keyboard shortcuts for core application navigation and actions.
 */
export function useGlobalShortcuts(
    handlers: GlobalShortcutsHandlers,
    options: UseGlobalShortcutsOptions = {}
): void {
    const { enabled = true } = options;
    const handlersRef = useRef<GlobalShortcutsHandlers>(handlers);

    useEffect(() => {
        handlersRef.current = handlers;
    });

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const isMod = e.metaKey || e.ctrlKey;
            const key = e.key?.toLowerCase();
            if (!key) return;

            // Escape: Close modals
            if (e.key === 'Escape') {
                handlersRef.current.onCloseModals?.();
                return;
            }

            // Ctrl/Cmd + Shift shortcuts
            if (isMod && e.shiftKey && !e.altKey) {
                if (key === 't') {
                    e.preventDefault();
                    handlersRef.current.onToggleTodos?.();
                    return;
                }
                if (key === 'c') {
                    e.preventDefault();
                    handlersRef.current.onOpenCalendar?.();
                    return;
                }
            }

            // Ctrl/Cmd shortcuts
            if (isMod && !e.shiftKey && !e.altKey) {
                if (key === 'n') {
                    e.preventDefault();
                    handlersRef.current.onNewNote?.();
                    return;
                }
                if (key === 's') {
                    e.preventDefault();
                    handlersRef.current.onSave?.();
                    return;
                }
                if (key === 'b' || e.key === '\\') {
                    e.preventDefault();
                    handlersRef.current.onToggleSidebar?.();
                    return;
                }
                if (key === 'k') {
                    e.preventDefault();
                    handlersRef.current.onOpenSearch?.();
                    return;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [enabled]);
}

export default useGlobalShortcuts;
