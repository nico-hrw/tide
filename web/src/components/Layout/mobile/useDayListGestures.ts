'use client';

import type React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { createListGestures, emptyDayDraft, isInteractiveTarget } from './listGestures';
import { DAY_PX_PER_MIN, draftRangeFromTime, timeFromTap, type SegRect } from './timelineMath';
import { isRecurringOccurrence } from './quickEditState';
import { NO_CALLOUT_STYLE } from './DayTimelineParts';

/** How long after a hold or double tap the next click on the list is swallowed. */
const CLICK_SUPPRESS_MS = 600;

export interface DayListGestureOptions<E extends { id: string }> {
  /** Off = no handlers at all (month and agenda views). */
  enabled: boolean;
  day: Date;
  now: Date;
  /** Real timed events of the day (no todos); a hold only opens one of these. */
  events: E[];
  expandedEventId: string | null;
  setExpandedEventId: (id: string | null) => void;
  onQuickEdit?: (ev: E) => void;
  onDraftAt?: (start: Date, end: Date) => void;
}

export type DayListGestureHandlers = Pick<React.HTMLAttributes<HTMLElement>,
  'onTouchStart' | 'onTouchMove' | 'onTouchEnd' | 'onTouchCancel' | 'onClickCapture' | 'onContextMenu' | 'style'>;

/** All `[data-seg]` segments under `root` with their time range and top relative to `root`, sorted by top. */
export function collectSegRects(root: HTMLElement): SegRect[] {
  const rootTop = root.getBoundingClientRect().top;
  return Array.from(root.querySelectorAll<HTMLElement>('[data-seg]'))
    .map(el => {
      const r = el.getBoundingClientRect();
      return { start: Number(el.dataset.segStart), end: Number(el.dataset.segEnd), top: r.top - rootTop, height: r.height };
    })
    .filter(s => Number.isFinite(s.start) && Number.isFinite(s.end))
    .sort((a, b) => a.top - b.top);
}

/**
 * Hold (quick edit) and double tap (draft) on the day list. Spread the result onto the list's root element.
 * A single tap still expands a card at once; a double tap restores the expand state from before its first tap.
 */
export function useDayListGestures<E extends { id: string }>(o: DayListGestureOptions<E>): DayListGestureHandlers | undefined {
  const latest = useRef(o);
  useEffect(() => { latest.current = o; });

  const rootRef = useRef<HTMLElement | null>(null);
  // Expand state at the start of the previous and the current touch.
  const snaps = useRef<{ prev: string | null; cur: string | null }>({ prev: null, cur: null });
  const fired = useRef(false);
  const suppressUntil = useRef(0);
  const gesturesRef = useRef<ReturnType<typeof createListGestures> | null>(null);

  useEffect(() => {
    const gestures = createListGestures({
      onHold: (_x, _y, target) => {
        const { events, onQuickEdit } = latest.current;
        const root = rootRef.current;
        const card = (target as Element | null)?.closest?.('[id^="ev-"]');
        if (!onQuickEdit || !root || !card || !root.contains(card)) return;
        const ev = events.find(e => `ev-${e.id}` === card.id);
        // Quick edit would move the whole series; occurrences of recurring events stay untouched.
        if (!ev || isRecurringOccurrence(ev)) return;
        fired.current = true;
        onQuickEdit(ev);
      },
      onDoubleTap: (_x, y) => {
        const { day, now, onDraftAt, expandedEventId, setExpandedEventId } = latest.current;
        const root = rootRef.current;
        if (!onDraftAt || !root) return;
        fired.current = true;
        // Undo a toggle the first tap of the pair caused.
        if (snaps.current.prev !== expandedEventId) setExpandedEventId(snaps.current.prev);
        const segs = collectSegRects(root);
        if (segs.length === 0) {
          const { start, end } = emptyDayDraft(day, now);
          onDraftAt(start, end);
          return;
        }
        const raw = timeFromTap(segs, y - root.getBoundingClientRect().top, DAY_PX_PER_MIN);
        const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
        const { start, end } = draftRangeFromTime(raw, dayStart);
        onDraftAt(start, end);
      },
    });
    gesturesRef.current = gestures;
    return () => { gestures.cancel(); gesturesRef.current = null; };
  }, []);

  const handlers = useMemo<DayListGestureHandlers>(() => ({
    onTouchStart: e => {
      const gestures = gesturesRef.current;
      if (!gestures) return;
      rootRef.current = e.currentTarget;
      if (e.touches.length !== 1 || isInteractiveTarget(e.target)) { gestures.cancel(); return; }
      snaps.current = { prev: snaps.current.cur, cur: latest.current.expandedEventId };
      fired.current = false;
      gestures.start(e.touches[0].clientX, e.touches[0].clientY, e.target);
    },
    onTouchMove: e => {
      const t = e.touches[0];
      if (t) gesturesRef.current?.move(t.clientX, t.clientY);
    },
    onTouchEnd: e => {
      gesturesRef.current?.end();
      if (!fired.current) return;
      fired.current = false;
      suppressUntil.current = Date.now() + CLICK_SUPPRESS_MS;
      if (e.cancelable) e.preventDefault(); // no synthetic click, no double-tap zoom
    },
    onTouchCancel: () => { gesturesRef.current?.cancel(); fired.current = false; },
    onClickCapture: e => {
      if (Date.now() >= suppressUntil.current) return;
      suppressUntil.current = 0;
      e.preventDefault();
      e.stopPropagation();
    },
    // A long press must reach the 450 ms hold: no context menu, text selection or iOS callout first.
    onContextMenu: e => e.preventDefault(),
    style: NO_CALLOUT_STYLE,
  }), []);

  return o.enabled ? handlers : undefined;
}
