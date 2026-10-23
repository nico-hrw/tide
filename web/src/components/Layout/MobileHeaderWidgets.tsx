'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { DT } from '@/lib/designTokens';

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

function getColorStyles(color?: string) {
  const fallback = DT.accent || '#3b82f6';
  const c = color && color.trim() ? color.trim() : fallback;
  if (/^#[0-9a-fA-F]{6}$/.test(c)) {
    return { bg: `${c}1F`, border: `1px solid ${c}40`, dot: c, text: c };
  }
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    const expanded = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    return { bg: `${expanded}1F`, border: `1px solid ${expanded}40`, dot: expanded, text: expanded };
  }
  return { bg: `${fallback}1F`, border: `1px solid ${fallback}40`, dot: fallback, text: fallback };
}

export const NextEventCountdown = React.memo(function NextEventCountdown({
  events,
  onTap,
}: {
  events: CountdownEvent[];
  onTap?: (eventId: string) => void;
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
  const s = diffSec % 60;
  const timeStr = `${pad(h)}:${pad(m)}:${pad(s)}`;

  const title = target.event.title?.trim() || 'Termin';
  const colorStyles = getColorStyles(target.event.color);

  return (
    <button
      type="button"
      onClick={() => onTap?.(target.event.id)}
      aria-label={`${target.isActive ? 'Laufender Termin' : 'Nächster Termin'}: ${title}, ${
        target.isActive ? 'noch' : 'in'
      } ${timeStr}`}
      className="shrink-0 max-w-[150px] w-full cursor-pointer text-left transition-opacity hover:opacity-90 active:scale-[0.98] transition-transform overflow-hidden"
      style={{
        borderRadius: DT.cardRadius || '14px',
        padding: '6px 10px',
        backgroundColor: colorStyles.bg,
        border: colorStyles.border,
      }}
    >
      <div
        className="text-[12px] font-bold truncate leading-tight"
        style={{ color: 'var(--foreground, #111827)' }}
        title={title}
      >
        {title}
      </div>
      <div className="text-[11px] font-medium tabular-nums flex items-center gap-1.5 leading-tight mt-0.5">
        {target.isActive && (
          <span className="relative flex h-2 w-2 shrink-0">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ backgroundColor: colorStyles.dot }}
            />
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ backgroundColor: colorStyles.dot }}
            />
          </span>
        )}
        <span className="text-[var(--muted-text,#6b7280)] font-normal">
          {target.isActive ? 'noch' : 'in'}
        </span>
        <span className="font-bold" style={{ color: colorStyles.text }}>
          {timeStr}
        </span>
      </div>
    </button>
  );
});
