import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DbTimelineDay, type DbTimelineDayProps } from '../MobileAgendaTimeline';

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
  type OnDraftAt = NonNullable<DbTimelineDayProps['onDraftAt']>;
  type OnQuickEdit = NonNullable<DbTimelineDayProps['onQuickEdit']>;
  let root: Root;
  let host: HTMLDivElement;
  let onDraftAt: ReturnType<typeof vi.fn<OnDraftAt>>;
  let onQuickEdit: ReturnType<typeof vi.fn<OnQuickEdit>>;
  let onMoveEvent: ReturnType<typeof vi.fn<NonNullable<DbTimelineDayProps['onMoveEvent']>>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at(11));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    onDraftAt = vi.fn<OnDraftAt>();
    onQuickEdit = vi.fn<OnQuickEdit>();
    onMoveEvent = vi.fn<NonNullable<DbTimelineDayProps['onMoveEvent']>>();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  function render(opts: { proportional?: boolean; dayEvs?: unknown[]; isToday?: boolean; now?: Date; move?: boolean } = {}) {
    act(() => {
      root.render(React.createElement(DbTimelineDay, {
        day: DAY, dayEvs: (opts.dayEvs ?? EVENTS) as never[], allDayEvs: [], isToday: opts.isToday ?? false, now: opts.now ?? at(11),
        theme: 'light', proportional: opts.proportional ?? true, onDraftAt, onQuickEdit, onMoveEvent: opts.move ? onMoveEvent : undefined, onDeleteEvent: () => {},
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

  it('moves a card inside the list: feedback while pressed, others faded, commit on release', () => {
    render({ move: true });
    const cardA = host.querySelector<HTMLElement>('#ev-a')!;
    const cardB = host.querySelector<HTMLElement>('#ev-b')!;
    const body = cardA.querySelector('button')!;
    touch(body, 'touchstart', 50, 120);
    act(() => { vi.advanceTimersByTime(100); });
    expect(cardA.style.transform).toContain('scale(1.015)'); // light lift soon after touching
    act(() => { vi.advanceTimersByTime(250); });
    expect(cardA.style.transform).toContain('scale(1.04)'); // armed after the hold
    expect(cardB.style.pointerEvents).toBe('none'); // others cannot be grabbed
    expect(onQuickEdit).not.toHaveBeenCalled();
    touch(body, 'touchmove', 50, 120 + 48); // 48 px = 60 min at 0.8 px/min
    act(() => { vi.advanceTimersByTime(50); });
    touch(body, 'touchend', 50, 168);
    expect(onMoveEvent).toHaveBeenCalledTimes(1);
    const [moved, start, end] = onMoveEvent.mock.calls[0] as [{ id: string }, Date, Date];
    expect(moved.id).toBe('a');
    expect(start).toEqual(at(10));
    expect(end).toEqual(at(11));
    expect(cardB.style.pointerEvents).toBe('');
  });

  it('shows the light lift on a short press and removes it on release', () => {
    render({ move: true });
    const cardA = host.querySelector<HTMLElement>('#ev-a')!;
    const body = cardA.querySelector('button')!;
    touch(body, 'touchstart', 50, 120);
    act(() => { vi.advanceTimersByTime(120); });
    expect(cardA.style.transform).toContain('scale(1.015)');
    touch(body, 'touchend', 50, 120);
    expect(cardA.style.transform).toBe('');
    expect(onMoveEvent).not.toHaveBeenCalled();
  });

  it('does not open quick edit on a hold on an occurrence of a recurring event', () => {
    render({ dayEvs: [{ ...ev('r', 9, 10), id: 'r_1763625600000' }, { ...ev('w', 14, 15), recurrence: 'weekly' }] });
    for (const id of ['r_1763625600000', 'w']) {
      const body = host.querySelector(`[id="ev-${id}"] button`)!;
      touch(body, 'touchstart', 50, 120);
      act(() => { vi.advanceTimersByTime(450); });
      touch(body, 'touchend', 50, 120);
    }
    expect(onQuickEdit).not.toHaveBeenCalled();
  });

  it('suppresses selection, callout and context menu in the day view only', () => {
    const overlapping = [ev('a', 9, 10), ev('p', 9, 11), ev('q', 10, 12)];
    const propsOf = (el: Element) => {
      const k = Object.keys(el).find(key => key.startsWith('__reactProps'))!;
      return (el as unknown as Record<string, { style?: Record<string, unknown> }>)[k];
    };
    const ctx = (el: Element) => {
      const e = new Event('contextmenu', { bubbles: true, cancelable: true });
      act(() => { el.dispatchEvent(e); });
      return e.defaultPrevented;
    };
    for (const dayEvs of [EVENTS, overlapping]) {
      const rootEl = render({ dayEvs });
      expect(ctx(host.querySelector('[id^="ev-"] button')!)).toBe(true);
      expect(propsOf(rootEl).style).toMatchObject({ WebkitTouchCallout: 'none', userSelect: 'none' });
      const cards = host.querySelectorAll('[id^="ev-"]');
      expect(cards.length).toBe(dayEvs.length);
      cards.forEach(c => {
        expect(c.classList.contains('select-none')).toBe(true);
        expect(propsOf(c).style).toMatchObject({ WebkitTouchCallout: 'none' });
      });
    }
    for (const dayEvs of [EVENTS, overlapping]) {
      const rootEl = render({ dayEvs, proportional: false });
      expect(ctx(host.querySelector('[id^="ev-"] button')!)).toBe(false);
      expect(propsOf(rootEl).style).toBeUndefined();
      host.querySelectorAll('[id^="ev-"]').forEach(c => {
        expect(c.classList.contains('select-none')).toBe(false);
        expect(propsOf(c).style?.WebkitTouchCallout).toBeUndefined();
      });
    }
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

  it('hides options again and drafts on a double tap on the card body without changing segment height', () => {
    render();
    const body = host.querySelector('#ev-a button') as HTMLElement;
    const seg = () => host.querySelector<HTMLElement>('[data-seg="block"]')!;
    const fixedH = seg().style.height;
    touch(body, 'touchstart', 50, 134);
    vi.advanceTimersByTime(40);
    touch(body, 'touchend', 50, 134);
    act(() => { body.click(); });
    expect(seg().style.height).toBe(fixedH); // tap shows options without changing event height
    expect(host.querySelector('[aria-label="Löschen"]')).not.toBeNull();
    vi.advanceTimersByTime(100);
    touch(body, 'touchstart', 50, 134);
    vi.advanceTimersByTime(40);
    touch(body, 'touchend', 50, 134);
    expect(onDraftAt).toHaveBeenCalledTimes(1);
    // The synthetic click of the second tap is swallowed; the options close and the segment height stays fixed.
    act(() => { body.click(); });
    expect(seg().style.height).toBe(fixedH);
    expect(host.querySelector('[aria-label="Löschen"]')).toBeNull();
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
