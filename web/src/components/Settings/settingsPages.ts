/**
 * Navigationsstruktur der Einstellungen (reine Daten, keine React-Abhaengigkeit).
 * Gruppen: Persoenlich, Arbeitsbereich, Erweitert; "Ueber Tide" steht abgesetzt darunter.
 */
export type SettingsPageId =
    | 'account'
    | 'appearance'
    | 'calendar'
    | 'notes'
    | 'todos'
    | 'extensions'
    | 'access'
    | 'about';

export type NavGroupId = 'personal' | 'workspace' | 'advanced';

export interface NavGroup {
    id: NavGroupId;
    pages: readonly SettingsPageId[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
    { id: 'personal', pages: ['account', 'appearance'] },
    { id: 'workspace', pages: ['calendar', 'notes', 'todos'] },
    { id: 'advanced', pages: ['extensions', 'access'] },
];

/** Eigener, abgesetzter Eintrag ganz unten. */
export const ABOUT_PAGE: SettingsPageId = 'about';

export const DEFAULT_PAGE: SettingsPageId = 'account';

const ALL_PAGES: readonly SettingsPageId[] = [...NAV_GROUPS.flatMap((g) => g.pages), ABOUT_PAGE];

/** Alte Tab-Ids (Store, Deep-Links) auf die neuen Seiten abbilden. */
const LEGACY_TABS: Record<string, SettingsPageId> = {
    info: 'about',
    debug: 'about',
    integrations: 'extensions',
};

export function resolvePage(tab?: string | null): SettingsPageId {
    if (!tab) return DEFAULT_PAGE;
    if ((ALL_PAGES as readonly string[]).includes(tab)) return tab as SettingsPageId;
    return LEGACY_TABS[tab] ?? DEFAULT_PAGE;
}
