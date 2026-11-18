import React, { useState } from 'react';
import { Button, Chip, Notice, SelectField, TextField } from '../ui/Controls';
import { cx } from '../ui/cx';
import { useT, useTDynamic } from '../useT';
import { DEFAULT_EXPIRY_DAYS, DEFAULT_SCOPES, EXPIRY_CHOICES, groupScopes } from './scopes';
import type { CreateTokenInput } from './useApiTokens';

export interface NewTokenFormProps {
    onSubmit: (input: CreateTokenInput) => Promise<void>;
    onCancel: () => void;
}

export function NewTokenForm({ onSubmit, onCancel }: NewTokenFormProps) {
    const t = useT();
    const td = useTDynamic();
    const [name, setName] = useState('');
    const [scopes, setScopes] = useState<string[]>([...DEFAULT_SCOPES]);
    const [days, setDays] = useState<number>(DEFAULT_EXPIRY_DAYS);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggleScope = (key: string) => setScopes((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return setError(t('access.errName'));
        if (scopes.length === 0) return setError(t('access.errScopes'));
        setBusy(true);
        setError(null);
        try {
            await onSubmit({ name: name.trim(), scopes, expiresInDays: days });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4 p-4" aria-label={t('access.newToken')}>
            <h4 className="text-[15px] font-semibold text-t2-ink">{t('access.newToken')}</h4>
            {error && <Notice tone="error">{error}</Notice>}

            <label className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                <span className="text-t2-ink-2">{t('access.name')}</span>
                <TextField value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder={t('access.namePlaceholder')} autoFocus />
            </label>

            <label className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                <span className="text-t2-ink-2">{t('access.validity')}</span>
                <SelectField
                    label={t('access.validity')}
                    value={days}
                    onChange={setDays}
                    options={EXPIRY_CHOICES.map((d) => ({ value: d, label: td(`access.expiry.${d}`) }))}
                />
            </label>

            <fieldset>
                <legend className="mb-1 text-t2-ink-2">{t('access.rightsQuestion')}</legend>
                {groupScopes().map((g) => (
                    <div key={g.id}>
                        <div className="mb-0.5 mt-4 text-[12px] font-semibold uppercase tracking-[0.04em] text-t2-ink-3">{t(`access.group.${g.id}`)}</div>
                        {g.scopes.map((s) => (
                            <label key={s.key} className="flex cursor-pointer items-start gap-2.5 py-1.5">
                                <input
                                    type="checkbox"
                                    checked={scopes.includes(s.key)}
                                    onChange={() => toggleScope(s.key)}
                                    className="mt-[3px] h-[15px] w-[15px] accent-t2-accent"
                                />
                                <span className="min-w-0">
                                    <b className={cx('flex items-center gap-2 font-medium text-t2-ink')}>
                                        {td(`scope.${s.key}.label`)}
                                        {!s.implemented && <Chip>{t('access.planned')}</Chip>}
                                    </b>
                                    <small className="text-[12.5px] text-t2-ink-3">{td(`scope.${s.key}.desc`)}</small>
                                </span>
                            </label>
                        ))}
                    </div>
                ))}
            </fieldset>

            <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
                <Button type="submit" variant="primary" disabled={busy}>{busy ? t('access.creating') : t('access.create')}</Button>
            </div>
        </form>
    );
}
