import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { SettingsCard, SettingsPage, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { Toggle } from '../ui/Controls';
import { useT, useTDynamic } from '../useT';
import { ExtensionDisableConfirm } from './ExtensionsList';

export interface ExtensionSubpageProps {
    id: string;
    enabled: boolean;
    onToggle: (id: string, next: boolean) => void;
    pendingOff: string | null;
    onConfirmOff: (id: string) => void;
    onCancelOff: () => void;
    onBack: () => void;
    /** Optionen der Erweiterung als Sektionen */
    children?: React.ReactNode;
}

/** Rahmen jeder Erweiterungs-Unterseite: Breadcrumb, Titel, Sektion "Status", danach die Optionen. */
export function ExtensionSubpage({ id, enabled, onToggle, pendingOff, onConfirmOff, onCancelOff, onBack, children }: ExtensionSubpageProps) {
    const t = useT();
    const td = useTDynamic();
    const title = td(`ext.${id}.title`);

    return (
        <div>
            <nav aria-label={t('ext.breadcrumb')} className="mb-3.5 hidden items-center gap-1 text-[13.5px] text-t2-ink-3 sm:flex">
                <button
                    type="button"
                    onClick={onBack}
                    className="-ml-1.5 flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-t2-ink-2 hover:bg-t2-hover hover:text-t2-ink"
                >
                    <ChevronLeft className="h-[15px] w-[15px]" aria-hidden />
                    {t('nav.extensions')}
                </button>
                <span aria-hidden>/</span>
                <span>{title}</span>
            </nav>
            <header className="mb-8 hidden sm:block">
                <h2 className="text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-t2-ink">{title}</h2>
                <p className="mt-0.5 text-t2-ink-3">{td(`ext.${id}.lead`)}</p>
            </header>
            <SettingsPage>
                <SettingsSection title={t('ext.statusSection')} hint={t('ext.statusHint')}>
                    <SettingsCard>
                        <SettingsRow title={t('ext.active')} description={t('ext.activeDesc')}>
                            <Toggle checked={enabled} label={t('ext.toggleLabel', { name: title })} onChange={(next) => onToggle(id, next)} />
                        </SettingsRow>
                        {pendingOff === id && <ExtensionDisableConfirm id={id} onConfirm={() => onConfirmOff(id)} onCancel={onCancelOff} />}
                    </SettingsCard>
                </SettingsSection>
                {enabled && children}
            </SettingsPage>
        </div>
    );
}
