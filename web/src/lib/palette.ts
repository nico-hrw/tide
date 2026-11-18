// App colour palette (separate from light/dark and from the calendar event palette).
// The palette is a data attribute on <html>; the colours themselves live in app/palettes.css.

export type AppPalette = 'tide' | 'warm' | 'slate';

export const DEFAULT_PALETTE: AppPalette = 'tide';
export const PALETTE_STORAGE_KEY = 'tide_app_palette';

export const PALETTES: { id: AppPalette; label: string; desc: string }[] = [
    { id: 'tide', label: 'Tide', desc: 'Neutral und ruhig' },
    { id: 'warm', label: 'Warm', desc: 'Papierweiß mit Terrakotta' },
    { id: 'slate', label: 'Slate', desc: 'Kühl und klar' },
];

export function isPalette(value: unknown): value is AppPalette {
    return PALETTES.some((p) => p.id === value);
}

export function getStoredPalette(): AppPalette {
    if (typeof window === 'undefined') return DEFAULT_PALETTE;
    try {
        const stored = localStorage.getItem(PALETTE_STORAGE_KEY);
        return isPalette(stored) ? stored : DEFAULT_PALETTE;
    } catch {
        return DEFAULT_PALETTE;
    }
}

export function applyPalette(palette: AppPalette): void {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-palette', palette);
}

/** Inline script for <head>: sets the attribute before first paint so a stored palette does not flash. */
export const PALETTE_BOOT_SCRIPT = `try{var p=localStorage.getItem('${PALETTE_STORAGE_KEY}');if(p==='warm'||p==='slate'){document.documentElement.setAttribute('data-palette',p)}}catch(e){}`;
