import { apiFetch } from './api';
import { setAnimatedEmojiEnabled } from './animatedEmoji';
import type { WeekStart } from './calendarWeeks';
import { useDataStore } from '@/store/useDataStore';
import { useIslandSettingsStore, type IslandFileShareDisplay, type IslandMessagePreviewMode } from '@/store/useIslandSettingsStore';
import { useReferenceStore, type ReferenceDisplayMode } from '@/store/useReferenceStore';
import type {
    AppLanguage, AppPalette, CalendarColorPalette, CalendarHolidayPackage, CalendarOverlapMode,
    CalendarScrollMode, EventMentionPreview, EventMentionStyle, NavigationMode, NoteLayout,
    NoteMargin, PaperPattern, ThemePreference,
} from '@/store/slices/types';

export interface ServerProfileSettings {
    username?: string; title?: string; bio?: string;
    avatar_style?: 'notionists' | 'openPeeps'; avatar_salt?: string; avatar_seed?: string; discoverable?: boolean;
}

export interface ServerAppearanceSettings {
    theme?: ThemePreference; app_palette?: AppPalette; language?: AppLanguage; navigation_mode?: NavigationMode;
}

export interface ServerNotesSettings {
    note_layout?: NoteLayout; note_margin?: NoteMargin; paper_pattern?: PaperPattern;
    show_page_breaks?: boolean; heading_numbering?: boolean; a4_side_borders?: boolean;
    animated_emoji?: boolean; graph_animation?: boolean; date_detection_mode?: 'auto' | 'manual';
    event_mention_style?: EventMentionStyle; event_mention_preview?: EventMentionPreview;
}

export interface ServerCalendarSettings {
    scroll_mode?: CalendarScrollMode; overlap_mode?: CalendarOverlapMode; color_palette?: CalendarColorPalette;
    week_starts_on?: WeekStart; holidays_enabled?: boolean; holiday_package?: CalendarHolidayPackage;
}

export interface ServerExtensionsSettings {
    enabled?: string[];
    smart_island?: {
        expand_on_notification?: boolean; notification_duration_seconds?: number;
        message_preview_mode?: IslandMessagePreviewMode; file_share_display?: IslandFileShareDisplay;
        show_note_shared_text?: boolean;
    };
    job_planner?: { mode?: 'job' | 'study' | 'both'; show_weekends?: boolean; plugin_tag_ids?: string[] };
    surveys?: { mood_tracker_enabled?: boolean };
    references?: { auto_scan_enabled?: boolean; display_mode?: ReferenceDisplayMode };
    mobile_connection?: {
        enabled?: boolean; channel_id?: string; widget_id?: string;
        notify_upcoming?: boolean; notify_daily_agenda?: boolean; update_widget?: boolean;
    };
}

export interface ServerSettings {
    profile?: ServerProfileSettings; appearance?: ServerAppearanceSettings; notes?: ServerNotesSettings;
    calendar?: ServerCalendarSettings; extensions?: ServerExtensionsSettings;
    presence?: { status?: 'online' | 'away' | 'offline' };
}

export type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends Array<infer U> ? Array<U> : T[K] extends object ? DeepPartial<T[K]> : T[K];
};
export type ServerSettingsPatch = DeepPartial<ServerSettings>;

export interface ServerWorkspaceItem {
    name: string; is_default: boolean; is_active: boolean; file_count: number;
}

export interface ServerWorkspacesResponse {
    workspaces: ServerWorkspaceItem[];
    active_workspaces: string[];
}

let applyingRemoteSettings = false;
let pendingPatch: ServerSettingsPatch = {};
let patchTimer: ReturnType<typeof setTimeout> | null = null;

export function isApplyingRemoteSettings(): boolean {
    return applyingRemoteSettings;
}

function safeSetStorage(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(key, value); } catch { /* ignore private mode errors */ }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMergeObjects(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...target };
    for (const [key, val] of Object.entries(source)) {
        if (val === undefined) continue;
        const existing = out[key];
        out[key] = isPlainObject(existing) && isPlainObject(val) ? deepMergeObjects(existing, val) : val;
    }
    return out;
}

function normalizeWorkspaceNames(names: string[], ensureMain: boolean): string[] {
    const unique = Array.from(new Set(
        names.map((n) => n.trim()).filter(Boolean).map((n) => (n === 'Standard' ? 'main' : n))
    ));
    return ensureMain && !unique.includes('main') ? ['main', ...unique] : unique;
}

export function applyServerSettings(settings: ServerSettings, options?: { preserveEmptyExtensions?: boolean }): void {
    applyingRemoteSettings = true;
    try {
        const store = useDataStore.getState();
        const a = settings.appearance;
        if (a) {
            if (a.theme !== undefined) store.setThemePreference(a.theme);
            if (a.app_palette !== undefined) store.setAppPalette(a.app_palette);
            if (a.language !== undefined) store.setLanguage(a.language);
            if (a.navigation_mode !== undefined) store.setNavigationMode(a.navigation_mode);
        }
        const n = settings.notes;
        if (n) {
            if (n.note_layout !== undefined) store.setNoteLayout(n.note_layout);
            if (n.note_margin !== undefined) store.setNoteMargin(n.note_margin);
            if (n.paper_pattern !== undefined) store.setPaperPattern(n.paper_pattern);
            if (n.show_page_breaks !== undefined) store.setShowPageBreaks(n.show_page_breaks);
            if (n.heading_numbering !== undefined) store.setHeadingNumbering(n.heading_numbering);
            if (n.a4_side_borders !== undefined) store.setA4SideBorders(n.a4_side_borders);
            if (n.event_mention_style !== undefined) store.setEventMentionStyle(n.event_mention_style);
            if (n.event_mention_preview !== undefined) store.setEventMentionPreview(n.event_mention_preview);
            if (n.animated_emoji !== undefined) setAnimatedEmojiEnabled(n.animated_emoji);
            if (n.graph_animation !== undefined) store.setGraphAnimation(n.graph_animation);
            if (n.date_detection_mode !== undefined) safeSetStorage('tide_date_detection_mode', n.date_detection_mode);
        }
        const c = settings.calendar;
        if (c) {
            if (c.scroll_mode !== undefined) store.setCalendarScrollMode(c.scroll_mode);
            if (c.overlap_mode !== undefined) store.setCalendarOverlapMode(c.overlap_mode);
            if (c.color_palette !== undefined) store.setCalendarColorPalette(c.color_palette);
            if (c.week_starts_on !== undefined) store.setWeekStartsOn(c.week_starts_on);
            if (c.holidays_enabled !== undefined) store.setCalendarHolidaysEnabled(c.holidays_enabled);
            if (c.holiday_package !== undefined) store.setCalendarHolidayPackage(c.holiday_package);
        }
        const ext = settings.extensions;
        if (ext) {
            if (Array.isArray(ext.enabled) && (!options?.preserveEmptyExtensions || ext.enabled.length > 0)) {
                useDataStore.setState({ enabledExtensions: ext.enabled });
                safeSetStorage('tide_enabled_extensions', JSON.stringify(ext.enabled));
            }
            if (ext.smart_island) {
                const si = ext.smart_island;
                const island = useIslandSettingsStore.getState();
                if (si.message_preview_mode !== undefined) island.setMessagePreviewMode(si.message_preview_mode);
                if (si.file_share_display !== undefined) island.setFileShareDisplay(si.file_share_display);
                if (si.show_note_shared_text !== undefined) island.setShowNoteSharedText(si.show_note_shared_text);
                if (si.expand_on_notification !== undefined) island.setExpandOnNotification(si.expand_on_notification);
                if (si.notification_duration_seconds !== undefined) island.setNotificationDurationSeconds(si.notification_duration_seconds);
            }
            if (ext.references) {
                const refStore = useReferenceStore.getState();
                if (ext.references.auto_scan_enabled !== undefined) refStore.setAutoScanEnabled(ext.references.auto_scan_enabled);
                if (ext.references.display_mode !== undefined) refStore.setDisplayMode(ext.references.display_mode);
            }
        }
        if (settings.profile && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tide:profile_updated', { detail: settings.profile }));
        }
    } finally {
        applyingRemoteSettings = false;
    }
}

export async function hydrateSettingsFromServer(): Promise<void> {
    try {
        const res = await apiFetch('/api/v1/user/settings');
        if (!res.ok) return;
        const data = (await res.json()) as { settings?: ServerSettings };
        if (data?.settings) applyServerSettings(data.settings, { preserveEmptyExtensions: true });
    } catch { /* ignore offline errors */ }
}

export function pushSettingsPatch(patch: ServerSettingsPatch): void {
    if (applyingRemoteSettings) return;
    pendingPatch = deepMergeObjects(pendingPatch as Record<string, unknown>, patch as Record<string, unknown>) as ServerSettingsPatch;
    if (patchTimer !== null) clearTimeout(patchTimer);
    patchTimer = setTimeout(() => {
        const body = pendingPatch;
        pendingPatch = {};
        patchTimer = null;
        void apiFetch('/api/v1/user/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).catch(() => {});
    }, 400);
}

export function applyServerWorkspaces(workspaces: string[], activeWorkspaces: string[]): void {
    const availableSafes = normalizeWorkspaceNames(workspaces, true);
    const availableSet = new Set(availableSafes);
    const filtered = normalizeWorkspaceNames(activeWorkspaces, false).filter((s) => availableSet.has(s));
    const activeSafes = filtered.length > 0 ? filtered : ['main'];
    useDataStore.setState({ availableSafes, activeSafes });
    safeSetStorage('tide_safes', JSON.stringify(availableSafes));
    safeSetStorage('tide_active_safes', JSON.stringify(activeSafes));
}

export async function hydrateWorkspacesFromServer(): Promise<void> {
    try {
        const res = await apiFetch('/api/v1/user/workspaces');
        if (!res.ok) return;
        const data = (await res.json()) as Partial<ServerWorkspacesResponse>;
        const serverNames = Array.isArray(data.workspaces) ? data.workspaces.map((w) => w.name).filter((n) => typeof n === 'string') : [];
        const serverActive = Array.isArray(data.active_workspaces) ? data.active_workspaces : ['main'];
        const serverSet = new Set(normalizeWorkspaceNames(serverNames, true));
        const { availableSafes: localSafes, activeSafes: localActive } = useDataStore.getState();
        const missingLocal = normalizeWorkspaceNames(localSafes, false).filter((s) => s !== 'main' && !serverSet.has(s));
        if (missingLocal.length > 0) {
            void Promise.allSettled(missingLocal.map((name) => apiFetch('/api/v1/user/workspaces', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, active: localActive.includes(name) }),
            })));
        }
        applyServerWorkspaces([...serverNames, ...missingLocal], serverActive);
    } catch { /* ignore offline errors */ }
}

export function syncCreateWorkspace(name: string): void {
    if (applyingRemoteSettings) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    void apiFetch('/api/v1/user/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
    }).catch(() => {});
}

export function syncDeleteWorkspace(name: string): void {
    if (applyingRemoteSettings) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === 'main' || trimmed === 'Standard') return;
    void apiFetch(`/api/v1/user/workspaces/${encodeURIComponent(trimmed)}`, { method: 'DELETE' }).catch(() => {});
}

export function syncActiveWorkspaces(active: string[]): void {
    if (applyingRemoteSettings) return;
    const normalized = normalizeWorkspaceNames(active, false);
    const active_workspaces = normalized.length > 0 ? normalized : ['main'];
    void apiFetch('/api/v1/user/workspaces/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active_workspaces }),
    }).catch(() => {});
}
