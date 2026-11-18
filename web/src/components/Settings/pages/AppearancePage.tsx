import React from 'react';
import { Check, Moon, Monitor, Sun } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { PALETTES } from '@/lib/palette';
import { PALETTE_PREVIEW } from '@/lib/designTokens';
import { SettingsBlock, SettingsCard, SettingsPage, SettingsPageHeader, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { Segmented, SelectField, Toggle } from '../ui/Controls';
import { cx } from '../ui/cx';
import { useT, useTDynamic } from '../useT';

const NAV_MODE_STORAGE_KEY = 'tide_navigation_mode';

export function AppearancePage() {
    const t = useT();
    const td = useTDynamic();
    const { themePreference, setThemePreference, appPalette, setAppPalette, theme, language, setLanguage, navigationMode, setNavigationMode } = useDataStore();

    const toggleNavigation = (folders: boolean) => {
        const next = folders ? 'folders' : 'sidebar';
        try {
            localStorage.setItem(NAV_MODE_STORAGE_KEY, next);
        } catch (e) {
            console.warn('Failed to save navigation mode to localStorage', e);
        }
        setNavigationMode(next);
    };

    return (
        <div>
            <SettingsPageHeader title={t('nav.appearance')} lead={t('page.appearance.lead')} />
            <SettingsPage>
                <SettingsSection title={t('look.palette')} hint={t('look.paletteHint')}>
                    <SettingsCard>
                        <SettingsBlock>
                            <div role="radiogroup" aria-label={t('look.palette')} className="grid grid-cols-3 gap-2 sm:gap-3">
                                {PALETTES.map((p) => {
                                    const active = appPalette === p.id;
                                    const [bg, sub, ink, accent] = PALETTE_PREVIEW[p.id][theme === 'dark' ? 'dark' : 'light'];
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            onClick={() => setAppPalette(p.id)}
                                            className={cx('flex flex-col gap-0.5 rounded-card bg-t2-surface p-1.5 text-left transition-shadow sm:p-2', active ? 'ring-2 ring-t2-accent' : 'ring-1 ring-t2-line hover:ring-t2-ink-3')}
                                        >
                                            <span className="grid h-16 grid-cols-[28%_1fr] overflow-hidden rounded-[8px] ring-1 ring-t2-line sm:h-[84px]" style={{ backgroundColor: bg }} aria-hidden>
                                                <span className="flex flex-col gap-[5px] p-1.5" style={{ backgroundColor: sub }}>
                                                    <u className="block h-[5px] w-[70%] rounded-[3px]" style={{ backgroundColor: ink, opacity: 0.45 }} />
                                                    <u className="block h-[5px] rounded-[3px]" style={{ backgroundColor: ink, opacity: 0.15 }} />
                                                    <u className="block h-[5px] rounded-[3px]" style={{ backgroundColor: ink, opacity: 0.15 }} />
                                                </span>
                                                <span className="flex flex-col gap-1 p-2">
                                                    <u className="block h-[11px] w-4/5 rounded-[3px]" style={{ backgroundColor: ink, opacity: 0.55 }} />
                                                    <u className="block h-[11px] w-[55%] rounded-[3px]" style={{ backgroundColor: ink, opacity: 0.3, marginLeft: '20%' }} />
                                                    <u className="mt-auto block h-2.5 w-1/3 rounded-[5px]" style={{ backgroundColor: accent }} />
                                                </span>
                                            </span>
                                            <b className="flex items-center gap-1.5 px-1 pt-2 font-semibold text-t2-ink">
                                                {p.label}
                                                <Check className={cx('ml-auto h-[15px] w-[15px] text-t2-accent', active ? 'opacity-100' : 'opacity-0')} aria-hidden />
                                            </b>
                                            <small className="hidden px-1 pb-1 text-[12.5px] text-t2-ink-3 sm:block">{td(`look.palette.${p.id}`)}</small>
                                        </button>
                                    );
                                })}
                            </div>
                        </SettingsBlock>
                    </SettingsCard>
                </SettingsSection>

                <SettingsSection title={t('look.mode')} hint={t('look.modeHint')}>
                    <SettingsCard>
                        <SettingsRow title={t('look.modeRow')} description={t('look.modeRowDesc')} wide>
                            <Segmented
                                full
                                label={t('look.modeRow')}
                                value={themePreference}
                                onChange={setThemePreference}
                                options={[
                                    { value: 'light', label: t('look.light'), icon: <Sun className="h-[15px] w-[15px]" /> },
                                    { value: 'dark', label: t('look.dark'), icon: <Moon className="h-[15px] w-[15px]" /> },
                                    { value: 'system', label: t('look.system'), icon: <Monitor className="h-[15px] w-[15px]" /> },
                                ]}
                            />
                        </SettingsRow>
                    </SettingsCard>
                </SettingsSection>

                <SettingsSection title={t('look.language')} hint={t('look.languageHint')}>
                    <SettingsCard>
                        <SettingsRow title={t('look.languageRow')} description={t('look.languageRowDesc')}>
                            <SelectField
                                label={t('look.languageRow')}
                                value={language}
                                onChange={(v) => setLanguage(v)}
                                options={[
                                    { value: 'en', label: 'English' },
                                    { value: 'de', label: 'Deutsch' },
                                ]}
                            />
                        </SettingsRow>
                    </SettingsCard>
                </SettingsSection>

                <SettingsSection title={t('look.layout')} hint={t('look.layoutHint')}>
                    <SettingsCard>
                        <SettingsRow title={t('look.tablet')} description={t('look.tabletDesc')}>
                            <Toggle checked={navigationMode === 'folders'} onChange={toggleNavigation} label={t('look.tablet')} />
                        </SettingsRow>
                        <SettingsRow title={t('look.fontSize')} description={t('look.fontSizeDesc')} soon>
                            <SelectField label={t('look.fontSize')} value="medium" onChange={() => undefined} disabled options={[{ value: 'medium', label: t('look.fontMedium') }]} />
                        </SettingsRow>
                    </SettingsCard>
                </SettingsSection>
            </SettingsPage>
        </div>
    );
}
