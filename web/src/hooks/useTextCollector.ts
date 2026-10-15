"use client";

import { useEffect, useRef, Dispatch, SetStateAction } from 'react';
import { useDataStore } from '@/store/useDataStore';
import { useIslandStore } from '@/store/useIslandStore';

interface UseTextCollectorOptions {
    enabledExtensions: string[];
    setOpenTabs: Dispatch<SetStateAction<any[]>>;
    setActiveTabId: (id: string) => void;
}

export function useTextCollector({
    enabledExtensions,
    setOpenTabs,
    setActiveTabId,
}: UseTextCollectorOptions) {
    const collectorBufferRef = useRef('');
    const collectorActiveRef = useRef(false); // whether the island view is already showing
    const collectorIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { push: islandPush, dismiss: islandDismiss } = useIslandStore();

    useEffect(() => {
        if (!enabledExtensions.includes('smart_island')) return;

        const isInputFocused = () => {
            const el = document.activeElement;
            if (!el) return false;
            const tag = el.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
            if ((el as HTMLElement).isContentEditable) return true;
            if (el.closest('.ProseMirror')) return true;
            return false;
        };

        const clearCollector = () => {
            collectorBufferRef.current = '';
            collectorActiveRef.current = false;
            if (collectorIdleTimerRef.current) clearTimeout(collectorIdleTimerRef.current);
            islandDismiss();
        };

        const createNoteFromText = async (noteText: string) => {
            const id = await useDataStore.getState().createNote(
                "",
                {
                    type: 'doc',
                    content: noteText.split('\n').map(line => ({
                        type: 'paragraph',
                        attrs: { blockId: crypto.randomUUID() },
                        content: line ? [{ type: 'text', text: line }] : undefined
                    }))
                }
            );

            setOpenTabs(prev => {
                if (prev.find(t => t.id === id)) return prev;
                return [...prev, { id, title: "Untitled", type: 'file' }];
            });
            setActiveTabId(id);

            useDataStore.getState().fetchDirectory(null, true);
            clearCollector();
        };

        const handler = (e: KeyboardEvent) => {
            if (isInputFocused()) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key.length !== 1 && e.key !== 'Backspace' && e.key !== ' ') return;

            e.preventDefault();

            if (e.key === 'Backspace') {
                collectorBufferRef.current = collectorBufferRef.current.slice(0, -1);
                if (collectorBufferRef.current.length === 0) {
                    clearCollector();
                    return;
                }
            } else {
                collectorBufferRef.current += e.key;
            }

            const currentText = collectorBufferRef.current;

            // Push island view on first char (if not already active)
            if (!collectorActiveRef.current && currentText.trim().length >= 1) {
                collectorActiveRef.current = true;
                islandPush({
                    type: 'text_collector',
                    priority: 'DEFAULT',
                    payload: {
                        text: currentText,
                        duration: 120_000, // 2 min idle timeout
                        onCreateNote: createNoteFromText,
                        onCreateEvent: (eventData: { title: string; start: Date; end: Date }) => {
                            window.dispatchEvent(new CustomEvent('tide:collector-create-event', { detail: eventData }));
                            clearCollector();
                        },
                        onDismiss: clearCollector,
                    },
                });
            }

            // Fire real-time update event so the view updates instantly
            window.dispatchEvent(new CustomEvent('tide:collector-update', {
                detail: { text: currentText }
            }));

            // Reset idle timer: if no typing for 60s, auto-dismiss
            if (collectorIdleTimerRef.current) clearTimeout(collectorIdleTimerRef.current);
            collectorIdleTimerRef.current = setTimeout(() => {
                if (collectorBufferRef.current.trim().length === 0) {
                    clearCollector();
                }
            }, 60_000);
        };

        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
            if (collectorIdleTimerRef.current) clearTimeout(collectorIdleTimerRef.current);
        };
    }, [enabledExtensions, islandPush, islandDismiss]);
}
