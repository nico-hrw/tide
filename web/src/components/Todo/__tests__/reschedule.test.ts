import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isOverdueOpen, pickedDatePatch, reschedulePatch, rescheduleValue, type RescheduleOption } from '../reschedule';

/** Local wall-clock date (month 1-based) in the zone the test runs in. */
const at = (y: number, m: number, d: number, h = 10, min = 15, s = 42) => new Date(y, m - 1, d, h, min, s);

const ZONES = ['Europe/Berlin', 'America/New_York', 'Pacific/Auckland', 'UTC'];

describe.each(ZONES)('rescheduleValue in %s', (zone) => {
  const before = process.env.TZ;
  beforeAll(() => { process.env.TZ = zone; });
  afterAll(() => { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; });

  it('runs in the requested zone', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
  });

  const v = (o: RescheduleOption, now: Date, current?: string) => rescheduleValue(o, current, now);

  it('Jetzt: today with the current local time (minutes, no seconds)', () => {
    expect(v('now', at(2026, 11, 26, 10, 15, 42), '2026-11-20')).toBe('2026-11-26T10:15:00');
    // Late in the evening the local day counts, not the UTC day.
    expect(v('now', at(2026, 11, 26, 23, 59, 59))).toBe('2026-11-26T23:59:00');
    expect(v('now', at(2026, 11, 27, 0, 30))).toBe('2026-11-27T00:30:00');
  });

  it('Heute, Morgen, Übermorgen: date only for an all-day todo', () => {
    const now = at(2026, 11, 26);
    expect(v('today', now, '2026-11-20')).toBe('2026-11-26');
    expect(v('tomorrow', now, '2026-11-20')).toBe('2026-11-27');
    expect(v('dayAfter', now, '2026-11-20')).toBe('2026-11-28');
  });

  it('keeps the todo\'s time of day; midnight counts as all-day', () => {
    const now = at(2026, 11, 26, 7, 0);
    expect(v('tomorrow', now, '2026-11-20T14:30:00')).toBe('2026-11-27T14:30:00');
    expect(v('today', now, '2026-11-20T00:00:00')).toBe('2026-11-26');
    // An ISO string with zone keeps its local wall-clock time.
    const iso = at(2026, 11, 20, 9, 45, 0).toISOString();
    expect(v('dayAfter', now, iso)).toBe('2026-11-28T09:45:00');
  });

  it('month, year and leap-day boundaries', () => {
    expect(v('tomorrow', at(2026, 11, 30))).toBe('2026-12-01');
    expect(v('dayAfter', at(2026, 11, 30))).toBe('2026-12-02');
    expect(v('tomorrow', at(2026, 12, 31))).toBe('2027-01-01');
    expect(v('dayAfter', at(2026, 12, 31))).toBe('2027-01-02');
    expect(v('tomorrow', at(2028, 2, 28))).toBe('2028-02-29');
    expect(v('dayAfter', at(2027, 2, 28))).toBe('2027-03-02');
  });

  it('daylight-saving changes do not shift the day', () => {
    // Europe: 29 Mar 2026 and 25 Oct 2026; US: 8 Mar and 1 Nov 2026; NZ: 5 Apr and 27 Sep 2026.
    expect(v('tomorrow', at(2026, 3, 28, 23, 30))).toBe('2026-03-29');
    expect(v('dayAfter', at(2026, 3, 28, 23, 30))).toBe('2026-03-30');
    expect(v('tomorrow', at(2026, 10, 24, 23, 30), '2026-10-20T02:30:00')).toBe('2026-10-25T02:30:00');
    expect(v('tomorrow', at(2026, 3, 7, 12))).toBe('2026-03-08');
    expect(v('nextWeek', at(2026, 4, 5, 12))).toBe('2026-04-06');
    expect(v('tomorrow', at(2026, 9, 26, 12))).toBe('2026-09-27');
  });

  it('Nächste Woche: the coming Monday, from every weekday incl. the weekend', () => {
    // Mon 23 Nov 2026 … Sun 29 Nov 2026 -> Mon 30 Nov 2026.
    for (let d = 23; d <= 29; d += 1) expect(v('nextWeek', at(2026, 11, d))).toBe('2026-11-30');
    // From a Monday: the Monday a week later.
    expect(v('nextWeek', at(2026, 11, 30))).toBe('2026-12-07');
    // Across the year end: Thu 31 Dec 2026 -> Mon 4 Jan 2027; Sun 3 Jan 2027 -> Mon 4 Jan 2027.
    expect(v('nextWeek', at(2026, 12, 31))).toBe('2027-01-04');
    expect(v('nextWeek', at(2027, 1, 3, 23, 50))).toBe('2027-01-04');
    expect(v('nextWeek', at(2026, 11, 26), '2026-11-20T08:00:00')).toBe('2026-11-30T08:00:00');
  });

  it('Ohne Datum clears the date', () => {
    expect(v('none', at(2026, 11, 26), '2026-11-20')).toBeUndefined();
  });
});

describe('reschedulePatch', () => {
  let now: Date;
  beforeAll(() => { now = at(2026, 11, 26); });

  it('moves dueDate and scheduledDate together', () => {
    expect(reschedulePatch('tomorrow', { dueDate: '2026-11-20', scheduledDate: '2026-11-20' }, now))
      .toEqual({ dueDate: '2026-11-27', scheduledDate: '2026-11-27' });
    expect(reschedulePatch('none', { dueDate: '2026-11-20' }, now)).toEqual({ dueDate: undefined, scheduledDate: undefined });
    // A todo that only has scheduledDate keeps working.
    expect(reschedulePatch('today', { scheduledDate: '2026-11-20T18:00:00' }, now))
      .toEqual({ dueDate: '2026-11-26T18:00:00', scheduledDate: '2026-11-26T18:00:00' });
  });

  it('refuses options later than a subtask\'s parent date (no silent clamping)', () => {
    const sub = { dueDate: '2026-11-20' };
    expect(reschedulePatch('today', sub, now, '2026-11-27')).not.toBeNull();
    expect(reschedulePatch('tomorrow', sub, now, '2026-11-27T09:00:00')).not.toBeNull();
    expect(reschedulePatch('dayAfter', sub, now, '2026-11-27')).toBeNull();
    expect(reschedulePatch('nextWeek', sub, now, '2026-11-27')).toBeNull();
    expect(reschedulePatch('none', sub, now, '2026-11-27')).not.toBeNull();
  });

  it('picked date keeps the time of day and respects max', () => {
    expect(pickedDatePatch('2026-12-03', { dueDate: '2026-11-20T09:30:00' })).toEqual({ dueDate: '2026-12-03T09:30:00', scheduledDate: '2026-12-03T09:30:00' });
    expect(pickedDatePatch('2026-12-03', { dueDate: '2026-11-20' })).toEqual({ dueDate: '2026-12-03', scheduledDate: '2026-12-03' });
    expect(pickedDatePatch('', { dueDate: '2026-11-20' })).toBeNull();
    expect(pickedDatePatch('2026-12-03', { dueDate: '2026-11-20' }, '2026-12-01')).toBeNull();
  });
});

describe('isOverdueOpen', () => {
  let now: Date;
  beforeAll(() => { now = at(2026, 11, 26, 0, 5); });
  const t = (extra: Record<string, unknown>) => ({ isCompleted: false, ...extra });

  it('only open todos dated before today', () => {
    expect(isOverdueOpen(t({ dueDate: '2026-11-25' }), now)).toBe(true);
    expect(isOverdueOpen(t({ scheduledDate: '2026-11-25T23:59:00' }), now)).toBe(true);
    expect(isOverdueOpen(t({ dueDate: '2026-11-26' }), now)).toBe(false);
    // Earlier today is not overdue (day-based, like the "Überfällig" group).
    expect(isOverdueOpen(t({ dueDate: '2026-11-26T00:01:00' }), at(2026, 11, 26, 18, 0))).toBe(false);
    expect(isOverdueOpen(t({ dueDate: '2026-11-27' }), now)).toBe(false);
    expect(isOverdueOpen(t({}), now)).toBe(false);
    expect(isOverdueOpen(t({ dueDate: 'kaputt' }), now)).toBe(false);
  });

  it('never for completed or archived todos', () => {
    expect(isOverdueOpen(t({ dueDate: '2026-11-20', isCompleted: true }), now)).toBe(false);
    expect(isOverdueOpen(t({ dueDate: '2026-11-20', isArchived: true }), now)).toBe(false);
  });
});
