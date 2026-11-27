import { describe, expect, it } from 'vitest';
import { defaultPopupTimerConfig, initialPopupTimer, popupTimerProgress, stepPopupTimer, type PopupTimerState } from '@/lib/popupTimer';

const cfg = defaultPopupTimerConfig(1000);

describe('stepPopupTimer', () => {
  it('runs down while the mouse is far away and expires', () => {
    let s = initialPopupTimer(cfg.duration);
    let expired = false;
    for (let i = 0; i < 10 && !expired; i++) {
      const r = stepPopupTimer(s, 100, 600, cfg);
      s = r.state;
      expired = r.expired;
    }
    expect(expired).toBe(true);
  });
  it('stays full near the popup and refills what was lost', () => {
    let s: PopupTimerState = { remaining: 300, lastDistance: 100 };
    s = stepPopupTimer(s, 100, 20, cfg).state;
    expect(s.remaining).toBe(600);
    for (let i = 0; i < 10; i++) s = stepPopupTimer(s, 100, 0, cfg).state;
    expect(s.remaining).toBe(cfg.duration);
    expect(popupTimerProgress(s, cfg)).toBe(1);
  });
  it('wins time while the mouse heads back towards the popup', () => {
    let s: PopupTimerState = { remaining: 500, lastDistance: 300 };
    s = stepPopupTimer(s, 100, 250, cfg).state; // closer than before
    expect(s.remaining).toBeGreaterThan(500);
  });
  it('loses time when the mouse moves further away', () => {
    const s = stepPopupTimer({ remaining: 500, lastDistance: 250 }, 100, 300, cfg).state;
    expect(s.remaining).toBe(400);
  });
  it('never expires without a mouse (touch) or while held', () => {
    const touch = stepPopupTimer({ remaining: 1, lastDistance: null }, 500, null, cfg);
    expect(touch.expired).toBe(false);
    expect(touch.state.remaining).toBe(cfg.duration);
    const held = stepPopupTimer({ remaining: 1, lastDistance: 900 }, 500, 900, cfg, true);
    expect(held.expired).toBe(false);
    expect(held.state.remaining).toBe(cfg.duration);
  });
  it('reports the share of time left for the bar', () => {
    expect(popupTimerProgress({ remaining: 250, lastDistance: null }, cfg)).toBe(0.25);
    expect(popupTimerProgress({ remaining: -5, lastDistance: null }, cfg)).toBe(0);
  });
});
