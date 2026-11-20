import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';

export type CellTextAlign = 'left' | 'center' | 'right';
export type CellVerticalAlign = 'top' | 'middle' | 'bottom';

const H_VALUES: readonly string[] = ['left', 'center', 'right'];
const V_VALUES: readonly string[] = ['top', 'middle', 'bottom'];
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_COLOR_RE = /^rgba?\(\s*\d{1,3}%?(?:\s*,\s*|\s+)\d{1,3}%?(?:\s*,\s*|\s+)\d{1,3}%?(?:\s*[,/]\s*(?:0|1|0?\.\d+|\d{1,3}%))?\s*\)$/i;
const NAMED_COLOR_RE = /^[a-z]{3,22}$/i;

function pick<T extends string>(raw: string | undefined, allowed: readonly string[]): T | null {
    return raw && allowed.includes(raw) ? (raw as T) : null;
}

/** Validates CSS color values (hex, rgb/rgba, or named colors) to prevent style injection via Yjs/JSON. */
export function sanitizeBgColor(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const v = raw.trim();
    if (!v || v === 'transparent') return null;
    if (HEX_COLOR_RE.test(v) || RGB_COLOR_RE.test(v) || NAMED_COLOR_RE.test(v)) return v;
    return null;
}

/** Shared attribute definitions. Values are allowlisted on parse AND render, since attrs can arrive via Yjs/JSON. */
const alignAttributes = {
    textAlign: {
        default: null as CellTextAlign | null,
        parseHTML: (el: HTMLElement) => pick<CellTextAlign>(el.style.textAlign, H_VALUES),
        renderHTML: (attrs: Record<string, unknown>) => {
            const v = pick<CellTextAlign>(attrs.textAlign as string | undefined, H_VALUES);
            return v ? { style: `text-align: ${v}` } : {};
        },
    },
    verticalAlign: {
        default: null as CellVerticalAlign | null,
        parseHTML: (el: HTMLElement) => pick<CellVerticalAlign>(el.style.verticalAlign, V_VALUES),
        renderHTML: (attrs: Record<string, unknown>) => {
            const v = pick<CellVerticalAlign>(attrs.verticalAlign as string | undefined, V_VALUES);
            return v ? { style: `vertical-align: ${v}` } : {};
        },
    },
    backgroundColor: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => sanitizeBgColor(el.style.backgroundColor),
        renderHTML: (attrs: Record<string, unknown>) => {
            const v = sanitizeBgColor(attrs.backgroundColor);
            return v ? { style: `background-color: ${v}` } : {};
        },
    },
};

export const TableCellAligned = TableCell.extend({
    addAttributes() {
        return { ...this.parent?.(), ...alignAttributes };
    },
});

export const TableHeaderAligned = TableHeader.extend({
    addAttributes() {
        return { ...this.parent?.(), ...alignAttributes };
    },
});
