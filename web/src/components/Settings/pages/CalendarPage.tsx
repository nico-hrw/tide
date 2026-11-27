import React, { useState } from 'react';
import { useDataStore, type CalendarHolidayPackage } from '@/store/useDataStore';
import CalendarImportModal from '@/components/Calendar/CalendarImportModal';
import { SettingsBlock, SettingsCard, SettingsPage, SettingsPageHeader, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { Button, SelectField, Toggle } from '../ui/Controls';
import { PaletteDropdown } from '../ui/PaletteDropdown';
import { useT } from '../useT';
import { CalendarEventPreview } from '../calendar/CalendarEventPreview';
import type { CalendarGroup } from '../calendar/CalendarGroupsSection';
import { getPaletteCategories } from '@/lib/calendarColors';

export interface CalendarPageProps {
    enabledExtensions?: string[];
    groups?: CalendarGroup[];
    onCreateGroup?: (title: string, color?: string, effect?: string) => Promise<string | undefined>;
}

export function CalendarPage({ groups, onCreateGroup }: CalendarPageProps) {
    const t = useT();
    const {
        calendarColorPalette, setCalendarColorPalette, calendarOverlapMode, setCalendarOverlapMode,
        calendarScrollMode, setCalendarScrollMode, weekStartsOn, setWeekStartsOn,
        calendarHolidaysEnabled, setCalendarHolidaysEnabled, calendarHolidayPackage, setCalendarHolidayPackage,
    } = useDataStore();
    const [importOpen, setImportOpen] = useState(false);

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
                            <PaletteDropdown
                                value={calendarColorPalette}
                                onChange={setCalendarColorPalette}
                                ariaLabel={t('cal.eventColors')}
                            />
                            <div className="mt-3 flex flex-wrap gap-2">
                                {getPaletteCategories(calendarColorPalette).map((cat) => (
                                    <span key={cat.key} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium" style={{ background: cat.bg, color: cat.ink }}>
                                        {cat.name}
                                    </span>
                                ))}
                            </div>
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
            </SettingsPage>

            <CalendarImportModal
                isOpen={importOpen}
                onClose={() => setImportOpen(false)}
                themes={groups}
                onCreateTag={onCreateGroup}
            />
        </div>
    );
}
