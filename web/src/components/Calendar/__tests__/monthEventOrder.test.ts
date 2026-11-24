import { describe, expect, it } from 'vitest';
import { compareMonthEvents, sortMonthEvents } from '../monthEventOrder';

const ev = (id: string, start: string, extra: Record<string, unknown> = {}) => ({ id, title: id, start, ...extra });

describe('monthEventOrder', () => {
  it('sorts timed events earliest first', () => {
    const list = [
      ev('c', '2026-12-02T15:00:00.000Z'),
      ev('a', '2026-12-02T08:00:00.000Z'),
      ev('b', '2026-12-02T11:30:00.000Z'),
    ];
    expect(sortMonthEvents(list).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('places todos first, then all-day, then timed events by start', () => {
    const list = [
      ev('late', '2026-12-02T18:00:00.000Z'),
      ev('todo', '2026-12-02T20:00:00.000Z', { is_task: true }),
      ev('early', '2026-12-02T07:00:00.000Z'),
      ev('allday', '2026-12-02T00:00:00.000Z', { allDay: true }),
    ];
    expect(sortMonthEvents(list).map((e) => e.id)).toEqual(['todo', 'allday', 'early', 'late']);
  });

  it('breaks ties by title and is stable for equal titles', () => {
    const list = [
      ev('x1', '2026-12-02T09:00:00.000Z', { title: 'Zebra' }),
      ev('x2', '2026-12-02T09:00:00.000Z', { title: 'Apfel' }),
      ev('x3', '2026-12-02T09:00:00.000Z', { title: 'Apfel' }),
    ];
    expect(sortMonthEvents(list).map((e) => e.id)).toEqual(['x2', 'x3', 'x1']);
  });

  it('does not mutate the input', () => {
    const list = [ev('b', '2026-12-02T11:00:00.000Z'), ev('a', '2026-12-02T08:00:00.000Z')];
    sortMonthEvents(list);
    expect(list.map((e) => e.id)).toEqual(['b', 'a']);
    expect(compareMonthEvents(list[0], list[1])).toBeGreaterThan(0);
  });
});
