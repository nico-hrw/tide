import React, { useState } from 'react';
import { useDataStore, type CalendarColorPalette, type CalendarHolidayPackage } from '@/store/useDataStore';
import { useJobPlannerStore } from '@/store/useJobPlannerStore';
import CalendarImportModal from '@/components/Calendar/CalendarImportModal';
import { SettingsBlock, SettingsCard, SettingsPage, SettingsPageHeader, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { Button, SelectField, Toggle } from '../ui/Controls';
import { useT } from '../useT';
import { CalendarEventPreview } from '../calendar/CalendarEventPreview';
import { CalendarGroupsSection, type CalendarGroupsSectionProps } from '../calendar/CalendarGroupsSection';

export interface CalendarPageProps extends Omit<CalendarGroupsSectionProps, 'protectedGroupId'> {
    enabledExtensions?: string[];
}

export function CalendarPage({ enabledExtensions = [], ...groupProps }: CalendarPageProps) {
    const t = useT();
    const {
        calendarColorPalette, setCalendarColorPalette, calendarOverlapMode, setCalendarOverlapMode,
        calendarScrollMode, setCalendarScrollMode, weekStartsOn, setWeekStartsOn,
        calendarHolidaysEnabled, setCalendarHolidaysEnabled, calendarHolidayPackage, setCalendarHolidayPackage,
    } = useDataStore();
    const plannerGroupId = useJobPlannerStore((s) => s.pluginGroupId);
    const [importOpen, setImportOpen] = useState(false);
    const plannerActive = enabledExtensions.includes('job_planner');

    return (
        <div>
            <SettingsPageHeader title={t('nav.calendar')} lead={t('page.calendar.lead')} />
            <SettingsPage>
                <SettingsSection title={t('cal.view')} hint={t('cal.viewHint')}>
                    <SettingsCard>
                        <SettingsRow title={t('cal.scroll')} description={t('cal.scrollDesc')}>
                            <SelectField
                                label={t('cal.scroll')}
                                value={calendarScrollMode}
                                onChange={setCalendarScrollMode}
                                options={[
                                    { value: 'infinite', label: t('cal.scrollInfinite') },
                                    { value: 'fixed', label: t('cal.scrollFixed') },
                                ]}
                            />
                        </SettingsRow>
                        <SettingsRow title={t('cal.overlap')} description={t('cal.overlapDesc')}>
                            <SelectField
                                label={t('cal.overlap')}
                                value={calendarOverlapMode}
                                onChange={setCalendarOverlapMode}
                                options={[
                                    { value: 'stack', label: t('cal.overlapSide') },
                                    { value: 'overlap', label: t('cal.overlapLayered') },
                                ]}
                            />
                        </SettingsRow>
                    </SettingsCard>
                </SettingsSection>

                <SettingsSection title={t('cal.colors')} hint={t('cal.colorsHint')}>
                    <SettingsCard>
                        <SettingsRow title={t('cal.eventColors')} description={t('cal.eventColorsDesc')}>
                            <SelectField<CalendarColorPalette>
                                label={t('cal.eventColors')}
                                value={calendarColorPalette}
                                onChange={setCalendarColorPalette}
                                options={[
                                    { value: 'balsam', label: 'Balsam' },
                                    { value: 'modern-dark', label: 'Modern Dark' },
                                    { value: 'soft-pastels', label: 'Soft Pastels' },
                                    { value: 'classic-tide', label: 'Classic Tide' },
                                ]}
                            />
                        </SettingsRow>
                        <SettingsBlock>
                            <CalendarEventPreview palette={calendarColorPalette} overlap={calendarOverlapMode} />
                        </SettingsBlock>
                    </SettingsCard>
                </SettingsSection>

                <SettingsSection title={t('cal.week')} hint={t('cal.weekHint')}>
                    <SettingsCard>
                        <SettingsRow title={t('cal.weekStart')} description={t('cal.weekStartDesc')}>
                            <SelectField
                                label={t('cal.weekStart')}
                                value={weekStartsOn}
                                onChange={(v) => setWeekStartsOn(v as 0 | 1)}
                                options={[
                                    { value: 1, label: t('cal.monday') },
                                    { value: 0, label: t('cal.sunday') },
                                ]}
                            />
                        </SettingsRow>
                        <SettingsRow title={t('cal.holidays')} description={t('cal.holidaysDesc')}>
                            <Toggle checked={calendarHolidaysEnabled} onChange={setCalendarHolidaysEnabled} label={t('cal.holidays')} />
                        </SettingsRow>
                        {calendarHolidaysEnabled && (
                            <SettingsRow title={t('cal.holidayPackage')} description={t('cal.holidayPackageDesc')}>
                                <SelectField<CalendarHolidayPackage>
                                    label={t('cal.holidayPackage')}
                                    value={calendarHolidayPackage}
                                    onChange={setCalendarHolidayPackage}
                                    options={[
                                        { value: 'DE', label: 'Deutschland (DE)' },
                                        { value: 'AT', label: 'Österreich (AT)' },
                                        { value: 'CH', label: 'Schweiz (CH)' },
                                        { value: 'US', label: 'United States (US)' },
                                    ]}
                                />
                            </SettingsRow>
                        )}
                    </SettingsCard>
                </SettingsSection>

                <SettingsSection title={t('cal.import')} hint={t('cal.importHint')}>
                    <SettingsCard>
                        <SettingsRow title={t('cal.importRow')} description={t('cal.importRowDesc')}>
                            <Button onClick={() => setImportOpen(true)}>{t('cal.importAction')}</Button>
                        </SettingsRow>
                    </SettingsCard>
                </SettingsSection>

                <CalendarGroupsSection {...groupProps} protectedGroupId={plannerActive ? plannerGroupId : null} />
            </SettingsPage>

            <CalendarImportModal isOpen={importOpen} onClose={() => setImportOpen(false)} themes={groupProps.groups} />
        </div>
    );
}
