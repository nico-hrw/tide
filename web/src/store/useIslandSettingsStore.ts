import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { pushSettingsPatch } from '@/lib/settingsSync';

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

            setMessagePreviewMode: (messagePreviewMode) => {
                set({ messagePreviewMode });
                pushSettingsPatch({ extensions: { smart_island: { message_preview_mode: messagePreviewMode } } });
            },
            setFileShareDisplay: (fileShareDisplay) => {
                set({ fileShareDisplay });
                pushSettingsPatch({ extensions: { smart_island: { file_share_display: fileShareDisplay } } });
            },
            setShowNoteSharedText: (showNoteSharedText) => {
                set({ showNoteSharedText });
                pushSettingsPatch({ extensions: { smart_island: { show_note_shared_text: showNoteSharedText } } });
            },
            setExpandOnNotification: (expandOnNotification) => {
                set({ expandOnNotification });
                pushSettingsPatch({ extensions: { smart_island: { expand_on_notification: expandOnNotification } } });
            },
            setNotificationDurationSeconds: (notificationDurationSeconds) => {
                set({ notificationDurationSeconds });
                pushSettingsPatch({ extensions: { smart_island: { notification_duration_seconds: notificationDurationSeconds } } });
            },
        }),
        {
            name: 'tide_island_settings',
        }
    )
);
