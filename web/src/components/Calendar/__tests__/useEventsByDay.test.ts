import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useEventsByDay } from '../useEventsByDay';
import type { CalendarEvent } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Result = ReturnType<typeof useEventsByDay>;
type Range = { start: Date; end: Date };

interface HarnessProps {
  events: CalendarEvent[];
  range: Range;
  onResult: (r: Result) => void;
}

function Harness({ events, range, onResult }: HarnessProps) {
  onResult(useEventsByDay(events, range, null, undefined));
  return null;
}

const ev = (id: string, day: number, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  title: `Event ${id}`,
  start: new Date(2026, 10, day, 9, 0).toISOString(),
  end: new Date(2026, 10, day, 10, 0).toISOString(),
  ...extra,
});

const RANGE: Range = { start: new Date(2026, 10, 1), end: new Date(2026, 10, 30) };

describe('useEventsByDay identity stability', () => {
  let root: Root;
  let host: HTMLDivElement;
  const out: { current: Result | null } = { current: null };

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    out.current = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function render(events: CalendarEvent[], range: Range = RANGE) {
    act(() => {
      root.render(React.createElement(Harness, {
        events, range, onResult: (r: Result) => { out.current = r; },
      }));
    });
    return out.current!;
  }

  it('returns the same array for an unchanged day when events are re-created', () => {
    const first = render([ev('a', 10), ev('b', 12)]);
    const a1 = first.timedMap.get('2026-11-10');
    const b1 = first.timedMap.get('2026-11-12');
    expect(a1).toHaveLength(1);

    // Fresh objects with identical content (what a store merge produces).
    const second = render([ev('a', 10), ev('b', 12)]);
    expect(second).not.toBe(first);
    expect(second.timedMap.get('2026-11-10')).toBe(a1);
    expect(second.timedMap.get('2026-11-12')).toBe(b1);
  });

  it('returns a new array only for the day whose event changed', () => {
    const first = render([ev('a', 10), ev('b', 12)]);
    const a1 = first.timedMap.get('2026-11-10');
    const b1 = first.timedMap.get('2026-11-12');

    const second = render([ev('a', 10), ev('b', 12, { title: 'Renamed' })]);
    expect(second.timedMap.get('2026-11-10')).toBe(a1);
    expect(second.timedMap.get('2026-11-12')).not.toBe(b1);
    expect(second.timedMap.get('2026-11-12')![0].title).toBe('Renamed');
  });

  it('detects changes to start, cancellation and completion', () => {
    const first = render([ev('a', 10), ev('b', 12), ev('c', 14)]);
    const second = render([
      ev('a', 10, { is_cancelled: true }),
      ev('b', 12, { is_completed: true }),
      ev('c', 15),
    ]);
    expect(second.timedMap.get('2026-11-10')).not.toBe(first.timedMap.get('2026-11-10'));
    expect(second.timedMap.get('2026-11-12')).not.toBe(first.timedMap.get('2026-11-12'));
    expect(second.timedMap.get('2026-11-14')).toBeUndefined();
    expect(second.timedMap.get('2026-11-15')).toHaveLength(1);
  });

  it('keeps recurring-occurrence days stable when the range shifts', () => {
    const weekly = ev('r', 2, { recurrence: 'weekly' });
    const first = render([weekly]);
    const nov9 = first.timedMap.get('2026-11-09');
    expect(nov9).toHaveLength(1);

    const shifted = render([weekly], { start: new Date(2026, 10, 5), end: new Date(2026, 11, 20) });
    expect(shifted.timedMap.get('2026-11-09')).toBe(nov9);
    expect(shifted.timedMap.get('2026-12-14')).toHaveLength(1);
  });

  it('prunes cache entries outside the range so they come back as new arrays', () => {
    // Recurring occurrences exist only inside the range; one-off events are not range-filtered.
    const events = [ev('r', 2, { recurrence: 'weekly' })];
    const first = render(events);
    const a1 = first.timedMap.get('2026-11-10') ?? first.timedMap.get('2026-11-09');
    const key = first.timedMap.get('2026-11-09') ? '2026-11-09' : '2026-11-10';

    // Range moves away: day is gone from the result and from the cache.
    const away = render(events, { start: new Date(2027, 0, 1), end: new Date(2027, 0, 20) });
    expect(away.timedMap.get(key)).toBeUndefined();

    const back = render(events);
    expect(back.timedMap.get(key)).toEqual(a1);
    expect(back.timedMap.get(key)).not.toBe(a1);
  });

  it('keeps all-day maps stable independently of the timed map', () => {
    const allDay = ev('d', 11, { allDay: true });
    const first = render([allDay, ev('a', 10)]);
    const d1 = first.allDayMap.get('2026-11-11');
    const second = render([ev('d', 11, { allDay: true }), ev('a', 10, { title: 'x' })]);
    expect(second.allDayMap.get('2026-11-11')).toBe(d1);
  });
});
