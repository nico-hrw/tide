'use client';

import React from 'react';

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
