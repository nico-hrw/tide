import React, { useState } from 'react';
import { Eye, EyeOff, RotateCcw, Star, Trash2 } from 'lucide-react';
import { SettingsCard, SettingsPage, SettingsPageHeader, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { Button, TextField } from '../ui/Controls';
import { useT } from '../useT';
import { useDataStore } from '@/store/useDataStore';
import { normalizeSafe, todoSafe } from '@/lib/todoSafes';
import { WORKSPACE_ICON_PRESETS, workspaceBadgeText } from '@/lib/workspaceBadge';

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
    const safeIcons = useDataStore((s) => s.safeIcons);
    const setSafeIcon = useDataStore((s) => s.setSafeIcon);
    const setActiveSafes = useDataStore((s) => s.setActiveSafes);
    const setDefaultSafe = useDataStore((s) => s.setDefaultSafe);
    const createSafe = useDataStore((s) => s.createSafe);
    const deleteSafe = useDataStore((s) => s.deleteSafe);
    const tasks = useDataStore((s) => s.tasks);
    const events = useDataStore((s) => s.events);
    const notes = useDataStore((s) => s.notes);
    const [name, setName] = useState('');
    const [iconEditorSafe, setIconEditorSafe] = useState<string | null>(null);
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
                        const defaultLabel = isDefault ? 'Standard für neue Inhalte' : 'Für neue Inhalte';
                        const shownLabel = shown ? `${label(safe)}: Angezeigt` : `${label(safe)}: Ausgeblendet`;
                        const deleteLabel = `${label(safe)} löschen`;
                        const badgeText = workspaceBadgeText(safe, safeIcons);
                        const editingIcon = iconEditorSafe === safe;
                        return (
                            <React.Fragment key={safe}>
                                <SettingsRow title={label(safe)} description={`${c.notes} Notizen · ${c.tasks} Todos · ${c.events} Termine`}>
                                    <div className="flex flex-wrap items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setIconEditorSafe(editingIcon ? null : safe)}
                                            title="Icon festlegen"
                                            aria-label={`Icon für ${label(safe)} festlegen`}
                                            aria-expanded={editingIcon}
                                            className="flex h-7 min-w-[28px] items-center justify-center rounded-md border border-t2-line bg-t2-sub px-1.5 text-xs font-bold text-t2-ink transition-colors hover:bg-t2-hover"
                                        >
                                            {badgeText}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDefaultSafe(isDefault ? null : safe)}
                                            title={defaultLabel}
                                            aria-label={defaultLabel}
                                            className={`bg-transparent p-1.5 transition-colors ${isDefault ? 'text-amber-400' : 'text-t2-ink-3 hover:text-amber-400'}`}
                                        >
                                            <Star className={`h-4 w-4 ${isDefault ? 'text-amber-400 fill-amber-400' : ''}`} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => toggleShown(safe)}
                                            title={shownLabel}
                                            aria-label={shownLabel}
                                            className={`bg-transparent p-1.5 transition-colors ${shown ? 'text-t2-ink-2' : 'text-t2-ink-3'}`}
                                        >
                                            {shown ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                        </button>
                                        {safe !== 'main' && (
                                            <button
                                                type="button"
                                                onClick={() => remove(safe)}
                                                title={deleteLabel}
                                                aria-label={deleteLabel}
                                                className="bg-transparent p-1.5 text-t2-ink-3 transition-colors hover:text-red-500"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                </SettingsRow>
                                {editingIcon && (
                                    <div className="flex flex-wrap items-center gap-1.5 border-t border-t2-line-soft bg-t2-sub/50 px-4 py-2.5">
                                        {WORKSPACE_ICON_PRESETS.map((emoji) => (
                                            <button
                                                key={emoji}
                                                type="button"
                                                onClick={() => { setSafeIcon(safe, emoji); setIconEditorSafe(null); }}
                                                className={`grid h-7 w-7 place-items-center rounded-md text-sm transition-colors hover:bg-t2-hover ${safeIcons[safe] === emoji ? 'bg-t2-hover ring-1 ring-t2-accent' : ''}`}
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                        <input
                                            type="text"
                                            maxLength={4}
                                            value={safeIcons[safe] ?? ''}
                                            onChange={(e) => setSafeIcon(safe, e.target.value)}
                                            placeholder="Icon…"
                                            aria-label={`Eigenes Icon für ${label(safe)}`}
                                            className="h-7 w-16 rounded-md border border-t2-line bg-t2-surface px-2 text-xs text-t2-ink outline-none"
                                        />
                                        {safeIcons[safe] && (
                                            <button
                                                type="button"
                                                onClick={() => { setSafeIcon(safe, null); setIconEditorSafe(null); }}
                                                title="Auf Anfangsbuchstaben zurücksetzen"
                                                aria-label="Icon zurücksetzen"
                                                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-t2-ink-3 hover:bg-t2-hover hover:text-t2-ink"
                                            >
                                                <RotateCcw className="h-3.5 w-3.5" />
                                                Reset
                                            </button>
                                        )}
                                    </div>
                                )}
                            </React.Fragment>
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
