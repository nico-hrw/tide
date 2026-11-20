import { DEFAULT_DURATION_MIN } from './timelineMath';

/**
 * Hold and double-tap detection for the mobile day list. Pure (no DOM, no React): the caller feeds it touch
 * positions. It only observes, so it never blocks scrolling or the parent's horizontal day swipe; any
 * movement past the tolerance cancels both the pending hold and the tap tracking.
 */
export interface GestureOptions {
  holdMs?: number; doubleTapMs?: number; moveTolerancePx?: number;
  onHold: (x: number, y: number, target: EventTarget | null) => void;
  onDoubleTap: (x: number, y: number, target: EventTarget | null) => void;
}

/** Max distance between the two taps of a double tap. */
export const DOUBLE_TAP_SLOP_PX = 24;

export function createListGestures(o: GestureOptions): {
  start(x: number, y: number, target: EventTarget | null): void;
  move(x: number, y: number): void; end(): void; cancel(): void;
} {
  const holdMs = o.holdMs ?? 450;
  const doubleTapMs = o.doubleTapMs ?? 300;
  const tol = o.moveTolerancePx ?? 10;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = false;
  let spoiled = false; // moved too far or held: this touch is no tap
  let sx = 0, sy = 0, startT = 0;
  let target: EventTarget | null = null;
  let lastTap: { x: number; y: number; t: number } | null = null;

  const clearTimer = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };

  return {
    start(x, y, t) {
      clearTimer();
      active = true; spoiled = false;
      sx = x; sy = y; startT = Date.now(); target = t;
      timer = setTimeout(() => {
        timer = null;
        spoiled = true;
        lastTap = null;
        o.onHold(sx, sy, target);
      }, holdMs);
    },
    move(x, y) {
      if (!active || spoiled) return;
      if (Math.hypot(x - sx, y - sy) > tol) {
        spoiled = true;
        lastTap = null;
        clearTimer();
      }
    },
    end() {
      if (!active) return;
      active = false;
      clearTimer();
      if (spoiled) { lastTap = null; return; }
      const prev = lastTap;
      if (prev && startT - prev.t <= doubleTapMs && Math.hypot(sx - prev.x, sy - prev.y) <= DOUBLE_TAP_SLOP_PX) {
        lastTap = null;
        o.onDoubleTap(sx, sy, target);
        return;
      }
      lastTap = { x: sx, y: sy, t: Date.now() };
    },
    cancel() {
      clearTimer();
      active = false;
      lastTap = null;
    },
  };
}

/** Controls inside a card (delete, check-off, edit …) that never take part in a gesture. */
const INTERACTIVE = 'button, a, input, textarea, [role=button]';

/** True for a target inside a control; the card's own toggle button (`data-card-body`) does not count. */
export function isInteractiveTarget(t: EventTarget | null): boolean {
  const el = t as Element | null;
  if (!el || typeof el.closest !== 'function') return false;
  const hit = el.closest(INTERACTIVE);
  return !!hit && !hit.hasAttribute('data-card-body');
}

/** Draft for a double tap on an empty day: 09:00, today the next full hour (at most 23:00), 60 min. */
export function emptyDayDraft(day: Date, now: Date): { start: Date; end: Date } {
  const isToday = day.getFullYear() === now.getFullYear() && day.getMonth() === now.getMonth() && day.getDate() === now.getDate();
  const hour = isToday ? Math.min(23, now.getHours() + 1) : 9;
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0);
  return { start, end: new Date(start.getTime() + DEFAULT_DURATION_MIN * 60000) };
}
