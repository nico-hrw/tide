export const SNAP_MIN = 10;
export const GAP_PX = 34;
export const DEFAULT_DURATION_MIN = 60;
export const DAY_PX_PER_MIN = 0.8;
export const DAY_MIN_BLOCK_PX = 56;

const MIN_MS = 60000;

/** start/end in ms, top/height in px relative to the list. */
export interface SegRect {
  start: number;
  end: number;
  top: number;
  height: number;
}

export function blockHeightPx(
  startMs: number,
  endMs: number,
  pxPerMin: number = DAY_PX_PER_MIN,
  minPx: number = DAY_MIN_BLOCK_PX,
): number {
  const minutes = (endMs - startMs) / MIN_MS;
  return Math.max(minPx, minutes * pxPerMin);
}

export function gapHeightPx(
  gapStartMs: number,
  gapEndMs: number,
  nowMs: number | null,
  pxPerMin: number = DAY_PX_PER_MIN,
): number {
  if (nowMs !== null && gapStartMs <= nowMs && nowMs < gapEndMs) {
    return Math.max(GAP_PX, ((gapEndMs - gapStartMs) / MIN_MS) * pxPerMin);
  }
  return GAP_PX;
}

export type NowPlacement =
  | { kind: 'before-first' }
  | { kind: 'after-last' }
  | { kind: 'in-block'; index: number; fraction: number }
  | { kind: 'in-gap'; index: number; fraction: number };

function fractionOf(value: number, start: number, end: number): number {
  const len = end - start;
  return len > 0 ? (value - start) / len : 0;
}

export function nowPlacement(
  blocks: Array<{ start: number; end: number }>,
  nowMs: number,
): NowPlacement {
  if (blocks.length === 0 || nowMs < blocks[0].start) return { kind: 'before-first' };
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (nowMs >= b.start && nowMs < b.end) {
      return { kind: 'in-block', index: i, fraction: fractionOf(nowMs, b.start, b.end) };
    }
    const next = blocks[i + 1];
    if (next && nowMs >= b.end && nowMs < next.start) {
      return { kind: 'in-gap', index: i, fraction: fractionOf(nowMs, b.end, next.start) };
    }
  }
  return { kind: 'after-last' };
}

export function timeFromTap(
  segs: SegRect[],
  y: number,
  pxPerMin: number = DAY_PX_PER_MIN,
): number {
  if (segs.length === 0) return 0;
  const first = segs[0];
  if (y < first.top) return first.start - ((first.top - y) / pxPerMin) * MIN_MS;
  const last = segs[segs.length - 1];
  const lastBottom = last.top + last.height;
  if (y >= lastBottom) return last.end + ((y - lastBottom) / pxPerMin) * MIN_MS;

  for (const s of segs) {
    if (y >= s.top && y < s.top + s.height) {
      const f = s.height > 0 ? (y - s.top) / s.height : 0;
      return s.start + f * (s.end - s.start);
    }
  }

  // y falls into a hole between two segments: nearest edge by pixel distance.
  let best = first.start;
  let bestDist = Infinity;
  for (const s of segs) {
    const dTop = Math.abs(y - s.top);
    if (dTop < bestDist) {
      bestDist = dTop;
      best = s.start;
    }
    const dBottom = Math.abs(y - (s.top + s.height));
    if (dBottom < bestDist) {
      bestDist = dBottom;
      best = s.end;
    }
  }
  return best;
}

export function roundToStep(ms: number, stepMin: number = SNAP_MIN): number {
  const step = stepMin * MIN_MS;
  return Math.round(ms / step) * step;
}

export function draftRangeFromTime(
  rawMs: number,
  dayStartMs: number,
): { start: Date; end: Date } {
  const durMs = DEFAULT_DURATION_MIN * MIN_MS;
  const maxStart = dayStartMs + 24 * 60 * MIN_MS - durMs;
  const startMs = Math.min(maxStart, Math.max(dayStartMs, roundToStep(rawMs)));
  return { start: new Date(startMs), end: new Date(startMs + durMs) };
}
