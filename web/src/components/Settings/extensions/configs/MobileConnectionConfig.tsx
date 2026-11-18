import React, { useCallback, useState } from 'react';
import { Eye, EyeOff, ExternalLink, RefreshCw, Send } from 'lucide-react';
import { useMobileConnectionStore } from '@/store/useMobileConnectionStore';
import { sendWhisperNotification, updateWhisperWidget } from '@/lib/mobileConnectionApi';
import { useDataStore } from '@/store/useDataStore';
import { SettingsCard, SettingsRow, SettingsSection } from '../../ui/SettingsLayout';
import { Button, Notice, StatusPill, TextField, Toggle } from '../../ui/Controls';
import { useT } from '../../useT';

interface Feedback {
    type: 'success' | 'error';
    message: string;
}

export function MobileConnectionConfig() {
    const t = useT();
    const [showToken, setShowToken] = useState(false);
    const [sending, setSending] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [feedback, setFeedback] = useState<Feedback | null>(null);

    const {
        token, setToken, notifyUpcoming, setNotifyUpcoming, notifyDailyAgenda, setNotifyDailyAgenda,
        updateWidget, setUpdateWidget, connectionStatus, statusMessage, testConnection, channelId, widgetId,
    } = useMobileConnectionStore();
    const events = useDataStore((s) => s.events);
    const hasToken = Boolean(token.trim());
    const isTesting = connectionStatus === 'testing';

    const handleTest = useCallback(async () => {
        if (!token.trim()) return;
        setFeedback(null);
        await testConnection();
    }, [token, testConnection]);

    const handleSendTest = useCallback(async () => {
        if (!token.trim()) return;
        setSending(true);
        setFeedback(null);
        try {
            const res = await sendWhisperNotification(token, {
                channel_id: channelId || 'reminders',
                priority: 'high',
                title: 'Tide Mobile Connection',
                body: '🔔 Test von Tide: Verbindung erfolgreich eingerichtet!',
            });
            setFeedback(res.success ? { type: 'success', message: t('mobile.testSent') } : { type: 'error', message: res.error || t('mobile.testFailed') });
        } catch (err: unknown) {
            setFeedback({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        } finally {
            setSending(false);
        }
    }, [token, channelId, t]);

    const handleUpdateWidget = useCallback(async () => {
        if (!token.trim()) return;
        setUpdating(true);
        setFeedback(null);
        try {
            const today = new Date().toISOString().split('T')[0];
            const count = events.filter((e) => {
                const v = e.date ?? e.startDate ?? e.scheduledDate;
                return typeof v === 'string' && v.startsWith(today);
            }).length;
            const res = await updateWhisperWidget(token, {
                widget_id: widgetId || 'calendar-today',
                template: 'agenda',
                data: {
                    title: 'Tide Kalender',
                    value: count === 1 ? '1 Termin heute' : `${count} Termine heute`,
                    subtitle: new Date().toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }),
                    status: count > 0 ? 'info' : 'normal',
                },
            });
            setFeedback(res.success ? { type: 'success', message: t('mobile.widgetUpdated') } : { type: 'error', message: res.error || t('mobile.widgetFailed') });
        } catch (err: unknown) {
            setFeedback({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        } finally {
            setUpdating(false);
        }
    }, [token, widgetId, events, t]);

    const statusTone = connectionStatus === 'connected' ? 'on' : connectionStatus === 'error' ? 'warn' : 'off';
    const statusText =
        statusMessage ||
        (connectionStatus === 'connected' ? t('mobile.connected') : connectionStatus === 'error' ? t('mobile.error') : t('mobile.checking'));

    return (
        <>
            <SettingsSection title={t('mobile.connection')} hint={t('mobile.connectionHint')}>
                <SettingsCard>
                    <SettingsRow title={t('mobile.token')} description={t('mobile.tokenDesc')} wide>
                        <div className="relative w-full sm:w-[260px]">
                            <TextField
                                block
                                mono
                                type={showToken ? 'text' : 'password'}
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                placeholder="wsp_live_..."
                                spellCheck={false}
                                autoComplete="off"
                                aria-label={t('mobile.token')}
                                className="pr-9"
                            />
                            <button
                                type="button"
                                onClick={() => setShowToken(!showToken)}
                                aria-label={showToken ? t('mobile.hideToken') : t('mobile.showToken')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-t2-ink-3 hover:text-t2-ink"
                            >
                                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </SettingsRow>
                    <SettingsRow title={t('mobile.getToken')} description={t('mobile.getTokenDesc')}>
                        <a
                            href="https://hrw.rocks/whisper/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-ui bg-t2-surface px-3 py-1.5 text-[13px] font-medium text-t2-ink ring-1 ring-t2-line hover:bg-t2-hover"
                        >
                            {t('mobile.openHub')}
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                    </SettingsRow>
                    <SettingsRow title={t('mobile.test')} description={connectionStatus !== 'idle' ? statusText : t('mobile.testDesc')}>
                        {connectionStatus !== 'idle' && <StatusPill tone={statusTone}>{connectionStatus === 'connected' ? t('mobile.statusOk') : connectionStatus === 'error' ? t('mobile.statusError') : t('mobile.statusChecking')}</StatusPill>}
                        <Button onClick={handleTest} disabled={isTesting || !hasToken} icon={<RefreshCw className={`h-3.5 w-3.5 ${isTesting ? 'animate-spin' : ''}`} />}>
                            {isTesting ? t('mobile.testing') : t('mobile.testAction')}
                        </Button>
                    </SettingsRow>
                </SettingsCard>
            </SettingsSection>

            <SettingsSection title={t('mobile.push')} hint={t('mobile.pushHint')}>
                <SettingsCard>
                    <SettingsRow title={t('mobile.upcoming')} description={t('mobile.upcomingDesc')}>
                        <Toggle checked={notifyUpcoming} onChange={setNotifyUpcoming} disabled={!hasToken} label={t('mobile.upcoming')} />
                    </SettingsRow>
                    <SettingsRow title={t('mobile.agenda')} description={t('mobile.agendaDesc')}>
                        <Toggle checked={notifyDailyAgenda} onChange={setNotifyDailyAgenda} disabled={!hasToken} label={t('mobile.agenda')} />
                    </SettingsRow>
                    <SettingsRow title={t('mobile.widget')} description={t('mobile.widgetDesc')}>
                        <Toggle checked={updateWidget} onChange={setUpdateWidget} disabled={!hasToken} label={t('mobile.widget')} />
                    </SettingsRow>
                </SettingsCard>
                {!hasToken && <p className="mt-2 text-[12.5px] text-t2-ink-3">{t('mobile.needToken')}</p>}
            </SettingsSection>

            <SettingsSection title={t('mobile.try')} hint={t('mobile.tryHint')}>
                <SettingsCard>
                    <SettingsRow title={t('mobile.sendTest')} description={t('mobile.sendTestDesc')}>
                        <Button onClick={handleSendTest} disabled={sending || !hasToken} icon={sending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}>
                            {sending ? t('mobile.sending') : t('mobile.sendAction')}
                        </Button>
                    </SettingsRow>
                    <SettingsRow title={t('mobile.refreshWidget')} description={t('mobile.refreshWidgetDesc')}>
                        <Button onClick={handleUpdateWidget} disabled={updating || !hasToken} icon={<RefreshCw className={`h-3.5 w-3.5 ${updating ? 'animate-spin' : ''}`} />}>
                            {updating ? t('mobile.updating') : t('mobile.updateAction')}
                        </Button>
                    </SettingsRow>
                </SettingsCard>
                {feedback && <div className="mt-3"><Notice tone={feedback.type === 'error' ? 'error' : 'success'}>{feedback.message}</Notice></div>}
            </SettingsSection>
        </>
    );
}
