import { useEffect, useRef, useCallback } from 'react';
import { useMobileConnectionStore } from '@/store/useMobileConnectionStore';
import { useDataStore } from '@/store/useDataStore';
import {
  sendWhisperNotification,
  updateWhisperWidget,
  WhisperApiResponse,
} from '@/lib/mobileConnectionApi';

export interface SyncEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  allDay?: boolean;
  is_completed?: boolean;
  is_cancelled?: boolean;
}

function isSameDay(dateStr: string, targetDateStr: string): boolean {
  if (!dateStr) return false;
  if (dateStr.startsWith(targetDateStr)) return true;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    return d.toLocaleDateString('en-CA') === targetDateStr;
  } catch {
    return false;
  }
}

export function useMobileConnectionSync(events: SyncEvent[]) {
  const {
    token,
    enabled,
    channelId,
    widgetId,
    notifyUpcoming,
    notifyDailyAgenda,
    updateWidget,
    lastDailyAgendaDate,
    notifiedEventKeys,
    markEventNotified,
    setLastDailyAgendaDate,
    setLastWidgetUpdate,
    lastWidgetUpdate,
  } = useMobileConnectionStore();

  const enabledExtensions = useDataStore((state) => state.enabledExtensions);
  const isExtensionActive =
    enabled && enabledExtensions.includes('mobile_connection') && !!token.trim();

  const lastWidgetSigRef = useRef<string>('');
  const notifiedKeysRef = useRef<string[]>(notifiedEventKeys);
  const eventsRef = useRef<SyncEvent[]>(events);

  useEffect(() => {
    notifiedKeysRef.current = notifiedEventKeys;
  }, [notifiedEventKeys]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const checkUpcomingReminders = useCallback(
    async (evList: SyncEvent[]) => {
      if (!notifyUpcoming || !token.trim()) return;
      const now = Date.now();

      for (const ev of evList) {
        if (ev.is_completed || ev.is_cancelled || !ev.start) continue;

        const startTime = new Date(ev.start).getTime();
        if (isNaN(startTime)) continue;

        const diffMins = Math.round((startTime - now) / 60000);
        const key = `${ev.id}_${ev.start}`;

        if (diffMins > 0 && diffMins <= 30 && !notifiedKeysRef.current.includes(key)) {
          const timeStr = new Date(ev.start).toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
          });

          const title = `📅 In ${diffMins} Min: ${ev.title}`;
          const body = `Termin startet um ${timeStr} Uhr${ev.description ? ` (${ev.description})` : ''}`;

          notifiedKeysRef.current = [...notifiedKeysRef.current, key];
          markEventNotified(key);

          await sendWhisperNotification(token, {
            channel_id: channelId || 'reminders',
            priority: 'high',
            title,
            body,
            sound: 'default',
            data: { event_id: ev.id, start: ev.start },
          });
        }
      }
    },
    [notifyUpcoming, token, channelId, markEventNotified]
  );

  const checkDailyAgenda = useCallback(
    async (evList: SyncEvent[]) => {
      if (!notifyDailyAgenda || !token.trim()) return;

      const todayStr = new Date().toLocaleDateString('en-CA');
      if (todayStr === lastDailyAgendaDate) return;

      const todayEvents = evList
        .filter((ev) => !ev.is_cancelled && isSameDay(ev.start, todayStr))
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      const dateLabel = new Date().toLocaleDateString('de-DE', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });

      const title = `☀️ Tagesübersicht für heute (${dateLabel})`;
      const body =
        todayEvents.length > 0
          ? `${todayEvents.length} Termine heute:\n` +
            todayEvents
              .map((e) => {
                const t = new Date(e.start).toLocaleTimeString('de-DE', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return `• ${t} ${e.title}`;
              })
              .join('\n')
          : 'Keine Termine für heute geplant.';

      setLastDailyAgendaDate(todayStr);

      await sendWhisperNotification(token, {
        channel_id: 'agenda',
        priority: 'normal',
        title,
        body,
        sound: 'default',
        data: { date: todayStr, event_count: todayEvents.length },
      });
    },
    [notifyDailyAgenda, token, lastDailyAgendaDate, setLastDailyAgendaDate]
  );

  const performWidgetUpdate = useCallback(
    async (evList: SyncEvent[], force = false): Promise<WhisperApiResponse> => {
      if (!token.trim()) {
        return { success: false, error: 'Kein API-Token konfiguriert' };
      }

      const todayStr = new Date().toLocaleDateString('en-CA');
      const todayEvents = evList
        .filter((ev) => !ev.is_cancelled && isSameDay(ev.start, todayStr))
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      const now = Date.now();
      const nextEvent = todayEvents.find(
        (e) => !e.is_completed && new Date(e.start).getTime() > now
      );

      const nextInfo = nextEvent
        ? `Nächster: ${nextEvent.title} (${new Date(nextEvent.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })})`
        : todayEvents.length > 0
          ? 'Alle Termine abgeschlossen'
          : 'Keine Termine heute';

      const widgetSig = `${todayEvents.length}_${nextEvent ? `${nextEvent.id}_${nextEvent.start}` : 'none'}`;
      const timeSinceLast = Date.now() - (lastWidgetUpdate || 0);
      const shouldUpdate =
        force || widgetSig !== lastWidgetSigRef.current || timeSinceLast >= 5 * 60 * 1000;

      if (!shouldUpdate) {
        return { success: true };
      }

      const payload = {
        widget_id: widgetId || 'calendar-today',
        template: 'metric_badge',
        data: {
          title: 'Termine heute',
          value: `${todayEvents.length} Termine`,
          status: todayEvents.length > 0 ? 'info' : 'success',
          accent_color: '#0284c7',
          progress: todayEvents.length > 0 ? 1 : 0,
          subtitle: nextInfo,
        },
      };

      const res = await updateWhisperWidget(token, payload);
      if (res.success) {
        lastWidgetSigRef.current = widgetSig;
        setLastWidgetUpdate(Date.now());
      }
      return res;
    },
    [token, widgetId, lastWidgetUpdate, setLastWidgetUpdate]
  );

  const syncNow = useCallback(async () => {
    if (!isExtensionActive) return;
    const currentEvents = eventsRef.current;
    await checkUpcomingReminders(currentEvents);
    await checkDailyAgenda(currentEvents);
    if (updateWidget) {
      await performWidgetUpdate(currentEvents, false);
    }
  }, [isExtensionActive, checkUpcomingReminders, checkDailyAgenda, updateWidget, performWidgetUpdate]);

  const sendTestNotification = useCallback(async (): Promise<WhisperApiResponse> => {
    if (!token.trim()) {
      return { success: false, error: 'Kein API-Token konfiguriert' };
    }
    return await sendWhisperNotification(token, {
      channel_id: channelId || 'reminders',
      priority: 'high',
      title: '🔔 Tide Push-Test',
      body: 'Verbindung zu Whisper Hub funktioniert einwandfrei!',
      sound: 'default',
      data: { test: true, timestamp: Date.now() },
    });
  }, [token, channelId]);

  const updateWidgetNow = useCallback(async (): Promise<WhisperApiResponse> => {
    return await performWidgetUpdate(eventsRef.current, true);
  }, [performWidgetUpdate]);

  useEffect(() => {
    if (!isExtensionActive) return;
    void syncNow();
    const timer = setInterval(() => void syncNow(), 60000);
    return () => clearInterval(timer);
  }, [isExtensionActive, syncNow]);

  return { syncNow, sendTestNotification, updateWidgetNow };
}
