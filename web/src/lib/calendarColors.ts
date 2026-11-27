import type { CalendarColorPalette } from '@/store/slices/types';

/**
 * The five calendar colours (Tide 2, default palette "Balsam"). Every event colour resolves to one of them:
 * new events store the category key; older events store a hex colour, which maps by hue.
 * Desktop, mobile and the colour pickers all use this file, so one event looks the same everywhere.
 */
export interface CalendarCategory {
    key: 'praktikum' | 'studium' | 'social' | 'uni' | 'geb';
    /** Palette colour name (e.g. Balsam, Aquatone, Artemis, Korall, Kupfer). */
    name: string;
    /** Background and text colour: CSS variables (Balsam) or hex colours (fixed palettes). */
    bg: string;
    ink: string;
    /** Representative hex, used to recognise stored hex colours and render swatches. */
    hex: string;
}

export interface CalendarPaletteDefinition {
    id: CalendarColorPalette;
    label: string;
    colors: readonly CalendarCategory[];
}

export const CALENDAR_CATEGORIES: readonly CalendarCategory[] = [
    { key: 'praktikum', name: 'Balsam', bg: 'var(--cal-praktikum)', ink: 'var(--cal-praktikum-ink)', hex: '#5C6E6C' },
    { key: 'studium', name: 'Aquatone', bg: 'var(--cal-studium)', ink: 'var(--cal-studium-ink)', hex: '#A6B7A8' },
    { key: 'social', name: 'Artemis', bg: 'var(--cal-social)', ink: 'var(--cal-social-ink)', hex: '#D2A96A' },
    { key: 'uni', name: 'Korall', bg: 'var(--cal-uni)', ink: 'var(--cal-uni-ink)', hex: '#D39D87' },
    { key: 'geb', name: 'Kupfer', bg: 'var(--cal-geb)', ink: 'var(--cal-geb-ink)', hex: '#A9623F' },
];

export const CALENDAR_PALETTES: Record<CalendarColorPalette, CalendarPaletteDefinition> = {
    balsam: {
        id: 'balsam',
        label: 'Balsam (Standard)',
        colors: CALENDAR_CATEGORIES,
    },
    'classic-tide': {
        id: 'classic-tide',
        label: 'Classic Tide',
        colors: [
            { key: 'praktikum', name: 'Cobalt', bg: '#2563EB', ink: '#FFFFFF', hex: '#2563EB' },
            { key: 'studium', name: 'Sky', bg: '#0EA5E9', ink: '#FFFFFF', hex: '#0EA5E9' },
            { key: 'social', name: 'Emerald', bg: '#10B981', ink: '#FFFFFF', hex: '#10B981' },
            { key: 'uni', name: 'Amber', bg: '#F59E0B', ink: '#1F2937', hex: '#F59E0B' },
            { key: 'geb', name: 'Coral', bg: '#EF4444', ink: '#FFFFFF', hex: '#EF4444' },
        ],
    },
    'soft-pastels': {
        id: 'soft-pastels',
        label: 'Soft Pastels',
        colors: [
            { key: 'praktikum', name: 'Mint', bg: '#D1FAE5', ink: '#1F2937', hex: '#D1FAE5' },
            { key: 'studium', name: 'Powder Blue', bg: '#DBEAFE', ink: '#1F2937', hex: '#DBEAFE' },
            { key: 'social', name: 'Butter', bg: '#FEF3C7', ink: '#1F2937', hex: '#FEF3C7' },
            { key: 'uni', name: 'Blush', bg: '#FCE7F3', ink: '#1F2937', hex: '#FCE7F3' },
            { key: 'geb', name: 'Lavender', bg: '#EDE9FE', ink: '#1F2937', hex: '#EDE9FE' },
        ],
    },
    'modern-dark': {
        id: 'modern-dark',
        label: 'Deep Ocean',
        colors: [
            { key: 'praktikum', name: 'Deep Teal', bg: '#0F766E', ink: '#FFFFFF', hex: '#0F766E' },
            { key: 'studium', name: 'Ocean Blue', bg: '#0284C7', ink: '#FFFFFF', hex: '#0284C7' },
            { key: 'social', name: 'Violet', bg: '#7C3AED', ink: '#FFFFFF', hex: '#7C3AED' },
            { key: 'uni', name: 'Ochre', bg: '#D97706', ink: '#FFFFFF', hex: '#D97706' },
            { key: 'geb', name: 'Crimson', bg: '#BE123C', ink: '#FFFFFF', hex: '#BE123C' },
        ],
    },
    sunset: {
        id: 'sunset',
        label: 'Sunset',
        colors: [
            { key: 'praktikum', name: 'Rust', bg: '#9A3412', ink: '#FFFFFF', hex: '#9A3412' },
            { key: 'studium', name: 'Tangerine', bg: '#EA580C', ink: '#FFFFFF', hex: '#EA580C' },
            { key: 'social', name: 'Gold', bg: '#FBBF24', ink: '#1F2937', hex: '#FBBF24' },
            { key: 'uni', name: 'Magenta', bg: '#DB2777', ink: '#FFFFFF', hex: '#DB2777' },
            { key: 'geb', name: 'Plum', bg: '#7E22CE', ink: '#FFFFFF', hex: '#7E22CE' },
        ],
    },
};

export const CALENDAR_PALETTE_LIST: readonly CalendarPaletteDefinition[] = [
    CALENDAR_PALETTES.balsam,
    CALENDAR_PALETTES['classic-tide'],
    CALENDAR_PALETTES['soft-pastels'],
    CALENDAR_PALETTES['modern-dark'],
    CALENDAR_PALETTES.sunset,
];

/** Returns the five categories for the given calendar palette, defaulting to Balsam. */
export function getPaletteCategories(palette?: CalendarColorPalette): readonly CalendarCategory[] {
    return (palette ? CALENDAR_PALETTES[palette]?.colors : undefined) ?? CALENDAR_CATEGORIES;
}

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

/** Category index (0..4) for any stored colour value across all palettes and legacy hues. */
export function resolveCategoryIndex(color?: string | null): number {
    if (!color) return 0;
    const raw = color.trim();
    if (!raw) return 0;

    const keyIdx = CALENDAR_CATEGORIES.findIndex((c) => c.key === raw);
    if (keyIdx !== -1) return keyIdx;

    const lower = raw.toLowerCase();
    for (const palette of CALENDAR_PALETTE_LIST) {
        const hexIdx = palette.colors.findIndex((c) => c.hex.toLowerCase() === lower);
        if (hexIdx !== -1) return hexIdx;
    }

    const legacyCat = categoryFromLegacy(lower);
    const legacyIdx = CALENDAR_CATEGORIES.findIndex((c) => c.key === legacyCat.key);
    return legacyIdx !== -1 ? legacyIdx : 0;
}

/** Category for any stored colour value in the given palette. Falls back to the first category. */
export function resolveCategoryForPalette(
    color?: string | null,
    palette?: CalendarColorPalette,
): CalendarCategory {
    const categories = getPaletteCategories(palette);
    const idx = resolveCategoryIndex(color);
    return categories[idx] ?? categories[0];
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
