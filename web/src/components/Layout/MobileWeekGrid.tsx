"use client";

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { format, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';

const DEFAULT_HOUR_H = 54;
const TIME_W = 38;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SNAP_MINS = 15;
const MIN_HOUR_H = 24;
const MAX_HOUR_H = 120;
const SCROLL_ZONE = 80;
const EDGE_ZONE = 28;

interface CalEvent { id: string; title: string; start: string; end?: string; color?: string; allDay?: boolean; }

interface Props {
  weekDays: Date[];
  events: CalEvent[];
  now: Date;
  onEventTap: (id: string) => void;
  onNewEvent: (start: Date, end: Date) => void;
  onEventUpdate?: (id: string, newStart: Date, newEnd: Date) => void;
  onWeekShift?: (dir: 1 | -1) => void;
  onEventDragChange?: (active: boolean) => void;
  hideTimeStrip?: boolean;
  onScrollY?: (top: number) => void;
  onHourHeightChange?: (h: number) => void;
}

function snapMins(m: number) { return Math.round(m / SNAP_MINS) * SNAP_MINS; }
function minsToPx(m: number, hh: number) { return (m / 60) * hh; }
function pxToMins(px: number, hh: number) { return (px / hh) * 60; }
function snapY(y: number, hh: number) { return minsToPx(snapMins(Math.max(0, pxToMins(y, hh))), hh); }
function yToDate(y: number, day: Date, hh: number): Date {
  const total = snapMins(Math.max(0, pxToMins(y, hh)));
  const d = new Date(day);
  d.setHours(Math.min(23, Math.floor(total / 60)), total % 60, 0, 0);
  return d;
}
function dayEvents(events: CalEvent[], day: Date): CalEvent[] {
  return events.filter(e => !e.allDay && (() => {
    try {
      const start = new Date(e.start);
      const end = e.end ? new Date(e.end) : new Date(start.getTime() + 3_600_000);
      const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
      // include events that start on this day OR span into this day (overnight continuation)
      return start <= dayEnd && end > dayStart;
    } catch { return false; }
  })());
}

interface CreationDrag { colIdx: number; startY: number; curY: number; }
interface EventDrag {
  eventId: string;
  type: 'move' | 'resize-top' | 'resize-bottom';
  colIdx: number;
  originalColIdx: number;
  startTouchY: number;
  startTouchX: number;
  originalStart: Date;
  originalEnd: Date;
  previewStart: Date;
  previewEnd: Date;
}

export default function MobileWeekGrid({ weekDays, events, now, onEventTap, onNewEvent, onEventUpdate, onWeekShift, onEventDragChange, hideTimeStrip, onScrollY, onHourHeightChange }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const hourHRef = useRef(DEFAULT_HOUR_H);

  const [hourH, setHourH] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_HOUR_H;
    const s = localStorage.getItem('tide_mobile_hour_h');
    const v = s ? Math.max(MIN_HOUR_H, Math.min(MAX_HOUR_H, parseFloat(s))) : DEFAULT_HOUR_H;
    hourHRef.current = v;
    return v;
  });
  const updateHourH = (v: number) => { hourHRef.current = v; setHourH(v); localStorage.setItem('tide_mobile_hour_h', String(v)); onHourHeightChange?.(v); };

  const [creation, setCreation] = useState<CreationDrag | null>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCreatingRef = useRef(false);
  const didHandleRef = useRef(false);

  const [evDrag, setEvDrag] = useState<EventDrag | null>(null);
  const evDragRef = useRef<EventDrag | null>(null);
  const [evHoverPillId, setEvHoverPillId] = useState<string | null>(null);
  const dragOverlayRef = useRef<HTMLElement | null>(null);
  const evHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const evPendingMoveRef = useRef(false); // true while waiting for 1s hold on event move

  const autoScrollRAF = useRef<number | null>(null);
  const edgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinchRef = useRef({ dist: 0, active: false, scrollTop: 0, centerY: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const weekDaysRef = useRef(weekDays);
  useEffect(() => { weekDaysRef.current = weekDays; }, [weekDays]);
  const onEventUpdateRef = useRef(onEventUpdate);
  useEffect(() => { onEventUpdateRef.current = onEventUpdate; }, [onEventUpdate]);
  const onWeekShiftRef = useRef(onWeekShift);
  useEffect(() => { onWeekShiftRef.current = onWeekShift; }, [onWeekShift]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const saved = localStorage.getItem('tide_mobile_scroll');
    if (saved) scrollRef.current.scrollTop = parseFloat(saved);
    else scrollRef.current.scrollTop = Math.max(0, (now.getHours() + now.getMinutes() / 60) * hourHRef.current - hourHRef.current);
  }, []);

  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScroll = () => {
    if (scrollRef.current) onScrollY?.(scrollRef.current.scrollTop);
    if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current = setTimeout(() => {
      if (scrollRef.current) localStorage.setItem('tide_mobile_scroll', String(scrollRef.current.scrollTop));
    }, 300);
  };
  const nowTop = (now.getHours() + now.getMinutes() / 60) * hourH;

  const stopAutoScroll = () => {
    if (autoScrollRAF.current !== null) { cancelAnimationFrame(autoScrollRAF.current); autoScrollRAF.current = null; }
  };
  const stopEdgeTimer = () => { if (edgeTimerRef.current) { clearTimeout(edgeTimerRef.current); edgeTimerRef.current = null; } };

  const getColIdx = (clientX: number): number => {
    if (!columnsRef.current) return 0;
    const r = columnsRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(weekDaysRef.current.length - 1, Math.floor(((clientX - r.left) / r.width) * weekDaysRef.current.length)));
  };

  const triggerAutoScroll = (touchY: number) => {
    if (!scrollRef.current) return;
    const r = scrollRef.current.getBoundingClientRect();
    const relY = touchY - r.top;
    const h = r.height;
    stopAutoScroll();
    if (relY < SCROLL_ZONE || relY > h - SCROLL_ZONE) {
      const dir = relY < SCROLL_ZONE ? -1 : 1;
      const speed = relY < SCROLL_ZONE ? (SCROLL_ZONE - relY) / 8 : (relY - (h - SCROLL_ZONE)) / 8;
      const tick = () => {
        if (scrollRef.current) scrollRef.current.scrollTop += dir * Math.max(2, speed);
        autoScrollRAF.current = requestAnimationFrame(tick);
      };
      autoScrollRAF.current = requestAnimationFrame(tick);
    }
  };

  const clearHold = () => { if (holdRef.current) clearTimeout(holdRef.current); };

  // ── Creation drag (long-press on empty column area) ──────────────────────────
  const colTouchStart = useCallback((e: React.TouchEvent, colIdx: number) => {
    if (e.touches.length === 2 || evDragRef.current || evPendingMoveRef.current) return;
    const touch = e.touches[0];
    // Use scrollRef top (not column top) to avoid double-counting scrollTop
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const scrollViewTop = scrollRef.current?.getBoundingClientRect().top ?? 0;
    const y = snapY(touch.clientY - scrollViewTop + scrollTop, hourHRef.current);
    holdRef.current = setTimeout(() => {
      isCreatingRef.current = true;
      didHandleRef.current = true;
      setCreation({ colIdx, startY: y, curY: y + hourHRef.current });
    }, 420);
  }, []);

  const colTouchMove = useCallback((e: React.TouchEvent, colIdx: number) => {
    if (e.touches.length === 2 || evDragRef.current) return;
    if (!isCreatingRef.current || creation?.colIdx !== colIdx) { clearHold(); return; }
    e.preventDefault();
    const touch = e.touches[0];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = snapY(Math.max(creation!.startY + minsToPx(SNAP_MINS, hourHRef.current), touch.clientY - rect.top + (scrollRef.current?.scrollTop ?? 0)), hourHRef.current);
    setCreation(prev => prev ? { ...prev, curY: y } : null);
  }, [creation]);

  const colTouchEnd = useCallback((colIdx: number) => {
    clearHold();
    if (isCreatingRef.current && creation?.colIdx === colIdx) {
      const day = weekDaysRef.current[colIdx];
      const start = yToDate(creation.startY, day, hourHRef.current);
      const end = yToDate(creation.curY, day, hourHRef.current);
      if (end.getTime() - start.getTime() < 900_000) end.setTime(start.getTime() + 3_600_000);
      onNewEvent(start, end);
    }
    isCreatingRef.current = false;
    setCreation(null);
  }, [creation, onNewEvent]);

  const handleColumnClick = useCallback((e: React.MouseEvent, colIdx: number) => {
    if (didHandleRef.current) { didHandleRef.current = false; return; }
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const scrollViewTop = scrollRef.current?.getBoundingClientRect().top ?? 0;
    const y = snapY(e.clientY - scrollViewTop + scrollTop, hourHRef.current);
    const start = yToDate(y, weekDaysRef.current[colIdx], hourHRef.current);
    onNewEvent(start, new Date(start.getTime() + 3_600_000));
  }, [onNewEvent]);

  // ── Event drag ───────────────────────────────────────────────────────────────
  // Root cause of "only one column": React re-render moves the event pill between DOM columns,
  // detaching the original touchstart target. Detached elements don't bubble to document.
  // Fix: keep event pill invisible (opacity:0) in original column the whole drag.
  //      DOM overlay follows the finger. Column highlight via direct style (no React re-renders).
  //      Capture-phase listeners are a safety net on top.
  const evTouchStart = useCallback((e: React.TouchEvent, eventId: string, type: EventDrag['type'], colIdx: number) => {
    if (e.touches.length !== 1) return;

    const ev = events.find(ev => ev.id === eventId);
    if (!ev) return;

    const startX = e.touches[0].clientX;
    const startY = e.touches[0].clientY;

    // Resize handles: activate immediately (deliberate small-target touch)
    if (type !== 'move') {
      e.stopPropagation();
      e.preventDefault();
      clearHold();
      isCreatingRef.current = false;
      setCreation(null);
      didHandleRef.current = true;

      const originalStart = new Date(ev.start);
      const originalEnd = ev.end ? new Date(ev.end) : new Date(originalStart.getTime() + 3_600_000);
      const drag: EventDrag = {
        eventId, type, colIdx, originalColIdx: colIdx,
        startTouchY: startY, startTouchX: startX,
        originalStart, originalEnd,
        previewStart: new Date(originalStart), previewEnd: new Date(originalEnd),
      };
      evDragRef.current = drag;
      flushSync(() => setEvDrag({ ...drag }));
      onEventDragChange?.(true);
      document.body.setAttribute('data-ev-drag', '1');

      const onMove = (evt: TouchEvent) => {
        const d = evDragRef.current;
        if (!d || evt.touches.length === 0) return;
        evt.preventDefault();
        const touch = evt.touches[0];
        const hh = hourHRef.current;
        const dy = touch.clientY - d.startTouchY;
        const deltaMins = snapMins(pxToMins(dy, hh));
        let previewStart: Date, previewEnd: Date;
        if (d.type === 'resize-bottom') {
          previewStart = new Date(d.originalStart);
          const endMins = d.originalEnd.getHours() * 60 + d.originalEnd.getMinutes() + deltaMins;
          const clamped = Math.max(d.originalStart.getHours() * 60 + d.originalStart.getMinutes() + 15, Math.min(23 * 60 + 59, endMins));
          previewEnd = new Date(d.originalStart);
          previewEnd.setHours(Math.floor(clamped / 60), clamped % 60, 0, 0);
        } else {
          previewEnd = new Date(d.originalEnd);
          const startMins = d.originalStart.getHours() * 60 + d.originalStart.getMinutes() + deltaMins;
          const clamped = Math.max(0, Math.min(d.originalEnd.getHours() * 60 + d.originalEnd.getMinutes() - 15, startMins));
          previewStart = new Date(d.originalStart);
          previewStart.setHours(Math.floor(clamped / 60), clamped % 60, 0, 0);
        }
        const updated: EventDrag = { ...d, colIdx: d.originalColIdx, previewStart, previewEnd };
        evDragRef.current = updated;
        setEvDrag({ ...updated });
        triggerAutoScroll(touch.clientY);
      };
      const onEnd = () => {
        stopAutoScroll();
        stopEdgeTimer();
        document.removeEventListener('touchmove', onMove, { capture: true });
        document.removeEventListener('touchend', onEnd, { capture: true });
        document.removeEventListener('touchcancel', onEnd, { capture: true });
        document.body.removeAttribute('data-ev-drag');
        if (dragOverlayRef.current) { dragOverlayRef.current.remove(); dragOverlayRef.current = null; }
        columnsRef.current?.querySelectorAll<HTMLElement>('[data-col-idx]').forEach(el => el.style.removeProperty('background'));
        const d = evDragRef.current;
        evDragRef.current = null;
        flushSync(() => setEvDrag(null));
        onEventDragChange?.(false);
        // iOS: preventDefault() during drag can freeze UIScrollView. Jiggling scrollTop re-enables it.
        if (scrollRef.current) { const st = scrollRef.current.scrollTop; scrollRef.current.scrollTop = st + 1; scrollRef.current.scrollTop = st; }
        if (d) onEventUpdateRef.current?.(d.eventId, d.previewStart, d.previewEnd);
      };
      document.addEventListener('touchmove', onMove, { passive: false, capture: true });
      document.addEventListener('touchend', onEnd, { capture: true });
      document.addEventListener('touchcancel', onEnd, { capture: true });
      return;
    }

    // 'move': require 1 second hold before activating drag.
    // Don't stopPropagation — lets week-swipe handler in MobileLayout receive the touch.
    // Don't preventDefault — allows native scroll while waiting.
    clearHold();
    isCreatingRef.current = false;
    setCreation(null);
    evPendingMoveRef.current = true; // blocks colTouchStart creation timer

    // Pre-capture pill rect while element is still in DOM (before any flushSync)
    const pillEl = (e.currentTarget as HTMLElement).parentElement;
    const pillRect = pillEl ? pillEl.getBoundingClientRect() : null;

    const originalStart = new Date(ev.start);
    const originalEnd = ev.end ? new Date(ev.end) : new Date(originalStart.getTime() + 3_600_000);

    const cancelPending = () => {
      evPendingMoveRef.current = false;
      if (evHoldTimerRef.current) { clearTimeout(evHoldTimerRef.current); evHoldTimerRef.current = null; }
    };

    const onEarlyMove = (evt: TouchEvent) => {
      if (!evt.touches.length) return;
      const dx = Math.abs(evt.touches[0].clientX - startX);
      const dy = Math.abs(evt.touches[0].clientY - startY);
      if (dx > 8 || dy > 8) {
        cancelPending();
        document.removeEventListener('touchmove', onEarlyMove);
        document.removeEventListener('touchend', onEarlyEnd);
      }
    };
    const onEarlyEnd = () => {
      cancelPending();
      document.removeEventListener('touchmove', onEarlyMove);
    };

    document.addEventListener('touchmove', onEarlyMove, { passive: true });
    document.addEventListener('touchend', onEarlyEnd, { once: true });

    evHoldTimerRef.current = setTimeout(() => {
      evHoldTimerRef.current = null;
      evPendingMoveRef.current = false;
      document.removeEventListener('touchmove', onEarlyMove);
      document.removeEventListener('touchend', onEarlyEnd);
      didHandleRef.current = true;

      const drag: EventDrag = {
        eventId, type: 'move', colIdx, originalColIdx: colIdx,
        startTouchY: startY, startTouchX: startX,
        originalStart, originalEnd,
        previewStart: new Date(originalStart), previewEnd: new Date(originalEnd),
      };

      // Show hover/lift on the pill to confirm hold is ready — drag activates on first move
      setEvHoverPillId(eventId);
      onEventDragChange?.(true);
      document.body.setAttribute('data-ev-drag', '1');

      const activateDrag = () => {
        if (evDragRef.current) return; // already activated
        evDragRef.current = drag;
        flushSync(() => { setEvHoverPillId(null); setEvDrag({ ...drag }); });
        if (pillRect && pillRect.width > 0) {
          const color = ev.color || '#3B82F6';
          const overlay = document.createElement('div');
          overlay.style.cssText = `position:fixed;left:${pillRect.left}px;top:${pillRect.top}px;width:${pillRect.width}px;height:${pillRect.height}px;background:${color}EE;border-radius:7px;border:2px solid ${color};box-shadow:0 8px 28px ${color}55;z-index:9999;pointer-events:none;padding:4px;overflow:hidden;will-change:transform;`;
          overlay.innerHTML = `<div style="font-size:10px;font-weight:700;color:#fff;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ev.title.replace(/</g, '&lt;')}</div>`;
          document.body.appendChild(overlay);
          dragOverlayRef.current = overlay;
        }
      };

      const onMove = (evt: TouchEvent) => {
        if (evt.touches.length === 0) return;
        evt.preventDefault();
        activateDrag();
        const d = evDragRef.current;
        if (!d) return;
        const touch = evt.touches[0];
        const hh = hourHRef.current;
        const dy = touch.clientY - d.startTouchY;
        const dx = touch.clientX - d.startTouchX;
        const deltaMins = snapMins(pxToMins(dy, hh));

        if (dragOverlayRef.current) {
          dragOverlayRef.current.style.transform = `translate(${dx}px,${dy}px)`;
        }
        let newColIdx = d.originalColIdx;
        const colsEl = columnsRef.current;
        if (colsEl) {
          const r = colsEl.getBoundingClientRect();
          const nCols = weekDaysRef.current.length;
          newColIdx = Math.max(0, Math.min(nCols - 1, Math.floor(((touch.clientX - r.left) / r.width) * nCols)));
          colsEl.querySelectorAll<HTMLElement>('[data-col-idx]').forEach(el => el.style.removeProperty('background'));
          const targetEl = colsEl.querySelector<HTMLElement>(`[data-col-idx="${newColIdx}"]`);
          if (targetEl) targetEl.style.background = 'rgba(59,130,246,0.08)';
          const relX = touch.clientX - r.left;
          if (relX < EDGE_ZONE) {
            if (!edgeTimerRef.current) edgeTimerRef.current = setTimeout(() => { onWeekShiftRef.current?.(-1); edgeTimerRef.current = null; }, 900);
          } else if (relX > r.width - EDGE_ZONE) {
            if (!edgeTimerRef.current) edgeTimerRef.current = setTimeout(() => { onWeekShiftRef.current?.(1); edgeTimerRef.current = null; }, 900);
          } else { stopEdgeTimer(); }
        }
        const duration = d.originalEnd.getTime() - d.originalStart.getTime();
        const targetDay = weekDaysRef.current[newColIdx];
        const newTotalMins = Math.max(0, Math.min(23 * 60 + 45,
          d.originalStart.getHours() * 60 + d.originalStart.getMinutes() + deltaMins));
        const previewStart = new Date(targetDay);
        previewStart.setHours(Math.floor(newTotalMins / 60), newTotalMins % 60, 0, 0);
        const previewEnd = new Date(previewStart.getTime() + duration);
        evDragRef.current = { ...d, colIdx: newColIdx, previewStart, previewEnd };
        triggerAutoScroll(touch.clientY);
      };

      const onEnd = () => {
        stopAutoScroll();
        stopEdgeTimer();
        document.removeEventListener('touchmove', onMove, { capture: true });
        document.removeEventListener('touchend', onEnd, { capture: true });
        document.removeEventListener('touchcancel', onEnd, { capture: true });
        document.body.removeAttribute('data-ev-drag');
        if (dragOverlayRef.current) { dragOverlayRef.current.remove(); dragOverlayRef.current = null; }
        columnsRef.current?.querySelectorAll<HTMLElement>('[data-col-idx]').forEach(el => el.style.removeProperty('background'));
        const d = evDragRef.current;
        evDragRef.current = null;
        setEvHoverPillId(null);
        flushSync(() => setEvDrag(null));
        onEventDragChange?.(false);
        // iOS: preventDefault() during drag can freeze UIScrollView. Jiggling scrollTop re-enables it.
        if (scrollRef.current) { const st = scrollRef.current.scrollTop; scrollRef.current.scrollTop = st + 1; scrollRef.current.scrollTop = st; }
        if (d) onEventUpdateRef.current?.(d.eventId, d.previewStart, d.previewEnd);
      };

      document.addEventListener('touchmove', onMove, { passive: false, capture: true });
      document.addEventListener('touchend', onEnd, { capture: true });
      document.addEventListener('touchcancel', onEnd, { capture: true });
    }, 700);
  }, [events]);

  // ── Pinch zoom ───────────────────────────────────────────────────────────────
  const containerTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), active: true, scrollTop: scrollRef.current?.scrollTop ?? 0, centerY: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
    }
  }, []);

  const containerTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current.active) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const scale = newDist / pinchRef.current.dist;
      pinchRef.current.dist = newDist;
      const next = Math.max(MIN_HOUR_H, Math.min(MAX_HOUR_H, hourHRef.current * scale));
      if (scrollRef.current) {
        const ratio = (pinchRef.current.scrollTop + pinchRef.current.centerY) / (hourHRef.current * 24);
        scrollRef.current.scrollTop = ratio * next * 24 - pinchRef.current.centerY;
      }
      updateHourH(next);
    }
  }, []);

  const containerTouchEnd = useCallback(() => { pinchRef.current.active = false; }, []);

  useEffect(() => () => { stopAutoScroll(); stopEdgeTimer(); }, []);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar" style={{ position: 'relative', touchAction: 'pan-y' }}
      onScroll={onScroll} onTouchStart={containerTouchStart} onTouchMove={containerTouchMove} onTouchEnd={containerTouchEnd}>
      <div style={{ display: 'flex', minHeight: `${24 * hourH}px`, position: 'relative' }}>

        {/* Time labels — hidden when parent renders its own shared strip */}
        {!hideTimeStrip && (
          <div style={{ width: TIME_W, flexShrink: 0, position: 'relative' }}>
            {HOURS.map(h => h > 0 && (
              <div key={h} style={{ position: 'absolute', top: h * hourH - 7, right: 5, left: 0, textAlign: 'right' }}>
                <span style={{ fontSize: 9, color: 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{h}:00</span>
              </div>
            ))}
          </div>
        )}

        {/* Day columns */}
        <div ref={columnsRef} style={{ flex: 1, display: 'flex', position: 'relative', borderLeft: hideTimeStrip ? 'none' : '1px solid var(--border-color)' }}>
          {weekDays.map((day, colIdx) => {
            const isToday = isSameDay(day, now);
            const colW = `${100 / weekDays.length}%`;
            // Base events for this day (exclude the dragged event — we handle it separately)
            const baseEvents = dayEvents(events, day).filter(e => !(evDrag && e.id === evDrag.eventId));
            // Dragged event appears in PREVIEW column (colIdx === evDrag.colIdx) regardless of its ev.start day
            const draggedEv = evDrag ? events.find(e => e.id === evDrag.eventId) : null;
            const colEvents = (draggedEv && evDrag!.colIdx === colIdx)
              ? [...baseEvents, draggedEv]
              : baseEvents;
            // Ghost shown in the ORIGINAL column when cross-day dragging
            const ghostEv = (draggedEv && evDrag!.originalColIdx === colIdx && evDrag!.colIdx !== colIdx)
              ? draggedEv : null;

            return (
              <div key={day.toISOString()} data-col-idx={colIdx}
                style={{ width: colW, flexShrink: 0, position: 'relative', borderRight: '1px solid var(--border-color)', background: isToday ? 'rgba(59,130,246,0.025)' : 'transparent', userSelect: 'none' }}
                onTouchStart={e => colTouchStart(e, colIdx)} onTouchMove={e => colTouchMove(e, colIdx)} onTouchEnd={() => colTouchEnd(colIdx)} onClick={e => handleColumnClick(e, colIdx)}
              >
                {/* Hour grid via CSS gradient (2×period for even/odd alternating opacity) */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  backgroundImage: [
                    // Even hours strong (0.45), odd hours faint (0.12) — 2*hourH period
                    `repeating-linear-gradient(to bottom, rgba(128,128,128,0.45) 0px, rgba(128,128,128,0.45) 0.5px, transparent 0.5px, transparent ${hourH}px, rgba(128,128,128,0.12) ${hourH}px, rgba(128,128,128,0.12) ${hourH + 0.5}px, transparent ${hourH + 0.5}px, transparent ${2 * hourH}px)`,
                    // Half-hour tick lines
                    `repeating-linear-gradient(to bottom, transparent ${hourH / 2 - 0.5}px, rgba(128,128,128,0.06) ${hourH / 2 - 0.5}px, rgba(128,128,128,0.06) ${hourH / 2 + 0.5}px, transparent ${hourH / 2 + 0.5}px, transparent ${hourH}px)`,
                  ].join(', '),
                }} />

                {/* Creation ghost */}
                {creation?.colIdx === colIdx && (
                  <div style={{ position: 'absolute', top: Math.min(creation.startY, creation.curY), height: Math.max(minsToPx(SNAP_MINS, hourH), Math.abs(creation.curY - creation.startY)), left: 2, right: 2, zIndex: 8, background: 'rgba(59,130,246,0.18)', border: '2px solid #3B82F6', borderRadius: 8, pointerEvents: 'none', display: 'flex', alignItems: 'flex-start', padding: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#3B82F6', lineHeight: 1 }}>
                      {format(yToDate(creation.startY, day, hourH), 'HH:mm')} – {format(yToDate(creation.curY, day, hourH), 'HH:mm')}
                    </span>
                  </div>
                )}

                {/* Current time line */}
                {isToday && (<>
                  <div style={{ position: 'absolute', left: -4, top: nowTop - 4, width: 8, height: 8, borderRadius: '50%', background: '#EF4444', zIndex: 6 }} />
                  <div style={{ position: 'absolute', left: -1, right: 0, top: nowTop, height: 2, background: '#EF4444', zIndex: 6 }} />
                </>)}

                {/* Ghost placeholder at original position during cross-day drag */}
                {ghostEv && (() => {
                  const evStart = new Date(ghostEv.start);
                  const evEnd = ghostEv.end ? new Date(ghostEv.end) : new Date(evStart.getTime() + 3_600_000);
                  const top = (evStart.getHours() + evStart.getMinutes() / 60) * hourH;
                  const height = Math.max(minsToPx(SNAP_MINS, hourH), ((evEnd.getTime() - evStart.getTime()) / 3_600_000) * hourH);
                  return <div key={`ghost-${ghostEv.id}`} style={{ position: 'absolute', top, height, left: 2, right: 2, zIndex: 3, background: (ghostEv.color || '#3B82F6') + '33', borderRadius: 7, border: `1.5px dashed ${ghostEv.color || '#3B82F6'}66`, pointerEvents: 'none' }} />;
                })()}

                {/* Events — sorted longest-first so shorter events render last (on top) */}
                {[...colEvents].sort((a, b) => {
                  if (evDrag?.eventId === a.id) return 1;
                  if (evDrag?.eventId === b.id) return -1;
                  const durA = (a.end ? new Date(a.end).getTime() : new Date(a.start).getTime() + 3_600_000) - new Date(a.start).getTime();
                  const durB = (b.end ? new Date(b.end).getTime() : new Date(b.start).getTime() + 3_600_000) - new Date(b.start).getTime();
                  return durB - durA;
                }).map(ev => {
                  const isBeingDragged = evDrag?.eventId === ev.id;

                  const evStartRaw = isBeingDragged ? evDrag!.previewStart : new Date(ev.start);
                  const evEndRaw   = isBeingDragged ? evDrag!.previewEnd   : (ev.end ? new Date(ev.end) : new Date(new Date(ev.start).getTime() + 3_600_000));

                  // Clamp to this day's 00:00–24:00 window for display
                  const dayWinStart = new Date(day); dayWinStart.setHours(0, 0, 0, 0);
                  const dayWinEnd   = new Date(day); dayWinEnd.setHours(24, 0, 0, 0);
                  const isContinuation = evStartRaw < dayWinStart; // started previous day
                  const isContinued    = evEndRaw   > dayWinEnd;   // continues into next day

                  // Hide dragged move-ghost in non-original column to avoid phantom pill
                  if (isBeingDragged && evDrag?.type === 'move' && isContinuation) return null;

                  const evStart = isContinuation ? dayWinStart : evStartRaw;
                  const evEnd   = isContinued    ? dayWinEnd   : evEndRaw;

                  const top    = (evStart.getHours() + evStart.getMinutes() / 60) * hourH;
                  const height = Math.max(minsToPx(SNAP_MINS, hourH), ((evEnd.getTime() - evStart.getTime()) / 3_600_000) * hourH);

                  const isSelected = selectedId === ev.id;
                  const color = ev.color || '#3B82F6';
                  const borderRadiusVal = `${isContinuation ? 0 : 7}px ${isContinuation ? 0 : 7}px ${isContinued ? 0 : 7}px ${isContinued ? 0 : 7}px`;

                  const handleH = height >= 48 ? 10 : height >= 32 ? 6 : 0;
                  // Body fills full pill — handles are absolute overlays so text gets all available space
                  const bodyTop = 0;
                  const bodyBot = 0;

                  const isHovered = evHoverPillId === ev.id;
                  return (
                    <div key={`${ev.id}-${isContinuation ? 'cont' : 'orig'}`}
                      style={{ position: 'absolute', top, height, left: 2, right: 2, zIndex: isBeingDragged ? 10 : 4,
                        background: color + (isBeingDragged ? 'EE' : isSelected ? 'DD' : 'CC'),
                        borderRadius: borderRadiusVal, overflow: 'hidden',
                        borderTop:    isContinuation ? '2px dashed rgba(255,255,255,0.4)' : ((isSelected || isBeingDragged) ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.2)'),
                        borderRight:  (isSelected || isBeingDragged) ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.2)',
                        borderBottom: isContinued   ? '2px dashed rgba(255,255,255,0.4)' : ((isSelected || isBeingDragged) ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.2)'),
                        borderLeft:   (isSelected || isBeingDragged) ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.2)',
                        boxShadow: isBeingDragged ? `0 8px 28px ${color}55` : isHovered ? `0 10px 28px ${color}88` : isSelected ? `0 2px 8px ${color}44` : 'none',
                        transform: isHovered ? 'scale(1.04)' : 'none',
                        transition: isBeingDragged ? 'none' : 'transform 0.15s ease, box-shadow 0.15s ease',
                        cursor: isBeingDragged ? 'grabbing' : 'grab',
                        opacity: (isBeingDragged && evDrag?.type === 'move') ? 0 : 1 }}>
                      {/* Top resize handle — hidden for continuations and tiny pills */}
                      {!isContinuation && handleH > 0 && (
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: handleH, zIndex: 2, borderRadius: '7px 7px 0 0', touchAction: 'none' }}
                          onTouchStart={e => evTouchStart(e, ev.id, 'resize-top', colIdx)}>
                          <div style={{ width: 12, height: 1, background: 'rgba(255,255,255,0.35)', borderRadius: 1, margin: `${Math.max(3, handleH - 5)}px auto 0` }} />
                        </div>
                      )}
                      {/* Body (move) — pan-y so native scroll still works when not dragging */}
                      <div style={{ position: 'absolute', top: bodyTop, left: 0, right: 0, bottom: bodyBot, padding: `${handleH > 0 && !isContinuation ? handleH + 1 : 2}px 4px ${handleH > 0 && !isContinued ? handleH + 1 : 2}px`, overflow: 'hidden', touchAction: isBeingDragged ? 'none' : 'pan-y' }}
                        onTouchStart={e => !isContinuation && evTouchStart(e, ev.id, 'move', colIdx)}
                        onClick={e => { e.stopPropagation(); setSelectedId(isSelected ? null : ev.id); onEventTap(ev.id); }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', lineHeight: 1.25, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                          {isContinuation ? '↑ ' : ''}{ev.title}
                        </div>
                        {height - handleH * 2 > 26 && (
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', lineHeight: 1, marginTop: 1 }}>
                            {format(evStartRaw, 'HH:mm')} – {format(evEndRaw, 'HH:mm')}
                            {isContinued ? ' ↓' : ''}
                          </div>
                        )}
                      </div>
                      {/* Bottom resize handle — hidden for continued events and tiny pills */}
                      {!isContinued && handleH > 0 && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: handleH, zIndex: 2, borderRadius: '0 0 7px 7px', touchAction: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 3 }}
                          onTouchStart={e => evTouchStart(e, ev.id, 'resize-bottom', colIdx)}>
                          <div style={{ width: 12, height: 1, background: 'rgba(255,255,255,0.35)', borderRadius: 1 }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
