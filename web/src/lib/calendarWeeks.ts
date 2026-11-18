import {
  addDays,
  addWeeks,
  differenceInCalendarDays,
  differenceInCalendarWeeks,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

export type WeekStart = 0 | 1;

/** Rotates a Monday-first label array so it starts with the configured first weekday. */
export function rotateWeekdayLabels<T>(mondayFirst: readonly T[], weekStartsOn: WeekStart): T[] {
  const offset = weekStartsOn === 0 ? mondayFirst.length - 1 : 0;
  return [...mondayFirst.slice(offset), ...mondayFirst.slice(0, offset)];
}

export const WEEK_RANGE = 520;
export const RENDER_BUFFER_WEEKS = 2;
export const MAX_ANCHOR_OFFSET_WEEKS = 26;
export const TIME_GUTTER_PX = 60;

/** Local midnight of the first day of the week containing `date`. */
export function startOfCalendarWeek(date: Date, weekStartsOn: WeekStart): Date {
  return startOfWeek(date, { weekStartsOn });
}

/** Whole weeks between the anchor week and the week containing `date`. */
export function weekIndexOf(date: Date, anchorWeekStart: Date, weekStartsOn: WeekStart): number {
  return differenceInCalendarWeeks(date, anchorWeekStart, { weekStartsOn });
}

/** Start of the week `index` weeks away from the anchor (DST-safe, local midnight). */
export function weekStartAt(anchorWeekStart: Date, index: number): Date {
  return addWeeks(anchorWeekStart, index);
}

/** Day column width in px; mirrors the breakpoints used in DayColumn.tsx. */
export function dayColumnWidth(viewportWidth: number): number {
  if (viewportWidth < 768) return 140;
  if (viewportWidth < 1024) return 155;
  if (viewportWidth < 1280) return 185;
  return 210;
}

/** Week indices (relative to the anchor) that should be rendered, including buffer. */
export function visibleWeekRange(p: {
  scrollLeft: number;
  viewportWidth: number;
  weekWidth: number;
}): { first: number; last: number } {
  const { scrollLeft, viewportWidth, weekWidth } = p;
  if (!(weekWidth > 0)) return { first: 0, last: 0 };
  const left = scrollLeft - TIME_GUTTER_PX;
  const firstVisible = Math.floor(left / weekWidth) - WEEK_RANGE;
  const lastVisible = Math.floor((left + viewportWidth) / weekWidth) - WEEK_RANGE;
  const clamp = (n: number) => Math.max(-WEEK_RANGE, Math.min(WEEK_RANGE, n));
  return {
    first: clamp(firstVisible - RENDER_BUFFER_WEEKS),
    last: clamp(lastVisible + RENDER_BUFFER_WEEKS),
  };
}

/** scrollLeft that centers the day column of `date` in the viewport. */
export function scrollLeftForDate(p: {
  date: Date;
  anchorWeekStart: Date;
  weekStartsOn: WeekStart;
  dayWidth: number;
  viewportWidth: number;
}): number {
  const { date, anchorWeekStart, weekStartsOn, dayWidth, viewportWidth } = p;
  const index = weekIndexOf(date, anchorWeekStart, weekStartsOn);
  const dayInWeek = differenceInCalendarDays(date, weekStartAt(anchorWeekStart, index));
  const dayCenterX = (index + WEEK_RANGE) * 7 * dayWidth + (dayInWeek + 0.5) * dayWidth;
  return TIME_GUTTER_PX + dayCenterX - viewportWidth / 2;
}

/**
 * scrollLeft that centers a rendered day column, given its offsetLeft inside the
 * days wrapper (i.e. excluding the time gutter). Same convention as scrollLeftForDate.
 */
export function scrollLeftForColumn(p: {
  columnOffsetLeft: number;
  columnWidth: number;
  viewportWidth: number;
}): number {
  return TIME_GUTTER_PX + p.columnOffsetLeft + p.columnWidth / 2 - p.viewportWidth / 2;
}

/** Inverse of scrollLeftForDate: the day under the viewport center. */
export function dateAtViewportCenter(p: {
  scrollLeft: number;
  viewportWidth: number;
  dayWidth: number;
  anchorWeekStart: Date;
  weekStartsOn: WeekStart;
}): Date {
  const { scrollLeft, viewportWidth, dayWidth, anchorWeekStart } = p;
  const dayX = scrollLeft + viewportWidth / 2 - TIME_GUTTER_PX;
  const totalDays = Math.floor(dayX / dayWidth);
  const weekPos = Math.floor(totalDays / 7);
  const dayInWeek = totalDays - weekPos * 7;
  return addDays(weekStartAt(anchorWeekStart, weekPos - WEEK_RANGE), dayInWeek);
}

/** True when `date` is further than MAX_ANCHOR_OFFSET_WEEKS from the anchor. */
export function needsReanchor(date: Date, anchorWeekStart: Date, weekStartsOn: WeekStart): boolean {
  return Math.abs(weekIndexOf(date, anchorWeekStart, weekStartsOn)) > MAX_ANCHOR_OFFSET_WEEKS;
}

/** localStorage key holding the last calendar date (restored by page.tsx on load). */
export const CALENDAR_DATE_STORAGE_KEY = 'tide_calendar_date';

/** Stored calendar date, or null when missing or unparseable. */
export function parseStoredCalendarDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Value written for CALENDAR_DATE_STORAGE_KEY (ISO string, read back by parseStoredCalendarDate). */
export function serializeCalendarDate(date: Date): string {
  return date.toISOString();
}

/** Week starts for month (6 weeks from the first of the month) or continuous (8 weeks from one week before `date`). */
export function weeksForViewMode(
  date: Date,
  mode: 'month' | 'continuous',
  weekStartsOn: WeekStart,
): Date[] {
  const first =
    mode === 'month'
      ? startOfCalendarWeek(startOfMonth(date), weekStartsOn)
      : addWeeks(startOfCalendarWeek(date, weekStartsOn), -1);
  const count = mode === 'month' ? 6 : 8;
  return Array.from({ length: count }, (_, i) => addWeeks(first, i));
}
