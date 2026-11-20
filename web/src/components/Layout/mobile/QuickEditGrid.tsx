'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { format, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { Check, X } from 'lucide-react';
import { DT } from '@/lib/designTokens';
import { paletteFor } from './eventPalette';
import { moveRange, pxToMin, resizeEnd, resizeStart, type Range } from './quickEditMath';

export interface QuickEditTarget {
  id: string | null;
  title: string;
  color?: string;
  start: Date;
  end: Date;
}

export interface QuickEditGridProps {
  day: Date;
  context: Array<{ id: string; title: string; color?: string; start: Date; end: Date }>;
  target: QuickEditTarget;
  mode: 'edit' | 'draft';
  onConfirm: (start: Date, end: Date) => void;
  onCancel: () => void;
}

/** Fixed hour height of the quick edit grid. */
export const QE_HOUR_PX = 56;
const PAD_Y = 12;
const LABEL_COL = 58;
const HANDLE_HIT_PX = 44;
const SCROLL_ZONE = 60;
const MIN_MS = 60000;
const DAY_MS = 24 * 60 * MIN_MS;

type DragKind = 'move' | 'start' | 'end';
interface Drag { kind: DragKind; startY: number; startScroll: number; origin: Range }

const minToPx = (min: number) => (min / 60) * QE_HOUR_PX;

function clockLabel(ms: number, dayStartMs: number): string {
  return ms - dayStartMs >= DAY_MS ? '24:00' : format(new Date(ms), 'HH:mm');
}

function durationLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m} Min.`;
  return `${h} h${m > 0 ? ` ${m} Min.` : ''}`;
}

/** Clips the target into the day so the block always starts inside the grid. */
function initialRange(target: QuickEditTarget, dayStartMs: number): Range {
  return resizeEnd(
    { start: target.start.getTime(), end: target.end.getTime() },
    0,
    dayStartMs,
  );
}

/**
 * Full-screen overlay with a day grid (56 px per hour) for moving and resizing one event.
 * Body drag moves the block, the top/bottom handles change start/end, all snapped to 10 min.
 * Nothing is persisted here: ✓ reports the current range, ✕ cancels.
 */
export function QuickEditGrid({ day, context, target, mode, onConfirm, onCancel }: QuickEditGridProps) {
  const dayStartMs = useMemo(() => startOfDay(day).getTime(), [day]);
  const [range, setRange] = useState<Range>(() => initialRange(target, dayStartMs));
  const [dragging, setDragging] = useState(false);
  const rangeRef = useRef(range);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const palette = paletteFor(target.color);

  const topOf = useCallback((ms: number) => PAD_Y + minToPx((ms - dayStartMs) / MIN_MS), [dayStartMs]);

  // Scroll so the active block sits in the upper third on open.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, topOf(rangeRef.current.start) - el.clientHeight / 3);
  }, [topOf]);

  // Unmount during a drag: drop the document listeners.
  useEffect(() => () => cleanupRef.current?.(), []);

  const beginDrag = (kind: DragKind) => (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || cleanupRef.current) return;
    e.stopPropagation();
    const scroller = scrollRef.current;
    const drag: Drag = {
      kind,
      startY: e.touches[0].clientY,
      startScroll: scroller?.scrollTop ?? 0,
      origin: rangeRef.current,
    };
    let lastY = drag.startY;
    let frame = 0;
    let autoFrame = 0;

    const apply = () => {
      frame = 0;
      const dy = lastY - drag.startY + ((scroller?.scrollTop ?? 0) - drag.startScroll);
      const delta = pxToMin(dy, QE_HOUR_PX);
      const fn = kind === 'move' ? moveRange : kind === 'start' ? resizeStart : resizeEnd;
      const next = fn(drag.origin, delta, dayStartMs);
      if (next.start !== rangeRef.current.start || next.end !== rangeRef.current.end) {
        rangeRef.current = next;
        setRange(next);
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };

    // Auto-scroll while the finger is near the top or bottom of the grid.
    const autoScroll = () => {
      autoFrame = 0;
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect();
      const fromTop = lastY - rect.top;
      const fromBottom = rect.bottom - lastY;
      let step = 0;
      if (fromTop < SCROLL_ZONE) step = -Math.max(2, (SCROLL_ZONE - fromTop) / 6);
      else if (fromBottom < SCROLL_ZONE) step = Math.max(2, (SCROLL_ZONE - fromBottom) / 6);
      if (step === 0) return;
      const before = scroller.scrollTop;
      scroller.scrollTop = before + step;
      if (scroller.scrollTop !== before) schedule();
      autoFrame = requestAnimationFrame(autoScroll);
    };

    const onMove = (evt: TouchEvent) => {
      if (evt.touches.length === 0) return;
      evt.preventDefault();
      lastY = evt.touches[0].clientY;
      schedule();
      if (!autoFrame) autoFrame = requestAnimationFrame(autoScroll);
    };

    const cleanup = () => {
      if (frame) cancelAnimationFrame(frame);
      if (autoFrame) cancelAnimationFrame(autoFrame);
      frame = 0;
      autoFrame = 0;
      document.removeEventListener('touchmove', onMove, { capture: true });
      document.removeEventListener('touchend', onEnd, { capture: true });
      document.removeEventListener('touchcancel', onEnd, { capture: true });
      document.body.removeAttribute('data-ev-drag');
      cleanupRef.current = null;
    };

    function onEnd() {
      if (frame) { cancelAnimationFrame(frame); apply(); }
      cleanup();
      flushSync(() => { setRange(rangeRef.current); setDragging(false); });
      // iOS: preventDefault() during the drag can freeze UIScrollView. Jiggling scrollTop re-enables it.
      if (scroller) { const st = scroller.scrollTop; scroller.scrollTop = st + 1; scroller.scrollTop = st; }
    }

    document.addEventListener('touchmove', onMove, { passive: false, capture: true });
    document.addEventListener('touchend', onEnd, { capture: true });
    document.addEventListener('touchcancel', onEnd, { capture: true });
    document.body.setAttribute('data-ev-drag', '1');
    cleanupRef.current = cleanup;
    setDragging(true);
  };

  const blockTop = topOf(range.start);
  const blockH = topOf(range.end) - blockTop;
  const handleInset = Math.min(10, blockH / 3);
  const durMin = (range.end - range.start) / MIN_MS;
  const title = target.title || (mode === 'draft' ? 'Neuer Termin' : 'Ohne Titel');
  const timeText = `${clockLabel(range.start, dayStartMs)} – ${clockLabel(range.end, dayStartMs)} · ${durationLabel(durMin)}`;

  const contextBlocks = context
    .filter(c => c.id !== target.id)
    .map(c => {
      const s = Math.max(c.start.getTime(), dayStartMs);
      const en = Math.min(c.end.getTime(), dayStartMs + DAY_MS);
      return en > s ? { ...c, s, en } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const roundBtn: React.CSSProperties = {
    width: HANDLE_HIT_PX, height: HANDLE_HIT_PX, borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };

  const overlay = (
    <div
      className="fixed inset-0 z-[60]"
      data-quick-edit="grid"
      onTouchStart={stop}
      onTouchMove={stop}
      onTouchEnd={stop}
      onClick={stop}
    >
      <div className="absolute inset-0" style={{ background: DT.modal.scrim }} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} bearbeiten`}
        className="absolute left-0 right-0 bottom-0 flex flex-col overflow-hidden"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 44px)',
          background: 'var(--t2-surface)',
          color: 'var(--t2-ink)',
          borderRadius: `${DT.radiusModal} ${DT.radiusModal} 0 0`,
          boxShadow: DT.shadowE2,
        }}
      >
        <div
          className="flex items-center justify-between shrink-0"
          style={{ height: 56, padding: '0 10px 0 16px', borderBottom: '1px solid var(--t2-line)' }}
        >
          <div className="min-w-0 truncate" style={{ fontSize: 14, fontWeight: 700 }}>
            {title}
            <small style={{ fontWeight: 500, color: 'var(--t2-ink-3)', fontSize: 12, marginLeft: 6 }}>
              {format(day, 'EEEEEE, dd.MM.', { locale: de })}
            </small>
          </div>
          <div className="flex items-center shrink-0" style={{ gap: 4 }}>
            <button
              type="button"
              aria-label="Abbrechen"
              onClick={onCancel}
              className="active:scale-95 transition-transform"
              style={{ ...roundBtn, background: 'var(--t2-sub)', color: 'var(--t2-ink-2)' }}
            >
              <X size={18} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              aria-label="Übernehmen"
              onClick={() => onConfirm(new Date(rangeRef.current.start), new Date(rangeRef.current.end))}
              className="active:scale-95 transition-transform"
              style={{ ...roundBtn, background: 'var(--t2-accent)', color: 'var(--t2-accent-ink)' }}
            >
              <Check size={18} strokeWidth={2.6} />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto no-scrollbar"
          style={{ position: 'relative', touchAction: 'pan-y', overscrollBehavior: 'contain' }}
        >
          <div style={{ position: 'relative', height: PAD_Y * 2 + 24 * QE_HOUR_PX }}>
            {Array.from({ length: 25 }, (_, h) => (
              <div
                key={h}
                aria-hidden
                style={{ position: 'absolute', left: 0, right: 0, top: PAD_Y + h * QE_HOUR_PX, borderTop: '1px solid var(--t2-line)' }}
              >
                <span
                  style={{
                    position: 'absolute', left: 10, top: -7, fontSize: 11, lineHeight: 1,
                    color: 'var(--t2-ink-3)', background: 'var(--t2-surface)', paddingRight: 4,
                  }}
                >
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}

            {contextBlocks.map(c => {
              const p = paletteFor(c.color);
              const top = topOf(c.s);
              return (
                <div
                  key={c.id}
                  data-qe="context"
                  style={{
                    position: 'absolute', left: LABEL_COL + 4, right: 14, top,
                    height: Math.max(14, topOf(c.en) - top - 2), background: p.bg, color: p.ink,
                    borderRadius: DT.radius, padding: '3px 9px', fontSize: 12, fontWeight: 600,
                    opacity: 0.35, overflow: 'hidden', pointerEvents: 'none',
                  }}
                >
                  {c.title}
                </div>
              );
            })}

            {dragging && (
              <div
                data-qe="time"
                aria-live="polite"
                style={{
                  position: 'absolute', right: 14, top: Math.max(2, blockTop - 34), zIndex: 4,
                  fontSize: 12, fontWeight: 700, background: 'var(--t2-ink)', color: 'var(--t2-surface)',
                  padding: '3px 9px', borderRadius: DT.radius, pointerEvents: 'none', whiteSpace: 'nowrap',
                }}
              >
                {timeText}
              </div>
            )}

            <div
              data-qe="active"
              onTouchStart={beginDrag('move')}
              style={{
                position: 'absolute', left: LABEL_COL, right: 10, top: blockTop, height: blockH, zIndex: 3,
                borderRadius: DT.radiusUi, border: `2px ${mode === 'draft' ? 'dashed' : 'solid'} ${palette.bg}`,
                background: `color-mix(in srgb, ${palette.bg} 22%, var(--t2-surface))`,
                boxShadow: DT.shadowFloat, color: 'var(--t2-ink)', touchAction: 'none',
                padding: blockH < 36 ? '0 12px' : '6px 12px', fontSize: 13, fontWeight: 700,
                userSelect: 'none', WebkitUserSelect: 'none',
              }}
            >
              <div className="truncate" style={{ lineHeight: blockH < 36 ? `${Math.max(0, blockH - 4)}px` : 1.3 }}>
                {title}
              </div>
              {blockH >= 52 && (
                <small style={{ display: 'block', fontWeight: 500, color: 'var(--t2-ink-2)', fontSize: 11, marginTop: 2 }}>
                  {dragging ? timeText : 'Ziehen zum Verschieben'}
                </small>
              )}
              {(['start', 'end'] as const).map(kind => (
                // Hit area: 44 px, mostly outside the block so the body stays grabbable on short blocks.
                // The visible pill is centred on the block edge.
                <div
                  key={kind}
                  data-qe={`handle-${kind}`}
                  onTouchStart={beginDrag(kind)}
                  style={{
                    position: 'absolute', left: 0, right: 0, height: HANDLE_HIT_PX, touchAction: 'none',
                    ...(kind === 'start' ? { top: handleInset - HANDLE_HIT_PX } : { bottom: handleInset - HANDLE_HIT_PX }),
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute', left: '50%', marginLeft: -22, width: 44, height: 20, borderRadius: 99,
                      background: palette.bg, border: '3px solid var(--t2-surface)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      ...(kind === 'start' ? { bottom: handleInset - 10 } : { top: handleInset - 10 }),
                    }}
                  >
                    <span style={{ width: 14, height: 2, borderRadius: 2, background: palette.ink, opacity: 0.8 }} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? null : createPortal(overlay, document.body);
}
