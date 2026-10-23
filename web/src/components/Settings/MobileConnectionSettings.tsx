import React, { useState, useCallback } from 'react';
import { tokens } from '@/lib/designTokens';
import {
  Smartphone, Key, Bell, Calendar, Send, CheckCircle2,
  AlertCircle, ExternalLink, Eye, EyeOff, RefreshCw,
} from 'lucide-react';
import { useMobileConnectionStore } from '@/store/useMobileConnectionStore';
import { sendWhisperNotification, updateWhisperWidget } from '@/lib/mobileConnectionApi';
import { useDataStore } from '@/store/useDataStore';

interface ActionFeedback {
  type: 'success' | 'error';
  message: string;
}

interface ToggleRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ icon, title, subtitle, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <div
      className="flex items-start justify-between gap-4 p-3.5 border border-gray-100 dark:border-white/5 bg-gray-50/60 dark:bg-white/[0.02] hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
      style={{ borderRadius: tokens.radius }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0"
          style={{ borderRadius: tokens.radius }}
        >
          {icon}
        </div>
        <div>
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{subtitle}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-zinc-700'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export const MobileConnectionSettings: React.FC = () => {
  const [showToken, setShowToken] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isUpdatingWidget, setIsUpdatingWidget] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);

  const {
    token, setToken, notifyUpcoming, setNotifyUpcoming,
    notifyDailyAgenda, setNotifyDailyAgenda, updateWidget, setUpdateWidget,
    connectionStatus, statusMessage, testConnection, channelId, widgetId,
  } = useMobileConnectionStore();

  const events = useDataStore((state) => state.events);
  const isTesting = connectionStatus === 'testing';

  const handleTestConnection = useCallback(async () => {
    if (!token.trim()) return;
    setActionFeedback(null);
    await testConnection();
  }, [token, testConnection]);

  const handleSendTestNotification = useCallback(async () => {
    if (!token.trim()) return;
    setIsSendingTest(true);
    setActionFeedback(null);
    try {
      const res = await sendWhisperNotification(token, {
        channel_id: channelId || 'reminders',
        priority: 'high',
        title: 'Tide Mobile Connection',
        body: '🔔 Test von Tide: Verbindung erfolgreich eingerichtet!',
      });
      if (res.success) {
        setActionFeedback({ type: 'success', message: 'Test-Benachrichtigung erfolgreich gesendet!' });
      } else {
        setActionFeedback({ type: 'error', message: res.error || 'Fehler beim Senden der Benachrichtigung.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionFeedback({ type: 'error', message: msg });
    } finally {
      setIsSendingTest(false);
    }
  }, [token, channelId]);

  const handleUpdateWidget = useCallback(async () => {
    if (!token.trim()) return;
    setIsUpdatingWidget(true);
    setActionFeedback(null);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const todayEvents = events.filter((e) => {
        const dateVal = e.date ?? e.startDate ?? e.scheduledDate;
        return typeof dateVal === 'string' && dateVal.startsWith(todayStr);
      });
      const count = todayEvents.length;
      const summary = count === 1 ? '1 Termin heute' : `${count} Termine heute`;

      const res = await updateWhisperWidget(token, {
        widget_id: widgetId || 'calendar-today',
        template: 'agenda',
        data: {
          title: 'Tide Kalender',
          value: summary,
          subtitle: new Date().toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }),
          status: count > 0 ? 'info' : 'normal',
        },
      });

      if (res.success) {
        setActionFeedback({ type: 'success', message: 'Glance-Widget erfolgreich aktualisiert!' });
      } else {
        setActionFeedback({ type: 'error', message: res.error || 'Fehler beim Aktualisieren des Widgets.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionFeedback({ type: 'error', message: msg });
    } finally {
      setIsUpdatingWidget(false);
    }
  }, [token, widgetId, events]);

  return (
    <div
      className="w-full space-y-6 p-6 border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900/50 shadow-sm"
      style={{ borderRadius: tokens.cardRadius }}
    >
      {/* Header */}
      <div className="flex items-start gap-3.5 pb-4 border-b border-gray-100 dark:border-white/10">
        <div
          className="p-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0"
          style={{ borderRadius: tokens.radius }}
        >
          <Smartphone className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            Mobile Connection (Whisper Hub)
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
            Synchronisiere Termine und erhalte Benachrichtigungen auf deinem Smartphone.
          </p>
        </div>
      </div>

      {/* API Token Field */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-blue-500" />
            <span>API-Token</span>
          </label>
          <a
            href="https://go-tide.app/whisper/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
          >
            <span>Whisper Hub Token erstellen</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="wsp_live_..."
              spellCheck={false}
              autoComplete="off"
              className="w-full pl-3 pr-10 py-2 text-xs font-mono bg-white dark:bg-zinc-800/80 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
              style={{ borderRadius: tokens.radius }}
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1"
              aria-label={showToken ? 'Token verbergen' : 'Token anzeigen'}
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting || !token.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95 shrink-0"
            style={{ borderRadius: tokens.radius }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
            <span>{isTesting ? 'Wird geprüft...' : 'Verbindung testen'}</span>
          </button>
        </div>

        {/* Status Message */}
        {connectionStatus !== 'idle' && (
          <div
            className={`flex items-center gap-2 p-2.5 text-xs ${
              connectionStatus === 'connected'
                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
                : connectionStatus === 'error'
                ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20'
                : 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20'
            }`}
            style={{ borderRadius: tokens.radius }}
          >
            {connectionStatus === 'connected' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {connectionStatus === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
            {connectionStatus === 'testing' && <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />}
            <span>
              {statusMessage ||
                (connectionStatus === 'connected'
                  ? 'Erfolgreich mit Whisper Hub verbunden'
                  : connectionStatus === 'error'
                  ? 'Verbindungsfehler aufgetreten'
                  : 'Verbindung wird überprüft...')}
            </span>
          </div>
        )}
      </div>

      {/* Toggles / Switches */}
      <div className="space-y-3 pt-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Synchronisation & Push-Regeln
        </h4>

        <div className="space-y-2.5">
          <ToggleRow
            icon={<Bell className="w-4 h-4" />}
            title="30-Minuten Vorab-Benachrichtigung"
            subtitle="Sendet 30 Minuten vor Beginn eines Kalendertermins eine Push-Benachrichtigung."
            checked={notifyUpcoming}
            onChange={setNotifyUpcoming}
            disabled={!token.trim()}
          />

          <ToggleRow
            icon={<Calendar className="w-4 h-4" />}
            title="Morgendliche Tagesübersicht"
            subtitle="Sendet am Morgen eine Zusammenfassung aller anstehenden Termine des Tages."
            checked={notifyDailyAgenda}
            onChange={setNotifyDailyAgenda}
            disabled={!token.trim()}
          />

          <ToggleRow
            icon={<Smartphone className="w-4 h-4" />}
            title="Glance-Widget synchronisieren"
            subtitle="Schreibt die heutigen Termine in das Glance-Widget auf deinem Homescreen."
            checked={updateWidget}
            onChange={setUpdateWidget}
            disabled={!token.trim()}
          />
        </div>
      </div>

      {/* Action / Testing Bar */}
      <div className="pt-4 border-t border-gray-100 dark:border-white/10 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={handleSendTestNotification}
            disabled={isSendingTest || !token.trim()}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
            style={{ borderRadius: tokens.radius }}
          >
            {isSendingTest ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5 text-blue-500" />
            )}
            <span>{isSendingTest ? 'Wird gesendet...' : 'Test-Benachrichtigung senden'}</span>
          </button>

          <button
            type="button"
            onClick={handleUpdateWidget}
            disabled={isUpdatingWidget || !token.trim()}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
            style={{ borderRadius: tokens.radius }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isUpdatingWidget ? 'animate-spin text-blue-500' : ''}`} />
            <span>{isUpdatingWidget ? 'Wird aktualisiert...' : 'Widget aktualisieren'}</span>
          </button>
        </div>

        {/* Action Feedback */}
        {actionFeedback && (
          <div
            className={`flex items-center gap-2 p-2.5 text-xs animate-in fade-in duration-200 ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
                : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20'
            }`}
            style={{ borderRadius: tokens.radius }}
          >
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileConnectionSettings;
