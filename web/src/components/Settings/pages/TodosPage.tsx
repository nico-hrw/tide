import React from 'react';
import { SettingsCard, SettingsPage, SettingsPageHeader, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { SelectField, StatusPill, Toggle } from '../ui/Controls';
import { useT } from '../useT';
import { useDataStore } from '@/store/useDataStore';
import type { TodoHideDone } from '@/store/slices/types';
import { ExtensionDisableConfirm } from '../extensions/ExtensionsList';
import { useExtensionSwitch } from '../extensions/useExtensionSwitch';

export interface TodosPageProps {
    enabledExtensions: string[];
    onToggleExtension: (extensionId: string, enabled: boolean) => void;
}

/**
 * Fuer Todos gibt es heute nur den Erweiterungs-Schalter. Weitere Optionen erscheinen
 * ausgegraut als "bald", damit die Seitenstruktur steht, ohne Funktion vorzutaeuschen.
 */
export function TodosPage({ enabledExtensions, onToggleExtension }: TodosPageProps) {
    const t = useT();
    const sw = useExtensionSwitch(onToggleExtension);
    const enabled = enabledExtensions.includes('todos');
    const hideDone = useDataStore((st) => st.todoHideDone);
    const setHideDone = useDataStore((st) => st.setTodoHideDone);

    return (
        <div>
            <SettingsPageHeader title={t('nav.todos')} lead={t('page.todos.lead')} />
            <SettingsPage>
                <SettingsSection title={t('todos.status')} hint={t('todos.statusHint')}>
                    <SettingsCard>
                        <SettingsRow title={t('ext.todos.title')} description={t('ext.todos.desc')}>
                            <StatusPill tone={enabled ? 'on' : 'off'}>{enabled ? t('ext.statusOn') : t('ext.statusOff')}</StatusPill>
                            <Toggle checked={enabled} label={t('ext.toggleLabel', { name: t('ext.todos.title') })} onChange={(next) => sw.toggle('todos', next)} />
                        </SettingsRow>
                        {sw.pendingOff === 'todos' && <ExtensionDisableConfirm id="todos" onConfirm={() => sw.confirmOff('todos')} onCancel={sw.cancel} />}
                    </SettingsCard>
                </SettingsSection>

                <SettingsSection title={t('todos.display')} hint={t('todos.displayHint')}>
                    <SettingsCard>
                        <SettingsRow title={t('todos.overdue')} description={t('todos.overdueDesc')} soon>
                            <Toggle checked label={t('todos.overdue')} onChange={() => undefined} disabled />
                        </SettingsRow>
                        <SettingsRow title={t('todos.hideDone')} description={t('todos.hideDoneDesc')}>
                            <SelectField<TodoHideDone>
                                label={t('todos.hideDone')}
                                value={hideDone}
                                onChange={setHideDone}
                                options={[
                                    { value: 'instant', label: t('todos.hideDoneInstant') },
                                    { value: 'leave', label: t('todos.hideDoneLeave') },
                                    { value: 'delay', label: t('todos.hideDoneDelay') },
                                    { value: 'nextDay', label: t('todos.hideDoneDay') },
                                    { value: 'never', label: t('todos.hideDoneNever') },
                                ]}
                            />
                        </SettingsRow>
                    </SettingsCard>
                </SettingsSection>
            </SettingsPage>
        </div>
    );
}
