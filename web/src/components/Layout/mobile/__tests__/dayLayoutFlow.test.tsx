import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DbTimelineDay } from '../MobileAgendaTimeline';
import { DAY_MIN_BLOCK_PX, DAY_PX_PER_MIN, GAP_PX, blockHeightPx, gapHeightPx } from '../timelineMath';
import { SEG_PAD_PX } from '../DayTimelineParts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DAY = new Date(2026, 10, 20);
const at = (h: number, m = 0) => new Date(2026, 10, 20, h, m);
const ev = (id: string, sh: number, eh: number) => ({
  id, title: `Termin ${id}`, start: at(sh).toISOString(), end: at(eh).toISOString(),
});
const EVENTS = [ev('a', 9, 10), ev('b', 14, 15)];

describe('DbTimelineDay proportional layout and now-line', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function render(now: Date, dayEvs: unknown[] = EVENTS, opts: { proportional?: boolean; allDayEvs?: unknown[] } = {}) {
    act(() => {
      root.render(React.createElement(DbTimelineDay, {
        day: DAY, dayEvs: dayEvs as never[], allDayEvs: (opts.allDayEvs ?? []) as never[], isToday: true, now, theme: 'light',
        proportional: opts.proportional ?? true,
      }));
    });
  }

  const gaps = () => Array.from(host.querySelectorAll<HTMLElement>('[data-seg="gap"]'));
  const blocks = () => Array.from(host.querySelectorAll<HTMLElement>('[data-seg="block"]'));
  const nowLine = () => host.querySelector<HTMLElement>('[aria-label="Jetzt"]');
  const h = (el: HTMLElement) => parseFloat(el.style.height);

  it('gives every block a height from blockHeightPx and marks its time range', () => {
    render(at(11));
    const bs = blocks();
    expect(bs).toHaveLength(2);
    expect(bs[0].dataset.segStart).toBe(String(at(9).getTime()));
    expect(bs[0].dataset.segEnd).toBe(String(at(10).getTime()));
    expect(h(bs[0])).toBeCloseTo(blockHeightPx(at(9).getTime(), at(10).getTime()));
    expect(h(bs[1])).toBeCloseTo(blockHeightPx(at(14).getTime(), at(15).getTime()));
  });

  it('grows only the active gap and puts the now-line inside it at 11:00', () => {
    render(at(11));
    const gs = gaps();
    expect(gs).toHaveLength(1);
    const big = gs.filter(g => h(g) > GAP_PX);
    expect(big).toHaveLength(1);
    expect(big[0].dataset.segStart).toBe(String(at(10).getTime()));
    expect(big[0].dataset.segEnd).toBe(String(at(14).getTime()));
    expect(h(big[0])).toBeCloseTo(gapHeightPx(at(10).getTime(), at(14).getTime(), at(11).getTime()));
    const line = nowLine();
    expect(line).not.toBeNull();
    expect(big[0].contains(line)).toBe(true);
    expect(line!.style.top).toBe('25%');
  });

  it('puts the now-line inside the running event at 9:30 and keeps gaps at GAP_PX', () => {
    render(at(9, 30));
    const line = nowLine();
    expect(line).not.toBeNull();
    const first = blocks()[0];
    expect(first.contains(line)).toBe(true);
    for (const g of gaps()) expect(h(g)).toBe(GAP_PX);
  });

  it('puts the now-line after the last event at 16:00', () => {
    render(at(16));
    const line = nowLine();
    expect(line).not.toBeNull();
    for (const s of [...blocks(), ...gaps()]) expect(s.contains(line)).toBe(false);
    const last = blocks()[blocks().length - 1];
    expect(last.compareDocumentPosition(line!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const g of gaps()) expect(h(g)).toBe(GAP_PX);
  });

  it('puts the now-line before the first event at 7:00', () => {
    render(at(7));
    const line = nowLine();
    expect(line).not.toBeNull();
    expect(blocks()[0].compareDocumentPosition(line!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('does not crash on events without end or with end before start', () => {
    const noEnd = { id: 'n', title: 'Ohne Ende', start: at(9).toISOString() };
    const backwards = { id: 'r', title: 'Rückwärts', start: at(13).toISOString(), end: at(12).toISOString() };
    render(at(11), [noEnd, backwards]);
    const bs = blocks();
    expect(bs).toHaveLength(2);
    expect(h(bs[0])).toBeCloseTo(blockHeightPx(at(9).getTime(), at(10).getTime()));
    expect(h(bs[1])).toBeGreaterThan(0);
  });

  it('marks the now-line as an image for assistive tech', () => {
    render(at(11));
    expect(nowLine()!.getAttribute('role')).toBe('img');
  });

  it('sizes an overlap cluster on the day scale and puts the now-line inside it', () => {
    // 9–11 and 10–12 overlap: one cluster 9–12, now at 11:00 = 2/3 of the way.
    render(at(11), [ev('a', 9, 11), ev('b', 10, 12)]);
    const bs = blocks();
    expect(bs).toHaveLength(1);
    expect(bs[0].dataset.segStart).toBe(String(at(9).getTime()));
    expect(bs[0].dataset.segEnd).toBe(String(at(12).getTime()));
    // Lanes on the day scale: b starts 60 min in, lasts 120 min -> bottom 60*0.8 + max(68, 120*0.8).
    const laneBottom = 60 * DAY_PX_PER_MIN + Math.max(DAY_MIN_BLOCK_PX, 120 * DAY_PX_PER_MIN);
    const expected = Math.max(blockHeightPx(at(9).getTime(), at(12).getTime()), laneBottom + 2 * SEG_PAD_PX);
    expect(h(bs[0])).toBeCloseTo(expected);
    const line = nowLine()!;
    expect(bs[0].contains(line)).toBe(true);
    expect(parseFloat(line.style.top)).toBeCloseTo(200 / 3, 3);
  });

  it('keeps the fixed segment height when tapping a card to open options', () => {
    render(at(11));
    const card = host.querySelector<HTMLElement>('#ev-a')!;
    const beforeH = blocks()[0].style.height;
    act(() => { card.querySelector('button')!.click(); });
    const seg = blocks()[0];
    expect(seg.style.height).toBe(beforeH);
    expect(host.querySelector('[aria-label="Bearbeiten"]')).not.toBeNull();
  });

  it('still renders timed todo rows and all-day todo pills', () => {
    const todo = { id: 't', title: 'Zeit-Todo', start: at(12).toISOString(), is_task: true };
    const pill = { id: 'p', title: 'Ganztags-Todo', start: at(0).toISOString(), allDay: true, is_task: true };
    render(at(11), [...EVENTS, todo], { allDayEvs: [pill] });
    expect(host.textContent).toContain('Zeit-Todo');
    expect(host.textContent).toContain('Ganztags-Todo');
    expect(blocks()).toHaveLength(2);
  });
});

describe('DbTimelineDay legacy layout (proportional off: month and agenda views)', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('keeps fixed card heights, 34px gaps and the line before the next cluster', () => {
    act(() => {
      root.render(React.createElement(DbTimelineDay, {
        day: DAY, dayEvs: EVENTS as never[], allDayEvs: [], isToday: true, now: at(11), theme: 'light',
      }));
    });
    expect(host.querySelectorAll('[data-seg]')).toHaveLength(0);
    const a = host.querySelector<HTMLElement>('#ev-a')!;
    const b = host.querySelector<HTMLElement>('#ev-b')!;
    expect(a.style.height).toBe('');
    expect(a.style.minHeight).toBe(`${Math.max(54, Math.min(180, 44 + 60 * 0.6))}px`);
    expect(a.className).toContain('my-1');
    const fixedGaps = Array.from(host.querySelectorAll<HTMLElement>('div')).filter(d => d.textContent === '4 h frei' && d.style.height);
    expect(fixedGaps).toHaveLength(1);
    expect(fixedGaps[0].style.height).toBe(`${GAP_PX}px`);
    const line = host.querySelector<HTMLElement>('[aria-label="Jetzt"]')!;
    expect(line).not.toBeNull();
    expect(line.style.top).toBe('');
    expect(fixedGaps[0].contains(line)).toBe(false);
    expect(a.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fixedGaps[0].compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows no now-line after the last event, as before', () => {
    act(() => {
      root.render(React.createElement(DbTimelineDay, {
        day: DAY, dayEvs: EVENTS as never[], allDayEvs: [], isToday: true, now: at(16), theme: 'light',
      }));
    });
    expect(host.querySelector('[aria-label="Jetzt"]')).toBeNull();
  });
});
