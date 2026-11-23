import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Palette, Plus, Share2, Trash2 } from 'lucide-react';
import { SettingsCard, SettingsEmpty, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { Button, IconButton, TextField, Toggle } from '../ui/Controls';
import { cx } from '../ui/cx';
import { useT } from '../useT';
import { CALENDAR_CATEGORIES, resolveCategory } from '@/lib/calendarColors';

export interface CalendarGroup {
    id: string;
    title: string;
    effect?: string;
    color?: string;
}

/** Musterfuellungen der Termin-Karten pro Gruppe. Label-Schluessel: `cal.effect.<id>`. */
const EFFECT_IDS = ['none', 'stripes', 'waves', 'dots', 'chess', 'diamonds', 'gradient', 'bars', 'dimmed'] as const;

interface GroupRowProps {
    group: CalendarGroup;
    hidden: boolean;
    isProtected: boolean;
    onToggleVisibility?: (id: string) => void;
    colorOverride: boolean;
    onToggleColorOverride?: (id: string) => void;
    onUpdate?: (id: string, updates: Partial<CalendarGroup>) => void;
    onShare?: (e: React.MouseEvent, id: string) => void;
    onDelete?: (e: React.MouseEvent, id: string) => void;
    onDeleteEvents?: (id: string) => void;
}

function GroupRow({ group, hidden, isProtected, colorOverride, onToggleColorOverride, onToggleVisibility, onUpdate, onShare, onDelete, onDeleteEvents }: GroupRowProps) {
    const t = useT();
    // Entwurf des Namens, solange getippt wird; null = der gespeicherte Name wird gezeigt.
    const [draft, setDraft] = useState<string | null>(null);
    const [styleOpen, setStyleOpen] = useState(false);
    const title = draft ?? group.title;

    const commit = () => {
        if (draft !== null && draft !== group.title) onUpdate?.(group.id, { title: draft });
        setDraft(null);
    };
    // Tag colours are the five calendar colours; older free hex values resolve to the nearest one.
    const category = resolveCategory(group.color);
    const color = category.bg;

    return (
        <div>
            <div className="flex items-center gap-3 px-4 py-2.5">
                <i className="h-3 w-3 shrink-0 rounded-[4px]" style={{ backgroundColor: color }} aria-hidden />
                <input
                    value={title}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => e.key === 'Enter' && commit()}
                    placeholder={t('cal.groupName')}
                    aria-label={t('cal.groupName')}
                    className={cx('min-w-0 flex-1 bg-transparent text-t2-ink outline-none placeholder:text-t2-ink-3', hidden && 'opacity-50')}
                />
                <IconButton label={hidden ? t('cal.show', { name: group.title }) : t('cal.hide', { name: group.title })} onClick={() => onToggleVisibility?.(group.id)}>
                    {hidden ? <EyeOff className="h-[15px] w-[15px]" /> : <Eye className="h-[15px] w-[15px]" />}
                </IconButton>
                <IconButton label={t('cal.style')} pressed={styleOpen} onClick={() => setStyleOpen((v) => !v)}>
                    <Palette className="h-[15px] w-[15px]" />
                </IconButton>
                <IconButton label={t('cal.share', { name: group.title })} onClick={(e) => onShare?.(e, group.id)}>
                    <Share2 className="h-[15px] w-[15px]" />
                </IconButton>
                {isProtected ? (
                    <span className="flex p-1.5 text-t2-ink-3" title={t('cal.protected')} aria-label={t('cal.protected')}>
                        <Lock className="h-[15px] w-[15px]" />
                    </span>
                ) : (
                    <IconButton label={t('cal.delete', { name: group.title })} tone="danger" onClick={(e) => onDelete?.(e, group.id)}>
                        <Trash2 className="h-[15px] w-[15px]" />
                    </IconButton>
                )}
            </div>
            {styleOpen && (
                <div className="space-y-3 bg-t2-sub px-4 pb-3.5 pt-3">
                    <div>
                        <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-t2-ink-3">{t('cal.pattern')}</div>
                        <div className="flex flex-wrap gap-1.5">
                            {EFFECT_IDS.map((id) => {
                                const active = (group.effect || 'none') === id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => onUpdate?.(group.id, { effect: id })}
                                        aria-pressed={active}
                                        className={cx('flex flex-col items-center gap-1 rounded-md p-1 ring-1', active ? 'ring-2 ring-t2-accent' : 'ring-t2-line hover:ring-t2-ink-3')}
                                    >
                                        <span className={cx('block h-3 w-7 rounded-sm', id !== 'none' && `effect-${id}`)} style={{ backgroundColor: color, opacity: id === 'dimmed' ? 0.55 : 1 }} />
                                        <span className="text-[11px] font-medium text-t2-ink-3">{t(`cal.effect.${id}`)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div>
                        <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-t2-ink-3">{t('cal.color')}</div>
                        <div className="flex flex-wrap gap-2">
                            {CALENDAR_CATEGORIES.map((cat) => {
                                const active = category.key === cat.key;
                                return (
                                    <button
                                        key={cat.key}
                                        type="button"
                                        onClick={() => onUpdate?.(group.id, { color: cat.hex })}
                                        aria-label={cat.name}
                                        title={cat.name}
                                        aria-pressed={active}
                                        className={cx('h-5 w-5 rounded-full transition-transform', active ? 'scale-110 ring-2 ring-t2-accent ring-offset-2 ring-offset-t2-sub' : 'hover:scale-105')}
                                        style={{ backgroundColor: cat.bg }}
                                    />
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-[13px] font-medium text-t2-ink">{t('cal.colorOverride')}</div>
                            <div className="text-[12px] text-t2-ink-3">{t('cal.colorOverrideDesc')}</div>
                        </div>
                        <Toggle checked={colorOverride} onChange={() => onToggleColorOverride?.(group.id)} label={t('cal.colorOverride')} />
                    </div>
                    {onDeleteEvents && (
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-[13px] font-medium text-t2-ink">{t('cal.deleteEvents')}</div>
                                <div className="text-[12px] text-t2-ink-3">{t('cal.deleteEventsDesc')}</div>
                            </div>
                            <Button onClick={() => onDeleteEvents(group.id)}>{t('cal.deleteEventsAction')}</Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export interface CalendarGroupsSectionProps {
    groups: CalendarGroup[];
    hiddenGroupIds: string[];
    protectedGroupId?: string | null;
    colorOverrideIds?: string[];
    onToggleColorOverride?: (id: string) => void;
    onToggleGroupVisibility?: (id: string) => void;
    onUpdateGroup?: (id: string, updates: Partial<CalendarGroup>) => void;
    onShareGroup?: (e: React.MouseEvent, id: string) => void;
    onDeleteGroup?: (e: React.MouseEvent, id: string) => void;
    /** Deletes every event that carries the tag (the tag stays). */
    onDeleteGroupEvents?: (id: string) => void;
    onCreateGroup?: (title: string, color?: string, effect?: string) => Promise<string | undefined>;
}

export function CalendarGroupsSection({ groups, hiddenGroupIds, protectedGroupId, colorOverrideIds = [], onToggleColorOverride, onToggleGroupVisibility, onUpdateGroup, onShareGroup, onDeleteGroup, onDeleteGroupEvents, onCreateGroup }: CalendarGroupsSectionProps) {
    const t = useT();
    const [newName, setNewName] = useState('');

    const create = async () => {
        if (!newName.trim() || !onCreateGroup) return;
        await onCreateGroup(newName.trim());
        setNewName('');
    };

    return (
        <SettingsSection title={t('cal.groups')} hint={t('cal.groupsHint')}>
            <SettingsCard>
                {groups.length === 0 && <SettingsEmpty>{t('cal.noGroups')}</SettingsEmpty>}
                {groups.map((g) => (
                    <GroupRow
                        key={g.id}
                        group={g}
                        hidden={hiddenGroupIds.includes(g.id)}
                        isProtected={Boolean(protectedGroupId && g.id === protectedGroupId)}
                        colorOverride={colorOverrideIds.includes(g.id)}
                        onToggleColorOverride={onToggleColorOverride}
                        onToggleVisibility={onToggleGroupVisibility}
                        onUpdate={onUpdateGroup}
                        onShare={onShareGroup}
                        onDelete={onDeleteGroup}
                        onDeleteEvents={onDeleteGroupEvents}
                    />
                ))}
                <SettingsRow title={t('cal.newGroup')} htmlFor="set-new-group">
                    <TextField
                        id="set-new-group"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && create()}
                        placeholder={t('cal.newGroupPlaceholder')}
                    />
                    <Button onClick={create} disabled={!newName.trim()} icon={<Plus className="h-[15px] w-[15px]" />}>{t('cal.createGroup')}</Button>
                </SettingsRow>
            </SettingsCard>
        </SettingsSection>
    );
}
