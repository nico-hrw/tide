import React from 'react';
import { useSurveyStore } from '@/store/useSurveyStore';
import { SettingsCard, SettingsRow, SettingsSection } from '../../ui/SettingsLayout';
import { Button, StatusPill, Toggle } from '../../ui/Controls';
import { useT } from '../../useT';

export function SurveysConfig() {
    const t = useT();
    const { isMoodTrackerEnabled, setMoodTrackerEnabled, setIsPopupOpen, responses } = useSurveyStore();

    return (
        <>
            <SettingsSection title={t('survey.checkins')} hint={t('survey.checkinsHint')}>
                <SettingsCard>
                    <SettingsRow title={t('survey.mood')} description={t('survey.moodDesc')}>
                        <Toggle checked={isMoodTrackerEnabled} onChange={setMoodTrackerEnabled} label={t('survey.mood')} />
                    </SettingsRow>
                    <SettingsRow title={t('survey.test')} description={t('survey.testDesc')}>
                        <Button onClick={() => setIsPopupOpen(true)}>{t('survey.testAction')}</Button>
                    </SettingsRow>
                </SettingsCard>
            </SettingsSection>

            <SettingsSection title={t('survey.data')} hint={t('survey.dataHint')}>
                <SettingsCard>
                    <SettingsRow title={t('survey.entries')} description={t('survey.entriesDesc')}>
                        <span className="tabular-nums text-t2-ink">{t(responses.length === 1 ? 'survey.entryOne' : 'survey.entryMany', { n: responses.length })}</span>
                    </SettingsRow>
                    <SettingsRow title={t('survey.sync')} description={t('survey.syncDesc')}>
                        <StatusPill>{t('survey.syncOn')}</StatusPill>
                    </SettingsRow>
                </SettingsCard>
            </SettingsSection>
        </>
    );
}
