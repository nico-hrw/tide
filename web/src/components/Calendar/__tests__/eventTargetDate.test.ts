import { describe, expect, it } from 'vitest';
import { eventTargetDate } from '../eventTargetDate';

const events = [
  { id: 'a', start: '2026-12-02T10:00:00.000Z' },
  { id: 'b-c', start: '2026-01-05T08:00:00.000Z' },
];

describe('eventTargetDate', () => {
  it('uses the start of a plain event', () => {
    expect(eventTargetDate('a', events)?.toISOString()).toBe('2026-12-02T10:00:00.000Z');
  });

  it('uses the occurrence timestamp of a recurring id', () => {
    const ts = Date.UTC(2027, 2, 9, 8);
    expect(eventTargetDate(`b-c_${ts}`, events)?.getTime()).toBe(ts);
  });

  it('returns null for unknown events', () => {
    expect(eventTargetDate('zzz', events)).toBeNull();
    expect(eventTargetDate('zzz_123', events)).toBeNull();
  });
});
