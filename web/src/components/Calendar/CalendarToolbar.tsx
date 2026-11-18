import React, { useState } from "react";
import { format, getISOWeek } from "date-fns";
import { de } from "date-fns/locale";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Upload } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import type { CalendarViewProps, CalendarViewMode } from "./types";

interface CalendarToolbarProps {
    date: Date;
    viewMode: CalendarViewMode;
    onViewModeChange: (mode: CalendarViewMode) => void;
    themes: CalendarViewProps['themes'];
    selectedGroupId: string | null;
    onSelectGroup: (id: string | null) => void;
    onImportClick: () => void;
    /** Steps the visible range by one unit of the current view (day, week or month). */
    onStep: (dir: 1 | -1) => void;
    onToday: () => void;
    /** Creates an event at 9:00 on the selected day. Omitted when creating is not possible. */
    onCreate?: () => void;
}

const VIEW_OPTIONS: { id: CalendarViewMode; label: string }[] = [
    { id: 'day', label: 'Tag' },
    { id: 'week', label: 'Woche' },
    { id: 'month', label: 'Monat' },
    { id: 'continuous', label: 'Fortlaufend' },
];

/** Tide 2 header: title with calendar week, navigation, view menu, import and "Termin", plus the group chips row. */
export function CalendarToolbar({
    date,
    viewMode,
    onViewModeChange,
    themes = [],
    selectedGroupId,
    onSelectGroup,
    onImportClick,
    onStep,
    onToday,
    onCreate,
}: CalendarToolbarProps) {
    const { t } = useTranslation();
    const [viewMenuOpen, setViewMenuOpen] = useState(false);
    const currentLabel = VIEW_OPTIONS.find((o) => o.id === viewMode)?.label ?? '';

    return (
        // position:relative + zIndex:500 creates a stacking context above
        // all sticky calendar elements (time col z-[160], day headers z-[150]).
        <div className="flex flex-col bg-transparent border-b border-gray-200/60 dark:border-white/10" style={{ position: 'relative', zIndex: 500 }}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold tracking-tight text-t2-ink sm:text-xl">
                        {viewMode === 'day'
                            ? format(date, "EEEE, d. MMMM yyyy", { locale: de })
                            : format(date, "MMMM yyyy", { locale: de })}
                    </h2>
                    <span className="text-[13px] text-t2-ink-3">KW {getISOWeek(date)}</span>
                    <div className="ml-2 flex items-center">
                        <button
                            type="button"
                            onClick={() => onStep(-1)}
                            aria-label={t('calendar', 'previousWeek')}
                            title={t('calendar', 'previousWeek')}
                            className="rounded-[8px] p-1.5 text-t2-ink-2 transition-colors hover:bg-t2-hover"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={onToday}
                            className="rounded-[8px] px-2.5 py-1 text-[13px] text-t2-ink-2 transition-colors hover:bg-t2-hover"
                        >
                            {t('common', 'today')}
                        </button>
                        <button
                            type="button"
                            onClick={() => onStep(1)}
                            aria-label={t('calendar', 'nextWeek')}
                            title={t('calendar', 'nextWeek')}
                            className="rounded-[8px] p-1.5 text-t2-ink-2 transition-colors hover:bg-t2-hover"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setViewMenuOpen((open) => !open)}
                            className="flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[13.5px] text-t2-ink-2 transition-colors hover:bg-t2-hover"
                            aria-haspopup="menu"
                            aria-expanded={viewMenuOpen}
                        >
                            {currentLabel}
                            <ChevronDown size={14} />
                        </button>
                        {viewMenuOpen && (
                            <div role="menu" className="absolute right-0 top-full z-[600] mt-1 flex w-44 flex-col gap-0.5 rounded-[12px] bg-t2-surface p-1.5 shadow-[0_0_0_1px_var(--t2-line)]">
                                {VIEW_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            onViewModeChange(opt.id);
                                            setViewMenuOpen(false);
                                        }}
                                        className={`flex items-center justify-between rounded-[8px] px-2.5 py-1.5 text-left text-[13.5px] transition-colors hover:bg-t2-hover ${
                                            viewMode === opt.id ? "font-semibold text-t2-ink" : "text-t2-ink-2"
                                        }`}
                                    >
                                        {opt.label}
                                        {viewMode === opt.id && <span className="text-t2-ink-3">✓</span>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={onImportClick}
                        className="rounded-[10px] p-1.5 text-t2-ink-3 transition-colors hover:bg-t2-hover hover:text-t2-ink-2"
                        title="Google Kalender (.ics) importieren"
                        aria-label="Importieren"
                    >
                        <Upload size={15} />
                    </button>

                    <button
                        type="button"
                        onClick={onCreate}
                        disabled={!onCreate}
                        className="flex items-center gap-1.5 rounded-[10px] bg-t2-ink px-3.5 py-1.5 text-[13.5px] font-semibold text-t2-bg transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                        <Plus size={14} />
                        Termin
                    </button>
                </div>
            </div>

            {/* Row 2 (Categories & Themes) */}
            <div className="flex items-center gap-1.5 px-4 py-2 border-t border-gray-200/40 dark:border-white/5 overflow-x-auto scrollbar-none">
                <button
                    type="button"
                    onClick={() => onSelectGroup(null)}
                    className={`px-3 py-1 text-xs font-bold rounded-full shadow-sm cursor-pointer hover:opacity-90 transition-all flex items-center gap-1 shrink-0 ${!selectedGroupId ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300'}`}
                >
                    {!selectedGroupId && (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    )}
                    All
                </button>
                {themes.map(group => (
                    <button
                        type="button"
                        key={group.id}
                        onClick={() => onSelectGroup(group.id)}
                        className={`px-3 py-1 text-xs font-semibold rounded-full cursor-pointer transition-all shrink-0 flex items-center gap-1.5 ${selectedGroupId === group.id ? 'bg-black dark:bg-white text-white dark:text-black font-bold shadow-sm' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 dark:bg-white/10 dark:hover:bg-white/15 dark:text-gray-300'}`}
                    >
                        {group.color && (
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                        )}
                        {group.title}
                    </button>
                ))}
            </div>
        </div>
    );
}
