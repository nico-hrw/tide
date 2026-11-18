'use client';

import { de, enUS } from 'date-fns/locale';
import { format, getISOWeek } from 'date-fns';
import { useTranslation } from '@/lib/i18n';

type Params = Record<string, string | number>;

/** Übersetzung der Island-Texte mit {platzhalter}-Ersetzung und Datumsformaten je Sprache. */
export function useIslandText() {
    const { t, lang } = useTranslation();
    const locale = lang === 'en' ? enUS : de;

    const tr = (key: string, params?: Params): string => {
        let out = t('island', key);
        if (params) for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(String(v));
        return out;
    };

    return {
        lang,
        tr,
        time: (d: Date) => format(d, 'HH:mm'),
        range: (a: Date, b: Date) => `${format(a, 'HH:mm')} – ${format(b, 'HH:mm')}`,
        weekdayShort: (d: Date) => format(d, 'EEEEEE', { locale }),
        monthName: (d: Date) => format(d, 'LLLL', { locale }),
        longDay: (d: Date) => format(d, lang === 'en' ? 'EEEE, MMMM d' : 'EEEE, d. MMMM', { locale }),
        shortDay: (d: Date) => format(d, lang === 'en' ? 'EEE M/d' : 'EEE d.M.', { locale }),
        weekLabel: (d: Date) => tr('weekShort', { n: getISOWeek(d) }),
    };
}

export type IslandText = ReturnType<typeof useIslandText>;
