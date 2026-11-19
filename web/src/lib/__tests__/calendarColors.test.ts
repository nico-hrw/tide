import { describe, it, expect } from 'vitest';
import { resolveCategory, CALENDAR_CATEGORIES } from '../calendarColors';

describe('resolveCategory', () => {
  it('keeps a category key', () => {
    expect(resolveCategory('geb').key).toBe('geb');
    expect(resolveCategory('social').key).toBe('social');
  });

  it('maps a category colour value to its category', () => {
    expect(resolveCategory('#A6B7A8').key).toBe('studium');
    expect(resolveCategory('#a9623f').key).toBe('geb');
  });

  it('maps legacy hex colours by hue, as the desktop view did', () => {
    expect(resolveCategory('#ef4444').key).toBe('uni'); // red
    expect(resolveCategory('#3b82f6').key).toBe('studium'); // blue
    expect(resolveCategory('#10b981').key).toBe('praktikum'); // green
    expect(resolveCategory('#f59e0b').key).toBe('social'); // orange
    expect(resolveCategory('#ec4899').key).toBe('geb'); // pink
  });

  it('falls back to Balsam for empty or unknown values', () => {
    expect(resolveCategory(undefined).key).toBe('praktikum');
    expect(resolveCategory('something').key).toBe('praktikum');
  });

  it('offers exactly five categories', () => {
    expect(CALENDAR_CATEGORIES).toHaveLength(5);
  });
});
