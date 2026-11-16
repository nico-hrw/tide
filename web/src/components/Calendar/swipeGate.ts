export interface SwipeGate {
  /** Feeds a horizontal delta; returns -1 / 1 once per gesture, otherwise 0. */
  push(deltaX: number, nowMs: number): -1 | 0 | 1;
  reset(): void;
}

/**
 * Turns a stream of horizontal wheel/touch deltas into discrete week steps:
 * deltas accumulate until `threshold`, then one step fires and further input is
 * ignored for `lockMs` (swallows trackpad inertia).
 */
export function createSwipeGate({ threshold, lockMs }: { threshold: number; lockMs: number }): SwipeGate {
  let sum = 0;
  let lockedUntil = -Infinity;

  return {
    push(deltaX, nowMs) {
      if (nowMs < lockedUntil) return 0;
      sum += deltaX;
      if (Math.abs(sum) < threshold) return 0;
      const dir = sum > 0 ? 1 : -1;
      sum = 0;
      lockedUntil = nowMs + lockMs;
      return dir;
    },
    reset() {
      sum = 0;
      lockedUntil = -Infinity;
    },
  };
}
