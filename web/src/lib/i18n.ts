import { useDataStore } from '@/store/useDataStore';

export type Language = 'de' | 'en';

export const translations = {
    de: {
        common: {
            newNote: "Neue Notiz",
            untitled: "Unbenannt",
            today: "Heute",
            searchPlaceholder: "Suchen oder tippen...",
            note: "Notiz",
            event: "Termin",
            holiday: "Feiertag",
            goToDate: "Gehe zu",
            none: "Keine",
            cancel: "Abbrechen",
            confirm: "Bestätigen",
            delete: "Löschen",
            save: "Speichern",
        },
        settings: {
            title: "Einstellungen",
            account: "Konto",
            calendar: "Kalender",
            appearance: "Erscheinungsbild",
            extensions: "Erweiterungen",
            info: "Info",
            language: "Sprache",
            languageDesc: "Wähle deine bevorzugte Anwendungssprache.",
            colorPalette: "Farbpalette",
            colorPaletteDesc: "Wähle das Erscheinungsbild für Kalendertermine.",
            eventArrangement: "Terminanordnung",
            eventArrangementDesc: "Bestimme, wie überlappende Termine dargestellt werden.",
            livePreview: "Live-Vorschau",
            groups: "Kalender-Gruppen",
            groupsDesc: "Verwalte Kategorien und Stile für Termine.",
            holidays: "Feiertage",
            holidaysDesc: "Zeige öffentliche Feiertage im Kalender und in der Suche an.",
            holidayPackage: "Feiertagspaket",
            holidayPackageDesc: "Wähle das Land für gesetzliche Feiertage.",
        },
        calendar: {
            createGroup: "Gruppe erstellen",
            newGroupPlaceholder: "Neuer Gruppenname...",
            eventRecognized: "Termin erkannt",
            createEventBtn: "Termin erstellen",
            noEventsToday: "Keine anstehenden Termine für heute.",
            nextEvents: "Nächste Termine",
            todaysSchedule: "Heutiger Tagesplan",
            sideBySide: "Nebeneinander",
            overlap: "Überlappend",
        }
    },
    en: {
        common: {
            newNote: "New Note",
            untitled: "Untitled",
            today: "Today",
            searchPlaceholder: "Search or type...",
            note: "Note",
            event: "Event",
            holiday: "Holiday",
            goToDate: "Go to",
            none: "None",
            cancel: "Cancel",
            confirm: "Confirm",
            delete: "Delete",
            save: "Save",
        },
        settings: {
            title: "Settings",
            account: "Account",
            calendar: "Calendar",
            appearance: "Appearance",
            extensions: "Extensions",
            info: "Info",
            language: "Language",
            languageDesc: "Choose your preferred application language.",
            colorPalette: "Color Palette",
            colorPaletteDesc: "Choose the appearance theme for calendar events.",
            eventArrangement: "Event Arrangement",
            eventArrangementDesc: "Decide how overlapping events are displayed.",
            livePreview: "Live Preview",
            groups: "Calendar Groups",
            groupsDesc: "Manage event categories and styles.",
            holidays: "Holidays",
            holidaysDesc: "Show public holidays in the calendar and search.",
            holidayPackage: "Holiday Package",
            holidayPackageDesc: "Choose the country package for public holidays.",
        },
        calendar: {
            createGroup: "Create Group",
            newGroupPlaceholder: "New group name...",
            eventRecognized: "Event detected",
            createEventBtn: "Create Event",
            noEventsToday: "No upcoming events for today.",
            nextEvents: "Next Events",
            todaysSchedule: "Today's Schedule",
            sideBySide: "Side-by-Side",
            overlap: "Overlap",
        }
    }
} as const;

export type TranslationKey = keyof typeof translations.de.common | keyof typeof translations.de.settings | keyof typeof translations.de.calendar;

export function getTranslation(lang: Language, category: 'common' | 'settings' | 'calendar', key: string): string {
    const dict = translations[lang] || translations.de;
    const catDict = (dict as any)[category];
    return catDict?.[key] || (translations.de as any)[category]?.[key] || key;
}

export function useTranslation() {
    const language = useDataStore(s => s.language || 'de');
    return {
        lang: language,
        t: (category: 'common' | 'settings' | 'calendar', key: string): string => getTranslation(language, category, key)
    };
}
