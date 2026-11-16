import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { addDays } from 'date-fns';
import { createSwipeGate } from './swipeGate';

interface UseFixedWeekNavigationParams {
  containerRef: RefObject<HTMLElement | null>;
  date: Date;
  onDateChange: (d: Date) => void;
  enabled: boolean;
  /** An event is being dragged/resized/created: swiping must not change the week. */
  isDragging: boolean;
}

const SWIPE_THRESHOLD_PX = 80;
const SWIPE_LOCK_MS = 400;
/** Wheel input resting this long starts a fresh gesture. */
const WHEEL_IDLE_MS = 200;

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
}

/**
 * Week paging for the fixed one-week view: ←/→ keys and horizontal wheel/touch
 * gestures move `date` by ±7 days. `date` stays the single source of truth.
 */
export function useFixedWeekNavigation({
  containerRef,
  date,
  onDateChange,
  enabled,
  isDragging,
}: UseFixedWeekNavigationParams): void {
  const latest = useRef({ date, onDateChange, isDragging });
  useEffect(() => {
    latest.current = { date, onDateChange, isDragging };
  });

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    const gate = createSwipeGate({ threshold: SWIPE_THRESHOLD_PX, lockMs: SWIPE_LOCK_MS });
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let touch: { x: number; y: number; horizontal: boolean | null; fired: boolean } | null = null;

    const step = (dir: -1 | 0 | 1) => {
      if (dir === 0) return;
      const { date: d, onDateChange: emit } = latest.current;
      emit(addDays(d, dir * 7));
    };

    const onWheel = (e: WheelEvent) => {
      // Vertical scrolling stays native; only predominantly horizontal input pages weeks.
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault(); // also suppresses the browser's back/forward swipe
      if (latest.current.isDragging) return;
      if (idleTimer !== null) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { idleTimer = null; gate.reset(); }, WHEEL_IDLE_MS);
      step(gate.push(e.deltaX, e.timeStamp));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
      if (isTextEntry(e.target) || isTextEntry(document.activeElement)) return;
      if (latest.current.isDragging) return;
      step(e.key === 'ArrowRight' ? 1 : -1);
    };

    const onTouchStart = (e: TouchEvent) => {
      gate.reset();
      const t = e.touches[0];
      touch = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY, horizontal: null, fired: false } : null;
    };

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!touch || !t) return;
      const dx = t.clientX - touch.x;
      const dy = t.clientY - touch.y;
      if (touch.horizontal === null && Math.hypot(dx, dy) > 10) {
        touch.horizontal = Math.abs(dx) > Math.abs(dy);
      }
      if (!touch.horizontal || touch.fired || latest.current.isDragging) {
        touch.x = t.clientX;
        touch.y = t.clientY;
        return;
      }
      // Swiping left (negative dx) reveals the next week.
      const dir = gate.push(-(t.clientX - touch.x), e.timeStamp);
      if (dir !== 0) touch.fired = true; // one week per touch gesture
      step(dir);
      touch.x = t.clientX;
      touch.y = t.clientY;
    };

    const onTouchEnd = () => {
      touch = null;
      gate.reset();
    };

    window.addEventListener('keydown', onKeyDown);
    container?.addEventListener('wheel', onWheel, { passive: false });
    container?.addEventListener('touchstart', onTouchStart, { passive: true });
    container?.addEventListener('touchmove', onTouchMove, { passive: true });
    container?.addEventListener('touchend', onTouchEnd, { passive: true });
    container?.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      container?.removeEventListener('wheel', onWheel);
      container?.removeEventListener('touchstart', onTouchStart);
      container?.removeEventListener('touchmove', onTouchMove);
      container?.removeEventListener('touchend', onTouchEnd);
      container?.removeEventListener('touchcancel', onTouchEnd);
      if (idleTimer !== null) clearTimeout(idleTimer);
    };
  }, [enabled, containerRef]);
}
