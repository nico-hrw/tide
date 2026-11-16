import React from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Upload } from "lucide-react";
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
    /** Present in the fixed one-week mode: shows prev / next / today controls. */
    fixedWeekNav?: { onPrev: () => void; onNext: () => void; onToday: () => void };
}

const NAV_BUTTON_CLASS = "flex items-center justify-center px-2 py-1 text-xs font-semibold rounded-xl bg-gray-100/70 dark:bg-white/5 border border-gray-200/60 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer";

/** Title row (date, week navigation, import, view-mode pills) and the group chips row. */
export function CalendarToolbar({
    date,
    viewMode,
    onViewModeChange,
    themes = [],
    selectedGroupId,
    onSelectGroup,
    onImportClick,
    fixedWeekNav,
}: CalendarToolbarProps) {
    const { t } = useTranslation();

    return (
        // position:relative + zIndex:500 creates a stacking context above
        // all sticky calendar elements (time col z-[160], day headers z-[150]).
        <div className="flex flex-col bg-transparent border-b border-gray-200/60 dark:border-white/10" style={{ position: 'relative', zIndex: 500 }}>
            {/* Row 1 (Main Controls) */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                {/* Left: Date Title */}
                <div className="flex items-center gap-3">
                    <h2 className="text-base sm:text-lg md:text-xl font-extrabold text-[#1F2937] dark:text-[#E2E8F0] tracking-tight">
                        {viewMode === 'day'
                            ? format(date, "EEEE, d. MMMM yyyy", { locale: de })
                            : format(date, "MMMM yyyy", { locale: de })}
                    </h2>
                    {fixedWeekNav && (
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={fixedWeekNav.onPrev}
                                className={NAV_BUTTON_CLASS}
                                title={t('calendar', 'previousWeek')}
                                aria-label={t('calendar', 'previousWeek')}
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <button
                                type="button"
                                onClick={fixedWeekNav.onToday}
                                className={NAV_BUTTON_CLASS}
                            >
                                {t('common', 'today')}
                            </button>
                            <button
                                type="button"
                                onClick={fixedWeekNav.onNext}
                                className={NAV_BUTTON_CLASS}
                                title={t('calendar', 'nextWeek')}
                                aria-label={t('calendar', 'nextWeek')}
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Right: View Mode switcher pills & actions */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onImportClick}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-xl bg-gray-100/70 dark:bg-white/5 border border-gray-200/60 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer"
                        title="Google Kalender (.ics) importieren"
                    >
                        <Upload size={13} />
                        <span>Import</span>
                    </button>

                    <div className="flex items-center gap-1 bg-gray-100/70 dark:bg-white/5 border border-gray-200/60 dark:border-white/10 p-1 rounded-xl">
                        {([
                            { id: 'day' as const, label: 'Tag' },
                            { id: 'week' as const, label: 'Woche' },
                            { id: 'month' as const, label: 'Monat' },
                            { id: 'continuous' as const, label: 'Fortlaufend' },
                        ]).map((mode) => {
                            const isActive = viewMode === mode.id;
                            return (
                                <button
                                    key={mode.id}
                                    onClick={() => onViewModeChange(mode.id)}
                                    className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                                        isActive
                                            ? "bg-black dark:bg-white text-white dark:text-black font-bold shadow-sm"
                                            : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 font-medium"
                                    }`}
                                >
                                    {mode.label}
                                </button>
                            );
                        })}
                    </div>
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
