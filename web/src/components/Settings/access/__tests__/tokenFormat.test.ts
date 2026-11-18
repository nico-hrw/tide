import { describe, expect, it } from 'vitest';
import { describeLastUsed, formatExpiry, isTokenExpired } from '../tokenFormat';

const NOW = new Date(2026, 10, 18, 15, 30); // 18. Nov 2026, lokal

describe('describeLastUsed', () => {
  it('meldet nie bei fehlendem oder ungültigem Datum', () => {
    expect(describeLastUsed(null, NOW)).toEqual({ kind: 'never' });
    expect(describeLastUsed(undefined, NOW)).toEqual({ kind: 'never' });
    expect(describeLastUsed('kein-datum', NOW)).toEqual({ kind: 'never' });
  });

  it('erkennt heute mit Uhrzeit', () => {
    const r = describeLastUsed(new Date(2026, 10, 18, 8, 12).toISOString(), NOW, 'de-DE');
    expect(r.kind).toBe('today');
    if (r.kind === 'today') expect(r.time).toMatch(/08[:.]12/);
  });

  it('erkennt gestern und die letzten Tage', () => {
    expect(describeLastUsed(new Date(2026, 10, 17, 23, 59).toISOString(), NOW)).toEqual({ kind: 'yesterday' });
    expect(describeLastUsed(new Date(2026, 10, 15, 10, 0).toISOString(), NOW)).toEqual({ kind: 'days', days: 3 });
  });

  it('zeigt ab einer Woche ein Datum', () => {
    const r = describeLastUsed(new Date(2026, 9, 1).toISOString(), NOW, 'de-DE');
    expect(r.kind).toBe('date');
  });

  it('behandelt Zeitstempel in der Zukunft wie heute', () => {
    const r = describeLastUsed(new Date(2026, 10, 18, 23, 0).toISOString(), NOW);
    expect(r.kind).toBe('today');
  });
});

describe('isTokenExpired', () => {
  it('ohne Ablauf nie abgelaufen', () => {
    expect(isTokenExpired(null, NOW)).toBe(false);
  });

  it('vergleicht gegen die Jetzt-Zeit', () => {
    expect(isTokenExpired(new Date(2026, 9, 3).toISOString(), NOW)).toBe(true);
    expect(isTokenExpired(new Date(2027, 1, 18).toISOString(), NOW)).toBe(false);
  });

  it('ungültige Datumswerte zählen nicht als abgelaufen', () => {
    expect(isTokenExpired('kaputt', NOW)).toBe(false);
  });
});

describe('formatExpiry', () => {
  it('gibt null ohne Ablauf zurück', () => {
    expect(formatExpiry(null)).toBeNull();
    expect(formatExpiry('kaputt')).toBeNull();
  });

  it('formatiert ein Datum in der Locale', () => {
    expect(formatExpiry(new Date(2027, 1, 18).toISOString(), 'de-DE')).toMatch(/2027/);
  });
});
