import { describe, expect, it } from 'vitest';
import { moveRange, pxToMin, resizeEnd, resizeStart, type Range } from '../quickEditMath';
import { SNAP_MIN } from '../timelineMath';

const dayStart = new Date(2026, 10, 20).getTime();
const MIN = 60000;
const t = (h: number, m = 0) => dayStart + (h * 60 + m) * MIN;
const r = (sh: number, sm: number, eh: number, em: number): Range => ({ start: t(sh, sm), end: t(eh, em) });

function expectValid(x: Range) {
  expect(x.start).toBeGreaterThanOrEqual(dayStart);
  expect(x.end).toBeLessThanOrEqual(t(24));
  expect(x.end - x.start).toBeGreaterThanOrEqual(SNAP_MIN * MIN);
}

describe('moveRange', () => {
  it('snaps a +37 min move to 10 min and keeps the length', () => {
    expect(moveRange(r(9, 0, 10, 0), 37, dayStart)).toEqual(r(9, 40, 10, 40));
  });
  it('clamps at the start of the day', () => {
    expect(moveRange(r(9, 0, 10, 0), -600, dayStart)).toEqual(r(0, 0, 1, 0));
  });
  it('clamps at the end of the day', () => {
    expect(moveRange(r(9, 0, 10, 0), 2000, dayStart)).toEqual(r(23, 0, 24, 0));
  });
  it('treats delta 0 as a no-op', () => {
    expect(moveRange(r(9, 0, 10, 0), 0, dayStart)).toEqual(r(9, 0, 10, 0));
    expect(moveRange(r(9, 3, 10, 7), 0, dayStart)).toEqual(r(9, 3, 10, 7));
  });
  it('keeps a non-aligned range valid and snaps its start', () => {
    const out = moveRange(r(9, 3, 10, 7), 20, dayStart);
    expect(out).toEqual(r(9, 20, 10, 24));
    expectValid(out);
  });
  it('leaves a range already at the day end inside the day', () => {
    expect(moveRange(r(23, 0, 24, 0), 30, dayStart)).toEqual(r(23, 0, 24, 0));
  });
  it('grows a too-short range to the minimum duration', () => {
    const out = moveRange({ start: t(9), end: t(9) }, 10, dayStart);
    expect(out).toEqual(r(9, 10, 9, 20));
  });
});

describe('resizeEnd', () => {
  it('keeps the minimum duration of SNAP_MIN', () => {
    expect(resizeEnd(r(9, 0, 10, 0), -120, dayStart)).toEqual(r(9, 0, 9, 10));
  });
  it('snaps the new end to 10 min', () => {
    expect(resizeEnd(r(9, 0, 10, 0), 23, dayStart)).toEqual(r(9, 0, 10, 20));
  });
  it('never passes the end of the day', () => {
    expect(resizeEnd(r(23, 0, 24, 0), 60, dayStart)).toEqual(r(23, 0, 24, 0));
  });
  it('treats delta 0 as a no-op', () => {
    expect(resizeEnd(r(9, 3, 10, 7), 0, dayStart)).toEqual(r(9, 3, 10, 7));
  });
  it('keeps a non-aligned range valid', () => {
    const out = resizeEnd(r(9, 3, 10, 7), -60, dayStart);
    // Raw end 09:07 snaps to 09:10, but the minimum duration pushes it to 09:13.
    expect(out).toEqual(r(9, 3, 9, 13));
    expectValid(out);
  });
});

describe('resizeStart', () => {
  it('keeps the minimum duration of SNAP_MIN', () => {
    expect(resizeStart(r(9, 0, 10, 0), 120, dayStart)).toEqual(r(9, 50, 10, 0));
  });
  it('clamps at the start of the day', () => {
    expect(resizeStart(r(9, 0, 10, 0), -9999, dayStart)).toEqual(r(0, 0, 10, 0));
  });
  it('treats delta 0 as a no-op', () => {
    expect(resizeStart(r(9, 0, 10, 0), 0, dayStart)).toEqual(r(9, 0, 10, 0));
  });
  it('keeps a range already at the day end valid', () => {
    expect(resizeStart(r(23, 50, 24, 0), 30, dayStart)).toEqual(r(23, 50, 24, 0));
    expect(resizeStart(r(23, 0, 24, 0), 27, dayStart)).toEqual(r(23, 30, 24, 0));
  });
  it('keeps a non-aligned range valid', () => {
    const out = resizeStart(r(9, 3, 10, 7), 61, dayStart);
    expect(out).toEqual(r(9, 57, 10, 7));
    expectValid(out);
  });
});

describe('pxToMin', () => {
  it('converts pixels to minutes for the given hour height', () => {
    expect(pxToMin(48, 48)).toBe(60);
    expect(pxToMin(28, 56)).toBe(30);
    expect(pxToMin(-56, 56)).toBe(-60);
  });
});
