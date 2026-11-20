import { isErr, type Value } from './types';

const NF = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4, useGrouping: true });

/** Display text of a formula result: German number format (max. 4 decimals), error code, or the text itself. */
export function formatResult(v: Value): string {
    if (isErr(v)) return v.error;
    if (typeof v === 'string') return v;
    if (!Number.isFinite(v)) return '#WERT';
    return NF.format(Object.is(v, -0) ? 0 : v);
}
