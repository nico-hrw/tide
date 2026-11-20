import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';

export type CellTextAlign = 'left' | 'center' | 'right';
export type CellVerticalAlign = 'top' | 'middle' | 'bottom';

const H_VALUES: readonly string[] = ['left', 'center', 'right'];
const V_VALUES: readonly string[] = ['top', 'middle', 'bottom'];

function pick<T extends string>(raw: string | undefined, allowed: readonly string[]): T | null {
    return raw && allowed.includes(raw) ? (raw as T) : null;
}

/** Shared attribute definitions: text-align and vertical-align stored as cell attrs. */
const alignAttributes = {
    textAlign: {
        default: null as CellTextAlign | null,
        parseHTML: (el: HTMLElement) => pick<CellTextAlign>(el.style.textAlign, H_VALUES),
        renderHTML: (attrs: Record<string, unknown>) =>
            attrs.textAlign ? { style: `text-align: ${attrs.textAlign}` } : {},
    },
    verticalAlign: {
        default: null as CellVerticalAlign | null,
        parseHTML: (el: HTMLElement) => pick<CellVerticalAlign>(el.style.verticalAlign, V_VALUES),
        renderHTML: (attrs: Record<string, unknown>) =>
            attrs.verticalAlign ? { style: `vertical-align: ${attrs.verticalAlign}` } : {},
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
