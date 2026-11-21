import type { StateCreator } from 'zustand';
import type { WeekStart } from '@/lib/calendarWeeks';
import type { AppPalette } from '@/lib/palette';
import type { TagFilter } from '@/lib/tagFilter';
import type { SavedView } from '@/lib/viewsStorage';

export interface DataItem {
    id: string;
    title: string;
    type: string;
    safe?: string;
    linkedSafes?: string[];
    [key: string]: any; // Allow extra properties like visibility, secured_meta for file UI
}

export interface TaskItem {
    id: string;
    title: string;
    description?: string;
    color?: string;
    isCompleted: boolean;
    status?: 'todo' | 'in_progress' | 'completed';
    linkedNoteId?: string;
    scheduledDate?: string;
    priority?: 'low' | 'medium' | 'high';
    dueDate?: string;
    recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
    recurrence_rule?: string;
    recurrence_end?: string;
    completed_dates?: string[];
    folder?: string;
    tags?: string[];
    showInCalendar?: boolean;
    createdAt?: string;
    completedAt?: string;
    isArchived?: boolean;
    parentId?: string | null;
    order?: number;
    updatedAt?: string;
}

export interface SmartIslandState {
    show: boolean;
    parsedData?: any;
    text?: string;
    sourceNodePos?: number;
    anchorElement?: HTMLElement | null;
}

export type SettingsModalTab =
    | 'account'
    | 'calendar'
    | 'appearance'
    | 'notes'
    | 'todos'
    | 'extensions'
    | 'access'
    | 'about'
    | 'info'
    | 'debug';

export type NoteLayout = 'thin' | 'normal' | 'wide' | 'extra-wide' | 'a4';
export type NoteMargin = 'compact' | 'normal' | 'wide';
export type PaperPattern = 'blanko' | 'ruled' | 'grid';
export type ThemePreference = 'light' | 'dark' | 'system';
export type { AppPalette };
export type AppTheme = 'light' | 'dark';
export type AppLanguage = 'en' | 'de';
export type CalendarColorPalette = 'balsam' | 'modern-dark' | 'soft-pastels' | 'classic-tide';
export type CalendarOverlapMode = 'overlap' | 'stack';
export type CalendarScrollMode = 'infinite' | 'fixed';
export type CalendarHolidayPackage = 'DE' | 'AT' | 'CH' | 'US';
export type EventMentionStyle = 'blue' | 'calendar';
export type EventMentionPreview = 'always' | 'hover' | 'off';
export type NavigationMode = 'sidebar' | 'folders';

export interface NotesSlice {
    notes: DataItem[];
    orderedNoteIds: string[];
    activeNoteId: string | null;
    activeParentId: string | null;
    noteLayout: NoteLayout;
    noteMargin: NoteMargin;
    noteCaretPositions: Record<string, { from: number; to: number }>;

    setNotes: (notes: DataItem[]) => void;
    setOrderedNoteIds: (ids: string[]) => void;
    setActiveNoteId: (id: string | null) => void;
    setActiveParentId: (id: string | null) => void;
    setNoteLayout: (
        layout: NoteLayout | ((prev: NoteLayout) => NoteLayout)
    ) => void;
    setNoteMargin: (margin: NoteMargin) => void;
    setNoteCaretPosition: (
        noteId: string,
        pos: { from: number; to: number }
    ) => void;
    createNote: (
        title: string,
        initialContent?: unknown,
        parentIdOverride?: string | null
    ) => Promise<string>;
    createCanvasNote: (title: string) => Promise<string>;
    createFolder: (
        name: string,
        parentId?: string | null
    ) => Promise<string>;
    insertMentionIntoNote: (
        noteId: string,
        targetId: string,
        title: string
    ) => void;
}

export interface EventsSlice {
    events: DataItem[];
    /** True once the first server events response arrived (or the request failed). */
    eventsLoaded: boolean;
    eventMentionStyle: EventMentionStyle;
    eventMentionPreview: EventMentionPreview;
    calendarColorPalette: CalendarColorPalette;
    calendarOverlapMode: CalendarOverlapMode;
    calendarScrollMode: CalendarScrollMode;
    weekStartsOn: WeekStart;
    visibleCalendarRange?: { start: string; end: string } | null;
    calendarHolidaysEnabled: boolean;
    calendarHolidayPackage: CalendarHolidayPackage;

    setEvents: (events: DataItem[]) => void;
    setEventsLoaded: (loaded: boolean) => void;
    setEventMentionStyle: (style: EventMentionStyle) => void;
    setEventMentionPreview: (preview: EventMentionPreview) => void;
    setCalendarColorPalette: (palette: CalendarColorPalette) => void;
    setCalendarOverlapMode: (mode: CalendarOverlapMode) => void;
    setCalendarScrollMode: (mode: CalendarScrollMode) => void;
    setWeekStartsOn: (w: WeekStart) => void;
    setVisibleCalendarRange: (range: { start: string; end: string } | null) => void;
    setCalendarHolidaysEnabled: (enabled: boolean) => void;
    setCalendarHolidayPackage: (pkg: CalendarHolidayPackage) => void;
    groupOverlappingEvents: (parentId: string) => void;
}

export interface TodosSlice {
    tasks: TaskItem[];

    setTasks: (tasks: TaskItem[]) => void;
    addTask: (task: Omit<TaskItem, 'id'>) => Promise<string>;
    /** `strict`: Fehler werden geworfen statt verschluckt (Standard: unveraendert, still). */
    updateTask: (id: string, updates: Partial<TaskItem>, options?: { strict?: boolean }) => Promise<void>;
    toggleTask: (id: string) => Promise<void>;
    toggleTaskInProgress: (id: string) => Promise<void>;
    setTaskStatus: (
        id: string,
        status: 'todo' | 'in_progress' | 'completed'
    ) => Promise<void>;
    deleteTask: (id: string) => Promise<void>;
}

export interface UiSlice {
    isSettingsModalOpen: boolean;
    settingsModalTab: SettingsModalTab;
    isVariablesModalOpen: boolean;
    smartIslandState: SmartIslandState | null;
    enabledExtensions: string[];
    theme: AppTheme;
    themePreference: ThemePreference;
    appPalette: AppPalette;
    language: AppLanguage;
    navigationMode: NavigationMode;
    paperPattern: PaperPattern;
    showPageBreaks: boolean;

    setSettingsModalOpen: (open: boolean, tab?: SettingsModalTab) => void;
    setSettingsModalTab: (tab: SettingsModalTab) => void;
    setVariablesModalOpen: (open: boolean) => void;
    setSmartIsland: (state: SmartIslandState | null) => void;
    setEnabledExtensions: (
        extensions: string[] | ((prev: string[]) => string[])
    ) => void;
    setThemePreference: (pref: ThemePreference) => void;
    setAppPalette: (palette: AppPalette) => void;
    setLanguage: (lang: AppLanguage) => void;
    setNavigationMode: (mode: NavigationMode) => void;
    setPaperPattern: (pattern: PaperPattern) => void;
    setShowPageBreaks: (show: boolean) => void;
    /** Numbers headings and sub-headings (1, 1.1, 1.1.1) by CSS counters; the text is not changed. */
    headingNumbering: boolean;
    setHeadingNumbering: (on: boolean) => void;
    /** Shows the left and right edges of the A4 sheet. Off: only the top and bottom edge is drawn. */
    a4SideBorders: boolean;
    setA4SideBorders: (on: boolean) => void;
    /** Todo tag filter (multi-select, OR). Not persisted; other views may set it via links. */
    todoTagFilter: TagFilter;
    setTodoTagFilter: (filter: TagFilter) => void;
    /** Calendar tag filter (multi-select, OR). Not persisted. */
    calendarTagFilter: TagFilter;
    setCalendarTagFilter: (filter: TagFilter) => void;
}

export interface FsSlice {
    privateKey: CryptoKey | null;
    publicKey: CryptoKey | null;
    myId: string | null;
    loadedDirectories: Set<string>;
    fetchingDirectories: Set<string>;
    metadataCache: Record<string, any>;
    openFolderIds: Set<string>;
    isUpdatingMetadata: Set<string>;

    setKeys: (privateKey: CryptoKey, publicKey: CryptoKey, myId: string) => void;
    fetchDirectory: (
        parentId: string | null,
        forceRefresh?: boolean
    ) => Promise<void>;
    loadAllMetadata: () => Promise<void>;
    toggleFolder: (id: string, open?: boolean) => void;
    setUpdatingMetadata: (id: string, updating: boolean) => void;
    updateSpecificMetadataCache: (id: string, updates: any) => void;
    updateFileRaw: (id: string, updates: Partial<DataItem>) => void;
    updateFile: (id: string, updates: Partial<DataItem>) => void;
    appendFiles: (files: DataItem[], events: DataItem[]) => void;
}

export interface ContactItem {
    id: string;
    username: string;
    email?: string;
    avatar_seed?: string;
    avatar_salt?: string;
    avatar_style?: string;
    status?: string;
}

export interface ContactsSlice {
    contacts: ContactItem[];
    contactsList?: ContactItem[];
    setContactsList?: (contacts: ContactItem[]) => void;
    setContacts?: (contacts: ContactItem[]) => void;
    fetchContacts: () => Promise<void>;
}

export interface SafesSlice {
    availableSafes: string[];
    activeSafes: string[];

    setActiveSafes: (safes: string[]) => void;
    toggleSafe: (safe: string) => void;
    createSafe: (name: string) => void;
    deleteSafe: (name: string) => void;
    setNoteSafe: (noteId: string, safeName: string) => Promise<void>;
    linkNoteToSafe: (noteId: string, targetSafe: string) => Promise<void> | void;
}

export interface ViewsSlice {
    views: SavedView[];
    loadViews: () => Promise<void>;
    addView: (v: Omit<SavedView, 'id'>) => Promise<string>;
    renameView: (id: string, name: string) => Promise<void>;
    removeView: (id: string) => Promise<void>;
    pruneTagFromViews: (tagId: string) => Promise<void>;
}

export type DataStoreState = NotesSlice &
    EventsSlice &
    TodosSlice &
    UiSlice &
    FsSlice &
    SafesSlice &
    ViewsSlice &
    Partial<ContactsSlice>;

export type DataState = DataStoreState;

export type DataStoreSlice<T> = StateCreator<DataStoreState, [], [], T>;
