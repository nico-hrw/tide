import { beforeAll, describe, expect, it } from 'vitest';
import { addDays, differenceInCalendarDays, isSameDay } from 'date-fns';
import {
  RENDER_BUFFER_WEEKS,
  TIME_GUTTER_PX,
  WEEK_RANGE,
  dateAtViewportCenter,
  dayColumnWidth,
  needsReanchor,
  parseStoredCalendarDate,
  scrollLeftForColumn,
  serializeCalendarDate,
  scrollLeftForDate,
  startOfCalendarWeek,
  visibleWeekRange,
  weekIndexOf,
  weekStartAt,
  weeksForViewMode,
} from '../calendarWeeks';

beforeAll(() => {
  process.env.TZ = 'Europe/Berlin';
});

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('startOfCalendarWeek', () => {
  it('returns Monday for weekStartsOn 1', () => {
    const r = startOfCalendarWeek(new Date(2026, 10, 18, 15, 30), 1);
    expect(ymd(r)).toBe('2026-11-16');
    expect(r.getHours()).toBe(0);
  });
  it('returns Sunday for weekStartsOn 0', () => {
    expect(ymd(startOfCalendarWeek(new Date(2026, 10, 18), 0))).toBe('2026-11-15');
  });
});

describe('weekIndexOf', () => {
  const anchor = new Date(2026, 11, 28);
  it('counts weeks relative to the anchor', () => {
    expect(weekIndexOf(new Date(2027, 0, 4), anchor, 1)).toBe(1);
    expect(weekIndexOf(new Date(2026, 11, 27), anchor, 1)).toBe(-1);
    expect(weekIndexOf(anchor, anchor, 1)).toBe(0);
  });
});

describe('weekStartAt', () => {
  it('stays on local midnight across daylight saving time', () => {
    const anchor = new Date(2026, 2, 23);
    const results = [-3, -2, -1, 0, 1, 2, 3].map((i) => weekStartAt(anchor, i));
    results.forEach((d) => expect(d.getHours()).toBe(0));
    for (let i = 1; i < results.length; i++) {
      expect(differenceInCalendarDays(results[i], results[i - 1])).toBe(7);
    }
  });
});

describe('dayColumnWidth', () => {
  it('follows the breakpoints', () => {
    expect(dayColumnWidth(767)).toBe(140);
    expect(dayColumnWidth(768)).toBe(155);
    expect(dayColumnWidth(1023)).toBe(155);
    expect(dayColumnWidth(1024)).toBe(185);
    expect(dayColumnWidth(1279)).toBe(185);
    expect(dayColumnWidth(1280)).toBe(210);
  });
});

describe('visibleWeekRange', () => {
  const weekWidth = 7 * 185;
  it('includes index 0 and the buffer at the anchor', () => {
    const { first, last } = visibleWeekRange({
      scrollLeft: TIME_GUTTER_PX + WEEK_RANGE * weekWidth,
      viewportWidth: 1100,
      weekWidth,
    });
    expect(first).toBeLessThanOrEqual(0);
    expect(last).toBeGreaterThanOrEqual(0);
    expect(Math.abs(last - first - (1 + 2 * RENDER_BUFFER_WEEKS))).toBeLessThanOrEqual(1);
  });
  it('clamps extreme values', () => {
    const low = visibleWeekRange({ scrollLeft: -1e9, viewportWidth: 1100, weekWidth });
    const high = visibleWeekRange({ scrollLeft: 1e12, viewportWidth: 1100, weekWidth });
    expect(low.first).toBe(-WEEK_RANGE);
    expect(high.last).toBe(WEEK_RANGE);
    expect(low.last).toBeLessThanOrEqual(WEEK_RANGE);
    expect(high.first).toBeGreaterThanOrEqual(-WEEK_RANGE);
  });
  it('handles weekWidth 0 without NaN', () => {
    expect(visibleWeekRange({ scrollLeft: 100, viewportWidth: 500, weekWidth: 0 })).toEqual({
      first: 0,
      last: 0,
    });
  });
});

describe('scrollLeftForDate / dateAtViewportCenter round trip', () => {
  it('recovers every day of a week at several indices', () => {
    const anchor = new Date(2026, 2, 23);
    const dayWidth = 185;
    const viewportWidth = 1100;
    for (const idx of [-500, 0, 500]) {
      const weekStart = weekStartAt(anchor, idx);
      for (let d = 0; d < 7; d++) {
        const date = addDays(weekStart, d);
        const scrollLeft = scrollLeftForDate({
          date,
          anchorWeekStart: anchor,
          weekStartsOn: 1,
          dayWidth,
          viewportWidth,
        });
        const back = dateAtViewportCenter({
          scrollLeft,
          viewportWidth,
          dayWidth,
          anchorWeekStart: anchor,
          weekStartsOn: 1,
        });
        expect(isSameDay(back, date)).toBe(true);
      }
    }
  });
});

describe('needsReanchor', () => {
  const anchor = new Date(2026, 2, 23);
  it('is false at 26 weeks and true at 27', () => {
    expect(needsReanchor(weekStartAt(anchor, 26), anchor, 1)).toBe(false);
    expect(needsReanchor(weekStartAt(anchor, 27), anchor, 1)).toBe(true);
    expect(needsReanchor(weekStartAt(anchor, -27), anchor, 1)).toBe(true);
  });
});

describe('weeksForViewMode', () => {
  it('month: 6 weeks starting at the week of the first of the month', () => {
    const weeks = weeksForViewMode(new Date(2026, 10, 18), 'month', 1);
    expect(weeks).toHaveLength(6);
    expect(ymd(weeks[0])).toBe('2026-10-26');
    for (let i = 1; i < weeks.length; i++) {
      expect(differenceInCalendarDays(weeks[i], weeks[i - 1])).toBe(7);
    }
  });
  it('continuous: 8 weeks starting one week before date', () => {
    const weeks = weeksForViewMode(new Date(2026, 10, 18), 'continuous', 1);
    expect(weeks).toHaveLength(8);
    expect(ymd(weeks[0])).toBe('2026-11-09');
  });
});

describe('scrollLeftForColumn', () => {
  // Regression: the old DOM formula `colLeft - cw/2 + colW/2 - 30` ignored the 60px gutter,
  // so at 155px columns the viewport center fell into the previous day.
  it.each([140, 155, 185, 210])('puts the column day under the viewport center (%ipx columns)', (dayWidth) => {
    const anchor = startOfCalendarWeek(new Date(2026, 10, 18), 1);
    const viewportWidth = 900;
    for (const dayOffset of [-9, 0, 2, 17]) {
      const day = addDays(anchor, dayOffset);
      const columnOffsetLeft = (WEEK_RANGE * 7 + dayOffset) * dayWidth;
      const scrollLeft = scrollLeftForColumn({ columnOffsetLeft, columnWidth: dayWidth, viewportWidth });
      expect(scrollLeft).toBeCloseTo(scrollLeftForDate({ date: day, anchorWeekStart: anchor, weekStartsOn: 1, dayWidth, viewportWidth }));
      const center = dateAtViewportCenter({ scrollLeft, viewportWidth, dayWidth, anchorWeekStart: anchor, weekStartsOn: 1 });
      expect(ymd(center)).toBe(ymd(day));
    }
  });

  it('differs from the old formula, which lands on the previous day at 155px', () => {
    const anchor = startOfCalendarWeek(new Date(2026, 10, 18), 1);
    const dayWidth = 155;
    const viewportWidth = 900;
    const columnOffsetLeft = WEEK_RANGE * 7 * dayWidth;
    const oldScrollLeft = columnOffsetLeft - viewportWidth / 2 + dayWidth / 2 - 30;
    const oldCenter = dateAtViewportCenter({ scrollLeft: oldScrollLeft, viewportWidth, dayWidth, anchorWeekStart: anchor, weekStartsOn: 1 });
    expect(ymd(oldCenter)).toBe(ymd(addDays(anchor, -1)));
  });
});

describe('stored calendar date', () => {
  it('round-trips through serialize/parse', () => {
    const d = new Date(2026, 11, 9, 14, 30);
    expect(parseStoredCalendarDate(serializeCalendarDate(d))?.getTime()).toBe(d.getTime());
  });

  it('returns null for missing or invalid values', () => {
    expect(parseStoredCalendarDate(null)).toBeNull();
    expect(parseStoredCalendarDate('')).toBeNull();
    expect(parseStoredCalendarDate('not a date')).toBeNull();
  });
});
