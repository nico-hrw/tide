'use client';

import React, { useRef, useState } from 'react';

const SWIPE_LIMIT = 120;
const SWIPE_TRIGGER = 60;

/**
 * Wischen auf einer Todo-Karte: nach rechts erledigen, nach links löschen.
 * Nach einem Wisch wird der folgende Klick unterdrückt, damit kein Detail aufgeht.
 */
export function SwipeRow({
  children, onComplete, onDelete, completeLabel,
}: { children: React.ReactNode; onComplete: () => void; onDelete: () => void; completeLabel: string }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dxRef = useRef(0);
  const startRef = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null);
  const swipedRef = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY, axis: null };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const s = startRef.current;
    if (!s) return;
    const t = e.touches[0];
    const ddx = t.clientX - s.x;
    const ddy = t.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;
      s.axis = Math.abs(ddx) > Math.abs(ddy) ? 'x' : 'y';
    }
    if (s.axis !== 'x') return;
    const limited = Math.max(-SWIPE_LIMIT, Math.min(SWIPE_LIMIT, ddx));
    dxRef.current = limited;
    setDragging(true);
    setDx(limited);
  };

  const onTouchEnd = () => {
    const s = startRef.current;
    startRef.current = null;
    const final = dxRef.current;
    dxRef.current = 0;
    setDx(0);
    setDragging(false);
    if (s?.axis !== 'x') return;
    swipedRef.current = true;
    setTimeout(() => { swipedRef.current = false; }, 300);
    if (final > SWIPE_TRIGGER) onComplete();
    else if (final < -SWIPE_TRIGGER) onDelete();
  };

  return (
    <div
      className="relative overflow-hidden rounded-[18px]"
      style={{ touchAction: 'pan-y' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onClickCapture={(e) => { if (swipedRef.current) { e.stopPropagation(); e.preventDefault(); } }}
    >
      <div
        className={`absolute inset-0 flex items-center justify-between px-5 text-[13px] font-semibold text-white pointer-events-none ${
          dx > 0 ? 'bg-emerald-500' : dx < 0 ? 'bg-rose-500' : 'bg-transparent'
        }`}
      >
        <span className={dx > 30 ? 'opacity-100' : 'opacity-0'}>{completeLabel}</span>
        <span className={dx < -30 ? 'opacity-100' : 'opacity-0'}>Löschen</span>
      </div>
      <div
        className="relative"
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform 0.2s ease-out' }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Fortschrittsring: ein Segment pro Element (Untertodo oder das Todo selbst).
 * Erledigte Segmente sind gefüllt, offene bleiben als Spur sichtbar.
 */
export function TodoProgressRing({
  segments, inverted = false, size = 30,
}: { segments: boolean[]; inverted?: boolean; size?: number }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  const n = Math.max(1, segments.length);
  const gap = n > 1 ? 4 : 0;
  const seg = (c - gap * n) / n;
  const filled = inverted ? 'currentColor' : 'var(--t2-ink)';
  const track = inverted ? 'rgba(255,255,255,0.28)' : 'var(--t2-line)';
  const items = segments.length ? segments : [false];

  return (
    <svg width={size} height={size} viewBox="0 0 30 30" className="shrink-0 cursor-pointer" aria-hidden>
      <g transform="rotate(-90 15 15)">
        {items.map((done, i) => (
          <circle
            key={i}
            cx="15"
            cy="15"
            r={r}
            fill="none"
            stroke={done ? filled : track}
            strokeWidth={3.2}
            strokeDasharray={`${seg} ${c - seg}`}
            strokeDashoffset={-(i * (seg + gap))}
          />
        ))}
      </g>
    </svg>
  );
}

/** Häkchen für Untertodos, Kreis mit Haken wenn erledigt. */
export function CheckMark({
  checked, inverted = false, size = 18,
}: { checked: boolean; inverted?: boolean; size?: number }) {
  const ring = inverted ? 'rgba(255,255,255,0.85)' : 'var(--t2-ink-3)';
  const fill = inverted ? '#fff' : 'var(--t2-ink)';
  const mark = inverted ? 'var(--t2-blue)' : 'var(--t2-bg)';
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, boxShadow: checked ? 'none' : `inset 0 0 0 1.5px ${ring}`, background: checked ? fill : 'transparent' }}
      aria-hidden
    >
      {checked && (
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke={mark} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 5 5L20 7" />
        </svg>
      )}
    </span>
  );
}
