import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DbTimelineDay } from '../MobileAgendaTimeline';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DAY = new Date(2026, 10, 20);
const at = (h: number, m = 0) => new Date(2026, 10, 20, h, m);
const ev = (id: string, sh: number, eh: number) => ({
  id, title: `Termin ${id}`, start: at(sh).toISOString(), end: at(eh).toISOString(),
});
const EVENTS = [ev('a', 9, 10), ev('b', 14, 15)];
const ROOT_TOP = 100;

function stubRect(el: Element, top: number, height: number) {
  el.getBoundingClientRect = () => ({
    top, height, bottom: top + height, left: 0, right: 300, width: 300, x: 0, y: top, toJSON: () => ({}),
  }) as DOMRect;
}

function touch(el: Element, type: 'touchstart' | 'touchmove' | 'touchend', x: number, y: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const pts = [{ clientX: x, clientY: y, target: el }];
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : pts });
  Object.defineProperty(e, 'changedTouches', { value: pts });
  act(() => { el.dispatchEvent(e); });
}

describe('DbTimelineDay hold and double-tap gestures', () => {
  let root: Root;
  let host: HTMLDivElement;
  let onDraftAt: ReturnType<typeof vi.fn>;
  let onQuickEdit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at(11));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    onDraftAt = vi.fn();
    onQuickEdit = vi.fn();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  function render(opts: { proportional?: boolean; dayEvs?: unknown[]; isToday?: boolean; now?: Date } = {}) {
    act(() => {
      root.render(React.createElement(DbTimelineDay, {
        day: DAY, dayEvs: (opts.dayEvs ?? EVENTS) as never[], allDayEvs: [], isToday: opts.isToday ?? false, now: opts.now ?? at(11),
        theme: 'light', proportional: opts.proportional ?? true, onDraftAt, onQuickEdit, onDeleteEvent: () => {},
      }));
    });
    const rootEl = host.firstElementChild as HTMLElement;
    stubRect(rootEl, ROOT_TOP, 400);
    // Segments in DOM order: block a 9–10, gap 10–14, block b 14–15.
    const segs = Array.from(host.querySelectorAll<HTMLElement>('[data-seg]'));
    const layout: Array<[number, number]> = [[100, 68], [168, 192], [360, 68]];
    segs.forEach((s, i) => { if (layout[i]) stubRect(s, layout[i][0], layout[i][1]); });
    return rootEl;
  }

  function doubleTap(el: Element, x: number, y: number) {
    touch(el, 'touchstart', x, y);
    vi.advanceTimersByTime(40);
    touch(el, 'touchend', x, y);
    vi.advanceTimersByTime(100);
    touch(el, 'touchstart', x, y);
    vi.advanceTimersByTime(40);
    touch(el, 'touchend', x, y);
  }

  it('creates a draft inside the gap on a double tap in the gap', () => {
    render();
    const gap = host.querySelector('[data-seg="gap"]')!;
    doubleTap(gap, 50, 168 + 96); // middle of the 10–14 gap
    expect(onDraftAt).toHaveBeenCalledTimes(1);
    const [start, end] = onDraftAt.mock.calls[0] as [Date, Date];
    expect(start.getTime()).toBeGreaterThanOrEqual(at(10).getTime());
    expect(start.getTime()).toBeLessThan(at(14).getTime());
    expect(start).toEqual(at(12));
    expect(end).toEqual(at(13));
  });

  it('opens quick edit with the event on a hold on its card', () => {
    render();
    const body = host.querySelector('#ev-a button')!;
    touch(body, 'touchstart', 50, 120);
    act(() => { vi.advanceTimersByTime(450); });
    expect(onQuickEdit).toHaveBeenCalledTimes(1);
    expect(onQuickEdit.mock.calls[0][0]).toMatchObject({ id: 'a' });
    touch(body, 'touchend', 50, 120);
    // The click after the hold is swallowed and does not expand the card.
    act(() => { (body as HTMLElement).click(); });
    expect(host.querySelector('[aria-label="Löschen"]')).toBeNull();
    expect(onDraftAt).not.toHaveBeenCalled();
  });

  it('ignores a double tap and a hold on the delete button of a card', () => {
    render();
    act(() => { (host.querySelector('#ev-a button') as HTMLElement).click(); });
    const del = host.querySelector('[aria-label="Löschen"]')!;
    expect(del).not.toBeNull();
    doubleTap(del, 50, 150);
    touch(del, 'touchstart', 50, 150);
    act(() => { vi.advanceTimersByTime(600); });
    touch(del, 'touchend', 50, 150);
    expect(onDraftAt).not.toHaveBeenCalled();
    expect(onQuickEdit).not.toHaveBeenCalled();
  });

  it('undoes the expand of the first tap and drafts on a double tap on the card body', () => {
    render();
    const body = host.querySelector('#ev-a button') as HTMLElement;
    const seg = () => host.querySelector<HTMLElement>('[data-seg="block"]')!;
    touch(body, 'touchstart', 50, 134);
    vi.advanceTimersByTime(40);
    touch(body, 'touchend', 50, 134);
    act(() => { body.click(); });
    expect(seg().style.height).toBe(''); // the first tap expands at once
    vi.advanceTimersByTime(100);
    touch(body, 'touchstart', 50, 134);
    vi.advanceTimersByTime(40);
    touch(body, 'touchend', 50, 134);
    expect(onDraftAt).toHaveBeenCalledTimes(1);
    // The synthetic click of the second tap is swallowed; the card ends up collapsed (fixed segment height).
    act(() => { body.click(); });
    expect(seg().style.height).not.toBe('');
    const [start] = onDraftAt.mock.calls[0] as [Date, Date];
    expect(start.getTime()).toBeGreaterThanOrEqual(at(9).getTime());
    expect(start.getTime()).toBeLessThan(at(10).getTime());
  });

  it('drafts at 09:00 on a double tap on an empty day other than today', () => {
    const rootEl = render({ dayEvs: [], now: new Date(2026, 10, 19, 15) });
    doubleTap(rootEl, 50, 150);
    expect(onDraftAt).toHaveBeenCalledWith(at(9), at(10));
  });

  it('drafts at the next full hour on an empty today', () => {
    const rootEl = render({ dayEvs: [], isToday: true });
    doubleTap(rootEl, 50, 150);
    expect(onDraftAt).toHaveBeenCalledWith(at(12), at(13));
  });

  it('attaches no touch handlers when not proportional (month and agenda views)', () => {
    const rootEl = render({ proportional: false });
    const propsKey = Object.keys(rootEl).find(k => k.startsWith('__reactProps'))!;
    const props = (rootEl as unknown as Record<string, Record<string, unknown>>)[propsKey];
    expect(props.onTouchStart).toBeUndefined();
    expect(props.onClickCapture).toBeUndefined();
    const body = host.querySelector('#ev-a button')!;
    doubleTap(body, 50, 134);
    touch(body, 'touchstart', 50, 134);
    act(() => { vi.advanceTimersByTime(600); });
    touch(body, 'touchend', 50, 134);
    expect(onDraftAt).not.toHaveBeenCalled();
    expect(onQuickEdit).not.toHaveBeenCalled();
  });

  it('attaches no touch handlers without callbacks', () => {
    act(() => {
      root.render(React.createElement(DbTimelineDay, {
        day: DAY, dayEvs: EVENTS as never[], allDayEvs: [], isToday: false, now: at(11), theme: 'light', proportional: true,
      }));
    });
    const rootEl = host.firstElementChild as HTMLElement;
    const propsKey = Object.keys(rootEl).find(k => k.startsWith('__reactProps'))!;
    expect((rootEl as unknown as Record<string, Record<string, unknown>>)[propsKey].onTouchStart).toBeUndefined();
  });
});
