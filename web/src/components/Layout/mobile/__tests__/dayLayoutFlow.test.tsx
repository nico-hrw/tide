import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DbTimelineDay } from '../MobileAgendaTimeline';
import { GAP_PX, blockHeightPx, gapHeightPx } from '../timelineMath';

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

  function render(now: Date, dayEvs: unknown[] = EVENTS) {
    act(() => {
      root.render(React.createElement(DbTimelineDay, {
        day: DAY, dayEvs: dayEvs as never[], allDayEvs: [], isToday: true, now, theme: 'light',
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
});
