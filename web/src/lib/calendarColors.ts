/**
 * The five calendar colours (Tide 2, palette "Balsam"). Every event colour resolves to one of them:
 * new events store the category key; older events store a hex colour, which maps by hue.
 * Desktop, mobile and the colour pickers all use this file, so one event looks the same everywhere.
 */
export interface CalendarCategory {
    key: 'praktikum' | 'studium' | 'social' | 'uni' | 'geb';
    /** Palette colour name (Balsam, Aquatone, Artemis, Korall, Kupfer). */
    name: string;
    /** Background and text colour: CSS variables, so each app palette has its own set (app/palettes.css). */
    bg: string;
    ink: string;
    /** Default-theme hex, used to recognise older events that stored a hex. */
    hex: string;
}

export const CALENDAR_CATEGORIES: readonly CalendarCategory[] = [
    { key: 'praktikum', name: 'Balsam', bg: 'var(--cal-praktikum)', ink: 'var(--cal-praktikum-ink)', hex: '#5C6E6C' },
    { key: 'studium', name: 'Aquatone', bg: 'var(--cal-studium)', ink: 'var(--cal-studium-ink)', hex: '#A6B7A8' },
    { key: 'social', name: 'Artemis', bg: 'var(--cal-social)', ink: 'var(--cal-social-ink)', hex: '#D2A96A' },
    { key: 'uni', name: 'Korall', bg: 'var(--cal-uni)', ink: 'var(--cal-uni-ink)', hex: '#D39D87' },
    { key: 'geb', name: 'Kupfer', bg: 'var(--cal-geb)', ink: 'var(--cal-geb-ink)', hex: '#A9623F' },
];

const byKey = (key: string) => CALENDAR_CATEGORIES.find((c) => c.key === key);

/** Legacy colours (hex or name) by hue. Same rules the desktop view used before. */
function categoryFromLegacy(col: string): CalendarCategory {
    const is = (names: string[], prefixes: string[]) =>
        names.includes(col) || prefixes.some((p) => col.startsWith(p));
    if (is(['pink'], ['#ec', '#d9', '#e8', '#f4', '#f0'])) return byKey('geb')!;
    if (is(['red'], ['#ef', '#f8', '#ea', '#eb'])) return byKey('uni')!;
    if (is(['blue'], ['#3b', '#25', '#1d', '#63', '#4f'])) return byKey('studium')!;
    if (is(['green'], ['#10', '#22', '#15'])) return byKey('praktikum')!;
    if (is(['orange'], ['#f5', '#f9', '#fb', '#d9'])) return byKey('social')!;
    return byKey('praktikum')!;
}

/** Category for any stored colour value. Unknown or empty values fall back to Balsam. */
export function resolveCategory(color?: string | null): CalendarCategory {
    if (!color) return CALENDAR_CATEGORIES[0];
    const raw = color.trim();
    const hit = byKey(raw) ?? CALENDAR_CATEGORIES.find((c) => c.hex.toLowerCase() === raw.toLowerCase());
    if (hit) return hit;
    return categoryFromLegacy(raw.toLowerCase());
}

/** CSS colour for a category key, for swatches and inline styles. */
export function categoryVar(key: string): string {
    return `var(--cal-${key})`;
}
