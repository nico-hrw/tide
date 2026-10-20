import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type IslandMessagePreviewMode = 'full' | 'preview' | 'sender_only';
export type IslandFileShareDisplay = 'card' | 'compact';

export interface IslandSettingsState {
    messagePreviewMode: IslandMessagePreviewMode;
    fileShareDisplay: IslandFileShareDisplay;
    showNoteSharedText: boolean;
    expandOnNotification: boolean;
    notificationDurationSeconds: number;

    setMessagePreviewMode: (mode: IslandMessagePreviewMode) => void;
    setFileShareDisplay: (display: IslandFileShareDisplay) => void;
    setShowNoteSharedText: (show: boolean) => void;
    setExpandOnNotification: (expand: boolean) => void;
    setNotificationDurationSeconds: (duration: number) => void;
}

export const useIslandSettingsStore = create<IslandSettingsState>()(
    persist(
        (set) => ({
            messagePreviewMode: 'preview',
            fileShareDisplay: 'card',
            showNoteSharedText: true,
            expandOnNotification: true,
            notificationDurationSeconds: 6,

            setMessagePreviewMode: (messagePreviewMode) => set({ messagePreviewMode }),
            setFileShareDisplay: (fileShareDisplay) => set({ fileShareDisplay }),
            setShowNoteSharedText: (showNoteSharedText) => set({ showNoteSharedText }),
            setExpandOnNotification: (expandOnNotification) => set({ expandOnNotification }),
            setNotificationDurationSeconds: (notificationDurationSeconds) => set({ notificationDurationSeconds }),
        }),
        {
            name: 'tide_island_settings',
        }
    )
);
