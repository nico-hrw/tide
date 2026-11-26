import React, { useState } from 'react';
import { SettingsCard, SettingsPage, SettingsPageHeader, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { Button, TextField, Toggle } from '../ui/Controls';
import { useT } from '../useT';
import { useDataStore } from '@/store/useDataStore';
import { normalizeSafe, todoSafe } from '@/lib/todoSafes';

const label = (s: string) => (s === 'main' ? 'Standard' : s);

/**
 * Workspaces: the list with what each one holds, which ones are shown, the default for new items,
 * creating and deleting. Renaming and merging need a data migration and are marked as "bald".
 */
export function WorkspacesPage() {
    const t = useT();
    const available = useDataStore((s) => s.availableSafes);
    const activeSafes = useDataStore((s) => s.activeSafes);
    const defaultSafe = useDataStore((s) => s.defaultSafe);
    const setActiveSafes = useDataStore((s) => s.setActiveSafes);
    const setDefaultSafe = useDataStore((s) => s.setDefaultSafe);
    const createSafe = useDataStore((s) => s.createSafe);
    const deleteSafe = useDataStore((s) => s.deleteSafe);
    const tasks = useDataStore((s) => s.tasks);
    const events = useDataStore((s) => s.events);
    const notes = useDataStore((s) => s.notes);
    const [name, setName] = useState('');
    const [message, setMessage] = useState<string | null>(null);

    const all = Array.from(new Set(['main', ...available].map(normalizeSafe)));
    const count = (safe: string) => ({
        notes: notes.filter((n) => normalizeSafe(n.safe || (n.metadata as { safe?: string } | undefined)?.safe || 'main') === safe).length,
        tasks: tasks.filter((x) => todoSafe(x) === safe).length,
        events: events.filter((e) => normalizeSafe(e.safe || 'main') === safe).length,
    });

    const toggleShown = (safe: string) => {
        const on = activeSafes.map(normalizeSafe).includes(safe);
        const next = on ? activeSafes.filter((s) => normalizeSafe(s) !== safe) : [...activeSafes, safe];
        setActiveSafes(next.length ? next : ['main']);
    };

    const remove = (safe: string) => {
        const c = count(safe);
        const inUse = c.tasks + c.events;
        if (inUse > 0) {
            setMessage(`„${label(safe)}“ enthält noch ${inUse} Todos oder Termine. Verschiebe sie zuerst in einen anderen Workspace.`);
            return;
        }
        if (window.confirm(`Workspace „${label(safe)}“ löschen? Seine Notizen wandern nach Standard.`)) {
            deleteSafe(safe);
            setMessage(null);
        }
    };

    return (
        <SettingsPage>
            <SettingsPageHeader title={t('nav.workspaces')} lead={t('page.workspaces.lead')} />

            <SettingsSection title={t('workspaces.list')} hint={t('workspaces.listHint')}>
                <SettingsCard>
                    {all.map((safe) => {
                        const c = count(safe);
                        const shown = activeSafes.map(normalizeSafe).includes(safe);
                        const isDefault = defaultSafe === safe;
                        return (
                            <SettingsRow key={safe} title={label(safe)} description={`${c.notes} Notizen · ${c.tasks} Todos · ${c.events} Termine`}>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button onClick={() => setDefaultSafe(isDefault ? null : safe)}>
                                        {isDefault ? 'Standard für neue Inhalte' : 'Für neue Inhalte'}
                                    </Button>
                                    <span className="text-[13px] text-t2-ink-2">{shown ? 'Angezeigt' : 'Ausgeblendet'}</span>
                                    <Toggle checked={shown} onChange={() => toggleShown(safe)} label={`${label(safe)} anzeigen`} />
                                    {safe !== 'main' && <Button variant="danger" onClick={() => remove(safe)}>Löschen</Button>}
                                </div>
                            </SettingsRow>
                        );
                    })}
                </SettingsCard>
                {message && <p role="alert" className="mt-2 text-[13px] text-t2-ink-2">{message}</p>}
            </SettingsSection>

            <SettingsSection title={t('workspaces.create')}>
                <SettingsCard>
                    <SettingsRow title={t('workspaces.newName')} description={t('workspaces.newNameHint')} htmlFor="new-workspace-name">
                        <TextField id="new-workspace-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Studium" />
                        <Button
                            onClick={() => {
                                if (!name.trim()) return;
                                createSafe(name.trim());
                                setName('');
                            }}
                        >
                            Anlegen
                        </Button>
                    </SettingsRow>
                    <SettingsRow title={t('workspaces.rename')} description={t('workspaces.renameDesc')} soon>
                        <Button disabled>Umbenennen</Button>
                    </SettingsRow>
                    <SettingsRow title={t('workspaces.merge')} description={t('workspaces.mergeDesc')} soon>
                        <Button disabled>Zusammenführen</Button>
                    </SettingsRow>
                </SettingsCard>
            </SettingsSection>
        </SettingsPage>
    );
}

export default WorkspacesPage;
