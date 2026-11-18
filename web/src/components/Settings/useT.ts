import { useCallback } from 'react';
import { useDataStore } from '@/store/useDataStore';
import { formatMessage, getTranslation, type SettingsKey } from '@/lib/i18n';

export type MessageVars = Record<string, string | number>;

/** Typisierte Uebersetzung fuer die Einstellungen (Schluessel aus `i18nSettings.de.ts`). */
export function useT() {
    const language = useDataStore((s) => s.language || 'de');
    return useCallback(
        (key: SettingsKey, vars?: MessageVars): string => formatMessage(getTranslation(language, 'settings', key), vars),
        [language],
    );
}

/** Fuer dynamisch gebildete Schluessel (z. B. `ext.<id>.title`); unbekannte Schluessel werden unveraendert gezeigt. */
export function useTDynamic() {
    const language = useDataStore((s) => s.language || 'de');
    return useCallback(
        (key: string, vars?: MessageVars): string => formatMessage(getTranslation(language, 'settings', key), vars),
        [language],
    );
}

/** BCP-47-Locale passend zur App-Sprache (fuer Datumsformate). */
export function useLocale(): string {
    const language = useDataStore((s) => s.language || 'de');
    return language === 'de' ? 'de-DE' : 'en-US';
}
