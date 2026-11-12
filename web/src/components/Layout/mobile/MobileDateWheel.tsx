import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { format, addDays, isSameDay, isAfter } from 'date-fns';
import { de } from 'date-fns/locale';
import { ArrowRight, ArrowLeft } from 'lucide-react';

const T = {
  bg:     'var(--background)',
  card:   'var(--sidebar-bg)',
  pri:    'var(--foreground)',
  sec:    'var(--muted-text)',
  mut:    'var(--text-subtle)',
  brd:    'var(--border-color)',
  hov:    'var(--hover-bg)',
  accent: '#3B82F6',
  danger: '#EF4444',
} as const;

export const getDayDiff = (d1: Date, d2: Date): number => {
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.round((utc1 - utc2) / 86_400_000);
};

export interface AppleDateWheelProps {
  activeDate: Date;
  onSelectDate: (d: Date) => void;
  now: Date;
  theme: string;
  onMonthChange?: (monthYear: string) => void;
}

export const AppleDateWheel = React.memo(function AppleDateWheel({
  activeDate,
  onSelectDate,
  now,
  theme,
  onMonthChange,
}: AppleDateWheelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const monthLabelRef = useRef<HTMLSpanElement>(null);
  const currentMonthLabelRef = useRef<string>(format(activeDate, 'MMMM yyyy', { locale: de }));
  const onMonthChangeRef = useRef(onMonthChange);
  useEffect(() => {
    onMonthChangeRef.current = onMonthChange;
  }, [onMonthChange]);

  const [wheelAnchor, setWheelAnchor] = useState<Date>(() => now);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProgrammaticScroll = useRef(false);
  const programmaticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressActiveDateScrollRef = useRef(false);
  const isUserTouching = useRef(false);
  const rafId = useRef<number | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  const [prevActive, setPrevActive] = useState<Date>(activeDate);

  // Sync month label when activeDate changes
  useEffect(() => {
    const label = format(activeDate, 'MMMM yyyy', { locale: de });
    currentMonthLabelRef.current = label;
    if (monthLabelRef.current) {
      monthLabelRef.current.textContent = label;
    }
    onMonthChangeRef.current?.(label);
  }, [activeDate]);

  // If activeDate moves far away (e.g. navigated via another view > 90 days), re-anchor smoothly
  if (activeDate !== prevActive) {
    setPrevActive(activeDate);
    const diff = Math.abs(getDayDiff(activeDate, wheelAnchor));
    if (diff > 90) {
      setWheelAnchor(activeDate);
    }
  }

  // Generous ±120 days (241 days total, ~8 months) so normal and far scrolling never hits an abrupt re-anchor jump
  const days = useMemo(() => {
    return Array.from({ length: 241 }, (_, i) => addDays(wheelAnchor, i - 120));
  }, [wheelAnchor]);

  const daysRef = useRef(days);
  useEffect(() => {
    daysRef.current = days;
  }, [days]);

  const activeDateRef = useRef(activeDate);
  useEffect(() => {
    activeDateRef.current = activeDate;
  }, [activeDate]);

  const onSelectDateRef = useRef(onSelectDate);
  useEffect(() => {
    onSelectDateRef.current = onSelectDate;
  }, [onSelectDate]);

  const itemMetricsRef = useRef({
    itemOffset: 0,
    itemWidth: 44,
    itemStride: 48,
  });
  const hasMeasuredRef = useRef(false);
  const lastMagnifiedIndicesRef = useRef<Set<number>>(new Set());

  const measureMetrics = useCallback(() => {
    const container = containerRef.current;
    if (!container || container.children.length === 0) return;
    const first = container.children[0] as HTMLElement | undefined;
    const second = container.children[1] as HTMLElement | undefined;
    if (first) {
      const itemOffset = first.offsetLeft;
      const itemWidth = first.offsetWidth || 44;
      const itemStride = second ? (second.offsetLeft - first.offsetLeft) : 48;
      itemMetricsRef.current = {
        itemOffset,
        itemWidth,
        itemStride: itemStride || 48,
      };
      hasMeasuredRef.current = true;
    }
  }, []);

  useEffect(() => {
    hasMeasuredRef.current = false;
    lastMagnifiedIndicesRef.current.clear();
  }, [wheelAnchor]);

  // Real-time magnifier function (runs on every scroll frame)
  const updateMagnifier = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!hasMeasuredRef.current && container.children.length > 0) {
      measureMetrics();
    }

    const { itemOffset, itemWidth, itemStride } = itemMetricsRef.current;
    const containerWidth = container.clientWidth;
    const centerOffset = container.scrollLeft + containerWidth / 2;
    const children = container.children;
    const totalChildren = children.length;
    if (totalChildren === 0) return;

    const radius = 110; // lens influence radius in px
    const span = Math.ceil(radius / itemStride); // ~3 items to left and right

    const rawCenterIndex = Math.round((centerOffset - itemOffset - itemWidth / 2) / itemStride);
    const centerIndex = Math.max(0, Math.min(totalChildren - 1, rawCenterIndex));
    const minIdx = Math.max(0, centerIndex - span);
    const maxIdx = Math.min(totalChildren - 1, centerIndex + span);

    const newMagnifiedIndices = new Set<number>();
    let closestIndex = centerIndex;
    let minDistance = Infinity;

    for (let i = minIdx; i <= maxIdx; i++) {
      const childCenter = itemOffset + i * itemStride + itemWidth / 2;
      const dist = Math.abs(childCenter - centerOffset);

      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }

      const child = children[i] as HTMLElement | undefined;
      if (!child) continue;

      if (dist < radius) {
        // Cosine bell curve: 1 at exact center, 0 at edge
        const curve = (Math.cos((dist / radius) * Math.PI) + 1) / 2;
        const scale = 0.72 + curve * 0.60; // 0.72 to 1.32 (larger zoom)
        const opacity = 0.35 + curve * 0.65; // 0.35 to 1.00
        child.style.transform = `scale(${scale.toFixed(3)})`;
        child.style.opacity = opacity.toFixed(3);
        newMagnifiedIndices.add(i);
      } else {
        child.style.transform = 'scale(0.72)';
        child.style.opacity = '0.35';
      }
    }

    // Reset items that were magnified in previous frames but are now outside the lens
    lastMagnifiedIndicesRef.current.forEach(prevIdx => {
      if (!newMagnifiedIndices.has(prevIdx)) {
        const child = children[prevIdx] as HTMLElement | undefined;
        if (child) {
          child.style.transform = 'scale(0.72)';
          child.style.opacity = '0.35';
        }
      }
    });

    lastMagnifiedIndicesRef.current = newMagnifiedIndices;

    const closestDate = daysRef.current[closestIndex];
    if (closestDate) {
      const newMonthLabel = format(closestDate, 'MMMM yyyy', { locale: de });
      if (newMonthLabel !== currentMonthLabelRef.current) {
        currentMonthLabelRef.current = newMonthLabel;
        if (monthLabelRef.current) {
          monthLabelRef.current.textContent = newMonthLabel;
        }
        onMonthChangeRef.current?.(newMonthLabel);
      }
    }
  }, [measureMetrics]);

  useEffect(() => {
    const handleResize = () => {
      measureMetrics();
      updateMagnifier();
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [measureMetrics, updateMagnifier]);

  // Programmatic centering on activeDate change
  useEffect(() => {
    if (suppressActiveDateScrollRef.current) {
      suppressActiveDateScrollRef.current = false;
      return;
    }

    const key = format(activeDate, 'yyyy-MM-dd');
    const container = containerRef.current;
    if (!container) return;

    const el = document.getElementById(`wheel-date-${key}`);
    if (!el) return;

    if (!mountedRef.current) {
      // First mount: instant centering without smooth animation
      mountedRef.current = true;
      measureMetrics();
      const containerWidth = container.clientWidth;
      container.scrollLeft = el.offsetLeft - containerWidth / 2 + el.offsetWidth / 2;
      requestAnimationFrame(updateMagnifier);
      return;
    }

    if (!isUserTouching.current) {
      isProgrammaticScroll.current = true;
      if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);
      const containerWidth = container.clientWidth;
      const targetScrollLeft = el.offsetLeft - containerWidth / 2 + el.offsetWidth / 2;
      container.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
      programmaticTimerRef.current = setTimeout(() => {
        isProgrammaticScroll.current = false;
        updateMagnifier();
      }, 350);
    }
  }, [activeDate, measureMetrics, updateMagnifier]);

  // Scroll handler for real-time lens + debounced snap when user scrolls manually
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onTouchStart = () => {
      isUserTouching.current = true;
      isProgrammaticScroll.current = false;
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };

    const triggerAutoSelect = () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      // Clean 140ms debounce after momentum/scrolling settles completely
      scrollTimerRef.current = setTimeout(() => {
        if (isProgrammaticScroll.current || isUserTouching.current) return;
        const c = containerRef.current;
        if (!c) return;

        const { itemOffset, itemWidth, itemStride } = itemMetricsRef.current;
        const containerWidth = c.clientWidth;
        const centerOffset = c.scrollLeft + containerWidth / 2;
        const rawCenterIndex = Math.round((centerOffset - itemOffset - itemWidth / 2) / itemStride);
        const closestIndex = Math.max(0, Math.min(daysRef.current.length - 1, rawCenterIndex));

        const d = daysRef.current[closestIndex];
        if (d && !isSameDay(d, activeDateRef.current)) {
          suppressActiveDateScrollRef.current = true;
          onSelectDateRef.current(d);
        }

        const targetScrollLeft = itemOffset + closestIndex * itemStride + itemWidth / 2 - containerWidth / 2;
        if (Math.abs(c.scrollLeft - targetScrollLeft) > 2) {
          isProgrammaticScroll.current = true;
          c.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
          if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);
          programmaticTimerRef.current = setTimeout(() => {
            isProgrammaticScroll.current = false;
            updateMagnifier();
          }, 300);
        }
      }, 140);
    };

    const onTouchEnd = () => {
      isUserTouching.current = false;
      triggerAutoSelect();
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        if (monthLabelRef.current) {
          monthLabelRef.current.style.opacity = '0';
        }
      }, 700);
    };

    const onScroll = () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(updateMagnifier);

      if (!isProgrammaticScroll.current) {
        if (monthLabelRef.current) {
          monthLabelRef.current.style.opacity = '1';
        }
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = setTimeout(() => {
          if (!isUserTouching.current && monthLabelRef.current) {
            monthLabelRef.current.style.opacity = '0';
          }
        }, 700);

        triggerAutoSelect();
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    container.addEventListener('touchcancel', onTouchEnd, { passive: true });
    container.addEventListener('pointerdown', onTouchStart, { passive: true });
    container.addEventListener('pointerup', onTouchEnd, { passive: true });
    container.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
      container.removeEventListener('pointerdown', onTouchStart);
      container.removeEventListener('pointerup', onTouchEnd);
      container.removeEventListener('scroll', onScroll);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [updateMagnifier]);

  return (
    <div className="flex items-center gap-2 px-3 pb-1 w-full min-w-0">
      <div className="flex-1 min-w-0 flex flex-col relative">
        {/* Live Month & Year indicator directly above wheel */}
        <div className="flex items-center justify-between px-1 pb-1 min-h-[20px]">
          <div className="flex items-center gap-1.5">
            <span
              ref={monthLabelRef}
              className="text-[11px] font-black tracking-wider uppercase pointer-events-none"
              style={{
                color: theme === 'dark' ? '#ffffff' : '#000000',
                fontWeight: 900,
                opacity: 0,
                transition: 'opacity 200ms ease-out',
              }}
            >
              {format(activeDate, 'MMMM yyyy', { locale: de })}
            </span>
          </div>
        </div>

        <div
          ref={containerRef}
          className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1 w-full select-none"
          style={{
            WebkitOverflowScrolling: 'touch',
          }}
          onWheel={e => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
            e.preventDefault();
            if (e.deltaY > 0) onSelectDate(addDays(activeDate, 1));
            else if (e.deltaY < 0) onSelectDate(addDays(activeDate, -1));
          }}
        >
          {days.map(d => {
            const diff = Math.abs(getDayDiff(d, activeDate));
            const isSelected = diff === 0;
            const isTodayDate = isSameDay(d, now);
            const initialScale = isSelected ? 1.32 : diff === 1 ? 0.95 : diff === 2 ? 0.80 : 0.72;
            const initialOpacity = isSelected ? 1 : diff === 1 ? 0.75 : diff === 2 ? 0.50 : 0.35;

            return (
              <button
                key={d.toISOString()}
                id={`wheel-date-${format(d, 'yyyy-MM-dd')}`}
                onClick={() => {
                  isProgrammaticScroll.current = true;
                  suppressActiveDateScrollRef.current = true;
                  onSelectDate(d);
                  const el = document.getElementById(`wheel-date-${format(d, 'yyyy-MM-dd')}`);
                  const container = containerRef.current;
                  if (el && container) {
                    const target = el.offsetLeft - container.clientWidth / 2 + el.offsetWidth / 2;
                    container.scrollTo({ left: target, behavior: 'smooth' });
                  }
                  setTimeout(() => {
                    isProgrammaticScroll.current = false;
                    updateMagnifier();
                  }, 350);
                }}
                className="flex flex-col items-center justify-center shrink-0 rounded-2xl active:scale-95"
                style={{
                  width: 44,
                  height: 52,
                  transform: `scale(${initialScale})`,
                  opacity: initialOpacity,
                  background: 'transparent',
                  border: 'none',
                  color: isSelected
                    ? (theme === 'dark' ? '#ffffff' : '#09090b')
                    : (theme === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'),
                }}
              >
                <span
                  className="text-[10px] uppercase tracking-wider"
                  style={{
                    color: isTodayDate
                      ? (theme === 'dark' ? '#ffffff' : '#000000')
                      : isSelected
                      ? (theme === 'dark' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.7)')
                      : T.mut,
                    fontWeight: isTodayDate ? 800 : 700,
                  }}
                >
                  {format(d, 'EEE', { locale: de })}
                </span>
                <span
                  className="text-lg leading-none mt-0.5"
                  style={{
                    color: isTodayDate
                      ? (theme === 'dark' ? '#ffffff' : '#000000')
                      : isSelected
                      ? (theme === 'dark' ? '#ffffff' : '#09090b')
                      : (theme === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'),
                    fontWeight: isTodayDate ? 900 : (isSelected ? 900 : 700),
                  }}
                >
                  {format(d, 'd')}
                </span>
              </button>
            );
          })}
        </div>

        {/* Small rounded indicator triangle centered directly beneath the active date (Apple timer style) */}
        <div className="flex justify-center pointer-events-none -mt-0.5 pb-0.5">
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path
              d="M4.15 0.85C4.55 0.25 5.45 0.25 5.85 0.85L9.15 5.2C9.6 5.8 9.15 6 8.35 6H1.65C0.85 6 0.4 5.8 0.85 5.2L4.15 0.85Z"
              fill={theme === 'dark' ? '#ffffff' : '#000000'}
            />
          </svg>
        </div>
      </div>

      {!isSameDay(activeDate, now) && (
        <button
          onClick={() => onSelectDate(now)}
          className="w-8 h-8 flex items-center justify-center rounded-xl shrink-0 transition-transform active:scale-90"
          style={{
            background: theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
            color: theme === 'dark' ? '#9ca3af' : '#4b5563',
            border: `1px solid ${T.brd}`,
          }}
          title={isAfter(now, activeDate) ? 'Vor zu Heute' : 'Zurück zu Heute'}
        >
          {isAfter(now, activeDate) ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
        </button>
      )}
    </div>
  );
});

export const MobileDateWheel = AppleDateWheel;
export default MobileDateWheel;
