"use client";

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DT from '@/lib/designTokens';

export interface FoldedTab {
    id: string;
    label: string;
    icon: React.ReactNode;
    active: boolean;
}

interface TabOverflowProps {
    tabs: FoldedTab[];
    onSelect: (id: string) => void;
}

/** Hover delay before the list closes again, so the pointer can travel from the icons into the list. */
const CLOSE_DELAY_MS = 180;

/**
 * The least used note tabs, folded into one group of icons. Hovering slides the list of titles out below it;
 * a click selects a tab.
 */
export default function TabOverflow({ tabs, onSelect }: TabOverflowProps) {
    const [open, setOpen] = useState(false);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const btnRef = useRef<HTMLDivElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // The list is portalled to the body: the tab row clips anything that reaches beyond it.
    const show = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        setRect(btnRef.current?.getBoundingClientRect() ?? null);
        setOpen(true);
    };
    const hide = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
    };
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    if (tabs.length === 0) return null;
    const preview = tabs.slice(0, 3);

    return (
        <div ref={btnRef} className="relative shrink-0" onMouseEnter={show} onMouseLeave={hide}>
            <button
                type="button"
                aria-label={`${tabs.length} weitere Tabs`}
                aria-expanded={open}
                onFocus={show}
                onBlur={hide}
                style={{ borderRadius: DT.radius }}
                className="flex h-8 items-center gap-0.5 px-1.5 text-t2-ink-2 hover:bg-t2-stage hover:text-t2-ink cursor-pointer transition-colors"
            >
                {preview.map((t) => (
                    <span key={t.id} className="flex h-5 w-4 items-center justify-center text-t2-ink-3 [&>svg]:h-3.5 [&>svg]:w-3.5">
                        {t.icon}
                    </span>
                ))}
                <span className="ml-0.5 rounded-full bg-t2-sub px-1.5 text-[11px] font-medium text-t2-ink-2">{tabs.length}</span>
            </button>

            {open && rect && typeof document !== 'undefined' && createPortal(
                <div
                    role="menu"
                    onMouseEnter={show}
                    onMouseLeave={hide}
                    style={{ position: 'fixed', top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) }}
                    className="z-[900] w-60 origin-top-right rounded-xl border border-t2-line bg-t2-surface p-1.5 shadow-lg animate-in fade-in slide-in-from-top-2 duration-150"
                >
                    {tabs.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            role="menuitem"
                            onClick={() => { setOpen(false); onSelect(t.id); }}
                            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                                t.active ? 'bg-t2-sub font-semibold text-t2-ink' : 'text-t2-ink-2 hover:bg-t2-hover hover:text-t2-ink'
                            }`}
                        >
                            <span className="shrink-0 text-t2-ink-3">{t.icon}</span>
                            <span className="min-w-0 flex-1 truncate">{t.label}</span>
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </div>
    );
}
