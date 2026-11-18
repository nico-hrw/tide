import React from 'react';
import { useJobPlannerStore } from '@/store/useJobPlannerStore';
import { SettingsCard, SettingsRow, SettingsSection } from '../../ui/SettingsLayout';
import { Chip, Segmented, Toggle } from '../../ui/Controls';
import { useT } from '../../useT';

export interface JobPlannerConfigProps {
    groups?: { id: string; title: string }[];
}

export function JobPlannerConfig({ groups }: JobPlannerConfigProps) {
    const t = useT();
    const { mode, setMode, showWeekends, setShowWeekends, pluginGroupId } = useJobPlannerStore();
    const activeGroup = groups?.find((g) => g.id === pluginGroupId);
    const fallbackName = mode === 'both' ? t('job.nameBoth') : mode === 'job' ? t('job.modeJob') : t('job.modeStudy');

    return (
        <>
            <SettingsSection title={t('job.mode')} hint={t('job.modeHint')}>
                <SettingsCard>
                    <SettingsRow title={t('job.mode')} description={t('job.modeDesc')} wide>
                        <Segmented
                            full
                            label={t('job.mode')}
                            value={mode}
                            onChange={setMode}
                            options={[
                                { value: 'job', label: t('job.modeJob') },
                                { value: 'study', label: t('job.modeStudy') },
                                { value: 'both', label: t('job.modeBoth') },
                            ]}
                        />
                    </SettingsRow>
                </SettingsCard>
            </SettingsSection>

            <SettingsSection title={t('job.timetable')} hint={t('job.timetableHint')}>
                <SettingsCard>
                    <SettingsRow title={t('job.weekend')} description={t('job.weekendDesc')}>
                        <Toggle checked={showWeekends} onChange={setShowWeekends} label={t('job.weekend')} />
                    </SettingsRow>
                </SettingsCard>
            </SettingsSection>

            <SettingsSection title={t('job.assign')} hint={t('job.assignHint')}>
                <SettingsCard>
                    <SettingsRow title={t('job.category')} description={t('job.categoryDesc')}>
                        <Chip>{activeGroup?.title || fallbackName}</Chip>
                    </SettingsRow>
                </SettingsCard>
            </SettingsSection>
        </>
    );
}
