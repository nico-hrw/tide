import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { addDays, addWeeks, isSameDay } from 'date-fns';
import {
  WEEK_RANGE,
  dayColumnWidth,
  scrollLeftForDate,
  startOfCalendarWeek,
  weekIndexOf,
  type WeekStart,
} from '@/lib/calendarWeeks';
import { useWeekWindow, type WeekWindow } from '../useWeekWindow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface FakeContainer {
  el: HTMLDivElement;
  setScrollLeft: (v: number) => void;
  getScrollLeft: () => number;
}

function makeContainer(width: number): FakeContainer {
  const el = document.createElement('div');
  let scrollLeft = 0;
  let scrollTop = 0;
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(el, 'scrollLeft', {
    configurable: true,
    get: () => scrollLeft,
    set: (v: number) => { scrollLeft = v; },
  });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (v: number) => { scrollTop = v; },
  });
  el.scrollTo = ((opts?: ScrollToOptions) => {
    if (opts && typeof opts.left === 'number') scrollLeft = opts.left;
    if (opts && typeof opts.top === 'number') scrollTop = opts.top;
  }) as typeof el.scrollTo;
  return { el, setScrollLeft: (v) => { scrollLeft = v; }, getScrollLeft: () => scrollLeft };
}

interface HarnessProps {
  date: Date;
  weekStartsOn: WeekStart;
  enabled?: boolean;
  onDateChange: (d: Date) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onResult: (win: WeekWindow) => void;
}

function Harness({ date, weekStartsOn, enabled = true, onDateChange, containerRef, onResult }: HarnessProps) {
  onResult(useWeekWindow({
    scrollContainerRef: containerRef,
    date,
    onDateChange,
    weekStartsOn,
    enabled,
  }));
  return null;
}

describe('useWeekWindow', () => {
  let root: Root;
  let host: HTMLDivElement;
  const out: { current: WeekWindow | null } = { current: null };
  const dayWidth = () => dayColumnWidth(window.innerWidth);
  const MOUNT_DATE = new Date(2026, 10, 18); // Wed 2026-11-18

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 16) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    out.current = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  type ExtraProps = Partial<Omit<HarnessProps, 'onResult' | 'containerRef'>>;

  function mount(container: FakeContainer, props: ExtraProps = {}) {
    const onDateChange = props.onDateChange ?? vi.fn();
    const ref = { current: container.el };
    const onResult = (win: WeekWindow) => { out.current = win; };
    const render = (p: ExtraProps) =>
      act(() => {
        root.render(React.createElement(Harness, {
          date: MOUNT_DATE,
          weekStartsOn: 1,
          onDateChange,
          containerRef: ref,
          onResult,
          ...props,
          ...p,
        }));
      });
    render({});
    return { onDateChange, rerender: render };
  }

  function fireScroll(container: FakeContainer) {
    act(() => { container.el.dispatchEvent(new Event('scroll')); });
  }

  function advance(ms: number) {
    act(() => { vi.advanceTimersByTime(ms); });
  }

  it('renders the week of `date` on mount with a spacer matching the anchor convention', () => {
    const c = makeContainer(1200);
    mount(c);
    const win = out.current!;
    const anchor = startOfCalendarWeek(MOUNT_DATE, 1);
    expect(win.weeks.some((w) => isSameDay(w, new Date(2026, 10, 16)))).toBe(true);
    expect(win.leftSpacerPx).toBe((weekIndexOf(win.weeks[0], anchor, 1) + WEEK_RANGE) * 7 * dayWidth());
    expect(win.range.start).toEqual(win.weeks[0]);
    expect(win.range.end).toEqual(addDays(win.weeks[win.weeks.length - 1], 7));
    expect(c.getScrollLeft()).toBe(scrollLeftForDate({
      date: MOUNT_DATE, anchorWeekStart: anchor, weekStartsOn: 1, dayWidth: dayWidth(), viewportWidth: 1200,
    }));
  });

  it('scrolls on a programmatic date change without calling onDateChange', () => {
    const c = makeContainer(1200);
    const { onDateChange, rerender } = mount(c);
    const anchor = startOfCalendarWeek(MOUNT_DATE, 1);

    const near = addWeeks(MOUNT_DATE, 10);
    rerender({ date: near });
    expect(c.getScrollLeft()).toBe(scrollLeftForDate({
      date: near, anchorWeekStart: anchor, weekStartsOn: 1, dayWidth: dayWidth(), viewportWidth: 1200,
    }));
    fireScroll(c);
    advance(400);

    const far = addWeeks(MOUNT_DATE, 40);
    rerender({ date: far });
    expect(c.getScrollLeft()).toBe(scrollLeftForDate({
      date: far, anchorWeekStart: startOfCalendarWeek(far, 1), weekStartsOn: 1, dayWidth: dayWidth(), viewportWidth: 1200,
    }));
    fireScroll(c);
    advance(400);

    expect(onDateChange).not.toHaveBeenCalled();
  });

  it('emits the viewport-center date exactly once after 150 ms of scroll rest', () => {
    const c = makeContainer(1200);
    const { onDateChange, rerender } = mount(c);
    const start = c.getScrollLeft();

    c.setScrollLeft(start + 5 * 7 * dayWidth());
    fireScroll(c);
    advance(100);
    // Not day-aligned on purpose: an echo re-scroll would snap back to the day center.
    c.setScrollLeft(start + 10 * 7 * dayWidth() + 0.3 * dayWidth());
    fireScroll(c);
    advance(100);
    expect(onDateChange).not.toHaveBeenCalled();

    advance(60);
    expect(onDateChange).toHaveBeenCalledTimes(1);
    const emitted = vi.mocked(onDateChange).mock.calls[0][0] as Date;
    expect(isSameDay(emitted, addDays(MOUNT_DATE, 70))).toBe(true);

    // Parent feeds the emitted date back: no programmatic re-scroll, no second emit.
    const before = c.getScrollLeft();
    rerender({ date: emitted });
    expect(c.getScrollLeft()).toBe(before);
    advance(400);
    expect(onDateChange).toHaveBeenCalledTimes(1);
  });

  it('finishes a stalled smooth jump (<= 4 weeks) without reporting it as a date change', () => {
    const c = makeContainer(1200);
    const { onDateChange, rerender } = mount(c);
    // Simulate a smooth animation that never progresses (cancelled / hidden page).
    c.el.scrollTo = (() => {}) as typeof c.el.scrollTo;
    const before = c.getScrollLeft();
    const near = addWeeks(MOUNT_DATE, 2);
    rerender({ date: near });
    expect(c.getScrollLeft()).toBe(before);
    // A scroll event (e.g. vertical) while the jump is pending must not emit.
    fireScroll(c);
    advance(400);
    expect(onDateChange).not.toHaveBeenCalled();
    advance(1200);
    expect(c.getScrollLeft()).toBe(scrollLeftForDate({
      date: near, anchorWeekStart: startOfCalendarWeek(MOUNT_DATE, 1), weekStartsOn: 1,
      dayWidth: dayWidth(), viewportWidth: 1200,
    }));
    fireScroll(c);
    advance(400);
    expect(onDateChange).not.toHaveBeenCalled();
  });

  it('re-anchors on jumps beyond the max anchor offset', () => {
    const c = makeContainer(1200);
    const { rerender } = mount(c);
    const target = addWeeks(MOUNT_DATE, 60);
    rerender({ date: target });
    const win = out.current!;
    const targetWeek = startOfCalendarWeek(target, 1);
    expect(win.weeks.some((w) => isSameDay(w, targetWeek))).toBe(true);
    expect(Math.abs(weekIndexOf(win.weeks[0], targetWeek, 1))).toBeLessThanOrEqual(4);
    expect(c.getScrollLeft()).toBe(scrollLeftForDate({
      date: target, anchorWeekStart: targetWeek, weekStartsOn: 1, dayWidth: dayWidth(), viewportWidth: 1200,
    }));
  });

  it('re-anchors to the week of `date` when weekStartsOn changes', () => {
    const c = makeContainer(1200);
    const { rerender } = mount(c);
    rerender({ weekStartsOn: 0 });
    const win = out.current!;
    expect(win.weeks.every((w) => w.getDay() === 0)).toBe(true);
    expect(win.range.start.getTime()).toBeLessThanOrEqual(MOUNT_DATE.getTime());
    expect(win.range.end.getTime()).toBeGreaterThan(MOUNT_DATE.getTime());
    expect(c.getScrollLeft()).toBe(scrollLeftForDate({
      date: MOUNT_DATE, anchorWeekStart: startOfCalendarWeek(MOUNT_DATE, 0), weekStartsOn: 0,
      dayWidth: dayWidth(), viewportWidth: 1200,
    }));
  });

  it('uses the current column width when the week view is enabled again after a resize', () => {
    const c = makeContainer(1200);
    const { rerender } = mount(c);
    const originalWidth = window.innerWidth;
    rerender({ enabled: false });
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 });
      act(() => { window.dispatchEvent(new Event('resize')); });
      rerender({ enabled: true });
      expect(c.getScrollLeft()).toBe(scrollLeftForDate({
        date: MOUNT_DATE, anchorWeekStart: startOfCalendarWeek(MOUNT_DATE, 1), weekStartsOn: 1,
        dayWidth: dayColumnWidth(1400), viewportWidth: 1200,
      }));
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    }
  });

  it('copes with a zero-width container', () => {
    const c = makeContainer(0);
    const { onDateChange } = mount(c);
    const win = out.current!;
    expect(Number.isNaN(win.leftSpacerPx)).toBe(false);
    expect(Number.isNaN(win.rightSpacerPx)).toBe(false);
    expect(win.weeks.length).toBeGreaterThanOrEqual(1);
    c.setScrollLeft(c.getScrollLeft() + 7 * dayWidth());
    fireScroll(c);
    advance(400);
    expect(onDateChange).not.toHaveBeenCalled();
  });
});
