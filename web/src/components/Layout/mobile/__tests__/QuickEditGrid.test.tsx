import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QuickEditGrid, QE_HOUR_PX, type QuickEditGridProps } from '../QuickEditGrid';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DAY = new Date(2026, 10, 20);
const at = (h: number, m = 0) => new Date(2026, 10, 20, h, m);

describe('QuickEditGrid', () => {
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
});
