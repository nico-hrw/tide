import { calendarPalette } from '@/lib/designTokens';

export type PaletteEntry = { bg: string; ink: string };

const ENTRIES: PaletteEntry[] = [
  calendarPalette.praktikum,
  calendarPalette.studium,
  calendarPalette.social,
  calendarPalette.uni,
  calendarPalette.geb,
];

/**
 * Maps an event's stored colour onto the Balsam calendar palette.
 * Already-tokenised colours pass through; any other value is hashed so
 * the same colour always lands on the same palette entry.
 */
export function paletteFor(color?: string | null): PaletteEntry {
  if (!color) return ENTRIES[0];
  const known = ENTRIES.find(e => e.bg === color);
  if (known) return known;
  let h = 0;
  for (let i = 0; i < color.length; i++) h = (h * 31 + color.charCodeAt(i)) >>> 0;
  return ENTRIES[h % ENTRIES.length];
}

/** True if the ink colour is light (card background is dark) – used for faint overlays. */
export function isLightInk(p: PaletteEntry): boolean {
  return p.ink === calendarPalette.praktikum.ink || p.ink === calendarPalette.geb.ink;
}
