import { describe, expect, it } from 'vitest';
import { defaultToastTimerConfig, initialToastTimer, stepToastTimer, toastTimerProgress } from '../toastTimer';

const cfg = defaultToastTimerConfig(8000);

function run(distances: (number | null)[], dt = 100) {
    let s = initialToastTimer(cfg.duration);
    let expiredAt = -1;
    distances.forEach((d, i) => {
        if (expiredAt >= 0) return;
        const r = stepToastTimer(s, dt, d, cfg);
        s = r.state;
        if (r.expired) expiredAt = i;
    });
    return { s, expiredAt };
}

describe('toast timer', () => {
    it('expires after the duration without a mouse', () => {
        const { expiredAt } = run(Array(100).fill(null));
        expect(expiredAt).toBe(79);
    });

    it('stands still while the mouse is close', () => {
        const { s, expiredAt } = run(Array(2000).fill(20));
        expect(expiredAt).toBe(-1);
        expect(s.remaining).toBe(cfg.duration);
        expect(s.life).toBe(0);
    });

    it('extends while approaching, but only up to the cap', () => {
        const dist = Array.from({ length: 300 }, (_, i) => 360 - i); // steadily approaching, never near
        const { s } = run(dist.slice(0, 50));
        expect(s.remaining).toBeGreaterThan(cfg.duration);
        const all = run(dist);
        expect(all.s.remaining).toBeLessThanOrEqual(cfg.duration * cfg.extendCap);
    });

    it('the hard limit ends it even while approaching and hovering nearby', () => {
        const dist = Array.from({ length: 1000 }, (_, i) => 400 - (i % 300) * 0.5 + (i % 2)); // wiggling nearby, never near
        const { expiredAt } = run(dist);
        expect(expiredAt).toBeGreaterThan(0);
        expect(expiredAt).toBeLessThan(1000);
    });

    it('progress stays within 0..1', () => {
        expect(toastTimerProgress(initialToastTimer(8000), cfg)).toBe(1);
        expect(toastTimerProgress({ remaining: 4000, life: 4000, lastDistance: null }, cfg)).toBeCloseTo(0.5);
    });

    it('runs faster while the mouse moves away (awayFactor)', () => {
        const away = { ...cfg, awayFactor: 3 };
        let slow = initialToastTimer(8000);
        let fast = initialToastTimer(8000);
        for (let i = 0; i < 20; i++) {
            const d = 100 + i * 5;
            slow = stepToastTimer(slow, 16, d, cfg).state;
            fast = stepToastTimer(fast, 16, d, away).state;
        }
        expect(fast.remaining).toBeLessThan(slow.remaining);
    });
});
