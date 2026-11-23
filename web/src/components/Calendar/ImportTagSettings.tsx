import React from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import type { ImportRule, ImportRuleField, ImportRuleMode } from '@/lib/importRules';

export interface ImportTagOption {
    id: string;
    title: string;
}

export interface MainTagChoice {
    /** Existing tag id, or '' to create a new tag named `newName`. */
    tagId: string;
    newName: string;
}

interface ImportTagSettingsProps {
    tags: ImportTagOption[];
    canCreate: boolean;
    mainTag: MainTagChoice;
    onMainTagChange: (next: MainTagChoice) => void;
    rules: ImportRule[];
    onRulesChange: (next: ImportRule[]) => void;
    onSuggest: () => void;
    suggestAvailable: boolean;
}

const FIELD_LABELS: Record<ImportRuleField, string> = { title: 'Titel', description: 'Beschreibung', both: 'Titel oder Beschreibung' };
const MODE_LABELS: Record<ImportRuleMode, string> = { startsWith: 'beginnt mit', contains: 'enthält' };

const controlClass =
    'text-xs rounded-xl border border-t2-line bg-t2-surface px-2.5 py-1.5 text-t2-ink focus:outline-none focus:ring-1 focus:ring-t2-accent';

export function ImportTagSettings({
    tags, canCreate, mainTag, onMainTagChange, rules, onRulesChange, onSuggest, suggestAvailable,
}: ImportTagSettingsProps) {
    const updateRule = (id: string, patch: Partial<ImportRule>) =>
        onRulesChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

    const addRule = () =>
        onRulesChange([
            ...rules,
            { id: `rule-${Date.now()}-${rules.length}`, field: 'title', mode: 'startsWith', pattern: '', tagName: '' },
        ]);

    return (
        <div className="space-y-4 pb-3 border-b border-t2-line-soft">
            <div className="space-y-1.5">
                <div className="text-xs font-semibold text-t2-ink">Gemeinsamer Tag (Pflicht)</div>
                <p className="text-xs text-t2-ink-2">Alle importierten Termine erhalten diesen Tag als Haupt-Tag.</p>
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        aria-label="Gemeinsamer Tag"
                        value={mainTag.tagId}
                        onChange={(e) => onMainTagChange({ ...mainTag, tagId: e.target.value })}
                        className={controlClass}
                    >
                        {canCreate && <option value="">Neuen Tag anlegen…</option>}
                        {tags.map((t) => (
                            <option key={t.id} value={t.id}>{t.title}</option>
                        ))}
                    </select>
                    {mainTag.tagId === '' && (
                        <input
                            aria-label="Name des neuen Tags"
                            value={mainTag.newName}
                            onChange={(e) => onMainTagChange({ ...mainTag, newName: e.target.value })}
                            placeholder="Name des Tags"
                            className={`${controlClass} flex-1 min-w-[10rem]`}
                        />
                    )}
                </div>
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <div className="text-xs font-semibold text-t2-ink">Filter für weitere Tags</div>
                        <p className="text-xs text-t2-ink-2">Passt ein Termin, bekommt er zusätzlich diesen Tag.</p>
                    </div>
                    {suggestAvailable && (
                        <button
                            type="button"
                            onClick={onSuggest}
                            className="inline-flex items-center gap-1 text-xs font-medium text-t2-accent hover:underline"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            Vorschlag aus Titeln
                        </button>
                    )}
                </div>

                {rules.map((rule) => (
                    <div key={rule.id} className="flex flex-wrap items-center gap-1.5">
                        <select
                            aria-label="Feld"
                            value={rule.field}
                            onChange={(e) => updateRule(rule.id, { field: e.target.value as ImportRuleField })}
                            className={controlClass}
                        >
                            {(Object.keys(FIELD_LABELS) as ImportRuleField[]).map((f) => (
                                <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                            ))}
                        </select>
                        <select
                            aria-label="Bedingung"
                            value={rule.mode}
                            onChange={(e) => updateRule(rule.id, { mode: e.target.value as ImportRuleMode })}
                            className={controlClass}
                        >
                            {(Object.keys(MODE_LABELS) as ImportRuleMode[]).map((m) => (
                                <option key={m} value={m}>{MODE_LABELS[m]}</option>
                            ))}
                        </select>
                        <input
                            aria-label="Suchtext"
                            value={rule.pattern}
                            onChange={(e) => updateRule(rule.id, { pattern: e.target.value })}
                            placeholder="z. B. V:"
                            className={`${controlClass} w-24`}
                        />
                        <span className="text-xs text-t2-ink-2">→ Tag</span>
                        <input
                            aria-label="Tag-Name"
                            list="import-rule-tags"
                            value={rule.tagName}
                            onChange={(e) => updateRule(rule.id, { tagName: e.target.value })}
                            placeholder="Tag-Name"
                            className={`${controlClass} flex-1 min-w-[8rem]`}
                        />
                        <label className="inline-flex items-center gap-1 text-xs text-t2-ink-2 cursor-pointer" title="Gefundenen Text aus Titel/Beschreibung löschen">
                            <input
                                type="checkbox"
                                checked={!!rule.removeMatch}
                                onChange={(e) => updateRule(rule.id, { removeMatch: e.target.checked })}
                                className="h-3.5 w-3.5 rounded border-t2-line text-t2-accent focus:ring-t2-accent"
                            />
                            Text entfernen
                        </label>
                        <button
                            type="button"
                            aria-label="Filter entfernen"
                            onClick={() => onRulesChange(rules.filter((r) => r.id !== rule.id))}
                            className="p-1.5 rounded-full text-t2-ink-3 hover:text-t2-ink-2 hover:bg-t2-hover"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ))}
                <datalist id="import-rule-tags">
                    {tags.map((t) => <option key={t.id} value={t.title} />)}
                </datalist>

                <button
                    type="button"
                    onClick={addRule}
                    className="inline-flex items-center gap-1 text-xs font-medium text-t2-accent hover:underline"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Filter hinzufügen
                </button>
            </div>
        </div>
    );
}
