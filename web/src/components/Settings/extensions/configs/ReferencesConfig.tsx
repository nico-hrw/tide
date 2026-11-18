import React from 'react';
import { Bookmark } from 'lucide-react';
import { useReferenceStore, type ReferenceDisplayMode } from '@/store/useReferenceStore';
import { SettingsBlock, SettingsCard, SettingsRow, SettingsSection } from '../../ui/SettingsLayout';
import { Toggle } from '../../ui/Controls';
import { cx } from '../../ui/cx';
import { useT } from '../../useT';
import { ReferencesDictionary } from './ReferencesDictionary';

export function ReferencesConfig() {
    const t = useT();
    const autoScanEnabled = useReferenceStore((s) => s.autoScanEnabled);
    const displayMode = useReferenceStore((s) => s.displayMode);
    const setDisplayMode = useReferenceStore((s) => s.setDisplayMode);

    const styles: ReadonlyArray<{ id: ReferenceDisplayMode; label: string; preview: React.ReactNode }> = [
        { id: 'magic', label: t('ref.styleMagic'), preview: <span className="bg-gradient-to-r from-t2-accent to-t2-ink-3 bg-clip-text font-semibold text-transparent">{t('ref.example')}</span> },
        { id: 'underline-black', label: t('ref.styleUnderlineInk'), preview: <span className="font-medium text-t2-ink underline decoration-t2-ink decoration-2 underline-offset-2">{t('ref.example')}</span> },
        { id: 'underline-color', label: t('ref.styleUnderlineAccent'), preview: <span className="font-medium text-t2-accent underline decoration-t2-accent decoration-2 underline-offset-2">{t('ref.example')}</span> },
        { id: 'icon', label: t('ref.styleIcon'), preview: <span className="inline-flex items-center gap-1 font-medium text-t2-ink"><Bookmark className="h-3 w-3 text-t2-accent" />{t('ref.example')}</span> },
        { id: 'emoji', label: t('ref.styleEmoji'), preview: <span className="inline-flex items-center gap-1 font-medium text-t2-ink"><span>🔖</span>{t('ref.example')}</span> },
    ];

    return (
        <>
            <SettingsSection title={t('ref.auto')} hint={t('ref.autoHint')}>
                <SettingsCard>
                    <SettingsRow title={t('ref.autopilot')} description={t('ref.autopilotDesc')}>
                        <Toggle checked={autoScanEnabled} onChange={(v) => useReferenceStore.getState().setAutoScanEnabled(v)} label={t('ref.autopilot')} />
                    </SettingsRow>
                </SettingsCard>
            </SettingsSection>

            <SettingsSection title={t('ref.display')} hint={t('ref.displayHint')}>
                <SettingsCard>
                    <SettingsBlock>
                        <div role="radiogroup" aria-label={t('ref.display')} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {styles.map((s) => {
                                const active = displayMode === s.id;
                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        onClick={() => setDisplayMode(s.id)}
                                        className={cx('flex flex-col gap-2 rounded-ui p-2.5 text-left ring-1 transition-shadow', active ? 'ring-2 ring-t2-accent' : 'ring-t2-line hover:ring-t2-ink-3')}
                                    >
                                        <span className="truncate text-[12.5px] font-medium text-t2-ink">{s.label}</span>
                                        <span className="flex items-center justify-center truncate rounded-md bg-t2-sub px-1.5 py-1 text-[12px]">{s.preview}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </SettingsBlock>
                </SettingsCard>
            </SettingsSection>

            <SettingsSection title={t('ref.dictionarySection')} hint={t('ref.dictionaryHint')}>
                <SettingsCard>
                    <ReferencesDictionary />
                </SettingsCard>
            </SettingsSection>
        </>
    );
}
