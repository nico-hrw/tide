"use client";

import React, { useRef, useState, useCallback, useMemo } from "react";
import { History, Loader2 } from "lucide-react";
import { NoteBackupPoint } from "@/hooks/useNoteBackups";

export interface NoteVersionTimelineProps {
    points: NoteBackupPoint[];
    activeIndex: number;
    onSelectIndex: (index: number) => void;
    isLoading?: boolean;
}

function formatPointTimestamp(ts?: string | number | Date): string {
    if (!ts) return "";
    try {
        const d = typeof ts === "string" || typeof ts === "number" ? new Date(ts) : ts;
        if (isNaN(d.getTime())) return "";
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        if (isToday) return timeStr;
        return `${d.toLocaleDateString([], { day: "2-digit", month: "2-digit" })} ${timeStr}`;
    } catch {
        return "";
    }
}

export default function NoteVersionTimeline({
    points,
    activeIndex,
    onSelectIndex,
    isLoading = false,
}: NoteVersionTimelineProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    // Keep activeIndex within bounds
    const safeActiveIndex = useMemo(() => {
        if (points.length === 0) return 0;
        return Math.max(0, Math.min(activeIndex, points.length - 1));
    }, [activeIndex, points.length]);

    const calculateNearestIndex = useCallback(
        (clientY: number): number => {
            if (points.length <= 1) return 0;

            let closestIndex = 0;
            let minDistance = Infinity;

            for (let i = 0; i < points.length; i++) {
                const el = itemRefs.current[i];
                if (!el) continue;
                const rect = el.getBoundingClientRect();
                const center = rect.top + rect.height / 2;
                const dist = Math.abs(clientY - center);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestIndex = i;
                }
            }

            return closestIndex;
        },
        [points.length]
    );

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0 || points.length <= 1) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsDragging(true);
        const nextIndex = calculateNearestIndex(e.clientY);
        if (nextIndex !== safeActiveIndex) {
            onSelectIndex(nextIndex);
        }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging) return;
        const nextIndex = calculateNearestIndex(e.clientY);
        if (nextIndex !== safeActiveIndex) {
            onSelectIndex(nextIndex);
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (isDragging) {
            setIsDragging(false);
            try {
                e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
                // Ignore if pointer capture already released
            }
        }
    };

    return (
        <div
            className="w-48 sm:w-56 py-2 px-3 bg-gray-50/80 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/10 rounded-2xl shadow-sm backdrop-blur-md select-none transition-all duration-300"
            role="region"
            aria-label="Versionsverlauf Timeline"
        >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100 dark:border-white/5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-zinc-200">
                    <History className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Versionsverlauf</span>
                </div>
                {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                ) : (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-zinc-400">
                        {points.length}
                    </span>
                )}
            </div>

            {/* Empty state */}
            {points.length === 0 ? (
                <div className="py-4 text-center text-xs text-gray-400 dark:text-zinc-500">
                    {isLoading ? "Versionen werden geladen..." : "Keine Versionen vorhanden"}
                </div>
            ) : (
                /* Timeline Track */
                <div
                    ref={trackRef}
                    className="relative py-1 cursor-pointer touch-none select-none"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                >
                    {/* Vertical continuous line */}
                    <div className="w-0.5 bg-gray-200 dark:bg-white/10 absolute left-4 -translate-x-1/2 top-2 bottom-2 rounded-full pointer-events-none" />

                    {/* Points list */}
                    <div className="flex flex-col space-y-1">
                        {points.map((point, index) => {
                            const isActive = index === safeActiveIndex;
                            const formattedTime = formatPointTimestamp(point.timestamp);

                            return (
                                <div
                                    key={point.id || index}
                                    ref={(el) => {
                                        itemRefs.current[index] = el;
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectIndex(index);
                                    }}
                                    className={`group flex items-center gap-2.5 py-1.5 px-1 rounded-xl transition-all duration-150 cursor-pointer ${
                                        isActive
                                            ? "bg-indigo-50/70 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200"
                                            : "hover:bg-gray-100/60 dark:hover:bg-white/[0.04] text-gray-600 dark:text-zinc-400"
                                    }`}
                                >
                                    {/* Dot / Scrubber node */}
                                    <div className="w-6 flex items-center justify-center shrink-0 relative">
                                        <div
                                            className={`transition-all duration-200 ${
                                                isActive
                                                    ? "w-3.5 h-3.5 rounded-full border-2 border-indigo-600 bg-white dark:bg-zinc-900 shadow-sm ring-4 ring-indigo-500/20 scale-110 cursor-grab active:cursor-grabbing"
                                                    : "w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-zinc-700 group-hover:bg-gray-400 dark:group-hover:bg-zinc-500"
                                            }`}
                                        />
                                    </div>

                                    {/* Label & Timestamp */}
                                    <div className="flex flex-col min-w-0 pr-1">
                                        <span
                                            className={`truncate leading-tight text-xs ${
                                                isActive
                                                    ? "font-semibold text-indigo-700 dark:text-indigo-300"
                                                    : "font-medium text-gray-700 dark:text-zinc-300 group-hover:text-gray-900 dark:group-hover:text-zinc-100"
                                            }`}
                                        >
                                            {point.label || (index === 0 ? "Jetzt" : `Version ${points.length - index}`)}
                                        </span>
                                        {formattedTime && (
                                            <span className="text-[10px] text-gray-400 dark:text-zinc-500 leading-tight">
                                                {formattedTime}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
