"use client";

import React, { useRef, useState, useCallback, useMemo } from "react";
import { History, Loader2, Check, X } from "lucide-react";
import { NoteBackupPoint } from "@/hooks/useNoteBackups";

export interface NoteVersionTimelineProps {
    points: NoteBackupPoint[];
    activeIndex: number;
    onSelectIndex: (index: number) => void;
    isLoading?: boolean;
    onCancel?: () => void;
    onApply?: () => void;
    className?: string;
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
    onCancel,
    onApply,
    className = "",
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
            className={`w-48 sm:w-56 h-full flex flex-col select-none ${className}`}
            role="region"
            aria-label="Versionsverlauf Timeline"
        >
            {/* Top controls: Status & Header (minimal, no card or dividers) */}
            <div className="shrink-0 flex items-center justify-between text-xs text-gray-400 dark:text-zinc-500 px-0.5 mb-2.5">
                <div className="flex items-center gap-1.5 font-medium text-gray-600 dark:text-zinc-300">
                    <History className="w-3.5 h-3.5 text-gray-500 dark:text-zinc-400" />
                    <span>Versionsverlauf</span>
                </div>
                {isLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin text-gray-500 dark:text-zinc-400" />
                ) : (
                    <span className="text-[10px] text-gray-400 dark:text-zinc-500">
                        {points.length} {points.length === 1 ? 'Stand' : 'Stände'}
                    </span>
                )}
            </div>

            {/* Empty state */}
            {points.length === 0 ? (
                <div className="flex-1 py-4 text-right text-xs text-gray-400 dark:text-zinc-500 pr-4">
                    {isLoading ? "Versionen werden geladen..." : "Keine Versionen vorhanden"}
                </div>
            ) : (
                /* Timeline Track */
                <div
                    ref={trackRef}
                    className="relative flex-1 min-h-0 max-h-[calc(100vh-14rem)] overflow-y-auto pr-0 cursor-pointer touch-none select-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                >
                    <div className="relative min-h-full py-1.5">
                        {/* Continuous vertical rail line on the far right edge */}
                        <div className="w-px bg-gray-200 dark:bg-white/10 absolute right-[7px] top-1.5 bottom-3 pointer-events-none" />

                        {/* Points list */}
                        <div className="flex flex-col space-y-4">
                            {points.map((point, index) => {
                                const isActive = index === safeActiveIndex;
                                const formattedTime = point.formattedTime || formatPointTimestamp(point.updatedAt || point.timestamp);
                                const formattedDate = point.formattedDate;

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
                                        className="group flex flex-row items-center justify-end gap-3 py-1 cursor-pointer"
                                    >
                                        {/* Description (positioned to the LEFT of the dot, text right-aligned) */}
                                        <div className="flex flex-col items-end text-right min-w-0">
                                            <span
                                                className={`text-xs leading-tight truncate transition-colors ${
                                                    isActive
                                                        ? "font-semibold text-gray-900 dark:text-white"
                                                        : "font-normal text-gray-500 dark:text-zinc-400 group-hover:text-gray-800 dark:group-hover:text-zinc-200"
                                                }`}
                                            >
                                                {point.label || (index === 0 ? "Jetzt" : `Version ${points.length - index}`)}
                                            </span>
                                            <div className="flex items-center gap-1 mt-0.5 justify-end">
                                                {formattedDate && formattedDate !== "Heute" && (
                                                    <span className="text-[10px] text-gray-400/80 dark:text-zinc-500/80 leading-tight">
                                                        {formattedDate} •
                                                    </span>
                                                )}
                                                {formattedTime && (
                                                    <span className="text-[10px] text-gray-400 dark:text-zinc-500 leading-tight">
                                                        {formattedTime}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Interactive dot aligned on the vertical rail line at the right */}
                                        <div className="w-[15px] flex items-center justify-center shrink-0 z-10">
                                            <div
                                                className={`transition-all duration-150 ${
                                                    isActive
                                                        ? "w-2.5 h-2.5 rounded-full bg-gray-900 dark:bg-white"
                                                        : "w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-zinc-600 group-hover:bg-gray-500"
                                                }`}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom controls: Action buttons at the bottom-left next to the timeline rail */}
            {(onCancel || onApply) && (
                <div className="shrink-0 flex items-center justify-start gap-1.5 pt-2 mt-2 border-t border-gray-200/50 dark:border-zinc-800/50">
                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg text-gray-600 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                            title="Versionsverlauf beenden"
                        >
                            <X className="w-3.5 h-3.5" />
                            <span>Abbrechen</span>
                        </button>
                    )}
                    {onApply && (
                        <button
                            type="button"
                            onClick={onApply}
                            disabled={isLoading}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
                            title="Ausgewählten Stand übernehmen"
                        >
                            <Check className="w-3.5 h-3.5" />
                            <span>Übernehmen</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
