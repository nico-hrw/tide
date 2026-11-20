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

/** Forces a range into the day with at least SNAP_MIN length. Valid ranges stay unchanged. */
function normalize(r: Range, dayStartMs: number): Range {
  const dayEnd = dayStartMs + DAY_MS;
  const start = clamp(r.start, dayStartMs, dayEnd - SNAP_MS);
  const end = clamp(r.end, start + SNAP_MS, dayEnd);
  return { start, end };
}

/**
 * Moves the whole range by a raw minute delta (measured from the drag start). The new start
 * snaps to SNAP_MIN, the length stays, and the range stays inside the day.
 */
export function moveRange(r: Range, deltaMin: number, dayStartMs: number): Range {
  const base = normalize(r, dayStartMs);
  if (deltaMin === 0) return base;
  const len = base.end - base.start;
  const dayEnd = dayStartMs + DAY_MS;
  const start = clamp(snap(base.start + deltaMin * MIN_MS, dayStartMs), dayStartMs, dayEnd - len);
  return { start, end: start + len };
}

/** Changes the start by a raw minute delta; snapped, at least SNAP_MIN before the end, not before the day. */
export function resizeStart(r: Range, deltaMin: number, dayStartMs: number): Range {
  const base = normalize(r, dayStartMs);
  if (deltaMin === 0) return base;
  const start = clamp(snap(base.start + deltaMin * MIN_MS, dayStartMs), dayStartMs, base.end - SNAP_MS);
  return { start, end: base.end };
}

/** Changes the end by a raw minute delta; snapped, at least SNAP_MIN after the start, not after the day. */
export function resizeEnd(r: Range, deltaMin: number, dayStartMs: number): Range {
  const base = normalize(r, dayStartMs);
  if (deltaMin === 0) return base;
  const end = clamp(snap(base.end + deltaMin * MIN_MS, dayStartMs), base.start + SNAP_MS, dayStartMs + DAY_MS);
  return { start: base.start, end };
}

/** Converts a vertical pixel distance to minutes for the given hour height. */
export function pxToMin(px: number, hourHeightPx: number): number {
  return (px / hourHeightPx) * 60;
}
