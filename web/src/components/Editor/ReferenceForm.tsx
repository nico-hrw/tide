"use client";

import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, HelpCircle, Trash2 } from 'lucide-react';
import { REFERENCE_COLORS, REFERENCE_QUICK_EMOJIS } from './editorConstants';

export interface ReferenceFormValue {
    definition: string;
    color: string;
    emoji: string;
}

interface ReferenceFormProps {
    /** The marked word or sentence */
    term: string;
    initial?: Partial<ReferenceFormValue>;
    mode: 'create' | 'edit';
    onSave: (value: ReferenceFormValue) => void;
    onCancel: () => void;
    onRemove?: () => void;
    /** Only for references whose definition note is another note */
    onOpenSource?: () => void;
}

/**
 * The definition popup of the References plugin: type what the marked term means; hovering the term shows exactly
 * this text. Colour and emoji (used by some display modes) sit behind "Darstellung".
 */
export default function ReferenceForm({ term, initial, mode, onSave, onCancel, onRemove, onOpenSource }: ReferenceFormProps) {
    const [definition, setDefinition] = useState(initial?.definition ?? '');
    const [color, setColor] = useState(initial?.color ?? REFERENCE_COLORS[0].value);
    const [emoji, setEmoji] = useState(initial?.emoji ?? '🔖');
    const [showLook, setShowLook] = useState(false);
    const [error, setError] = useState(false);
    const areaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const el = areaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
    }, []);

    const submit = () => {
        const text = definition.trim();
        if (!text) { setError(true); areaRef.current?.focus(); return; }
        onSave({ definition: text, color, emoji });
    };

    return (
        <div
            className="flex w-[300px] flex-col gap-2.5 rounded-2xl border border-t2-line bg-t2-surface p-3.5 text-t2-ink shadow-[0_18px_44px_rgba(0,0,0,0.18)]"
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className="flex items-center gap-2">
                <HelpCircle size={15} className="shrink-0 text-t2-ink-3" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" title={term}>{term}</span>
            </div>

            <textarea
                ref={areaRef}
                value={definition}
                rows={3}
                onChange={(e) => { setDefinition(e.target.value); if (error) setError(false); }}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
                }}
                placeholder={`Was bedeutet „${term.length > 30 ? term.slice(0, 30) + '…' : term}“?`}
                aria-label="Definition"
                aria-invalid={error}
                className={`w-full resize-none rounded-xl bg-t2-sub px-3 py-2 text-[13px] leading-snug text-t2-ink outline-none placeholder:text-t2-ink-3 focus:shadow-[inset_0_0_0_1px_var(--t2-ink-3)] ${
                    error ? 'shadow-[inset_0_0_0_1px_var(--t2-late)]' : 'shadow-[inset_0_0_0_1px_var(--t2-line)]'
                }`}
            />
            {error && <span className="-mt-1.5 text-[12px] text-t2-late">Schreib eine Definition, die beim Hovern erscheint.</span>}

            <button
                type="button"
                onClick={() => setShowLook((v) => !v)}
                className="flex items-center gap-1.5 self-start text-[12px] font-medium text-t2-ink-3 transition-colors hover:text-t2-ink cursor-pointer"
                aria-expanded={showLook}
            >
                Darstellung
                <span className="h-2.5 w-2.5 rounded-full border border-t2-line" style={{ backgroundColor: color }} />
                <span>{emoji}</span>
            </button>
            {showLook && (
                <div className="flex flex-col gap-2 rounded-xl bg-t2-sub p-2.5">
                    <div className="flex items-center gap-1.5">
                        {REFERENCE_COLORS.map((c) => (
                            <button
                                key={c.value}
                                type="button"
                                title={c.label}
                                aria-label={c.label}
                                aria-pressed={color === c.value}
                                onClick={() => setColor(c.value)}
                                className={`h-5 w-5 rounded-full transition-transform cursor-pointer ${color === c.value ? 'scale-110 ring-2 ring-t2-ink ring-offset-2 ring-offset-t2-sub' : 'hover:scale-110'}`}
                                style={{ backgroundColor: c.value }}
                            />
                        ))}
                    </div>
                    <div className="flex items-center gap-1">
                        {REFERENCE_QUICK_EMOJIS.map((e) => (
                            <button
                                key={e}
                                type="button"
                                onClick={() => setEmoji(e)}
                                className={`grid h-6 w-6 place-items-center rounded-md text-sm transition-colors cursor-pointer ${emoji === e ? 'bg-t2-surface ring-1 ring-t2-ink-3' : 'hover:bg-t2-hover'}`}
                            >
                                {e}
                            </button>
                        ))}
                        <input
                            value={emoji}
                            onChange={(e) => setEmoji(e.target.value)}
                            maxLength={4}
                            aria-label="Eigenes Emoji"
                            className="h-6 w-8 rounded border border-t2-line bg-transparent text-center text-xs text-t2-ink outline-none focus:border-t2-ink-3"
                        />
                    </div>
                </div>
            )}

            <div className="flex items-center gap-1.5 border-t border-t2-line-soft pt-2.5">
                {mode === 'edit' && onRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-medium text-t2-ink-3 transition-colors hover:bg-t2-hover hover:text-t2-late cursor-pointer"
                    >
                        <Trash2 size={13} /> Entfernen
                    </button>
                )}
                {onOpenSource && (
                    <button
                        type="button"
                        onClick={onOpenSource}
                        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-medium text-t2-ink-3 transition-colors hover:bg-t2-hover hover:text-t2-ink cursor-pointer"
                    >
                        <ArrowUpRight size={13} /> Zur Quelle
                    </button>
                )}
                <span className="flex-1" />
                <button type="button" onClick={onCancel} className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-t2-ink-2 transition-colors hover:bg-t2-hover cursor-pointer">
                    Abbrechen
                </button>
                <button type="button" onClick={submit} className="rounded-lg bg-t2-ink px-3 py-1.5 text-[12px] font-semibold text-t2-bg transition-opacity hover:opacity-90 cursor-pointer">
                    {mode === 'create' ? 'Speichern' : 'Aktualisieren'}
                </button>
            </div>
        </div>
    );
}
