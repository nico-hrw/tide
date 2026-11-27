import { calendarPalette } from '@/lib/designTokens';
import { resolveCategoryForPalette } from '@/lib/calendarColors';
import { useDataStore, type CalendarColorPalette } from '@/store/useDataStore';

export type PaletteEntry = { bg: string; ink: string };

/**
 * Maps an event's stored colour onto the active calendar palette (see lib/calendarColors).
 * Category keys and legacy hex colours both resolve to the same five entries.
 */
export function paletteFor(color?: string | null, palette?: CalendarColorPalette): PaletteEntry {
  const cat = resolveCategoryForPalette(color, palette ?? useDataStore.getState().calendarColorPalette);
  return { bg: cat.bg, ink: cat.ink };
}

/** True if the ink colour is light (card background is dark) – used for faint overlays. */
export function isLightInk(p: PaletteEntry): boolean {
  return (
    p.ink === calendarPalette.praktikum.ink ||
    p.ink === calendarPalette.geb.ink ||
    p.ink.toLowerCase() === '#ffffff'
  );
}
