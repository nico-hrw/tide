/** Reine Helfer fuer die Tokenliste. */
export type LastUsed =
    | { kind: 'never' }
    | { kind: 'today'; time: string }
    | { kind: 'yesterday' }
    | { kind: 'days'; days: number }
    | { kind: 'date'; date: string };

function startOfDay(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatShortDate(d: Date, locale: string): string {
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function describeLastUsed(iso: string | null | undefined, now: Date, locale = 'de-DE'): LastUsed {
    if (!iso) return { kind: 'never' };
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { kind: 'never' };
    const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
    if (days <= 0) return { kind: 'today', time: d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) };
    if (days === 1) return { kind: 'yesterday' };
    if (days < 7) return { kind: 'days', days };
    return { kind: 'date', date: formatShortDate(d, locale) };
}

export function isTokenExpired(expiresAt: string | null | undefined, now: Date): boolean {
    if (!expiresAt) return false;
    const t = new Date(expiresAt).getTime();
    return !Number.isNaN(t) && t < now.getTime();
}

export function formatExpiry(expiresAt: string | null | undefined, locale = 'de-DE'): string | null {
    if (!expiresAt) return null;
    const d = new Date(expiresAt);
    return Number.isNaN(d.getTime()) ? null : formatShortDate(d, locale);
}
