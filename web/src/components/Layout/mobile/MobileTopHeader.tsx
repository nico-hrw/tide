"use client";

import React, { useEffect, useState } from 'react';
import { addDays, format, isSameDay, startOfWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import { RotateCcw } from 'lucide-react';
import MobileIsland from '@/components/island/MobileIsland';
import type { WeekStart } from '@/lib/calendarWeeks';
import { useDataStore, useWeekStartsOn } from '@/store/useDataStore';
import {
  AutoHide,
  fireConfetti,
  formatGreeting,
  pickGreetingTemplate,
} from '../MobileHeaderWidgets';
import type { MobileTab } from './MobileBottomNav';
import { MobileDateWheel } from './MobileDateWheel';
import { T } from './mobileTheme';

export type MobileCalViewMode = 'day' | 'agenda' | 'week' | 'month';

export interface MobileTopHeaderProps {
  displayName: string;
  calViewMode: MobileCalViewMode;
  setCalViewMode: (mode: MobileCalViewMode) => void;
  activeDate: Date;
  setActiveDate: (date: Date) => void;
  onGoToToday: () => void;
  activeTab?: MobileTab;
  theme?: string;
  now?: Date;
  weekStartsOn?: WeekStart;
  setDayViewDays?: React.Dispatch<React.SetStateAction<Date[]>>;
  onMonthChange?: (monthYear: string) => void;
  onSelectDate?: (date: Date) => void;
  onOpenSidebar?: () => void;
  onOpenSearch?: () => void;
  onOpenExams?: () => void;
  onOpenSettings?: () => void;
}

const CAL_VIEW_MODES: readonly { id: MobileCalViewMode; label: string }[] = [
  { id: 'day', label: 'Tag' },
  { id: 'agenda', label: 'Fortlaufend' },
  { id: 'week', label: 'Woche' },
  { id: 'month', label: 'Monat' },
];

function renderGreetingContent(greetingTemplate: string, displayName: string): React.ReactNode {
  const trimmed = displayName.trim();
  if (!trimmed || !greetingTemplate.includes('{name}')) {
    return formatGreeting(greetingTemplate, displayName);
  }
  const [prefix, ...rest] = greetingTemplate.split('{name}');
  const suffix = rest.join('{name}');
  return (
    <>
      {prefix}
      {prefix ? ', ' : ''}
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          fireConfetti(e.currentTarget);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            fireConfetti(e.currentTarget);
          }
        }}
        className="cursor-pointer select-none active:scale-95 transition-transform inline-block"
        title="Konfetti"
      >
        {trimmed}
      </span>
      {suffix}
    </>
  );
}

/**
 * Sticky mobile top header with auto-hiding greeting, MobileIsland,
 * horizontal MobileDateWheel, and calendar view-mode pills.
 */
export const MobileTopHeader: React.FC<MobileTopHeaderProps> = ({
  displayName,
  calViewMode,
  setCalViewMode,
  activeDate,
  setActiveDate,
  onGoToToday,
  activeTab = 'calendar',
  theme: themeProp,
  now: nowProp,
  weekStartsOn: weekStartsOnProp,
  setDayViewDays,
  onMonthChange,
  onSelectDate,
}) => {
  const storeTheme = useDataStore((s) => s.theme);
  const storeWeekStartsOn = useWeekStartsOn();
  const theme = themeProp ?? storeTheme;
  const weekStartsOn = weekStartsOnProp ?? storeWeekStartsOn;

  const [internalNow, setInternalNow] = useState<Date>(() => new Date());
  useEffect(() => {
    if (nowProp) return;
    const id = setInterval(() => setInternalNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [nowProp]);
  const now = nowProp ?? internalNow;

  const [greetingTemplate] = useState<string>(() => pickGreetingTemplate(new Date()));

  useEffect(() => {
    const el = document.getElementById(`btn-view-${calViewMode}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [calViewMode]);

  const handleSelectDate = (d: Date) => {
    if (onSelectDate) {
      onSelectDate(d);
      return;
    }
    setActiveDate(d);
    if (calViewMode === 'agenda') {
      if (setDayViewDays) {
        setDayViewDays((prev) => {
          if (prev.some((day) => isSameDay(day, d))) return prev;
          const ws = startOfWeek(d, { weekStartsOn });
          return Array.from({ length: 30 }, (_, i) => addDays(ws, i));
        });
      }
      setTimeout(() => {
        document
          .getElementById(`day-${format(d, 'yyyy-MM-dd')}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  return (
    <div
      className="shrink-0 z-20 sticky top-0"
      style={{
        paddingTop: 'max(8px, calc(env(safe-area-inset-top) + 2px))',
        background: T.bg,
      }}
    >
      {/* Row 1: Date & Greeting + MobileIsland */}
      <div className="px-4 pt-0.5 pb-1 flex items-start justify-between gap-3">
        <AutoHide ms={6000} watch={displayName} className="min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            <p
              className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 flex-wrap"
              style={{ color: T.mut }}
            >
              {format(now, 'd. MMMM', { locale: de })}
            </p>
            <h1
              className="text-[1.35rem] font-black tracking-tight line-clamp-2 leading-tight mt-0.5"
              style={{ color: T.pri }}
            >
              {renderGreetingContent(greetingTemplate, displayName)}
            </h1>
          </div>
        </AutoHide>
        <AutoHide ms={8000} className="shrink-0">
          <MobileIsland className="-mt-1.5" />
        </AutoHide>
      </div>

      <div>
        {/* Row 2: Apple-style Horizontal Date Wheel */}
        {activeTab === 'calendar' && calViewMode !== 'month' && (
          <MobileDateWheel
            activeDate={activeDate}
            onSelectDate={handleSelectDate}
            now={now}
            theme={theme}
            onMonthChange={onMonthChange}
          />
        )}

        {/* Row 3: View mode selector — compact pills */}
        {activeTab === 'calendar' && (
          <div className="flex items-center justify-between gap-1 px-4 pb-2 pt-0.5">
            <div className="flex items-center gap-1">
              {CAL_VIEW_MODES.map(({ id, label }) => {
                const isAct = calViewMode === id;
                return (
                  <button
                    key={id}
                    id={`btn-view-${id}`}
                    type="button"
                    onClick={() => setCalViewMode(id)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-95 cursor-pointer"
                    style={{
                      background: isAct
                        ? theme === 'dark'
                          ? 'rgba(255,255,255,0.12)'
                          : 'rgba(0,0,0,0.08)'
                        : 'transparent',
                      color: isAct ? T.pri : T.mut,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {!isSameDay(activeDate, now) && (
              <button
                type="button"
                onClick={onGoToToday}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all active:scale-95 shrink-0 cursor-pointer bg-t2-ink text-t2-bg"
                title="Zum heutigen Tag springen"
              >
                <RotateCcw size={11} />
                <span>Heute</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="h-px" style={{ background: T.brd }} />
    </div>
  );
};

export default MobileTopHeader;
