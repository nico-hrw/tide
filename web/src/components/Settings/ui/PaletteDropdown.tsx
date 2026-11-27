"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { CalendarColorPalette } from '@/store/useDataStore';
import { CALENDAR_PALETTE_LIST, getPaletteCategories } from '@/lib/calendarColors';
import { cx } from './cx';

export interface PaletteDropdownProps {
    value: CalendarColorPalette;
    onChange: (palette: CalendarColorPalette) => void;
    ariaLabel?: string;
}

/** Five colour swatches representing a calendar colour palette. */
function PaletteDots({ palette }: { palette: CalendarColorPalette }) {
    const categories = getPaletteCategories(palette);
    return (
        <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
            {categories.map((cat) => (
                <span
                    key={cat.key}
                    className="h-3 w-3 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: cat.bg }}
                />
            ))}
        </span>
    );
}

/** Custom dropdown for selecting a calendar colour palette with live swatch previews. */
export function PaletteDropdown({ value, onChange, ariaLabel }: PaletteDropdownProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const selected = CALENDAR_PALETTE_LIST.find((p) => p.id === value) ?? CALENDAR_PALETTE_LIST[0];
    const selectedId = selected?.id ?? value;

    return (
        <div ref={ref} className="relative inline-block max-w-full">
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={ariaLabel}
                onClick={() => setOpen((v) => !v)}
                className={cx(
                    'inline-flex max-w-full cursor-pointer items-center gap-2.5 rounded-ui bg-t2-surface px-3 py-1.5 text-[13px] font-medium text-t2-ink ring-1 ring-t2-line outline-none transition-colors hover:bg-t2-hover focus-visible:ring-2 focus-visible:ring-t2-accent',
                    open && 'bg-t2-hover',
                )}
            >
                <PaletteDots palette={selectedId} />
                <span className="truncate">{selected?.label ?? value}</span>
                <ChevronDown
                    size={14}
                    aria-hidden="true"
                    className={cx('shrink-0 text-t2-ink-3 transition-transform duration-200', open && 'rotate-180')}
                />
            </button>

            {open && (
                <div
                    role="listbox"
                    aria-label={ariaLabel}
                    className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[240px] p-1.5 rounded-2xl border border-t2-line bg-t2-surface shadow-[0_18px_44px_rgba(0,0,0,0.16)] animate-in fade-in zoom-in-95 duration-100"
                >
                    {CALENDAR_PALETTE_LIST.map((p) => {
                        const active = p.id === value;
                        return (
                            <button
                                key={p.id}
                                type="button"
                                role="option"
                                aria-selected={active}
                                onClick={() => {
                                    onChange(p.id);
                                    setOpen(false);
                                }}
                                className={cx(
                                    'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors',
                                    active ? 'bg-t2-sub font-medium text-t2-ink' : 'text-t2-ink hover:bg-t2-hover',
                                )}
                            >
                                <PaletteDots palette={p.id} />
                                <span className="min-w-0 flex-1 truncate">{p.label}</span>
                                {active && <Check size={14} className="shrink-0 text-t2-ink" aria-hidden="true" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
