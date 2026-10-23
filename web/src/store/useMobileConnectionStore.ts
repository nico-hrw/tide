import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { verifyWhisperToken } from '@/lib/mobileConnectionApi';

export type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'error';

export interface MobileConnectionState {
  // State fields
  enabled: boolean;
  token: string;
  channelId: string;
  widgetId: string;
  notifyUpcoming: boolean;
  notifyDailyAgenda: boolean;
  updateWidget: boolean;
  lastDailyAgendaDate: string | null;
  notifiedEventKeys: string[];
  lastWidgetUpdate: number | null;
  connectionStatus: ConnectionStatus;
  statusMessage: string | null;

  // Actions
  setToken: (token: string) => void;
  setEnabled: (enabled: boolean) => void;
  setChannelId: (channelId: string) => void;
  setWidgetId: (widgetId: string) => void;
  setNotifyUpcoming: (notifyUpcoming: boolean) => void;
  setNotifyDailyAgenda: (notifyDailyAgenda: boolean) => void;
  setUpdateWidget: (updateWidget: boolean) => void;
  markEventNotified: (key: string) => void;
  setLastDailyAgendaDate: (dateStr: string) => void;
  setLastWidgetUpdate: (timestamp: number) => void;
  setConnectionStatus: (status: ConnectionStatus, message?: string | null) => void;
  testConnection: () => Promise<{ success: boolean; message: string }>;
}

export const useMobileConnectionStore = create<MobileConnectionState>()(
  persist(
    (set, get) => ({
      // Defaults
      enabled: false,
      token: '',
      channelId: 'reminders',
      widgetId: 'calendar-today',
      notifyUpcoming: true,
      notifyDailyAgenda: true,
      updateWidget: true,
      lastDailyAgendaDate: null,
      notifiedEventKeys: [],
      lastWidgetUpdate: null,
      connectionStatus: 'idle',
      statusMessage: null,

      // Actions
      setToken: (token: string) => set({ token }),
      setEnabled: (enabled: boolean) => set({ enabled }),
      setChannelId: (channelId: string) => set({ channelId }),
      setWidgetId: (widgetId: string) => set({ widgetId }),
      setNotifyUpcoming: (notifyUpcoming: boolean) => set({ notifyUpcoming }),
      setNotifyDailyAgenda: (notifyDailyAgenda: boolean) => set({ notifyDailyAgenda }),
      setUpdateWidget: (updateWidget: boolean) => set({ updateWidget }),

      markEventNotified: (key: string) =>
        set((state) => {
          if (state.notifiedEventKeys.includes(key)) {
            return state;
          }
          return {
            notifiedEventKeys: [...state.notifiedEventKeys, key].slice(-200),
          };
        }),

      setLastDailyAgendaDate: (dateStr: string) => set({ lastDailyAgendaDate: dateStr }),
      setLastWidgetUpdate: (timestamp: number) => set({ lastWidgetUpdate: timestamp }),

      setConnectionStatus: (status: ConnectionStatus, message?: string | null) =>
        set({
          connectionStatus: status,
          statusMessage: message ?? null,
        }),

      testConnection: async () => {
        set({ connectionStatus: 'testing', statusMessage: null });
        const { token } = get();

        if (!token || !token.trim()) {
          const errorMsg = 'Kein API-Token angegeben';
          set({ connectionStatus: 'error', statusMessage: errorMsg });
          return { success: false, message: errorMsg };
        }

        try {
          const res = await verifyWhisperToken(token);
          if (res.valid) {
            const successMsg = 'Verbindung erfolgreich';
            set({ connectionStatus: 'connected', statusMessage: successMsg });
            return { success: true, message: successMsg };
          } else {
            const errorMsg = res.error || 'Verbindung fehlgeschlagen';
            set({ connectionStatus: 'error', statusMessage: errorMsg });
            return { success: false, message: errorMsg };
          }
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          set({ connectionStatus: 'error', statusMessage: errorMsg });
          return { success: false, message: errorMsg };
        }
      },
    }),
    {
      name: 'tide-mobile-connection-storage',
    }
  )
);
