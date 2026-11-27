import React, { useState } from 'react';
import { SettingsCard, SettingsPage, SettingsPageHeader, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { Button } from '../ui/Controls';
import { useT } from '../useT';
import { InstallGuide } from '../about/InstallGuide';
import { DebugSections } from '../about/DebugSections';
import { OfflineStorageSection } from '../about/OfflineStorageSection';

export function AboutPage() {
    const t = useT();
    const [debugOpen, setDebugOpen] = useState(false);

    return (
        <div>
            <SettingsPageHeader title={t('nav.about')} lead={t('page.about.lead')} />
            <SettingsPage>
                <SettingsSection title={t('about.version')} hint={t('about.versionHint')}>
                    <SettingsCard>
                        <SettingsRow title={t('about.product')} description={t('about.tagline')}>
                            <span className="font-mono text-[12.5px] text-t2-ink-2">inside tide</span>
                        </SettingsRow>
                        <SettingsRow title={t('about.web')} description={t('about.webDesc')}>
                            <span className="font-mono text-[12.5px] text-t2-ink-2">v2.1.0</span>
                        </SettingsRow>
                        <SettingsRow title={t('about.cloud')} description={t('about.cloudDesc')}>
                            <span className="font-mono text-[12.5px] text-t2-ink-2">Go v2.1 Core</span>
                        </SettingsRow>
                        <SettingsRow title={t('about.database')} description={t('about.databaseDesc')}>
                            <span className="font-mono text-[12.5px] text-t2-ink-2">SQLite 3</span>
                        </SettingsRow>
                    </SettingsCard>
                </SettingsSection>

                <SettingsSection title={t('about.install')} hint={t('about.installHint')}>
                    <SettingsCard>
                        <InstallGuide />
                    </SettingsCard>
                </SettingsSection>

                <OfflineStorageSection />

                <SettingsSection title={t('about.debug')} hint={t('about.debugHint')}>
                    <SettingsCard>
                        <SettingsRow title={t('about.debugRow')} description={t('about.debugRowDesc')}>
                            <Button onClick={() => setDebugOpen((v) => !v)} aria-expanded={debugOpen}>
                                {debugOpen ? t('about.debugHide') : t('about.debugShow')}
                            </Button>
                        </SettingsRow>
                    </SettingsCard>
                </SettingsSection>

                {debugOpen && <DebugSections />}
            </SettingsPage>
            <p className="mt-10 text-center text-[12.5px] text-t2-ink-3">© {new Date().getFullYear()} tide</p>
        </div>
    );
}
