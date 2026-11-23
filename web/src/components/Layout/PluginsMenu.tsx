"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, GraduationCap, ListTodo, Puzzle, Settings, Smile, Users, Variable } from 'lucide-react';
import type { Tab } from './TabList';

interface PluginsMenuProps {
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
export default function PluginsMenu({ activeTabId, enabledExtensions = [], onTabSelect, onOpenSocial, onOpenSettings, onOpenVariables }: PluginsMenuProps) {
    const [open, setOpen] = useState(false);
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
        ...(enabledExtensions.includes('surveys')
            ? [{ key: 'surveys', title: 'Umfragen', hint: 'Stimmungsbild und Mood', tone: 'uni' as const, icon: <Smile size={17} />, tabId: 'surveys', onSelect: go(() => onTabSelect('surveys', 'surveys')) }]
            : []),
        ...(onOpenSocial
            ? [{ key: 'social', title: 'Social', hint: 'Chat und Kontakte', tone: 'geb' as const, icon: <Users size={17} />, onSelect: go(onOpenSocial) }]
            : []),
    ];

    return (
        <div ref={ref} className="relative shrink-0 flex items-center">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                title="Plugins und Erweiterungen"
                aria-label="Plugins"
                aria-expanded={open}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-95 cursor-pointer ${
                    open ? 'border-t2-line bg-t2-surface text-t2-ink shadow-xs' : 'border-transparent text-t2-ink-2 hover:bg-t2-stage hover:text-t2-ink'
                }`}
            >
                <Puzzle size={14} />
                <span className="hidden sm:inline">Plugins</span>
                <ChevronDown size={11} className={`text-t2-ink-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+10px)] z-[150] w-[320px] overflow-hidden rounded-2xl border border-t2-line bg-t2-surface shadow-[0_18px_44px_rgba(0,0,0,0.16)] animate-in fade-in zoom-in-95 duration-100"
                >
                    <div className="px-4 pb-2 pt-3.5">
                        <div className="text-[13px] font-semibold text-t2-ink">Plugins</div>
                        <div className="text-[12px] text-t2-ink-3">Werkzeuge, die du mit Tide nutzen kannst</div>
                    </div>

                    <div className="px-2 pb-2">
                        {entries.map((e) => {
                            const active = !!e.tabId && e.tabId === activeTabId;
                            return (
                                <button
                                    key={e.key}
                                    type="button"
                                    role="menuitem"
                                    onClick={e.onSelect}
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
                                </button>
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
