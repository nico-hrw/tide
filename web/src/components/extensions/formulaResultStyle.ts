import { sanitizeCssColor } from './TableCellAttrs';

interface MarkLike {
    type: { name: string };
    attrs: Record<string, unknown>;
}

const FONT_SIZE_RE = /^\d+(\.\d+)?(px|rem|em|%)$/;
/** Matches the browser default of a bare <mark>, which is how the app renders a highlight without color. */
const DEFAULT_HIGHLIGHT = '#ffff00';

function sanitizeFontSize(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const v = raw.trim();
    return FONT_SIZE_RE.test(v) ? v : null;
}

/**
 * CSS for the `style` attribute of a formula cell so the computed result looks like the formula text.
 * All values are sanitized (marks can arrive via Yjs/JSON); anything unsafe is dropped.
 * Output order is fixed: font-weight, font-style, text-decoration, color, font-size, background-color.
 * Returns '' when nothing applies.
 */
export function resultStyleFromMarks(marks: readonly MarkLike[]): string {
    let bold = false;
    let italic = false;
    let underline = false;
    let strike = false;
    let color: string | null = null;
    let fontSize: string | null = null;
    let background: string | null = null;

    for (const mark of marks) {
        const attrs = mark.attrs ?? {};
        switch (mark.type.name) {
            case 'bold': bold = true; break;
            case 'italic': italic = true; break;
            case 'underline': underline = true; break;
            case 'strike': strike = true; break;
            case 'textStyle':
                color = sanitizeCssColor(attrs.color) ?? color;
                fontSize = sanitizeFontSize(attrs.fontSize) ?? fontSize;
                break;
            case 'highlight':
                background = attrs.color ? sanitizeCssColor(attrs.color) : DEFAULT_HIGHLIGHT;
                break;
        }
    }

    const out: string[] = [];
    if (bold) out.push('font-weight:700');
    if (italic) out.push('font-style:italic');
    if (underline || strike) out.push(`text-decoration:${[underline && 'underline', strike && 'line-through'].filter(Boolean).join(' ')}`);
    if (color) out.push(`color:${color}`);
    if (fontSize) out.push(`font-size:${fontSize}`);
    if (background) out.push(`background-color:${background}`);
    return out.join(';');
}
