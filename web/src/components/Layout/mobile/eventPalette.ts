import { calendarPalette } from '@/lib/designTokens';
import { resolveCategory } from '@/lib/calendarColors';

export type PaletteEntry = { bg: string; ink: string };

/**
 * Maps an event's stored colour onto the Balsam calendar palette (see lib/calendarColors).
 * Category keys and legacy hex colours both resolve to the same five entries.
 */
export function paletteFor(color?: string | null): PaletteEntry {
  return calendarPalette[resolveCategory(color).key];
}

/** True if the ink colour is light (card background is dark) – used for faint overlays. */
export function isLightInk(p: PaletteEntry): boolean {
  return p.ink === calendarPalette.praktikum.ink || p.ink === calendarPalette.geb.ink;
}
