import { SNAP_MIN } from './timelineMath';

/** A time range in ms (epoch). */
export interface Range {
  start: number;
  end: number;
}

const MIN_MS = 60000;
const DAY_MS = 24 * 60 * MIN_MS;
const SNAP_MS = SNAP_MIN * MIN_MS;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Snap relative to the day start (local midnight is not always aligned to 10 min of the epoch). */
function snap(ms: number, dayStartMs: number): number {
  return dayStartMs + Math.round((ms - dayStartMs) / SNAP_MS) * SNAP_MS;
}

/**
 * The part of a range that is drawn in the day grid: clipped to the day and at least SNAP_MIN long.
 * A range entirely outside the day becomes a SNAP_MIN block at the nearest day edge.
 */
export function visibleRange(r: Range, dayStartMs: number): Range {
  const dayEnd = dayStartMs + DAY_MS;
  const s = Math.max(r.start, dayStartMs);
  const e = Math.min(r.end, dayEnd);
  if (e - s >= SNAP_MS) return { start: s, end: e };
  if (r.end <= dayStartMs) return { start: dayStartMs, end: dayStartMs + SNAP_MS };
  if (r.start >= dayEnd) return { start: dayEnd - SNAP_MS, end: dayEnd };
  const start = clamp(s, dayStartMs, dayEnd - SNAP_MS);
  return { start, end: start + SNAP_MS };
}

/** True start lies before the day, but the range reaches into it. */
const crossesDayStart = (r: Range, dayStartMs: number) => r.start < dayStartMs && r.end > dayStartMs;
/** True end lies after the day, but the range starts inside it. */
const crossesDayEnd = (r: Range, dayStartMs: number) => r.start < dayStartMs + DAY_MS && r.end > dayStartMs + DAY_MS;

/**
 * Moves the whole range by a raw minute delta (measured from the drag start). The new start
 * snaps to SNAP_MIN and the length stays.
 * - Range inside the day: the whole range stays inside the day.
 * - Range leaving the day (e.g. 22:00-02:00): the full length is kept and only the START is
 *   clamped into [dayStart, dayEnd - SNAP_MIN], so the end may lie in the next day.
 * Delta 0 returns the range unchanged.
 */
export function moveRange(r: Range, deltaMin: number, dayStartMs: number): Range {
  if (deltaMin === 0) return { ...r };
  const dayEnd = dayStartMs + DAY_MS;
  const len = Math.max(SNAP_MS, r.end - r.start);
  const raw = snap(r.start + deltaMin * MIN_MS, dayStartMs);
  const inDay = r.start >= dayStartMs && r.end <= dayEnd;
  const start = clamp(raw, dayStartMs, inDay ? dayEnd - len : dayEnd - SNAP_MS);
  return { start, end: start + len };
}

/**
 * Changes the visible start by a raw minute delta: snapped, inside the day, at least SNAP_MIN
 * before the visible end. A true end after the day is kept; a true start before the day is kept
 * when the new start would sit on the day start again. Delta 0 returns the range unchanged.
 */
export function resizeStart(r: Range, deltaMin: number, dayStartMs: number): Range {
  if (deltaMin === 0) return { ...r };
  const v = visibleRange(r, dayStartMs);
  const start = clamp(snap(v.start + deltaMin * MIN_MS, dayStartMs), dayStartMs, v.end - SNAP_MS);
  const end = crossesDayEnd(r, dayStartMs) ? r.end : v.end;
  if (start === dayStartMs && crossesDayStart(r, dayStartMs)) return { start: r.start, end };
  return { start, end };
}

/**
 * Changes the visible end by a raw minute delta: snapped, inside the day, at least SNAP_MIN
 * after the visible start. A true start before the day is kept; a true end after the day is kept
 * when the new end would sit on the day end again. Delta 0 returns the range unchanged.
 */
export function resizeEnd(r: Range, deltaMin: number, dayStartMs: number): Range {
  if (deltaMin === 0) return { ...r };
  const dayEnd = dayStartMs + DAY_MS;
  const v = visibleRange(r, dayStartMs);
  const end = clamp(snap(v.end + deltaMin * MIN_MS, dayStartMs), v.start + SNAP_MS, dayEnd);
  const start = crossesDayStart(r, dayStartMs) ? r.start : v.start;
  if (end === dayEnd && crossesDayEnd(r, dayStartMs)) return { start, end: r.end };
  return { start, end };
}

/** Converts a vertical pixel distance to minutes for the given hour height. */
export function pxToMin(px: number, hourHeightPx: number): number {
  return (px / hourHeightPx) * 60;
}
