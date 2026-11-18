import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { createNotesSlice } from './slices/createNotesSlice';
import { createEventsSlice } from './slices/createEventsSlice';
import { createTodosSlice } from './slices/createTodosSlice';
import { createUiSlice } from './slices/createUiSlice';
import { createFsSlice } from './slices/createFsSlice';
import { createContactsSlice } from './slices/createContactsSlice';
import { createSafesSlice, loadCachedSafes, loadCachedActiveSafes } from './slices/createSafesSlice';
import { broadcastSync, subscribeToSync } from './sync/broadcast';
import type { DataStoreState } from './slices/types';
import type { WeekStart } from '@/lib/calendarWeeks';

// Re-export all types
export * from './slices/types';

// Re-export offline caching helpers and sync utilities
export {
    deletedTaskIds,
    loadCachedTasks,
    saveTasksToOfflineCache,
} from './slices/createTodosSlice';
export {
    loadCachedNotes,
    saveNotesToOfflineCache,
} from './slices/createNotesSlice';
export {
    loadCachedEvents,
    saveEventsToOfflineCache,
} from './slices/createEventsSlice';
export { loadCachedSafes, loadCachedActiveSafes } from './slices/createSafesSlice';
export { broadcastSync, subscribeToSync } from './sync/broadcast';

// Root store composing all domain slices
export const useDataStore = create<DataStoreState>()((...a) => ({
    ...createNotesSlice(...a),
    ...createEventsSlice(...a),
    ...createTodosSlice(...a),
    ...createUiSlice(...a),
    ...createFsSlice(...a),
    ...createContactsSlice(...a),
    ...createSafesSlice(...a),
}));

// Cross-tab broadcast synchronization
if (typeof window !== 'undefined') {
    subscribeToSync((msg) => {
        const type = (msg?.type || '').toLowerCase();
        if (
            !type ||
            type.includes('sync') ||
            type.includes('invalidate') ||
            type.includes('refresh') ||
            type.includes('dir')
        ) {
            const state = useDataStore.getState();
            if (typeof state.fetchDirectory === 'function') {
                void state.fetchDirectory(null, true);
            }
        }
    });
}

// Non-reactive and reactive accessors for the week start setting
export function getWeekStartsOn(): WeekStart {
    return useDataStore.getState().weekStartsOn;
}
export function useWeekStartsOn(): WeekStart {
    return useDataStore((s) => s.weekStartsOn);
}

// Granular selector hooks
export const useNotes = () =>
    useDataStore(
        useShallow((s) => ({
            notes: s.notes,
            orderedNoteIds: s.orderedNoteIds,
            activeNoteId: s.activeNoteId,
            activeParentId: s.activeParentId,
            noteLayout: s.noteLayout,
            noteCaretPositions: s.noteCaretPositions,
            setNotes: s.setNotes,
            setOrderedNoteIds: s.setOrderedNoteIds,
            setActiveNoteId: s.setActiveNoteId,
            setActiveParentId: s.setActiveParentId,
            setNoteLayout: s.setNoteLayout,
            setNoteCaretPosition: s.setNoteCaretPosition,
            createNote: s.createNote,
            createCanvasNote: s.createCanvasNote,
            createFolder: s.createFolder,
            insertMentionIntoNote: s.insertMentionIntoNote,
        }))
    );

export const useCalendarEvents = () =>
    useDataStore(
        useShallow((s) => ({
            events: s.events,
            eventMentionStyle: s.eventMentionStyle,
            eventMentionPreview: s.eventMentionPreview,
            calendarColorPalette: s.calendarColorPalette,
            calendarOverlapMode: s.calendarOverlapMode,
            calendarScrollMode: s.calendarScrollMode,
            weekStartsOn: s.weekStartsOn,
            visibleCalendarRange: s.visibleCalendarRange,
            calendarHolidaysEnabled: s.calendarHolidaysEnabled,
            calendarHolidayPackage: s.calendarHolidayPackage,
            setEvents: s.setEvents,
            setEventMentionStyle: s.setEventMentionStyle,
            setEventMentionPreview: s.setEventMentionPreview,
            setCalendarColorPalette: s.setCalendarColorPalette,
            setCalendarOverlapMode: s.setCalendarOverlapMode,
            setCalendarScrollMode: s.setCalendarScrollMode,
            setWeekStartsOn: s.setWeekStartsOn,
            setVisibleCalendarRange: s.setVisibleCalendarRange,
            setCalendarHolidaysEnabled: s.setCalendarHolidaysEnabled,
            setCalendarHolidayPackage: s.setCalendarHolidayPackage,
            groupOverlappingEvents: s.groupOverlappingEvents,
        }))
    );

export const useTasks = () =>
    useDataStore(
        useShallow((s) => ({
            tasks: s.tasks,
            setTasks: s.setTasks,
            addTask: s.addTask,
            updateTask: s.updateTask,
            toggleTask: s.toggleTask,
            toggleTaskInProgress: s.toggleTaskInProgress,
            setTaskStatus: s.setTaskStatus,
            deleteTask: s.deleteTask,
        }))
    );

export const useUiActions = () =>
    useDataStore(
        useShallow((s) => ({
            isSettingsModalOpen: s.isSettingsModalOpen,
            settingsModalTab: s.settingsModalTab,
            smartIslandState: s.smartIslandState,
            enabledExtensions: s.enabledExtensions,
            theme: s.theme,
            themePreference: s.themePreference,
            appPalette: s.appPalette,
            language: s.language,
            paperPattern: s.paperPattern,
            showPageBreaks: s.showPageBreaks,
            headingNumbering: s.headingNumbering,
            setHeadingNumbering: s.setHeadingNumbering,
            setSettingsModalOpen: s.setSettingsModalOpen,
            setSettingsModalTab: s.setSettingsModalTab,
            setSmartIsland: s.setSmartIsland,
            setEnabledExtensions: s.setEnabledExtensions,
            setThemePreference: s.setThemePreference,
            setAppPalette: s.setAppPalette,
            setLanguage: s.setLanguage,
            setPaperPattern: s.setPaperPattern,
            setShowPageBreaks: s.setShowPageBreaks,
        }))
    );

export const useFileSystem = () =>
    useDataStore(
        useShallow((s) => ({
            metadataCache: s.metadataCache,
            privateKey: s.privateKey,
            publicKey: s.publicKey,
            myId: s.myId,
            loadedDirectories: s.loadedDirectories,
            fetchingDirectories: s.fetchingDirectories,
            openFolderIds: s.openFolderIds,
            isUpdatingMetadata: s.isUpdatingMetadata,
            setKeys: s.setKeys,
            fetchDirectory: s.fetchDirectory,
            loadAllMetadata: s.loadAllMetadata,
            toggleFolder: s.toggleFolder,
            setUpdatingMetadata: s.setUpdatingMetadata,
            updateSpecificMetadataCache: s.updateSpecificMetadataCache,
            updateFileRaw: s.updateFileRaw,
            appendFiles: s.appendFiles,
        }))
    );

export const useSafes = () =>
    useDataStore(
        useShallow((s) => ({
            availableSafes: s.availableSafes,
            activeSafes: s.activeSafes,
            setActiveSafes: s.setActiveSafes,
            toggleSafe: s.toggleSafe,
            createSafe: s.createSafe,
            deleteSafe: s.deleteSafe,
            setNoteSafe: s.setNoteSafe,
        }))
    );
