'use client';

import React, { useState } from 'react';
import { Link2, Pencil, Trash2 } from 'lucide-react';
import { formatResult } from '@/lib/formula/format';
import { STDLIB_ENTRIES, type StdlibEntry } from '@/lib/formula/stdlib';
import type { Value } from '@/lib/formula/types';

const STDLIB_GROUPS: ReadonlyArray<{ kind: StdlibEntry['kind']; label: string }> = [
    { kind: 'konstante', label: 'Konstanten' },
    { kind: 'funktion', label: 'Funktionen' },
    { kind: 'finanzen', label: 'Finanzen' },
];

const IDENTIFIER_RE = /^[A-Za-zÄÖÜäöüß_][A-Za-zÄÖÜäöüß0-9_]*$/;
const CELL_REF_RE = /^[A-Za-z]{1,2}\d+$/;

function isValidIdentifier(raw: string): boolean {
    return IDENTIFIER_RE.test(raw) && !CELL_REF_RE.test(raw);
}

export function StdlibView({ searchQuery }: { searchQuery: string }) {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
        ? STDLIB_ENTRIES.filter(
              (entry) =>
                  entry.name.toLowerCase().includes(query) ||
                  entry.signature.toLowerCase().includes(query) ||
                  entry.description.toLowerCase().includes(query),
          )
        : STDLIB_ENTRIES;

    return (
        <div className="space-y-4">
            <div className="rounded-lg border border-t2-line bg-t2-sub px-3 py-2 text-xs leading-relaxed text-t2-ink-2">
                Lokal &gt; Global &gt; Standard: Wenn du eine Variable oder Funktion mit gleichem Namen in deinen Notizen definierst, überschreibt sie den Standardwert.
            </div>

            {filtered.length === 0 ? (
                <p className="py-6 text-center text-xs text-t2-ink-3">
                    Keine passenden Standard-Einträge gefunden.
                </p>
            ) : (
                STDLIB_GROUPS.map(({ kind, label }) => {
                    const items = filtered.filter((entry) => entry.kind === kind);
                    if (items.length === 0) return null;
                    return (
                        <section key={kind} className="space-y-1.5">
                            <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-t2-ink-3">
                                {label}
                            </h3>
                            <div className="divide-y divide-t2-line-soft rounded-lg border border-t2-line bg-t2-surface">
                                {items.map((entry) => (
                                    <div
                                        key={entry.name}
                                        className="flex items-start justify-between gap-3 px-3 py-2.5"
                                    >
                                        <div className="min-w-0 space-y-0.5">
                                            <div className="font-mono text-[13px] font-semibold text-t2-ink">
                                                {entry.signature}
                                            </div>
                                            <div className="text-xs text-t2-ink-2">
                                                {entry.description}
                                            </div>
                                        </div>
                                        <span className="shrink-0 rounded bg-t2-sub px-1.5 py-0.5 text-[11px] text-t2-ink-3">
                                            Standard
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    );
                })
            )}
        </div>
    );
}

export interface ManualVarFormProps {
    onSave: (name: string, expr: string, params?: string[]) => Promise<void> | void;
    onCancel: () => void;
    initial?: { name: string; expr: string; params?: string[] };
}

export function ManualVarForm({ onSave, onCancel, initial }: ManualVarFormProps) {
    const [name, setName] = useState(initial?.name ?? '');
    const [expr, setExpr] = useState(initial?.expr ?? '');
    const [paramsInput, setParamsInput] = useState(initial?.params?.join(', ') ?? '');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const trimmedName = name.trim();
        const trimmedExpr = expr.trim();

        if (!isValidIdentifier(trimmedName)) {
            setError('Ungültiger Name. Erlaubt sind Buchstaben, Ziffern und „_“ (kein Zellbezug wie A1).');
            return;
        }
        if (!trimmedExpr) {
            setError('Bitte einen Ausdruck oder Wert eingeben.');
            return;
        }

        const parsedParams = paramsInput
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);

        if (parsedParams.some((p) => !isValidIdentifier(p))) {
            setError('Ungültiger Parametername in der Parameterliste.');
            return;
        }

        setError(null);
        setSaving(true);
        try {
            await onSave(trimmedName, trimmedExpr, parsedParams.length > 0 ? parsedParams : undefined);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-3 rounded-lg border border-t2-line bg-t2-sub p-3"
        >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-t2-ink-2">Name</span>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            if (error) setError(null);
                        }}
                        placeholder="z. B. mwst"
                        className="w-full rounded-md border border-t2-line bg-t2-surface px-2.5 py-1.5 font-mono text-[13px] text-t2-ink placeholder:text-t2-ink-3 focus:border-t2-accent focus:outline-none"
                    />
                </label>

                <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-t2-ink-2">
                        Parameter (optional, kommagetrennt)
                    </span>
                    <input
                        type="text"
                        value={paramsInput}
                        onChange={(e) => {
                            setParamsInput(e.target.value);
                            if (error) setError(null);
                        }}
                        placeholder="z. B. x, y"
                        className="w-full rounded-md border border-t2-line bg-t2-surface px-2.5 py-1.5 font-mono text-[13px] text-t2-ink placeholder:text-t2-ink-3 focus:border-t2-accent focus:outline-none"
                    />
                </label>
            </div>

            <label className="block space-y-1">
                <span className="text-[11px] font-medium text-t2-ink-2">Ausdruck</span>
                <input
                    type="text"
                    value={expr}
                    onChange={(e) => {
                        setExpr(e.target.value);
                        if (error) setError(null);
                    }}
                    placeholder="z. B. 0,19 oder x * 1,19"
                    className="w-full rounded-md border border-t2-line bg-t2-surface px-2.5 py-1.5 font-mono text-[13px] text-t2-ink placeholder:text-t2-ink-3 focus:border-t2-accent focus:outline-none"
                />
            </label>

            {error && <p className="text-xs text-t2-now">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={saving}
                    className="rounded-md border border-t2-line bg-t2-surface px-3 py-1.5 text-xs font-medium text-t2-ink-2 transition-colors hover:bg-t2-hover disabled:opacity-50"
                >
                    Abbrechen
                </button>
                <button
                    type="submit"
                    disabled={saving}
                    className="rounded-md bg-t2-accent px-3 py-1.5 text-xs font-medium text-t2-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                    {saving ? 'Speichern…' : 'Speichern'}
                </button>
            </div>
        </form>
    );
}

export interface VarRowProps {
    name: string;
    expr: string;
    evaluated?: Value | null;
    params?: readonly string[];
    sourceNoteTitle?: string | null;
    isManual?: boolean;
    onEdit?: () => void;
    onDelete?: () => void;
    onOpenNote?: () => void;
}

export function VarRow({
    name,
    expr,
    evaluated,
    params,
    sourceNoteTitle,
    isManual,
    onEdit,
    onDelete,
    onOpenNote,
}: VarRowProps) {
    const paramList = params && params.length > 0 ? params : null;
    const formattedValue =
        !paramList && evaluated !== undefined && evaluated !== null
            ? formatResult(evaluated)
            : null;

    return (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-t2-line bg-t2-surface px-3 py-2 transition-colors hover:bg-t2-hover">
            <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[13px] font-medium text-t2-accent">
                        {name}
                        {paramList ? `(${paramList.join(', ')})` : ''}
                    </span>
                    {paramList && (
                        <span className="rounded bg-t2-sub px-1.5 py-0.5 text-[11px] text-t2-ink-3">
                            Funktion
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-baseline gap-2">
                    <span className="truncate font-mono text-[13px] text-t2-ink">{expr}</span>
                    {formattedValue !== null && (
                        <span className="text-xs tabular-nums text-t2-ink-2">
                            = {formattedValue}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
                {sourceNoteTitle && (
                    <button
                        type="button"
                        onClick={onOpenNote}
                        title={sourceNoteTitle}
                        className="inline-flex max-w-[160px] items-center gap-1 rounded-full border border-t2-line bg-t2-sub px-2 py-0.5 text-[11px] text-t2-ink-2 transition-colors hover:bg-t2-hover hover:text-t2-ink"
                    >
                        <Link2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">{sourceNoteTitle}</span>
                    </button>
                )}

                {isManual && (
                    <>
                        <button
                            type="button"
                            onClick={onEdit}
                            aria-label={`${name} bearbeiten`}
                            className="rounded-md p-1.5 text-t2-ink-3 transition-colors hover:bg-t2-sub hover:text-t2-ink"
                        >
                            <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={onDelete}
                            aria-label={`${name} löschen`}
                            className="rounded-md p-1.5 text-t2-ink-3 transition-colors hover:bg-t2-sub hover:text-t2-now"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
