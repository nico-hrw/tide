"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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

    const clearHighlight = () => {
        setHighlightState(prev => ({ ...prev, type: null, excludeIds: [] }));
    };

    const startLinkSelection = (callback: (target: LinkTarget) => void, startCoords?: { x: number, y: number }) => {
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
                    setTimeout(() => setConnectionLine(null), 800);
                }
                callback(target);
                cancelLinkSelection();
            }
        });
    };

    const cancelLinkSelection = () => {
        setHighlightState(prev => ({
            ...prev,
            type: null,
            isSelectingLink: false,
            onLinkSelect: undefined
        }));
    };

    const isHighlighted = (id: string, itemType: 'file' | 'event' | 'tab') => {
        if (!highlight.type) return false;
        if (highlight.excludeIds.includes(id)) return false;
        if (highlight.type === 'all' || highlight.type === itemType) return true;
        return false;
    };

    return (
        <HighlightContext.Provider value={{
            highlight, setHighlight, clearHighlight, isHighlighted,
            startLinkSelection, cancelLinkSelection
        }}>
            {children}
            {connectionLine && (
                <svg className="fixed inset-0 pointer-events-none z-[9999] w-full h-full" style={{ animation: 'fadeOut 1s ease-in 2.5s forwards' }}>
                    <path
                        d={`M ${connectionLine.start.x} ${connectionLine.start.y} C ${connectionLine.start.x + 100} ${connectionLine.start.y - 150}, ${connectionLine.start.x - 100} ${connectionLine.start.y - 150}, ${connectionLine.end.x} ${connectionLine.end.y}`}
                        fill="none"
                        stroke="url(#purpleGlow)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        style={{ strokeDasharray: 3000, strokeDashoffset: 3000, animation: 'dash 2.5s cubic-bezier(0.2, 0, 0, 1) forwards' }}
                    />
                    <defs>
                        <linearGradient id="purpleGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#d8b4fe" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#a855f7" stopOpacity="1" />
                        </linearGradient>
                        <style>
                            {`
                            @keyframes dash {
                                to { stroke-dashoffset: 0; }
                            }
                            @keyframes fadeOut {
                                to { opacity: 0; }
                            }
                            `}
                        </style>
                    </defs>
                </svg>
            )}
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
