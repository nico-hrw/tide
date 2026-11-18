import React from 'react';
import { useIslandSettingsStore } from '@/store/useIslandSettingsStore';
import { SettingsBlock, SettingsCard, SettingsRow, SettingsSection } from '../../ui/SettingsLayout';
import { Notice, Segmented, SelectField, StatusPill, Toggle } from '../../ui/Controls';
import { useT } from '../../useT';

/** Optionen der Smart Island. Die Einstellungs-Schluessel (Breite, Anzeigedauer usw.) bleiben unveraendert. */
export function SmartIslandConfig({ isSocialEnabled }: { isSocialEnabled: boolean }) {
    const t = useT();
    const {
        expandOnNotification,
        setExpandOnNotification,
        notificationDurationSeconds,
        setNotificationDurationSeconds,
        messagePreviewMode,
        setMessagePreviewMode,
        fileShareDisplay,
        setFileShareDisplay,
        showNoteSharedText,
        setShowNoteSharedText,
    } = useIslandSettingsStore();

    return (
        <>
            <SettingsSection title={t('island.behavior')} hint={t('island.behaviorHint')}>
                <SettingsCard>
                    <SettingsRow title={t('island.expand')} description={t('island.expandDesc')}>
                        <Toggle checked={expandOnNotification} onChange={setExpandOnNotification} label={t('island.expand')} />
                    </SettingsRow>
                    <SettingsRow title={t('island.duration')} description={t('island.durationDesc')}>
                        <SelectField
                            label={t('island.duration')}
                            value={notificationDurationSeconds}
                            onChange={setNotificationDurationSeconds}
                            options={[
                                { value: 4, label: '4 s' },
                                { value: 6, label: t('island.durationDefault') },
                                { value: 8, label: '8 s' },
                                { value: 12, label: '12 s' },
                            ]}
                        />
                    </SettingsRow>
                </SettingsCard>
            </SettingsSection>

            <SettingsSection title={t('island.chat')} hint={t('island.chatHint')}>
                {isSocialEnabled ? (
                    <SettingsCard>
                        <SettingsBlock>
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <b className="font-medium text-t2-ink">{t('island.preview')}</b>
                                <StatusPill>{t('island.socialOn')}</StatusPill>
                            </div>
                            <Segmented
                                full
                                label={t('island.preview')}
                                value={messagePreviewMode}
                                onChange={setMessagePreviewMode}
                                options={[
                                    { value: 'full', label: t('island.previewFull') },
                                    { value: 'preview', label: t('island.previewShort') },
                                    { value: 'sender_only', label: t('island.previewSender') },
                                ]}
                            />
                        </SettingsBlock>
                        <SettingsRow title={t('island.shared')} description={t('island.sharedDesc')} wide>
                            <Segmented
                                full
                                label={t('island.shared')}
                                value={fileShareDisplay}
                                onChange={setFileShareDisplay}
                                options={[
                                    { value: 'card', label: t('island.sharedCard') },
                                    { value: 'compact', label: t('island.sharedCompact') },
                                ]}
                            />
                        </SettingsRow>
                        <SettingsRow title={t('island.noteText')} description={t('island.noteTextDesc')}>
                            <Toggle checked={showNoteSharedText} onChange={setShowNoteSharedText} label={t('island.noteText')} />
                        </SettingsRow>
                    </SettingsCard>
                ) : (
                    <Notice>{t('island.socialOff')}</Notice>
                )}
            </SettingsSection>
        </>
    );
}
