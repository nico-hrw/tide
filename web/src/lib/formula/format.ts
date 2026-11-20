import { isErr, type Value } from './types';

export interface GermanNumberOptions {
    decimals?: number;
    currency?: string;
}

const NF = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4, useGrouping: true });
const NF_DEFAULTS = new Intl.NumberFormat('de-DE', {
    useGrouping: true,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
const NF_INT = new Intl.NumberFormat('de-DE', {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});
const NF_BY_DECIMALS = new Map<number, Intl.NumberFormat>([
    [0, NF_INT],
    [2, NF_DEFAULTS],
]);

function getGermanFormatter(decimals: number): Intl.NumberFormat {
    const clamped = Math.max(0, Math.min(20, Math.trunc(decimals)));
    let nf = NF_BY_DECIMALS.get(clamped);
    if (!nf) {
        nf = new Intl.NumberFormat('de-DE', {
            useGrouping: true,
            minimumFractionDigits: clamped,
            maximumFractionDigits: clamped,
        });
        NF_BY_DECIMALS.set(clamped, nf);
    }
    return nf;
}

/** Formats a finite number in German notation (`x.xxx,xx` by default, or fixed `decimals` + optional `currency`). */
export function formatGermanNumber(value: number, options?: GermanNumberOptions): string {
    const n = Object.is(value, -0) ? 0 : value;
    if (!Number.isFinite(n)) return '#WERT';
    const nf = options?.decimals !== undefined ? getGermanFormatter(options.decimals) : NF_DEFAULTS;
    const formatted = nf.format(n);
    return options?.currency ? `${formatted} ${options.currency}` : formatted;
}

/** Display text of a formula result: German number format (max. 4 decimals by default), error code, or the text itself. */
export function formatResult(v: Value, options?: GermanNumberOptions): string {
    if (isErr(v)) return v.error;
    if (typeof v === 'string') return v;
    if (options && (options.decimals !== undefined || options.currency !== undefined)) {
        return formatGermanNumber(v, options);
    }
    if (!Number.isFinite(v)) return '#WERT';
    return NF.format(Object.is(v, -0) ? 0 : v);
}
