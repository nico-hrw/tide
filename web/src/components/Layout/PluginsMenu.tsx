"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, GraduationCap, LayoutGrid, ListTodo, Puzzle, Settings, Users, Variable } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Tab } from './TabList';

interface PluginsMenuProps {
    /** "pill" in the tab bar; "row" as a full-width sidebar entry (no icon). */
    variant?: 'pill' | 'row';
    activeTabId: string;
    enabledExtensions?: string[];
    onTabSelect: (id: string, type: Tab['type']) => void;
    onOpenSocial?: () => void;
    onOpenSettings?: () => void;
    onOpenVariables: () => void;
}

interface Entry {
    key: string;
    title: string;
    hint: string;
    /** Calendar palette variable (Balsam, ...): the badge follows the app palette */
    tone: 'praktikum' | 'studium' | 'social' | 'uni' | 'geb';
    icon: React.ReactNode;
    tabId?: string;
    onSelect: () => void;
}

/** "Plugins" button in the top bar with a tidy panel of tiles. */
export default function PluginsMenu({ variant = 'pill', activeTabId, enabledExtensions = [], onTabSelect, onOpenSocial, onOpenSettings, onOpenVariables }: PluginsMenuProps) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    const go = (fn: () => void) => () => { setOpen(false); fn(); };
    const entries: Entry[] = [
        { key: 'planner', title: 'Job & Uni', hint: 'Vorlesungen, Prüfungen, Jobs', tone: 'praktikum', icon: <GraduationCap size={17} />, tabId: 'job_planner', onSelect: go(() => onTabSelect('job_planner', 'job_planner')) },
        { key: 'calendar', title: 'Kalender', hint: 'Termine und Wochenansicht', tone: 'studium', icon: <Calendar size={17} />, tabId: 'calendar', onSelect: go(() => onTabSelect('calendar', 'calendar')) },
        { key: 'todos', title: 'Todos', hint: 'Aufgaben im Blick', tone: 'social', icon: <ListTodo size={17} />, tabId: 'todos', onSelect: go(() => onTabSelect('todos', 'todos')) },
        ...(onOpenSocial
            ? [{ key: 'social', title: 'Social', hint: 'Chat und Kontakte', tone: 'geb' as const, icon: <Users size={17} />, onSelect: go(onOpenSocial) }]
            : []),
    ];

    return (
        <div ref={ref} className={variant === 'row' ? 'relative w-full' : 'relative shrink-0 flex items-center'}>
            <button
                type="button"
                onClick={(e) => {
                    if (!open) { const r = e.currentTarget.getBoundingClientRect(); setPos({ top: r.top, left: r.right + 8 }); }
                    setOpen((v) => !v);
                }}
                title="Plugins und Erweiterungen"
                aria-label="Plugins"
                aria-expanded={open}
                className={variant === 'row'
                    ? 'flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left text-[14px] text-t2-ink-2 transition-colors hover:bg-t2-hover cursor-pointer select-none'
                    : `flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-95 cursor-pointer ${
                        open ? 'border-t2-line bg-t2-surface text-t2-ink shadow-xs' : 'border-transparent text-t2-ink-2 hover:bg-t2-stage hover:text-t2-ink'
                    }`}
            >
                {variant === 'pill' && <Puzzle size={14} />}
                {variant === 'row' && <LayoutGrid size={16} className="shrink-0 text-t2-ink-3" aria-hidden="true" />}
                <span className={variant === 'pill' ? 'hidden sm:inline' : 'flex-1 truncate'}>Plugins</span>
                {variant === 'pill' && <ChevronDown size={11} className={`text-t2-ink-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />}
            </button>

            {open && (
                <div
                    role="menu"
                    className={variant === 'row'
                        ? 'fixed z-[700] w-[260px] p-1.5 rounded-2xl bg-[var(--sidebar-bg)] border border-t2-line shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)] overflow-hidden'
                        : 'absolute right-0 top-[calc(100%+10px)] z-[150] w-[320px] overflow-hidden rounded-2xl border border-t2-line bg-t2-surface shadow-[0_18px_44px_rgba(0,0,0,0.16)] animate-in fade-in zoom-in-95 duration-100'}
                    style={variant === 'row' && pos ? { top: pos.top, left: pos.left } : undefined}
                >
                    <div className="px-4 pb-2 pt-3.5">
                        <div className="text-[13px] font-semibold text-t2-ink">Plugins</div>
                        <div className="text-[12px] text-t2-ink-3">Werkzeuge, die du mit Tide nutzen kannst</div>
                    </div>

                    <div className="px-2 pb-2">
                        {entries.map((e, idx) => {
                            const active = !!e.tabId && e.tabId === activeTabId;
                            return (
                                <motion.button
                                    key={e.key}
                                    type="button"
                                    role="menuitem"
                                    onClick={e.onSelect}
                                    initial={variant === 'row' ? { opacity: 0, x: -8 } : false}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ type: 'spring', stiffness: 350, damping: 40, mass: 0.8, delay: idx * 0.03 }}
                                    className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer ${active ? 'bg-t2-sub' : 'hover:bg-t2-hover'}`}
                                >
                                    <span
                                        className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
                                        style={{ background: `var(--cal-${e.tone})`, color: `var(--cal-${e.tone}-ink)` }}
                                    >
                                        {e.icon}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[13px] font-semibold text-t2-ink">{e.title}</span>
                                        <span className="block truncate text-[12px] text-t2-ink-3">{e.hint}</span>
                                    </span>
                                    {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-t2-ink" aria-label="geöffnet" />}
                                </motion.button>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-1 border-t border-t2-line-soft bg-t2-sub px-2 py-1.5">
                        <button
                            type="button"
                            onClick={go(onOpenVariables)}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-t2-ink-2 transition-colors hover:bg-t2-hover hover:text-t2-ink cursor-pointer"
                        >
                            <Variable size={14} /> Variablen
                        </button>
                        {onOpenSettings && (
                            <button
                                type="button"
                                onClick={go(onOpenSettings)}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-t2-ink-2 transition-colors hover:bg-t2-hover hover:text-t2-ink cursor-pointer"
                            >
                                <Settings size={14} /> Einstellungen
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
