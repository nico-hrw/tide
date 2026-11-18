import React, { useState } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { useReferenceStore, type ReferenceItem } from '@/store/useReferenceStore';
import { Button, TextField } from '../../ui/Controls';
import { SettingsEmpty } from '../../ui/SettingsLayout';
import { cx } from '../../ui/cx';
import { useT } from '../../useT';

/** Vom Nutzer waehlbare Markierungsfarben (Daten, nicht Teil der Palette). */
export const REFERENCE_PALETTE = [
    { label: 'Blue', value: '#3b82f6' },
    { label: 'Green', value: '#10b981' },
    { label: 'Amber', value: '#f59e0b' },
    { label: 'Red', value: '#ef4444' },
    { label: 'Purple', value: '#8b5cf6' },
    { label: 'Pink', value: '#ec4899' },
] as const;

export const QUICK_EMOJIS = ['🔖', '💡', '📌', '⭐', '🏷️', '📖'] as const;

interface StylePickerProps {
    color: string | undefined;
    emoji: string;
    onColor: (c: string | undefined) => void;
    onEmoji: (e: string) => void;
}

function StylePicker({ color, emoji, onColor, onEmoji }: StylePickerProps) {
    const t = useT();
    return (
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
            <div className="flex items-center gap-2">
                <span className="text-[12px] text-t2-ink-3">{t('ref.color')}</span>
                <button
                    type="button"
                    onClick={() => onColor(undefined)}
                    title={t('ref.noColor')}
                    aria-label={t('ref.noColor')}
                    className={cx('flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-t2-ink-3 ring-1', !color ? 'ring-2 ring-t2-accent' : 'ring-t2-line')}
                >
                    <X className="h-3 w-3" />
                </button>
                {REFERENCE_PALETTE.map((c) => (
                    <button
                        key={c.value}
                        type="button"
                        onClick={() => onColor(c.value)}
                        title={c.label}
                        aria-label={c.label}
                        aria-pressed={color === c.value}
                        className={cx('h-5 w-5 rounded-full transition-transform', color === c.value ? 'scale-110 ring-2 ring-t2-accent ring-offset-2 ring-offset-t2-surface' : 'hover:scale-105')}
                        style={{ backgroundColor: c.value }}
                    />
                ))}
            </div>
            <div className="flex items-center gap-1">
                <span className="mr-1 text-[12px] text-t2-ink-3">{t('ref.emoji')}</span>
                {QUICK_EMOJIS.map((em) => (
                    <button
                        key={em}
                        type="button"
                        onClick={() => onEmoji(emoji === em ? '' : em)}
                        aria-pressed={emoji === em}
                        className={cx('flex h-6 w-6 items-center justify-center rounded-md text-xs', emoji === em ? 'bg-t2-hover ring-1 ring-t2-line' : 'hover:bg-t2-hover')}
                    >
                        {em}
                    </button>
                ))}
                <TextField block maxLength={4} value={emoji} onChange={(e) => onEmoji(e.target.value)} placeholder={t('ref.emoji')} aria-label={t('ref.emojiCustom')} className="!w-12 !px-1.5 !py-0.5 text-center text-xs" />
            </div>
        </div>
    );
}

export function ReferencesDictionary() {
    const t = useT();
    const references = useReferenceStore((s) => s.references);
    const removeReference = useReferenceStore((s) => s.removeReference);
    const updateReference = useReferenceStore((s) => s.updateReference);
    const addReference = useReferenceStore((s) => s.addReference);

    const [editId, setEditId] = useState<string | null>(null);
    const [editTerm, setEditTerm] = useState('');
    const [editColor, setEditColor] = useState<string | undefined>(undefined);
    const [editEmoji, setEditEmoji] = useState('');
    const [adding, setAdding] = useState(false);
    const [newTerm, setNewTerm] = useState('');
    const [newPreview, setNewPreview] = useState('');
    const [newColor, setNewColor] = useState<string | undefined>(undefined);
    const [newEmoji, setNewEmoji] = useState('');

    const startEdit = (r: ReferenceItem) => {
        setEditId(r.id);
        setEditTerm(r.term);
        setEditColor(r.color);
        setEditEmoji(r.emoji || '');
    };
    const cancelEdit = () => {
        setEditId(null);
        setEditTerm('');
        setEditColor(undefined);
        setEditEmoji('');
    };
    const saveEdit = () => {
        const term = editTerm.trim();
        if (editId && term) updateReference(editId, { term, color: editColor, emoji: editEmoji.trim() || undefined });
        cancelEdit();
    };
    const resetNew = () => {
        setAdding(false);
        setNewTerm('');
        setNewPreview('');
        setNewColor(undefined);
        setNewEmoji('');
    };
    const create = () => {
        const term = newTerm.trim();
        if (!term) return;
        addReference({
            term,
            previewText: newPreview.trim() || t('ref.defaultPreview', { term }),
            sourceNoteId: '',
            color: newColor,
            emoji: newEmoji.trim() || undefined,
        });
        resetNew();
    };

    return (
        <div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
                <b className="font-medium text-t2-ink">{t('ref.dictionary', { n: references.length })}</b>
                <Button variant="ghost" onClick={() => (adding ? resetNew() : setAdding(true))} icon={<Plus className="h-[15px] w-[15px]" />}>
                    {adding ? t('common.cancel') : t('ref.add')}
                </Button>
            </div>

            {adding && (
                <div className="space-y-3 border-t border-t2-line-soft bg-t2-sub px-4 py-3.5">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <TextField block placeholder={t('ref.termPlaceholder')} value={newTerm} onChange={(e) => setNewTerm(e.target.value)} aria-label={t('ref.termPlaceholder')} />
                        <TextField block placeholder={t('ref.previewPlaceholder')} value={newPreview} onChange={(e) => setNewPreview(e.target.value)} aria-label={t('ref.previewPlaceholder')} />
                    </div>
                    <StylePicker color={newColor} emoji={newEmoji} onColor={setNewColor} onEmoji={setNewEmoji} />
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={resetNew}>{t('common.cancel')}</Button>
                        <Button variant="primary" onClick={create} disabled={!newTerm.trim()}>{t('ref.addAction')}</Button>
                    </div>
                </div>
            )}

            <div className="max-h-[280px] overflow-y-auto border-t border-t2-line-soft [&>*+*]:border-t [&>*+*]:border-t2-line-soft">
                {references.length === 0 ? (
                    <SettingsEmpty>{t('ref.empty')}</SettingsEmpty>
                ) : (
                    references.map((r) =>
                        editId === r.id ? (
                            <div key={r.id} className="space-y-3 bg-t2-sub px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <TextField
                                        block
                                        autoFocus
                                        value={editTerm}
                                        aria-label={t('ref.termPlaceholder')}
                                        onChange={(e) => setEditTerm(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveEdit();
                                            if (e.key === 'Escape') {
                                                e.stopPropagation();
                                                cancelEdit();
                                            }
                                        }}
                                    />
                                    <Button variant="primary" onClick={saveEdit}>{t('common.save')}</Button>
                                    <Button variant="ghost" onClick={cancelEdit}>{t('common.cancel')}</Button>
                                </div>
                                <StylePicker color={editColor} emoji={editEmoji} onColor={setEditColor} onEmoji={setEditEmoji} />
                            </div>
                        ) : (
                            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                                <button type="button" onClick={() => startEdit(r)} title={t('ref.clickToEdit')} className="min-w-0 flex-1 text-left">
                                    <span className="flex items-center gap-1.5">
                                        {r.color && <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-t2-line" style={{ backgroundColor: r.color }} />}
                                        {r.emoji && <span className="shrink-0 text-sm leading-none">{r.emoji}</span>}
                                        <span className="truncate font-medium text-t2-ink">{r.term}</span>
                                    </span>
                                    <span className="mt-0.5 block truncate text-[12.5px] text-t2-ink-3">{r.previewText || t('ref.noPreview')}</span>
                                </button>
                                <div className="flex shrink-0 items-center gap-1">
                                    <button type="button" onClick={() => startEdit(r)} title={t('common.edit')} aria-label={t('common.edit')} className="rounded-md p-1.5 text-t2-ink-3 hover:bg-t2-hover hover:text-t2-ink">
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button type="button" onClick={() => removeReference(r.id)} title={t('common.delete')} aria-label={t('common.delete')} className="rounded-md p-1.5 text-t2-ink-3 hover:bg-t2-hover hover:text-t2-late">
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ),
                    )
                )}
            </div>
        </div>
    );
}
