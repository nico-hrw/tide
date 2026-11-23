"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type HighlightType = 'all' | 'file' | 'event' | 'tab' | null;

export interface LinkTarget {
    id: string;
    title: string;
    type: 'file' | 'event' | 'chat' | 'tab' | 'calendar' | 'messages';
    rect?: DOMRect;
    start?: string;
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
                    setTimeout(() => setConnectionLine(null), 1100);
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
                {connectionLine && (() => {
                    const { start, end } = connectionLine;
                    // One smooth S-curve: leaves the start horizontally and arrives horizontally (no stray control points)
                    const dx = end.x - start.x;
                    const bend = Math.max(60, Math.abs(dx) * 0.5);
                    const dir = dx >= 0 ? 1 : -1;
                    const d = `M ${start.x} ${start.y} C ${start.x + bend * dir} ${start.y}, ${end.x - bend * dir} ${end.y}, ${end.x} ${end.y}`;
                    return (
                        <motion.svg
                            key="link-line"
                            initial={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.35 }}
                            className="fixed inset-0 pointer-events-none z-[9999] w-full h-full"
                        >
                            <defs>
                                {/* userSpaceOnUse: an objectBoundingBox gradient collapses on (almost) straight lines */}
                                <linearGradient id="linkLineGradient" gradientUnits="userSpaceOnUse" x1={start.x} y1={start.y} x2={end.x} y2={end.y}>
                                    <stop offset="0%" stopColor="var(--t2-ink-3)" stopOpacity="0.35" />
                                    <stop offset="100%" stopColor="var(--t2-ink)" stopOpacity="0.95" />
                                </linearGradient>
                            </defs>
                            <motion.path
                                d={d}
                                fill="none"
                                stroke="url(#linkLineGradient)"
                                strokeWidth={2.5}
                                strokeLinecap="round"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                            />
                            <motion.circle
                                cx={end.x}
                                cy={end.y}
                                r={4.5}
                                fill="var(--t2-ink)"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.4, duration: 0.2 }}
                                style={{ transformOrigin: `${end.x}px ${end.y}px` }}
                            />
                        </motion.svg>
                    );
                })()}
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
