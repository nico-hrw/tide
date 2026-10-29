'use client';

import React, { useState, useEffect, useMemo } from 'react';

const NIGHT_TEMPLATES: readonly string[] = [
  'Gute Nacht{name} – noch wach?', 'Späte Stunde{name}!', 'Schlaf gut{name}!',
  'Noch fleißig unterwegs{name}?', 'Ruhige Nacht{name}!',
];

const MORNING_TEMPLATES: readonly string[] = [
  'Guten Morgen{name}!', 'Frisch in den Tag{name}!', 'Guten Start in den Tag{name}!',
  'Morgenstund hat Gold im Mund{name}!', 'Kaffee bereit{name}?',
];

const MIDDAY_TEMPLATES: readonly string[] = [
  'Mahlzeit{name}!', 'Guten Mittag{name}!', 'Schöne Mittagspause{name}!', 'Halbzeit für heute{name}!',
];

const AFTERNOON_TEMPLATES: readonly string[] = [
  'Guten Tag{name}!', 'Schönen Nachmittag{name}!', 'Weiterhin viel Erfolg{name}!',
  'Energie fürs Nachmittagstief{name}?',
];

const EVENING_TEMPLATES: readonly string[] = [
  'Guten Abend{name}!', 'Feierabend in Sicht{name}!', 'Schönen Ausklang{name}!',
  'Zeit zum Durchatmen{name}!',
];

const GENERAL_TEMPLATES: readonly string[] = [
  'Schön, dich zu sehen{name}!', 'Willkommen zurück{name}!', 'Bereit für den Tag{name}?',
  'Alles im Griff{name}?', 'Hallo{name}!', 'Hi{name}, was steht an?',
  'Dein Tag, dein Tempo{name}!', 'Auf geht\'s{name}!', 'Schön, dass du da bist{name}!',
];

export function pickGreetingTemplate(date: Date): string {
  const h = date.getHours();
  let timePool: readonly string[];

  if (h >= 22 || h < 5) timePool = NIGHT_TEMPLATES;
  else if (h >= 5 && h < 11) timePool = MORNING_TEMPLATES;
  else if (h >= 11 && h < 14) timePool = MIDDAY_TEMPLATES;
  else if (h >= 14 && h < 18) timePool = AFTERNOON_TEMPLATES;
  else timePool = EVENING_TEMPLATES;

  const pool = [...timePool, ...GENERAL_TEMPLATES];
  let last = '';
  if (typeof window !== 'undefined') {
    try {
      last = localStorage.getItem('tide_last_greeting') || '';
    } catch {
      // ignore
    }
  }

  let picked = pool[Math.floor(Math.random() * pool.length)];
  if (picked === last && pool.length > 1) {
    const candidates = pool.filter((t) => t !== last);
    if (candidates.length > 0) {
      picked = candidates[Math.floor(Math.random() * candidates.length)];
    }
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('tide_last_greeting', picked);
    } catch {
      // ignore
    }
  }

  return picked;
}

export function formatGreeting(template: string, name: string): string {
  const trimmed = name?.trim();
  const replacement = trimmed ? `, ${trimmed}` : '';
  return template.split('{name}').join(replacement);
}

export interface CountdownEvent {
  id: string;
  title?: string;
  start: string;
  end?: string;
  allDay?: boolean;
  color?: string;
}

export const NextEventCountdown = React.memo(function NextEventCountdown({
  events,
  onTap,
  className,
}: {
  events: CountdownEvent[];
  onTap?: (eventId: string) => void;
  className?: string;
}) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const target = useMemo(() => {
    if (!events || events.length === 0) return null;
    const nowMs = now.getTime();
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth();
    const nowDate = now.getDate();

    interface ParsedEvent {
      event: CountdownEvent;
      startMs: number;
      endMs: number;
      isToday: boolean;
    }

    const parsed: ParsedEvent[] = [];
    for (const e of events) {
      if (e.allDay || !e.start) continue;
      const s = new Date(e.start);
      const startMs = s.getTime();
      if (isNaN(startMs)) continue;
      const endMs = e.end ? new Date(e.end).getTime() : startMs + 3600000;
      const isToday = s.getFullYear() === nowYear && s.getMonth() === nowMonth && s.getDate() === nowDate;
      parsed.push({ event: e, startMs, endMs, isToday });
    }

    // 1. Active: start <= now && end > now (earliest start if multiple)
    const active = parsed
      .filter((p) => p.startMs <= nowMs && p.endMs > nowMs)
      .sort((a, b) => a.startMs - b.startMs);

    if (active.length > 0) {
      return { event: active[0].event, isActive: true, startMs: active[0].startMs, endMs: active[0].endMs };
    }

    // 2. Next: if no active, first event with start > now today
    const next = parsed
      .filter((p) => p.isToday && p.startMs > nowMs)
      .sort((a, b) => a.startMs - b.startMs);

    if (next.length > 0) {
      return { event: next[0].event, isActive: false, startMs: next[0].startMs, endMs: next[0].endMs };
    }

    return null;
  }, [events, now]);

  if (!target) return null;

  const nowMs = now.getTime();
  const diffSec = Math.max(
    0,
    Math.floor((target.isActive ? target.endMs - nowMs : target.startMs - nowMs) / 1000)
  );

  const pad = (n: number) => n.toString().padStart(2, '0');
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const formattedHoursMins = `${h}:${pad(m)}h`;

  return (
    <button
      type="button"
      onClick={() => onTap?.(target.event.id)}
      className={`w-20 h-20 min-w-[76px] min-h-[76px] p-2 rounded-2xl flex flex-col justify-between items-start text-left bg-gray-900 text-white shadow-[0_4px_12px_rgba(0,0,0,0.18)] shrink-0 transition-transform active:scale-95 ${className || ''}`}
    >
      {target.isActive ? (
        <span className="text-xs font-bold text-gray-300 uppercase tracking-wider leading-none">endet in</span>
      ) : (
        <span className="text-xs font-bold text-gray-300 uppercase tracking-wider leading-none">startet in</span>
      )}
      <span className="text-base sm:text-lg font-black text-white leading-tight">{formattedHoursMins}</span>
      <span className="text-[10px] font-medium text-gray-400 truncate max-w-full leading-tight">{target.event.title || 'Termin'}</span>
    </button>
  );
});
