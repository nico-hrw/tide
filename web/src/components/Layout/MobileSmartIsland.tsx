'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { paletteFor } from './mobile/eventPalette';

export interface CountdownEvent {
  id: string;
  title?: string;
  start: string;
  end?: string;
  allDay?: boolean;
  color?: string;
  is_completed?: boolean;
  is_all_day?: boolean;
  is_task?: boolean;
  isCompleted?: boolean;
  completed_dates?: string[];
}

export interface MobileSmartIslandProps {
  events?: CountdownEvent[];
  onTap?: (eventId: string) => void;
  onEventClick?: (eventId: string) => void;
  className?: string;
  isLoading?: boolean;
  userName?: string;
  placement?: 'top-right' | 'bottom-left';
}

const pad = (n: number) => n.toString().padStart(2, '0');

interface Current {
  event: CountdownEvent;
  startMs: number;
  endMs: number;
}

/** The event running right now (earliest start wins); all-day events and todos are ignored. */
function findCurrent(events: CountdownEvent[], nowMs: number): Current | null {
  let best: Current | null = null;
  for (const e of events) {
    if (e.allDay || e.is_all_day || e.is_task || !e.start) continue;
    if (e.is_completed || e.isCompleted || (e.completed_dates && e.completed_dates.length > 0)) continue;
    const startMs = new Date(e.start).getTime();
    if (isNaN(startMs)) continue;
    const endMs = e.end ? new Date(e.end).getTime() : startMs + 3600000;
    if (startMs <= nowMs && endMs > nowMs && (!best || startMs < best.startMs)) {
      best = { event: e, startMs, endMs };
    }
  }
  return best;
}

export const MobileSmartIsland = React.memo(function MobileSmartIsland({
  events = [],
  onTap,
  onEventClick,
  className,
}: MobileSmartIslandProps) {
  const [now, setNow] = useState<number>(() => Date.now());
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const current = useMemo(() => findCurrent(events, now), [events, now]);
  const minutes = current ? Math.max(1, Math.ceil((current.endMs - now) / 60000)) : null;
  const pal = current ? paletteFor(current.event.color) : null;
  const title = current ? (current.event.title || 'Termin').toUpperCase() : 'KEIN TERMIN';

  const bg = pal ? pal.bg : 'var(--t2-ink)';
  const ink = pal ? pal.ink : 'var(--t2-bg)';
  const bigSize = minutes !== null && minutes >= 100 ? 40 : 52;

  const content = (
    <div className="h-full flex flex-col justify-between">
      <div>
        <small className="block truncate text-[10px] font-bold uppercase leading-tight tracking-[0.09em]">{title}</small>
        <small className="block text-[10px] font-bold uppercase leading-tight tracking-[0.09em] opacity-55">IN</small>
      </div>
      <b className="font-bold leading-[0.9] tracking-[-0.05em]" style={{ fontSize: bigSize }}>
        {minutes ?? '–'}
        {minutes !== null && <i className="not-italic text-[16px] font-semibold tracking-normal"> min</i>}
      </b>
    </div>
  );

  const fmt = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  return (
    <div ref={ref} className={`relative shrink-0 ${className ?? ''}`} style={{ width: 112, height: 104 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => current && setOpen(o => !o)}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && current) setOpen(o => !o); }}
        className="absolute top-0 right-0 cursor-pointer select-none active:scale-[0.98] transition-transform"
        style={{
          width: open ? 240 : 112,
          height: open ? 'auto' : 104,
          minHeight: 104,
          padding: open ? '16px 16px 14px' : '13px 14px',
          borderRadius: 24,
          background: bg,
          color: ink,
          zIndex: open ? 50 : 1,
          boxShadow: open ? '0 12px 32px -8px rgba(0,0,0,0.35)' : 'none',
        }}
      >
        {open && current ? (
          <div className="flex flex-col gap-3">
            <div style={{ height: 80 }}>{content}</div>
            <div className="text-[13px] font-semibold leading-snug">{current.event.title || 'Termin'}</div>
            <div className="flex items-center justify-between text-[12px] opacity-80">
              <span>{fmt(current.startMs)} – {fmt(current.endMs)} Uhr</span>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  const fn = onEventClick ?? onTap;
                  fn?.(current.event.id);
                  setOpen(false);
                }}
                className="font-bold underline underline-offset-2"
              >
                Öffnen
              </button>
            </div>
          </div>
        ) : content}
      </div>
    </div>
  );
});
