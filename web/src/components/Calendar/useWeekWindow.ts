import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { addDays, format } from 'date-fns';
import {
  WEEK_RANGE,
  dateAtViewportCenter,
  dayColumnWidth,
  needsReanchor,
  scrollLeftForDate,
  startOfCalendarWeek,
  visibleWeekRange,
  weekIndexOf,
  weekStartAt,
  type WeekStart,
} from '@/lib/calendarWeeks';

export interface WeekWindow {
  weeks: Date[];
  leftSpacerPx: number;
  rightSpacerPx: number;
  range: { start: Date; end: Date };
}

interface UseWeekWindowParams {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  date: Date;
  onDateChange: (d: Date) => void;
  weekStartsOn: WeekStart;
  enabled: boolean;
}

type IndexRange = { first: number; last: number };
type Behavior = 'instant' | 'smooth';
type SmoothScroll = { left: number; retried: boolean; fallback: ReturnType<typeof setTimeout> };

/** User scrolling only reports a new date after this much rest. */
const SETTLE_MS = 150;
/** Programmatic jumps up to this many weeks animate; longer ones are instant. */
const SMOOTH_MAX_WEEKS = 4;
/** A programmatic smooth scroll that has not arrived by then is finished instantly. */
const SMOOTH_FALLBACK_MS = 1500;
const SCROLL_Y_KEY = 'tide_calendar_scroll_y';

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');
const sameRange = (a: IndexRange, b: IndexRange) => a.first === b.first && a.last === b.last;

function currentDayWidth(): number {
  return dayColumnWidth(typeof window === 'undefined' ? 1280 : window.innerWidth);
}

/** Restored vertical position, or two hours before now (previous default). */
export function initialScrollTop(): number {
  try {
    const raw = localStorage.getItem(SCROLL_Y_KEY);
    const saved = raw === null ? NaN : Number(raw);
    if (Number.isFinite(saved) && saved >= 0) return saved;
  } catch {
    // storage unavailable
  }
  const now = new Date();
  return Math.max(0, now.getHours() * 60 + now.getMinutes() - 120);
}

/** scrollLeft that centers `date` plus the week indices to render around it. */
function placementFor(p: {
  date: Date;
  anchor: Date;
  weekStartsOn: WeekStart;
  dayWidth: number;
  viewportWidth: number;
}): { left: number; range: IndexRange } {
  const viewportWidth = Math.max(0, p.viewportWidth);
  const left = Math.max(0, scrollLeftForDate({
    date: p.date,
    anchorWeekStart: p.anchor,
    weekStartsOn: p.weekStartsOn,
    dayWidth: p.dayWidth,
    viewportWidth,
  }));
  const range = visibleWeekRange({ scrollLeft: left, viewportWidth, weekWidth: 7 * p.dayWidth });
  return { left, range };
}

/**
 * Virtual week window for the infinite week view: weeks live at fixed positions
 * around an anchor week; only the visible weeks ± buffer are rendered, the rest
 * is covered by spacer widths. `date` (props) stays the single source of truth:
 * programmatic date changes scroll, settled user scrolling reports a new date.
 */
export function useWeekWindow({
  scrollContainerRef,
  date,
  onDateChange,
  weekStartsOn,
  enabled,
}: UseWeekWindowParams): WeekWindow {
  const [anchorSeed, setAnchorSeed] = useState(date);
  const anchor = useMemo(() => startOfCalendarWeek(anchorSeed, weekStartsOn), [anchorSeed, weekStartsOn]);
  const [dayWidth, setDayWidth] = useState(currentDayWidth);
  const [range, setRange] = useState<IndexRange>(() => placementFor({
    date,
    anchor: startOfCalendarWeek(date, weekStartsOn),
    weekStartsOn,
    dayWidth: currentDayWidth(),
    viewportWidth: typeof window === 'undefined' ? 1280 : window.innerWidth,
  }).range);

  const latest = useRef({ date, onDateChange, anchor, dayWidth, weekStartsOn });
  /** Day the hook itself reported; the echo coming back through props is not scrolled to. */
  const lastEmittedKeyRef = useRef<string | null>(null);
  /** Target of a running programmatic smooth scroll; its settle must not emit. */
  const smoothTargetRef = useRef<SmoothScroll | null>(null);

  // Must stay the first layout effect so later effects in this commit see fresh values.
  useLayoutEffect(() => {
    latest.current = { date, onDateChange, anchor, dayWidth, weekStartsOn };
  });

  const clearSmooth = useCallback(() => {
    const pending = smoothTargetRef.current;
    if (pending) clearTimeout(pending.fallback);
    smoothTargetRef.current = null;
  }, []);

  const startSmooth = useCallback((container: HTMLDivElement, left: number) => {
    clearSmooth();
    const pending: SmoothScroll = {
      left,
      retried: false,
      // A cancelled or stalled animation (no scroll events at all) still lands on the target.
      fallback: setTimeout(() => {
        if (smoothTargetRef.current !== pending) return;
        smoothTargetRef.current = null;
        if (Math.abs(container.scrollLeft - left) >= 1) container.scrollLeft = left;
      }, SMOOTH_FALLBACK_MS),
    };
    smoothTargetRef.current = pending;
    container.scrollTo({ left, behavior: 'smooth' });
  }, [clearSmooth]);

  const positionTo = useCallback((target: Date, behavior: Behavior) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { anchor: a, dayWidth: dw, weekStartsOn: ws } = latest.current;
    const { left, range: next } = placementFor({
      date: target, anchor: a, weekStartsOn: ws, dayWidth: dw, viewportWidth: container.clientWidth,
    });
    if (behavior === 'smooth') {
      // Render both the current and the target weeks while the animation runs.
      setRange((prev) => {
        const merged = { first: Math.min(prev.first, next.first), last: Math.max(prev.last, next.last) };
        return sameRange(prev, merged) ? prev : merged;
      });
      startSmooth(container, left);
    } else {
      setRange((prev) => (sameRange(prev, next) ? prev : next));
      clearSmooth();
      container.scrollLeft = left;
    }
  }, [scrollContainerRef, startSmooth, clearSmooth]);

  /** Moves the anchor to `target`'s week and renders the matching weeks in the same batch. */
  const reanchor = useCallback((target: Date) => {
    const container = scrollContainerRef.current;
    const { dayWidth: dw, weekStartsOn: ws } = latest.current;
    setAnchorSeed(target);
    setRange(placementFor({
      date: target,
      anchor: startOfCalendarWeek(target, ws),
      weekStartsOn: ws,
      dayWidth: dw,
      viewportWidth: container?.clientWidth ?? 0,
    }).range);
  }, [scrollContainerRef]);

  // Programmatic date changes (navigation, "Heute", links) scroll to the date.
  const dateTime = date.getTime();
  const prevDateTimeRef = useRef(dateTime);
  useLayoutEffect(() => {
    if (prevDateTimeRef.current === dateTime) return;
    prevDateTimeRef.current = dateTime;
    const { date: d, anchor: a, dayWidth: dw, weekStartsOn: ws } = latest.current;
    const key = dayKey(d);
    const isEcho = lastEmittedKeyRef.current === key;
    lastEmittedKeyRef.current = null;
    if (isEcho || !enabled) return;
    if (needsReanchor(d, a, ws)) {
      reanchor(d); // the anchor effect below positions without animation
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) return;
    const center = dateAtViewportCenter({
      scrollLeft: container.scrollLeft,
      viewportWidth: container.clientWidth,
      dayWidth: dw,
      anchorWeekStart: a,
      weekStartsOn: ws,
    });
    const weeksAway = Math.abs(weekIndexOf(d, a, ws) - weekIndexOf(center, a, ws));
    positionTo(d, weeksAway > SMOOTH_MAX_WEEKS ? 'instant' : 'smooth');
  }, [dateTime, enabled, positionTo, reanchor, scrollContainerRef]);

  // Anchor (re-anchor, week start) or column width changed: re-place instantly.
  const geometryKey = `${anchor.getTime()}:${dayWidth}`;
  const prevGeometryRef = useRef(geometryKey);
  useLayoutEffect(() => {
    if (prevGeometryRef.current === geometryKey) return;
    prevGeometryRef.current = geometryKey;
    if (enabled) positionTo(latest.current.date, 'instant');
  }, [geometryKey, enabled, positionTo]);

  // Initial placement whenever the week container (re)mounts.
  useLayoutEffect(() => {
    if (!enabled) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const { date: d, anchor: a, weekStartsOn: ws } = latest.current;
    container.scrollTop = initialScrollTop();
    if (needsReanchor(d, a, ws)) reanchor(d);
    else positionTo(d, 'instant');
  }, [enabled, positionTo, reanchor, scrollContainerRef]);

  // Scroll tracking: rendered range per frame, date report after rest.
  useEffect(() => {
    if (!enabled) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    let frame: number | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const updateRange = () => {
      frame = null;
      const next = visibleWeekRange({
        scrollLeft: container.scrollLeft,
        viewportWidth: Math.max(0, container.clientWidth),
        weekWidth: 7 * latest.current.dayWidth,
      });
      setRange((prev) => (sameRange(prev, next) ? prev : next));
    };

    const settle = () => {
      settleTimer = null;
      // Also refresh the range here in case animation frames are paused (background page).
      if (frame !== null) cancelAnimationFrame(frame);
      updateRange();
      if (container.clientWidth <= 0) return;
      const { date: d, anchor: a, dayWidth: dw, weekStartsOn: ws, onDateChange: emit } = latest.current;
      const pending = smoothTargetRef.current;
      if (pending) {
        // Programmatic scroll in progress: never report it as a date change.
        if (Math.abs(container.scrollLeft - pending.left) < dw / 2) {
          clearSmooth();
        } else if (!pending.retried) {
          // Another programmatic scroll (e.g. vertical) cut the animation short.
          pending.retried = true;
          container.scrollTo({ left: pending.left, behavior: 'smooth' });
        }
        return;
      }
      const center = dateAtViewportCenter({
        scrollLeft: container.scrollLeft,
        viewportWidth: container.clientWidth,
        dayWidth: dw,
        anchorWeekStart: a,
        weekStartsOn: ws,
      });
      const key = dayKey(center);
      if (key === dayKey(d)) return;
      lastEmittedKeyRef.current = key;
      emit(center);
    };

    const onScroll = () => {
      if (frame === null) frame = requestAnimationFrame(updateRange);
      if (settleTimer !== null) clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, SETTLE_MS);
    };
    // Real user input takes over from a running programmatic scroll.
    const onUserInput = () => clearSmooth();
    const inputEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

    container.addEventListener('scroll', onScroll, { passive: true });
    inputEvents.forEach((t) => container.addEventListener(t, onUserInput, { passive: true }));
    return () => {
      container.removeEventListener('scroll', onScroll);
      inputEvents.forEach((t) => container.removeEventListener(t, onUserInput));
      if (frame !== null) cancelAnimationFrame(frame);
      if (settleTimer !== null) clearTimeout(settleTimer);
      clearSmooth();
    };
  }, [enabled, scrollContainerRef, clearSmooth]);

  // Column width follows the viewport breakpoints, also while another view is shown,
  // so the week container is placed with the right width when it mounts again.
  useEffect(() => {
    const onResize = () => setDayWidth((prev) => {
      const next = currentDayWidth();
      return next === prev ? prev : next;
    });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Container width changes (sidebar, window) re-center the date.
  useEffect(() => {
    if (!enabled) return;
    const container = scrollContainerRef.current;
    let observer: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== 'undefined') {
      let lastWidth = container.clientWidth;
      observer = new ResizeObserver(() => {
        if (container.clientWidth === lastWidth) return;
        lastWidth = container.clientWidth;
        positionTo(latest.current.date, 'instant');
      });
      observer.observe(container);
    }
    return () => observer?.disconnect();
  }, [enabled, positionTo, scrollContainerRef]);

  return useMemo(() => {
    const last = Math.max(range.first, range.last);
    const weeks: Date[] = [];
    for (let i = range.first; i <= last; i++) weeks.push(weekStartAt(anchor, i));
    const weekWidth = 7 * dayWidth;
    return {
      weeks,
      leftSpacerPx: (range.first + WEEK_RANGE) * weekWidth,
      rightSpacerPx: (WEEK_RANGE - last) * weekWidth,
      range: { start: weeks[0], end: addDays(weeks[weeks.length - 1], 7) },
    };
  }, [anchor, range, dayWidth]);
}
