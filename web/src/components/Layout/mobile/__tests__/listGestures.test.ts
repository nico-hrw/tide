import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createListGestures, emptyDayDraft } from '../listGestures';

describe('createListGestures', () => {
  let onHold: ReturnType<typeof vi.fn>;
  let onDoubleTap: ReturnType<typeof vi.fn>;
  let g: ReturnType<typeof createListGestures>;

  beforeEach(() => {
    vi.useFakeTimers();
    onHold = vi.fn();
    onDoubleTap = vi.fn();
    g = createListGestures({ onHold, onDoubleTap });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const tap = (x: number, y: number, target: EventTarget | null = null) => {
    g.start(x, y, target);
    vi.advanceTimersByTime(40);
    g.end();
  };

  it('fires onHold once after 450 ms without movement and no tap on release', () => {
    g.start(10, 20, null);
    vi.advanceTimersByTime(449);
    expect(onHold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(onHold).toHaveBeenCalledWith(10, 20, null);
    vi.advanceTimersByTime(500);
    g.end();
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('does not fire onHold when the finger moves more than 10 px before 450 ms', () => {
    g.start(10, 20, null);
    vi.advanceTimersByTime(100);
    g.move(10, 31);
    vi.advanceTimersByTime(1000);
    g.end();
    expect(onHold).not.toHaveBeenCalled();
  });

  it('fires onDoubleTap once with the second tap coordinates for two taps 200 ms apart', () => {
    const t2 = {} as EventTarget;
    tap(100, 200);
    vi.advanceTimersByTime(160);
    tap(110, 215, t2);
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
    expect(onDoubleTap).toHaveBeenCalledWith(110, 215, t2);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('does not fire a double tap when the second tap comes after 400 ms', () => {
    tap(100, 200);
    vi.advanceTimersByTime(400);
    tap(100, 200);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('does not fire a double tap when the second tap starts 301 ms after the first ended', () => {
    tap(100, 200);
    vi.advanceTimersByTime(301);
    tap(100, 200);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('fires a double tap when the second tap starts exactly 300 ms after the first ended', () => {
    tap(100, 200);
    vi.advanceTimersByTime(300);
    tap(100, 200);
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
  });

  it('does not fire a double tap for taps 25 px apart', () => {
    tap(100, 200);
    vi.advanceTimersByTime(100);
    tap(100, 225);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('does not count a touch that moved more than 10 px as a tap (swipe)', () => {
    tap(100, 200);
    vi.advanceTimersByTime(100);
    g.start(100, 200, null);
    g.move(115, 200);
    g.end();
    expect(onDoubleTap).not.toHaveBeenCalled();
    // The swipe also clears the pending first tap.
    vi.advanceTimersByTime(50);
    tap(100, 200);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('does not let a hold followed by release count as a tap of a double tap', () => {
    g.start(100, 200, null);
    vi.advanceTimersByTime(500);
    g.end();
    vi.advanceTimersByTime(50);
    tap(100, 200);
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('starts fresh after a double tap (a third tap is not another double tap)', () => {
    tap(100, 200);
    vi.advanceTimersByTime(100);
    tap(100, 200);
    vi.advanceTimersByTime(100);
    tap(100, 200);
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
  });

  it('cancel() clears the hold timer and the pending tap', () => {
    g.start(100, 200, null);
    g.cancel();
    vi.advanceTimersByTime(1000);
    expect(onHold).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    tap(100, 200);
    g.cancel();
    vi.advanceTimersByTime(50);
    tap(100, 200);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('honours custom options', () => {
    g = createListGestures({ onHold, onDoubleTap, holdMs: 200, doubleTapMs: 100, moveTolerancePx: 4 });
    g.start(0, 0, null);
    g.move(5, 0);
    vi.advanceTimersByTime(300);
    expect(onHold).not.toHaveBeenCalled();
    g.end();
    g.start(0, 0, null);
    vi.advanceTimersByTime(200);
    expect(onHold).toHaveBeenCalledTimes(1);
  });
});

describe('emptyDayDraft', () => {
  const day = new Date(2026, 10, 20);

  it('starts at 09:00 for 60 min on a day other than today', () => {
    const { start, end } = emptyDayDraft(day, new Date(2026, 10, 19, 15, 30));
    expect(start).toEqual(new Date(2026, 10, 20, 9, 0));
    expect(end).toEqual(new Date(2026, 10, 20, 10, 0));
  });

  it('starts at the next full hour today', () => {
    const { start, end } = emptyDayDraft(day, new Date(2026, 10, 20, 14, 5));
    expect(start).toEqual(new Date(2026, 10, 20, 15, 0));
    expect(end).toEqual(new Date(2026, 10, 20, 16, 0));
  });

  it('caps today at 23:00', () => {
    expect(emptyDayDraft(day, new Date(2026, 10, 20, 23, 30)).start).toEqual(new Date(2026, 10, 20, 23, 0));
    expect(emptyDayDraft(day, new Date(2026, 10, 20, 22, 59)).start).toEqual(new Date(2026, 10, 20, 23, 0));
  });
});
