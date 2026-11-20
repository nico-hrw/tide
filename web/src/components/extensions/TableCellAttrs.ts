import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';

export type CellTextAlign = 'left' | 'center' | 'right';
export type CellVerticalAlign = 'top' | 'middle' | 'bottom';

const H_VALUES: readonly string[] = ['left', 'center', 'right'];
const V_VALUES: readonly string[] = ['top', 'middle', 'bottom'];

function pick<T extends string>(raw: string | undefined, allowed: readonly string[]): T | null {
    return raw && allowed.includes(raw) ? (raw as T) : null;
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
