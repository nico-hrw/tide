import type {
    AppLanguage,
    AppTheme,
    DataStoreSlice,
    NavigationMode,
    SettingsModalTab,
    SmartIslandState,
    ThemePreference,
    UiSlice,
} from './types';

const DEFAULT_ENABLED_EXTENSIONS: string[] = [
    'smart_island',
    'summary',
    'smart_date_detection',
    'job_planner',
    'todos',
    'debug',
];

function applyThemeClass(theme: AppTheme): void {
    if (typeof document === 'undefined') return;
    const cl = document.documentElement.classList;
    if (theme === 'dark') {
        cl.add('dark');
        cl.remove('light-override');
    } else {
        cl.remove('dark');
        cl.add('light-override');
    }
}

function getInitialExtensions(): string[] {
    if (typeof window === 'undefined') return DEFAULT_ENABLED_EXTENSIONS;
    try {
        const stored = localStorage.getItem('tide_enabled_extensions');
        if (!stored) return DEFAULT_ENABLED_EXTENSIONS;
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : DEFAULT_ENABLED_EXTENSIONS;
    } catch {
        return DEFAULT_ENABLED_EXTENSIONS;
    }
}

function getInitialTheme(): AppTheme {
    if (typeof window === 'undefined') return 'light';
    const pref = (localStorage.getItem('tide_theme_preference') as ThemePreference | null) || 'system';
    const resolved: AppTheme = pref === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : pref;
    // Apply classes immediately so CSS vars are correct before first paint
    applyThemeClass(resolved);
    return resolved;
}

function getInitialThemePreference(): ThemePreference {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem('tide_theme_preference') as ThemePreference | null) || 'system';
}

function getInitialLanguage(): AppLanguage {
    if (typeof window === 'undefined') return 'en';
    const stored = localStorage.getItem('tide_language');
    return stored === 'de' ? 'de' : 'en';
}

function getInitialNavigationMode(): NavigationMode {
    if (typeof window === 'undefined') return 'sidebar';
    const stored = localStorage.getItem('tide_navigation_mode');
    return stored === 'folders' ? 'folders' : 'sidebar';
}

export const createUiSlice: DataStoreSlice<UiSlice> = (set) => ({
    isSettingsModalOpen: false,
    settingsModalTab: 'account',
    smartIslandState: null,
    enabledExtensions: getInitialExtensions(),
    theme: getInitialTheme(),
    themePreference: getInitialThemePreference(),
    language: getInitialLanguage(),
    navigationMode: getInitialNavigationMode(),

    setSettingsModalOpen: (open: boolean, tab?: SettingsModalTab) =>
        set((state) => ({
            isSettingsModalOpen: open,
            settingsModalTab: tab || (open ? state.settingsModalTab : 'account'),
        })),

    setSettingsModalTab: (tab: SettingsModalTab) =>
        set({ settingsModalTab: tab }),

    setSmartIsland: (state: SmartIslandState | null) =>
        set({ smartIslandState: state }),

    setEnabledExtensions: (extensions) =>
        set((state) => {
            const next =
                typeof extensions === 'function'
                    ? extensions(state.enabledExtensions)
                    : extensions;
            if (typeof window !== 'undefined') {
                try {
                    localStorage.setItem(
                        'tide_enabled_extensions',
                        JSON.stringify(next)
                    );
                } catch (e) {
                    console.warn('Failed to save extensions to localStorage', e);
                }
            }
            return { enabledExtensions: next };
        }),

    setThemePreference: (pref: ThemePreference) =>
        set(() => {
            if (typeof window !== 'undefined') {
                try {
                    localStorage.setItem('tide_theme_preference', pref);
                } catch (e) {
                    console.warn('Failed to save theme preference to localStorage', e);
                }
            }
            let resolvedTheme: AppTheme = 'light';
            if (pref === 'system') {
                resolvedTheme =
                    typeof window !== 'undefined' &&
                    window.matchMedia('(prefers-color-scheme: dark)').matches
                        ? 'dark'
                        : 'light';
            } else {
                resolvedTheme = pref;
            }
            applyThemeClass(resolvedTheme);
            return { themePreference: pref, theme: resolvedTheme };
        }),

    setLanguage: (lang: AppLanguage) =>
        set(() => {
            if (typeof window !== 'undefined') {
                try {
                    localStorage.setItem('tide_language', lang);
                } catch (e) {
                    console.warn('Failed to save language to localStorage', e);
                }
            }
            return { language: lang };
        }),

    setNavigationMode: (mode: NavigationMode) =>
        set(() => {
            if (typeof window !== 'undefined') {
                try {
                    localStorage.setItem('tide_navigation_mode', mode);
                } catch (e) {
                    console.warn('Failed to save navigation mode to localStorage', e);
                }
            }
            return { navigationMode: mode };
        }),
});
