import type { StateCreator } from 'zustand';

export interface DataItem {
    id: string;
    title: string;
    type: string;
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
    | 'extensions'
    | 'access'
    | 'info'
    | 'debug';

export type NoteLayout = 'thin' | 'normal' | 'wide' | 'extra-wide';
export type ThemePreference = 'light' | 'dark' | 'system';
export type AppTheme = 'light' | 'dark';
export type AppLanguage = 'en' | 'de';
export type CalendarColorPalette = 'modern-dark' | 'soft-pastels' | 'classic-tide';
export type CalendarOverlapMode = 'overlap' | 'stack';
export type CalendarHolidayPackage = 'DE' | 'AT' | 'CH' | 'US';
export type EventMentionStyle = 'blue' | 'calendar';
export type EventMentionPreview = 'always' | 'hover' | 'off';

export interface NotesSlice {
    notes: DataItem[];
    orderedNoteIds: string[];
    activeNoteId: string | null;
    activeParentId: string | null;
    noteLayout: NoteLayout;
    noteCaretPositions: Record<string, { from: number; to: number }>;

    setNotes: (notes: DataItem[]) => void;
    setOrderedNoteIds: (ids: string[]) => void;
    setActiveNoteId: (id: string | null) => void;
    setActiveParentId: (id: string | null) => void;
    setNoteLayout: (
        layout: NoteLayout | ((prev: NoteLayout) => NoteLayout)
    ) => void;
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
    insertMentionIntoNote: (
        noteId: string,
        targetId: string,
        title: string
    ) => void;
}

export interface EventsSlice {
    events: DataItem[];
    eventMentionStyle: EventMentionStyle;
    eventMentionPreview: EventMentionPreview;
    calendarColorPalette: CalendarColorPalette;
    calendarOverlapMode: CalendarOverlapMode;
    visibleCalendarRange?: { start: string; end: string } | null;
    calendarHolidaysEnabled: boolean;
    calendarHolidayPackage: CalendarHolidayPackage;

    setEvents: (events: DataItem[]) => void;
    setEventMentionStyle: (style: EventMentionStyle) => void;
    setEventMentionPreview: (preview: EventMentionPreview) => void;
    setCalendarColorPalette: (palette: CalendarColorPalette) => void;
    setCalendarOverlapMode: (mode: CalendarOverlapMode) => void;
    setVisibleCalendarRange: (range: { start: string; end: string } | null) => void;
    setCalendarHolidaysEnabled: (enabled: boolean) => void;
    setCalendarHolidayPackage: (pkg: CalendarHolidayPackage) => void;
    groupOverlappingEvents: (parentId: string) => void;
}

export interface TodosSlice {
    tasks: TaskItem[];

    setTasks: (tasks: TaskItem[]) => void;
    addTask: (task: Omit<TaskItem, 'id'>) => Promise<string>;
    updateTask: (id: string, updates: Partial<TaskItem>) => Promise<void>;
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
    smartIslandState: SmartIslandState | null;
    enabledExtensions: string[];
    theme: AppTheme;
    themePreference: ThemePreference;
    language: AppLanguage;

    setSettingsModalOpen: (open: boolean, tab?: SettingsModalTab) => void;
    setSettingsModalTab: (tab: SettingsModalTab) => void;
    setSmartIsland: (state: SmartIslandState | null) => void;
    setEnabledExtensions: (
        extensions: string[] | ((prev: string[]) => string[])
    ) => void;
    setThemePreference: (pref: ThemePreference) => void;
    setLanguage: (lang: AppLanguage) => void;
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
    appendFiles: (files: DataItem[], events: DataItem[]) => void;
}

export interface FinanceAccount {
    id: string;
    name: string;
    type: string;
    balance: number;
}

export interface FinanceTransaction {
    id: string;
    date: string;
    description: string;
    amount: number;
    category?: string;
    accountId?: string;
}

export interface FinanceSlice {
    accounts: FinanceAccount[];
    transactions: FinanceTransaction[];
    financeAccounts?: FinanceAccount[];
    financeTransactions?: FinanceTransaction[];
    setFinanceAccounts?: (accounts: FinanceAccount[]) => void;
    setFinanceTransactions?: (transactions: FinanceTransaction[]) => void;
    fetchFinanceData: () => Promise<void>;
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

export type DataStoreState = NotesSlice &
    EventsSlice &
    TodosSlice &
    UiSlice &
    FsSlice &
    Partial<FinanceSlice> &
    Partial<ContactsSlice>;

export type DataState = DataStoreState;

export type DataStoreSlice<T> = StateCreator<DataStoreState, [], [], T>;
