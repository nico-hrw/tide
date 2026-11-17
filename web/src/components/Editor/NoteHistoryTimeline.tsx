"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { NoteBackupPoint } from "@/hooks/useNoteBackups";
import "./noteChrome.css";

interface NoteHistoryTimelineProps {
    open: boolean;
    points: NoteBackupPoint[];
    activeIndex: number;
    onSelectIndex: (index: number) => void;
    isLoading?: boolean;
    error?: string | null;
    onView: () => void;
    onRestore: () => void;
    /** Selected version content is loaded and can be restored. */
    canRestore: boolean;
}

const MIN_GAP = 88;
const TOP_PAD = 12;
const BOTTOM_PAD = 96;

function formatWhen(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000);
    if (d.toDateString() === today.toDateString()) return `Heute, ${time}`;
    if (d.toDateString() === yesterday.toDateString()) return `Gestern, ${time}`;
    return `${d.toLocaleDateString("de-DE", { day: "numeric", month: "short" })}, ${time}`;
}

function sourceOf(p: NoteBackupPoint): string {
    if (p.isCurrent) return "Aktuell";
    return p.authorName ? p.authorName : "Automatisch gespeichert";
}

/** Vertical on-page timeline: a line grows down the right edge, save points sit at heights proportional to their age. */
export default function NoteHistoryTimeline({
    open, points, activeIndex, onSelectIndex, isLoading = false, error, onView, onRestore, canRestore,
}: NoteHistoryTimelineProps) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(600);

    useEffect(() => {
        const parent = wrapRef.current?.parentElement;
        if (!parent) return;
        const measure = () => setHeight(parent.clientHeight);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(parent);
        return () => ro.disconnect();
    }, []);

    const tops = useMemo(() => {
        const times = points.map((p) => new Date(p.updatedAt || p.timestamp || "").getTime());
        const newest = Math.max(...times.filter((t) => !isNaN(t)), 0);
        const oldest = Math.min(...times.filter((t) => !isNaN(t)), newest);
        const span = Math.max(newest - oldest, 1);
        const usable = Math.max(height - TOP_PAD - BOTTOM_PAD, MIN_GAP);
        const out: number[] = [];
        points.forEach((_, i) => {
            const t = isNaN(times[i]) ? oldest : times[i];
            let top = TOP_PAD + ((newest - t) / span) * usable;
            if (i > 0) top = Math.max(top, out[i - 1] + MIN_GAP);
            out.push(top);
        });
        return out;
    }, [points, height]);

    const trackHeight = Math.max(height, (tops[tops.length - 1] ?? 0) + BOTTOM_PAD);

    return (
        <div className="sticky top-0 h-0 z-30 pointer-events-none">
            <div
                ref={wrapRef}
                className={`t2-vtl ${open ? "open pointer-events-auto" : ""} absolute right-14 top-0 w-60 overflow-y-auto overflow-x-hidden [scrollbar-width:none]`}
                style={{ height }}
                role="region"
                aria-label="Versionsverlauf"
                aria-hidden={!open}
            >
                <div className="relative" style={{ height: trackHeight }}>
                    <div className="t2-vline absolute right-[5px] top-0 w-0.5 rounded-sm bg-t2-line" style={open ? { height: "100%" } : undefined} />
                    {points.map((p, i) => {
                        const on = i === activeIndex;
                        return (
                            <div
                                key={p.id}
                                className="t2-vp absolute left-0 right-0 flex justify-end items-start gap-3.5 text-right cursor-pointer"
                                style={{ top: tops[i], ["--i" as string]: i }}
                                onClick={() => onSelectIndex(i)}
                            >
                                <div>
                                    <span className={`block text-[13.5px] hover:text-t2-blue ${on ? "font-semibold text-t2-blue" : "font-medium text-t2-ink"}`}>
                                        {p.isCurrent ? "Aktuell" : formatWhen(p.updatedAt || p.timestamp || "") || p.label}
                                    </span>
                                    <small className="block text-[12px] text-t2-ink-3">{sourceOf(p)}</small>
                                    {on && !p.isCurrent && (
                                        <div className="flex gap-1.5 mt-2 justify-end">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); onView(); }}
                                                className="px-2.5 py-1 text-[12.5px] rounded-lg bg-t2-sub text-t2-ink hover:bg-t2-hover ring-1 ring-t2-line"
                                            >
                                                Ansehen
                                            </button>
                                            <button
                                                type="button"
                                                disabled={!canRestore || isLoading}
                                                onClick={(e) => { e.stopPropagation(); onRestore(); }}
                                                className="px-2.5 py-1 text-[12.5px] rounded-lg bg-t2-blue text-t2-bg font-medium disabled:opacity-50"
                                            >
                                                Wiederherstellen
                                            </button>
                                        </div>
                                    )}
                                    {on && !p.isCurrent && error && (
                                        <div className="text-[11px] text-t2-now mt-1 max-w-[200px] ml-auto">{error}</div>
                                    )}
                                </div>
                                <b
                                    className={`relative z-[1] mt-0.5 w-3 h-3 shrink-0 rounded-full ${
                                        on ? "bg-t2-blue" : "bg-t2-bg ring-2 ring-inset ring-t2-ink-3"
                                    }`}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
