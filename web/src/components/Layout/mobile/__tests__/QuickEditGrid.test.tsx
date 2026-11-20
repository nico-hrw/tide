import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QuickEditGrid, QE_HOUR_PX, type QuickEditGridProps } from '../QuickEditGrid';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DAY = new Date(2026, 10, 20);
const at = (h: number, m = 0) => new Date(2026, 10, 20, h, m);

type Pt = { id: number; y: number };

/** Touch-like event: plain Event with touches/changedTouches, as React reads them from nativeEvent. */
function touchEvent(type: string, touches: Pt[], changed: Pt[] = touches): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const list = (pts: Pt[]) => pts.map(p => ({ identifier: p.id, clientX: 100, clientY: p.y }));
  Object.defineProperty(e, 'touches', { value: list(touches) });
  Object.defineProperty(e, 'targetTouches', { value: list(touches) });
  Object.defineProperty(e, 'changedTouches', { value: list(changed) });
  return e;
}

/** Queued requestAnimationFrame so tests decide when frames run. */
let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
function flushFrames() {
  const run = Array.from(frames.values());
  frames = new Map();
  act(() => { run.forEach(cb => cb(0)); });
}

describe('QuickEditGrid', () => {
  let root: Root;
  let host: HTMLDivElement;
  let mounted = false;

  beforeEach(() => {
    frames = new Map();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { const id = nextFrame++; frames.set(id, cb); return id; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    mounted = true;
  });

  afterEach(() => {
    if (mounted) act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function render(overrides: Partial<QuickEditGridProps> = {}) {
    const props: QuickEditGridProps = {
      day: DAY,
      context: [
        { id: 'a', title: 'Praktikum Labor', color: 'praktikum', start: at(8), end: at(9) },
        { id: 'b', title: 'Kaffee mit Jonas', color: 'social', start: at(14), end: at(14, 30) },
      ],
      target: { id: 'x', title: 'Lerngruppe Mathe', color: 'studium', start: at(11, 30), end: at(13) },
      mode: 'edit',
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
      ...overrides,
    };
    act(() => { root.render(React.createElement(QuickEditGrid, props)); });
    return props;
  }

  const q = <T extends HTMLElement>(sel: string) => document.body.querySelector<T>(sel);
  const px = (v: string) => parseFloat(v);

  it('places the active block at 56 px per hour', () => {
    render();
    const block = q('[data-qe="active"]')!;
    const hourLine = (h: number) => px(Array.from(document.body.querySelectorAll<HTMLElement>('[aria-hidden]'))
      .find(el => el.textContent === `${String(h).padStart(2, '0')}:00`)!.style.top);
    expect(QE_HOUR_PX).toBe(56);
    expect(px(block.style.top)).toBeCloseTo(hourLine(11) + QE_HOUR_PX / 2);
    expect(px(block.style.height)).toBeCloseTo(1.5 * QE_HOUR_PX);
    expect(block.textContent).toContain('Lerngruppe Mathe');
  });

  it('shows context events faintly and not interactive', () => {
    render({ context: [
      { id: 'a', title: 'Praktikum Labor', start: at(8), end: at(9) },
      { id: 'x', title: 'Lerngruppe Mathe', start: at(11, 30), end: at(13) },
    ] });
    const ctx = Array.from(document.body.querySelectorAll<HTMLElement>('[data-qe="context"]'));
    expect(ctx.map(c => c.textContent)).toEqual(['Praktikum Labor']);
    expect(ctx[0].style.pointerEvents).toBe('none');
    expect(Number(ctx[0].style.opacity)).toBeLessThan(1);
    expect(px(ctx[0].style.top)).toBeCloseTo(px(q('[data-qe="active"]')!.style.top) - 3.5 * QE_HOUR_PX);
  });

  it('confirms with the unchanged initial range', () => {
    const props = render();
    act(() => { q<HTMLButtonElement>('button[aria-label="Übernehmen"]')!.click(); });
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    const [s, e] = (props.onConfirm as ReturnType<typeof vi.fn>).mock.calls[0] as [Date, Date];
    expect(s.getTime()).toBe(at(11, 30).getTime());
    expect(e.getTime()).toBe(at(13).getTime());
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('cancels with ✕', () => {
    const props = render();
    act(() => { q<HTMLButtonElement>('button[aria-label="Abbrechen"]')!.click(); });
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('marks a draft with a dashed border and a fallback title', () => {
    render({ mode: 'draft', target: { id: null, title: '', start: at(13, 20), end: at(14, 20) } });
    const block = q('[data-qe="active"]')!;
    expect(block.style.border).toContain('dashed');
    expect(block.textContent).toContain('Neuer Termin');
  });

  // ---- true range (midnight crossing) ----

  const confirmed = (props: QuickEditGridProps) => {
    act(() => { q<HTMLButtonElement>('button[aria-label="Übernehmen"]')!.click(); });
    const calls = (props.onConfirm as ReturnType<typeof vi.fn>).mock.calls;
    const [s, e] = calls[calls.length - 1] as [Date, Date];
    return [s.getTime(), e.getTime()];
  };
  const nextDay = (h: number) => new Date(2026, 10, 21, h, 0);

  it('confirms a midnight-crossing event unchanged with its exact original times', () => {
    const props = render({ target: { id: 'n', title: 'Nacht', start: at(22), end: nextDay(2) } });
    const block = q('[data-qe="active"]')!;
    expect(px(block.style.height)).toBeCloseTo(2 * QE_HOUR_PX); // drawn clipped to 24:00
    expect(confirmed(props)).toEqual([at(22).getTime(), nextDay(2).getTime()]);
  });

  it('confirms an event entirely outside the day unchanged and still draws a block', () => {
    const props = render({ target: { id: 'n', title: 'Morgen', start: nextDay(1), end: nextDay(2) } });
    expect(px(q('[data-qe="active"]')!.style.height)).toBeGreaterThan(0);
    expect(confirmed(props)).toEqual([nextDay(1).getTime(), nextDay(2).getTime()]);
  });

  // ---- touch handling ----

  const nine = { id: 'x', title: 'Neun', start: at(9), end: at(10) };
  const startDrag = (sel: string, y = 300, id = 1) =>
    act(() => { q(sel)!.dispatchEvent(touchEvent('touchstart', [{ id, y }])); });
  const moveTo = (y: number, id = 1) => {
    act(() => { document.dispatchEvent(touchEvent('touchmove', [{ id, y }])); });
    flushFrames();
  };
  const endDrag = (type = 'touchend', id = 1, y = 0) =>
    act(() => { document.dispatchEvent(touchEvent(type, [], [{ id, y }])); });
  const label = () => q('[data-qe="time"]')?.textContent ?? null;

  it('drags the body by +37 min, shows the snapped time and confirms it', () => {
    const props = render({ target: nine });
    startDrag('[data-qe="active"]');
    moveTo(300 + (37 / 60) * QE_HOUR_PX);
    expect(label()).toBe('09:40 – 10:40 · 1 h');
    endDrag();
    expect(label()).toBeNull();
    expect(confirmed(props)).toEqual([at(9, 40).getTime(), at(10, 40).getTime()]);
  });

  it('drags the end handle and changes only the end', () => {
    const props = render({ target: nine });
    startDrag('[data-qe="handle-end"]');
    moveTo(300 + QE_HOUR_PX);
    endDrag();
    expect(confirmed(props)).toEqual([at(9).getTime(), at(11).getTime()]);
  });

  it('drags the start handle and changes only the start', () => {
    const props = render({ target: nine });
    startDrag('[data-qe="handle-start"]');
    moveTo(300 - QE_HOUR_PX / 2);
    endDrag();
    expect(confirmed(props)).toEqual([at(8, 30).getTime(), at(10).getTime()]);
  });

  it('reverts to the original on touchcancel', () => {
    const props = render({ target: nine });
    startDrag('[data-qe="active"]');
    moveTo(300 + QE_HOUR_PX);
    expect(label()).toBe('10:00 – 11:00 · 1 h');
    endDrag('touchcancel');
    expect(label()).toBeNull();
    expect(confirmed(props)).toEqual([at(9).getTime(), at(10).getTime()]);
  });

  it('ignores movements under 6 px (dead zone keeps off-grid times)', () => {
    const props = render({ target: { ...nine, start: at(9, 3), end: at(10, 3) } });
    startDrag('[data-qe="active"]');
    moveTo(305);
    endDrag();
    expect(confirmed(props)).toEqual([at(9, 3).getTime(), at(10, 3).getTime()]);
  });

  it('follows only the first finger; a second finger lifting does not end the drag', () => {
    const props = render({ target: nine });
    startDrag('[data-qe="active"]');
    act(() => {
      document.dispatchEvent(touchEvent('touchmove', [{ id: 2, y: 900 }, { id: 1, y: 300 + QE_HOUR_PX }]));
    });
    flushFrames();
    expect(label()).toBe('10:00 – 11:00 · 1 h');
    act(() => { document.dispatchEvent(touchEvent('touchend', [{ id: 1, y: 356 }], [{ id: 2, y: 900 }])); });
    expect(label()).not.toBeNull();
    moveTo(300 + 2 * QE_HOUR_PX);
    endDrag();
    expect(confirmed(props)).toEqual([at(11).getTime(), at(12).getTime()]);
  });

  it('moves a midnight-crossing event with its full 4 h length', () => {
    const props = render({ target: { id: 'n', title: 'Nacht', start: at(22), end: nextDay(2) } });
    startDrag('[data-qe="active"]');
    moveTo(300 + QE_HOUR_PX);
    endDrag();
    expect(confirmed(props)).toEqual([at(23).getTime(), nextDay(3).getTime()]);
  });

  it('removes document listeners when unmounted during a drag', () => {
    render({ target: nine });
    const spy = vi.spyOn(document, 'removeEventListener');
    startDrag('[data-qe="active"]');
    moveTo(320);
    expect(() => { act(() => root.unmount()); }).not.toThrow();
    mounted = false;
    const removed = spy.mock.calls.map(c => c[0]);
    expect(removed).toEqual(expect.arrayContaining(['touchmove', 'touchend', 'touchcancel']));
    expect(document.body.hasAttribute('data-ev-drag')).toBe(false);
    expect(() => { document.dispatchEvent(touchEvent('touchmove', [{ id: 1, y: 400 }])); flushFrames(); }).not.toThrow();
  });

  // ---- handle geometry ----

  const handleIntrusion = (blockH: number) => {
    const hs = q('[data-qe="handle-start"]')!.style;
    const he = q('[data-qe="handle-end"]')!.style;
    const top = Math.max(0, px(hs.top) + px(hs.height));
    const bottom = Math.max(0, px(he.bottom) + px(he.height));
    return { body: blockH - top - bottom, hs, he };
  };

  it('keeps at least 24 px of body on a 30 min block, handles stay >= 44 px outside', () => {
    render({ target: { ...nine, end: at(9, 30) } });
    const blockH = px(q('[data-qe="active"]')!.style.height);
    expect(blockH).toBeCloseTo(28);
    const { body, hs, he } = handleIntrusion(blockH);
    expect(px(hs.height)).toBeGreaterThanOrEqual(44);
    expect(px(he.height)).toBeGreaterThanOrEqual(44);
    expect(body).toBeGreaterThanOrEqual(24);
  });

  it('extends the body hit area to 24 px on a 10 min block, outside the handles', () => {
    render({ target: { ...nine, end: at(9, 10) } });
    const hit = q('[data-qe="body-hit"]')!.style;
    expect(px(hit.height)).toBeGreaterThanOrEqual(24);
    const hs = q('[data-qe="handle-start"]')!.style;
    const he = q('[data-qe="handle-end"]')!.style;
    expect(px(hs.top) + px(hs.height)).toBeLessThanOrEqual(px(hit.top) + 0.01);
    const blockH = px(q('[data-qe="active"]')!.style.height);
    const hitBottom = px(hit.top) + px(hit.height);
    expect(blockH - (px(he.bottom) + px(he.height))).toBeGreaterThanOrEqual(hitBottom - 0.01);
  });
});
