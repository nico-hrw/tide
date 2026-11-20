import { describe, expect, it } from 'vitest';
import {
  DAY_MIN_BLOCK_PX,
  DAY_PX_PER_MIN,
  GAP_PX,
  blockHeightPx,
  draftRangeFromTime,
  gapHeightPx,
  nowPlacement,
  roundToStep,
  timeFromTap,
  type SegRect,
} from '../timelineMath';

const H = 3600000;
const MIN = 60000;
const dayStart = new Date(2026, 0, 5, 0, 0, 0, 0).getTime();
const at = (h: number, m = 0) => dayStart + h * H + m * MIN;

describe('gapHeightPx', () => {
  it('uses the fixed height when not active', () => {
    expect(gapHeightPx(0, 3 * H, null)).toBe(GAP_PX);
  });
  it('uses the real length when now is inside the gap', () => {
    expect(gapHeightPx(0, 3 * H, 1 * H)).toBeCloseTo(180 * 0.8);
  });
  it('never goes below the fixed height', () => {
    expect(gapHeightPx(0, 10 * MIN, 5 * MIN)).toBe(GAP_PX);
  });
  it('is not active when now equals the gap end', () => {
    expect(gapHeightPx(0, 3 * H, 3 * H)).toBe(GAP_PX);
  });
});

describe('blockHeightPx', () => {
  it('clamps short blocks to the minimum', () => {
    expect(blockHeightPx(0, 15 * MIN)).toBe(DAY_MIN_BLOCK_PX);
  });
  it('scales long blocks', () => {
    expect(blockHeightPx(0, 2 * H)).toBeCloseTo(96);
  });
});

describe('nowPlacement', () => {
  const blocks = [
    { start: H, end: 2 * H },
    { start: 4 * H, end: 5 * H },
  ];
  it('finds in-block', () => {
    expect(nowPlacement(blocks, 1.5 * H)).toEqual({ kind: 'in-block', index: 0, fraction: 0.5 });
  });
  it('finds in-gap', () => {
    expect(nowPlacement(blocks, 3 * H)).toEqual({ kind: 'in-gap', index: 0, fraction: 0.5 });
  });
  it('before first and after last', () => {
    expect(nowPlacement(blocks, 0)).toEqual({ kind: 'before-first' });
    expect(nowPlacement(blocks, 6 * H)).toEqual({ kind: 'after-last' });
  });
  it('empty list is before-first', () => {
    expect(nowPlacement([], H)).toEqual({ kind: 'before-first' });
  });
});

describe('timeFromTap', () => {
  const segs: SegRect[] = [
    { start: at(9), end: at(10), top: 0, height: 48 },
    { start: at(10), end: at(13), top: 48, height: 34 },
    { start: at(13), end: at(14), top: 82, height: 48 },
  ];
  it('interpolates inside a block', () => {
    expect(timeFromTap(segs, 24)).toBe(at(9, 30));
  });
  it('interpolates inside a gap', () => {
    expect(timeFromTap(segs, 65)).toBe(at(11, 30));
  });
  it('extrapolates above the list', () => {
    expect(timeFromTap(segs, -30)).toBeCloseTo(at(9) - (30 / DAY_PX_PER_MIN) * MIN);
  });
  it('extrapolates below the list', () => {
    expect(timeFromTap(segs, 200)).toBeCloseTo(at(14) + ((200 - 130) / DAY_PX_PER_MIN) * MIN);
  });
  it('snaps to the nearest edge between non-adjacent segments', () => {
    const holey: SegRect[] = [
      { start: at(9), end: at(10), top: 0, height: 48 },
      { start: at(13), end: at(14), top: 100, height: 48 },
    ];
    expect(timeFromTap(holey, 60)).toBe(at(10));
    expect(timeFromTap(holey, 90)).toBe(at(13));
  });
  it('returns 0 without segments', () => {
    expect(timeFromTap([], 10)).toBe(0);
  });
});

describe('roundToStep', () => {
  it('rounds to 10 minutes', () => {
    expect(roundToStep(at(9, 4))).toBe(at(9));
    expect(roundToStep(at(9, 5))).toBe(at(9, 10));
    expect(roundToStep(at(9, 55))).toBe(at(10));
  });
});

describe('draftRangeFromTime', () => {
  it('normal case', () => {
    const r = draftRangeFromTime(at(9, 4), dayStart);
    expect(r.start.getTime()).toBe(at(9));
    expect(r.end.getTime()).toBe(at(10));
  });
  it('clamps late taps so the draft ends at midnight', () => {
    const r = draftRangeFromTime(at(23, 50), dayStart);
    expect(r.start.getTime()).toBe(at(23));
    expect(r.end.getTime()).toBe(at(24));
  });
  it('clamps to day start', () => {
    const r = draftRangeFromTime(at(0, 1) - 30 * MIN, dayStart);
    expect(r.start.getTime()).toBe(dayStart);
    expect(r.end.getTime()).toBe(at(1));
  });
});
