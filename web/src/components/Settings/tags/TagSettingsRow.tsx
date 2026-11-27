import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Lock, Share2 } from 'lucide-react';
import { Button, Toggle } from '../ui/Controls';
import { cx } from '../ui/cx';
import { useT } from '../useT';
import { getPaletteCategories, resolveCategoryForPalette } from '@/lib/calendarColors';
import type { CalendarColorPalette } from '@/store/slices/types';
import { VisibilityBadge } from '@/components/Visibility/VisibilityBadge';
import type { CalendarGroup } from '../calendar/CalendarGroupsSection';

const EFFECT_IDS = ['none', 'stripes', 'waves', 'dots', 'chess', 'diamonds', 'gradient', 'bars', 'dimmed'] as const;

export interface TagDeleteOptions {
    deleteTodos: boolean;
    deleteEvents: boolean;
    deleteNotes: boolean;
}

const DELETE_OPTION_FIELDS: ReadonlyArray<{ key: keyof TagDeleteOptions; labelKey: 'tags.deleteTodos' | 'tags.deleteEventsCheck' | 'tags.deleteNotes' }> = [
    { key: 'deleteTodos', labelKey: 'tags.deleteTodos' },
    { key: 'deleteEvents', labelKey: 'tags.deleteEventsCheck' },
    { key: 'deleteNotes', labelKey: 'tags.deleteNotes' },
];

export interface TagSettingsRowProps {
    group: CalendarGroup;
    activePalette: CalendarColorPalette;
    hidden: boolean;
    isProtected?: boolean;
    colorOverride?: boolean;
    hiddenByDefault?: boolean;
    onToggleColorOverride?: (id: string) => void;
    onToggleHiddenByDefault?: (id: string) => void;
    onToggleVisibility?: (id: string) => void;
    onUpdate?: (id: string, updates: Partial<CalendarGroup>) => void;
    onShare?: (id: string) => void;
    onDelete?: (e: React.MouseEvent, id: string) => void;
    onDeleteWithOptions?: (id: string, options: TagDeleteOptions) => void;
    onDeleteEvents?: (id: string) => void;
}

export function TagSettingsRow({
    group, activePalette, hidden, isProtected = false, colorOverride = false, hiddenByDefault = false,
    onToggleColorOverride, onToggleHiddenByDefault, onToggleVisibility,
    onUpdate, onShare, onDelete, onDeleteWithOptions, onDeleteEvents,
}: TagSettingsRowProps) {
    const t = useT();
    const [expanded, setExpanded] = useState(false);
    const [draft, setDraft] = useState<string | null>(null);
    const [deleteOpts, setDeleteOpts] = useState<TagDeleteOptions>({
        deleteTodos: false, deleteEvents: false, deleteNotes: false,
    });

    const title = draft ?? group.title;
    const category = resolveCategoryForPalette(group.color, activePalette);
    const paletteCategories = getPaletteCategories(activePalette);
    const color = category.bg;

    const commit = () => {
        if (draft !== null && draft !== group.title) onUpdate?.(group.id, { title: draft });
        setDraft(null);
    };

    const hasDeleteSelections = deleteOpts.deleteTodos || deleteOpts.deleteEvents || deleteOpts.deleteNotes;

    const toggleRows = [
        { label: t('tags.showInCalendar'), checked: !hidden, onChange: () => onToggleVisibility?.(group.id) },
        { label: t('tags.hiddenByDefault'), description: t('tags.hiddenByDefaultDesc'), checked: !!hiddenByDefault, onChange: () => onToggleHiddenByDefault?.(group.id) },
        { label: t('cal.colorOverride'), description: t('cal.colorOverrideDesc'), checked: !!colorOverride, onChange: () => onToggleColorOverride?.(group.id) },
    ];

    return (
        <div>
            <div
                onClick={() => setExpanded((v) => !v)}
                className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-t2-hover"
            >
                <i className="h-3 w-3 shrink-0 rounded-[4px]" style={{ backgroundColor: color }} aria-hidden />
                <input
                    value={title}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => e.key === 'Enter' && commit()}
                    placeholder={t('cal.groupName')}
                    aria-label={t('cal.groupName')}
                    className={cx('min-w-0 flex-1 bg-transparent text-t2-ink outline-none placeholder:text-t2-ink-3', hidden && 'opacity-50')}
                />
                {group.share && group.share.recipients.length > 0 && (
                    <VisibilityBadge kind="shared" count={group.share.recipients.length} size={12} className="text-t2-ink-3" />
                )}
                <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={group.title || t('cal.groupName')}
                    onClick={(e) => {
                        e.stopPropagation();
                        setExpanded((v) => !v);
                    }}
                    className="flex shrink-0 rounded-lg p-1 text-t2-ink-3 transition-colors hover:text-t2-ink"
                >
                    {expanded ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                </button>
            </div>

            {expanded && (
                <div className="space-y-4 bg-t2-sub px-4 pb-4 pt-3">
                    <div className="space-y-3">
                        <div>
                            <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-t2-ink-3">
                                {t('cal.pattern')}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {EFFECT_IDS.map((id) => {
                                    const active = (group.effect || 'none') === id;
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => onUpdate?.(group.id, { effect: id })}
                                            aria-pressed={active}
                                            className={cx(
                                                'flex flex-col items-center gap-1 rounded-md p-1 ring-1',
                                                active ? 'ring-2 ring-t2-accent' : 'ring-t2-line hover:ring-t2-ink-3',
                                            )}
                                        >
                                            <span
                                                className={cx('block h-3 w-7 rounded-sm', id !== 'none' && `effect-${id}`)}
                                                style={{ backgroundColor: color, opacity: id === 'dimmed' ? 0.55 : 1 }}
                                            />
                                            <span className="text-[11px] font-medium text-t2-ink-3">{t(`cal.effect.${id}`)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-t2-ink-3">
                                {t('cal.color')}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {paletteCategories.map((cat) => {
                                    const active = category.key === cat.key;
                                    return (
                                        <button
                                            key={cat.key}
                                            type="button"
                                            onClick={() => onUpdate?.(group.id, { color: cat.hex })}
                                            aria-label={cat.name}
                                            title={cat.name}
                                            aria-pressed={active}
                                            className={cx(
                                                'h-5 w-5 rounded-full transition-transform',
                                                active ? 'scale-110 ring-2 ring-t2-accent ring-offset-2 ring-offset-t2-sub' : 'hover:scale-105',
                                            )}
                                            style={{ backgroundColor: cat.bg }}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3 border-t border-t2-line-soft pt-3">
                        {toggleRows.map((row) => (
                            <div key={row.label} className="flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="text-[13.5px] font-medium text-t2-ink">{row.label}</div>
                                    {row.description && (
                                        <div className="text-[12px] leading-[1.35] text-t2-ink-3">{row.description}</div>
                                    )}
                                </div>
                                <Toggle checked={row.checked} onChange={row.onChange} label={row.label} />
                            </div>
                        ))}
                        <div>
                            <Button
                                variant="ghost"
                                onClick={() => onShare?.(group.id)}
                                icon={<Share2 className="h-3.5 w-3.5" />}
                                className="px-2.5 py-1 text-[12.5px]"
                            >
                                {t('cal.share', { name: group.title })}
                            </Button>
                        </div>
                    </div>

                    <div className="border-t border-t2-line-soft pt-3">
                        {isProtected ? (
                            <div className="flex items-center gap-2 text-[12.5px] text-t2-ink-3">
                                <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                <span>{t('cal.protected')}</span>
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                <div className="space-y-1.5">
                                    {DELETE_OPTION_FIELDS.map(({ key, labelKey }) => (
                                        <label key={key} className="flex cursor-pointer items-center gap-2 text-[13px] text-t2-ink">
                                            <input
                                                type="checkbox"
                                                checked={deleteOpts[key]}
                                                onChange={(e) => setDeleteOpts((prev) => ({ ...prev, [key]: e.target.checked }))}
                                                className="h-3.5 w-3.5 accent-t2-accent"
                                            />
                                            <span>{t(labelKey)}</span>
                                        </label>
                                    ))}
                                    <p className="text-[12px] leading-[1.35] text-t2-ink-3">{t('tags.deleteHint')}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        variant="danger"
                                        className="px-2.5 py-1 text-[12.5px]"
                                        onClick={(e) => {
                                            if (onDeleteWithOptions) onDeleteWithOptions(group.id, deleteOpts);
                                            else onDelete?.(e, group.id);
                                        }}
                                    >
                                        {hasDeleteSelections ? t('tags.deleteTagAndSelected') : t('tags.deleteTagOnly')}
                                    </Button>
                                    {onDeleteEvents && (
                                        <Button
                                            variant="ghost"
                                            className="px-2.5 py-1 text-[12.5px]"
                                            onClick={() => onDeleteEvents(group.id)}
                                        >
                                            {t('cal.deleteEventsAction')}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
