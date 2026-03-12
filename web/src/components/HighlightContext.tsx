"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type HighlightType = 'all' | 'file' | 'event' | 'tab' | null;

export interface LinkTarget {
    id: string;
    title: string;
    type: 'file' | 'event' | 'chat' | 'tab' | 'calendar' | 'messages';
    rect?: DOMRect;
}

interface HighlightState {
    type: HighlightType;
    excludeIds: string[];
    isSelectingLink: boolean;
    onLinkSelect?: (target: LinkTarget) => void;
}

interface HighlightContextType {
    highlight: HighlightState;
    setHighlight: (type: HighlightType, excludeIds?: string[]) => void;
    clearHighlight: () => void;
    isHighlighted: (id: string, itemType: 'file' | 'event' | 'tab') => boolean;
    startLinkSelection: (callback: (target: LinkTarget) => void, startCoords?: { x: number, y: number }) => void;
    cancelLinkSelection: () => void;
}

const HighlightContext = createContext<HighlightContextType | undefined>(undefined);

export function HighlightProvider({ children }: { children: ReactNode }) {
    const [highlight, setHighlightState] = useState<HighlightState>({ type: null, excludeIds: [], isSelectingLink: false });
    const [connectionLine, setConnectionLine] = useState<{ start: { x: number, y: number }, end: { x: number, y: number } } | null>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setHighlightState(prev => ({
                    ...prev,
                    type: null,
                    isSelectingLink: false,
                    onLinkSelect: undefined
                }));
            }
        };
        if (highlight.isSelectingLink) {
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [highlight.isSelectingLink]);

    const setHighlight = (type: HighlightType, excludeIds: string[] = []) => {
        setHighlightState(prev => ({ ...prev, type, excludeIds }));
    };

    const clearHighlight = useCallback(() => {
        setHighlightState(prev => ({ ...prev, type: null, excludeIds: [] }));
    }, []);

    const startLinkSelection = useCallback((callback: (target: LinkTarget) => void, startCoords?: { x: number, y: number }) => {
        setHighlightState({
            type: 'all',
            excludeIds: [],
            isSelectingLink: true,
            onLinkSelect: (target) => {
                if (startCoords && target.rect) {
                    setConnectionLine({
                        start: { x: startCoords.x, y: startCoords.y - 10 },
                        end: { x: target.rect.left + target.rect.width / 2, y: target.rect.top + target.rect.height / 2 }
                    });
                    setTimeout(() => setConnectionLine(null), 1200);
                }
                callback(target);
                cancelLinkSelection();
            }
        });
    }, []);

    const cancelLinkSelection = useCallback(() => {
        setHighlightState(prev => ({
            ...prev,
            type: null,
            isSelectingLink: false,
            onLinkSelect: undefined
        }));
    }, []);

    const isHighlighted = useCallback((id: string, itemType: 'file' | 'event' | 'tab') => {
        if (!highlight.type) return false;
        if (highlight.excludeIds.includes(id)) return false;
        if (highlight.type === 'all' || highlight.type === itemType) return true;
        return false;
    }, [highlight.type, highlight.excludeIds]);

    return (
        <HighlightContext.Provider value={{
            highlight, setHighlight, clearHighlight, isHighlighted,
            startLinkSelection, cancelLinkSelection
        }}>
            {children}
            <AnimatePresence>
                {connectionLine && (
                    <motion.svg
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5, delay: 0.6 }}
                        className="fixed inset-0 pointer-events-none z-[9999] w-full h-full"
                    >
                        <motion.path
                            d={`M ${connectionLine.start.x} ${connectionLine.start.y} C ${connectionLine.start.x + 100} ${connectionLine.start.y - 150}, ${connectionLine.start.x - 100} ${connectionLine.start.y - 150}, ${connectionLine.end.x} ${connectionLine.end.y}`}
                            fill="none"
                            stroke="url(#purpleGlow)"
                            strokeWidth="3"
                            strokeLinecap="round"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 1 }}
                            transition={{
                                pathLength: { duration: 0.8, ease: "easeOut" },
                                opacity: { duration: 0.2 }
                            }}
                        />
                        <defs>
                            <linearGradient id="purpleGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#d8b4fe" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="#a855f7" stopOpacity="1" />
                            </linearGradient>
                        </defs>
                    </motion.svg>
                )}
            </AnimatePresence>
        </HighlightContext.Provider>
    );
}

export function useHighlight() {
    const context = useContext(HighlightContext);
    if (context === undefined) {
        throw new Error('useHighlight must be used within a HighlightProvider');
    }
    return context;
}
