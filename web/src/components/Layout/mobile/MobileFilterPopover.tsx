'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal, Calendar } from 'lucide-react';

export type PriorityOption = 'high' | 'medium' | 'low';
export type StatusOption = 'active' | 'in_progress' | 'completed';
export type DateFilterOption = 'all' | 'today' | 'tomorrow' | string;

export interface MobileFilterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPriority?: PriorityOption | null;
  onPriorityChange?: (priority: PriorityOption | null) => void;
  selectedStatus?: StatusOption | string | null;
  onStatusChange?: (status: StatusOption | string | null) => void;
  dateFilter?: DateFilterOption;
  onDateFilterChange?: (date: DateFilterOption) => void;
  tags?: string[];
  selectedTag?: string | null;
  onTagChange?: (tag: string | null) => void;
  onResetFilters?: () => void;
  className?: string;
}

const STATUS_ITEMS: { key: StatusOption; label: string }[] = [
  { key: 'active', label: 'Offen' },
  { key: 'in_progress', label: 'In Arbeit' },
  { key: 'completed', label: 'Erledigt' },
];

export const MobileFilterPopover: React.FC<MobileFilterPopoverProps> = ({
  isOpen,
  onClose,
  selectedPriority = null,
  onPriorityChange,
  selectedStatus = null,
  onStatusChange,
  dateFilter = 'all',
  onDateFilterChange,
  tags,
  selectedTag = null,
  onTagChange,
  onResetFilters,
  className = '',
}) => {
  const isCustomDate =
    Boolean(dateFilter) &&
    dateFilter !== 'all' &&
    dateFilter !== 'today' &&
    dateFilter !== 'tomorrow';

  const formattedCustomDate = useMemo(() => {
    if (!isCustomDate || !dateFilter) return null;
    const parts = dateFilter.split('-');
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return dateFilter;
  }, [isCustomDate, dateFilter]);

  const handleReset = () => {
    onPriorityChange?.(null);
    onStatusChange?.(null);
    onDateFilterChange?.('all');
    onTagChange?.(null);
    onResetFilters?.();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop to capture outside clicks */}
          <div
            className="fixed inset-0 z-20 cursor-pointer"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Filter Popover Card */}
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.95 }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 30,
            }}
            className={`fixed bottom-[86px] left-4 right-4 max-w-md mx-auto bg-t2-surface  backdrop-blur-xl border border-t2-line  rounded-[28px] p-4 shadow-2xl z-30 flex flex-col gap-3.5 ${className}`}
            role="dialog"
            aria-modal="true"
            aria-label="Filteroptionen"
          >
            {/* Kopfzeile mit Zurücksetzen */}
            <div className="flex items-center justify-between border-b border-t2-line-soft  pb-2">
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-4 h-4 text-t2-ink " />
                <span className="text-[12px] font-black tracking-wider uppercase text-t2-ink ">
                  Filteroptionen
                </span>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="text-[11px] font-bold text-t2-ink-3 hover:text-t2-ink  transition-colors"
              >
                Zurücksetzen
              </button>
            </div>

            {/* Zeile 1: Priorität */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold tracking-wider text-t2-ink-3 uppercase">
                Priorität
              </span>
              <div className="flex items-center gap-1.5">
                {/* High Priority */}
                <button
                  type="button"
                  title="Hohe Priorität"
                  aria-pressed={selectedPriority === 'high'}
                  onClick={() =>
                    onPriorityChange?.(selectedPriority === 'high' ? null : 'high')
                  }
                  className={`w-9 h-7 rounded-xl text-[13px] font-black transition-all flex items-center justify-center ${
                    selectedPriority === 'high'
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'bg-t2-hover  text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
                  }`}
                >
                  ^
                </button>

                {/* Medium Priority */}
                <button
                  type="button"
                  title="Mittlere Priorität"
                  aria-pressed={selectedPriority === 'medium'}
                  onClick={() =>
                    onPriorityChange?.(selectedPriority === 'medium' ? null : 'medium')
                  }
                  className={`w-9 h-7 rounded-xl text-[13px] font-black transition-all flex items-center justify-center ${
                    selectedPriority === 'medium'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-t2-hover  text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                  }`}
                >
                  -
                </button>

                {/* Low Priority */}
                <button
                  type="button"
                  title="Niedrige Priorität"
                  aria-pressed={selectedPriority === 'low'}
                  onClick={() =>
                    onPriorityChange?.(selectedPriority === 'low' ? null : 'low')
                  }
                  className={`w-9 h-7 rounded-xl text-[13px] font-black transition-all flex items-center justify-center ${
                    selectedPriority === 'low'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'bg-t2-hover  text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                  }`}
                >
                  v
                </button>
              </div>
            </div>

            {/* Zeile 2: Status */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-extrabold tracking-wider text-t2-ink-3 uppercase">
                Status
              </span>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_ITEMS.map(({ key, label }) => {
                  const isActive = selectedStatus === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => onStatusChange?.(isActive ? null : key)}
                      className={`rounded-xl text-[11px] font-bold px-3 py-1.5 transition-all ${
                        isActive
                          ? 'bg-t2-ink text-white  dark:text-neutral-900 shadow-sm'
                          : 'bg-t2-hover  text-t2-ink-2  hover:bg-t2-stage '
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optionale Zeile: Tags */}
            {tags && tags.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-extrabold tracking-wider text-t2-ink-3 uppercase">
                  Tag
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => {
                    const isActive = selectedTag === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => onTagChange?.(isActive ? null : tag)}
                        className={`rounded-xl text-[11px] font-bold px-3 py-1.5 transition-all ${
                          isActive
                            ? 'bg-t2-ink text-white  dark:text-neutral-900 shadow-sm'
                            : 'bg-t2-hover  text-t2-ink-2  hover:bg-t2-stage '
                        }`}
                      >
                        {tag.startsWith('#') ? tag : `#${tag}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Zeile 3: Datum */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold tracking-wider text-t2-ink-3 uppercase">
                  Datum
                </span>
                {formattedCustomDate && (
                  <span className="text-[11px] font-bold text-t2-accent ">
                    {formattedCustomDate}
                  </span>
                )}
              </div>
              <div className="bg-t2-hover  rounded-xl p-1 flex items-center">
                <button
                  type="button"
                  aria-pressed={dateFilter === 'all'}
                  onClick={() => onDateFilterChange?.('all')}
                  className={`flex-1 rounded-lg py-1 px-3 text-[11px] font-bold transition-all text-center ${
                    dateFilter === 'all'
                      ? 'bg-t2-ink text-white  dark:text-neutral-900 shadow-sm'
                      : 'text-t2-ink-2 hover:text-t2-ink '
                  }`}
                >
                  Alle
                </button>
                <span className="text-t2-ink-3  text-[11px] px-0.5 select-none">
                  |
                </span>
                <button
                  type="button"
                  aria-pressed={dateFilter === 'today'}
                  onClick={() => onDateFilterChange?.('today')}
                  className={`flex-1 rounded-lg py-1 px-3 text-[11px] font-bold transition-all text-center ${
                    dateFilter === 'today'
                      ? 'bg-t2-ink text-white  dark:text-neutral-900 shadow-sm'
                      : 'text-t2-ink-2 hover:text-t2-ink '
                  }`}
                >
                  Heute
                </button>
                <span className="text-t2-ink-3  text-[11px] px-0.5 select-none">
                  |
                </span>
                <button
                  type="button"
                  aria-pressed={dateFilter === 'tomorrow'}
                  onClick={() => onDateFilterChange?.('tomorrow')}
                  className={`flex-1 rounded-lg py-1 px-3 text-[11px] font-bold transition-all text-center ${
                    dateFilter === 'tomorrow'
                      ? 'bg-t2-ink text-white  dark:text-neutral-900 shadow-sm'
                      : 'text-t2-ink-2 hover:text-t2-ink '
                  }`}
                >
                  Morgen
                </button>
                <span className="text-t2-ink-3  text-[11px] px-0.5 select-none">
                  |
                </span>
                <label
                  title="Datum wählen"
                  className={`px-2.5 py-1 rounded-lg flex items-center justify-center transition-all relative cursor-pointer ${
                    isCustomDate
                      ? 'bg-t2-ink text-white  dark:text-neutral-900 shadow-sm'
                      : 'text-t2-ink-2 hover:text-t2-ink '
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  <input
                    type="date"
                    value={isCustomDate ? dateFilter : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        onDateFilterChange?.(e.target.value);
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    aria-label="Datum wählen"
                  />
                </label>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default MobileFilterPopover;
