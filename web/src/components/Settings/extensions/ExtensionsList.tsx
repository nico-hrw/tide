import React, { useMemo } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { SettingsCard, SettingsPage, SettingsSection } from '../ui/SettingsLayout';
import { Button, StatusPill, Toggle } from '../ui/Controls';
import { cx } from '../ui/cx';
import { useT, useTDynamic } from '../useT';
import { ExtensionIcon } from './ExtensionIcon';
import { EXTENSION_CATALOG, filterAndGroupExtensions, type ExtensionDef } from './extensionCatalog';

export interface ExtensionsListProps {
    enabled: readonly string[];
    query: string;
    onQueryChange: (q: string) => void;
    onOpen: (id: string) => void;
    /** Aktivieren: ein Klick. Deaktivieren: nur Anfrage, der Bestaetigungsschritt folgt. */
    onToggle: (id: string, next: boolean) => void;
    pendingOff: string | null;
    onConfirmOff: (id: string) => void;
    onCancelOff: () => void;
}

/** Bestaetigungsschritt beim Deaktivieren, mit Hinweis dass Daten erhalten bleiben. */
export function ExtensionDisableConfirm({ id, onConfirm, onCancel }: { id: string; onConfirm: () => void; onCancel: () => void }) {
    const t = useT();
    const td = useTDynamic();
    const cancelRef = React.useRef<HTMLButtonElement>(null);
    React.useEffect(() => { cancelRef.current?.focus(); }, []);
    return (
        <div role="alertdialog" aria-label={td(`ext.${id}.title`)} className="border-t border-t2-line bg-t2-sub px-4 pb-4 pt-3.5">
            <b className="block font-semibold text-t2-ink">{t('ext.confirmTitle', { name: td(`ext.${id}.title`) })}</b>
            <p className="mb-3 mt-0.5 max-w-[46ch] text-[13px] text-t2-ink-2">
                {td(`ext.${id}.off`)} {t('ext.confirmKeepData')}
            </p>
            <div className="flex gap-2">
                <button
                    ref={cancelRef}
                    type="button"
                    onClick={onCancel}
                    className="rounded-ui bg-t2-surface px-3 py-1.5 text-[13px] font-medium text-t2-ink ring-1 ring-t2-line hover:bg-t2-hover"
                >
                    {t('common.cancel')}
                </button>
                <Button variant="danger" onClick={onConfirm}>{t('ext.confirmDisable')}</Button>
            </div>
        </div>
    );
}

export function ExtensionsList({ enabled, query, onQueryChange, onOpen, onToggle, pendingOff, onConfirmOff, onCancelOff }: ExtensionsListProps) {
    const t = useT();
    const td = useTDynamic();

    const groups = useMemo(
        () => filterAndGroupExtensions(EXTENSION_CATALOG, query, (d) => `${td(`ext.${d.id}.title`)} ${td(`ext.${d.id}.desc`)} ${td(`ext.group.${d.group}`)}`),
        [query, td],
    );

    const renderRow = (ext: ExtensionDef) => {
        const isOn = enabled.includes(ext.id);
        const status = ext.maintenance ? (
            <StatusPill tone="warn">{t('ext.statusMaintenance')}</StatusPill>
        ) : isOn ? (
            <StatusPill>{t('ext.statusOn')}</StatusPill>
        ) : (
            <StatusPill tone="off">{t('ext.statusOff')}</StatusPill>
        );
        const body = (
            <>
                <span className={cx('grid h-[38px] w-[38px] flex-none place-items-center rounded-[11px] bg-t2-sub text-t2-ink-2 transition-opacity', !isOn && 'opacity-55')}>
                    <ExtensionIcon id={ext.id} className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                        <b className="font-medium text-t2-ink">{td(`ext.${ext.id}.title`)}</b>
                        {status}
                    </span>
                    <span className="mt-px block text-[12.5px] leading-[1.35] text-t2-ink-3">{td(`ext.${ext.id}.desc`)}</span>
                </span>
                {ext.hasPage && <ChevronRight className="h-[15px] w-[15px] flex-none text-t2-ink-3" aria-hidden />}
            </>
        );
        return (
            <React.Fragment key={ext.id}>
                <div className="flex items-center gap-3 pr-4 sm:pr-4">
                    {ext.hasPage ? (
                        <button
                            type="button"
                            onClick={() => onOpen(ext.id)}
                            aria-label={t('ext.openOptions', { name: td(`ext.${ext.id}.title`) })}
                            className="flex min-w-0 flex-1 items-center gap-3.5 py-3.5 pl-3 pr-1 text-left hover:bg-t2-hover sm:pl-4"
                        >
                            {body}
                        </button>
                    ) : (
                        <div className="flex min-w-0 flex-1 items-center gap-3.5 py-3.5 pl-3 sm:pl-4">{body}</div>
                    )}
                    <Toggle
                        checked={isOn}
                        disabled={ext.maintenance}
                        label={t('ext.toggleLabel', { name: td(`ext.${ext.id}.title`) })}
                        onChange={(next) => onToggle(ext.id, next)}
                    />
                </div>
                {pendingOff === ext.id && (
                    <ExtensionDisableConfirm id={ext.id} onConfirm={() => onConfirmOff(ext.id)} onCancel={onCancelOff} />
                )}
            </React.Fragment>
        );
    };

    return (
        <div>
            <label className="mb-6 flex items-center gap-2 rounded-ui bg-t2-sub px-3 py-2 text-t2-ink-3 ring-1 ring-t2-line focus-within:ring-2 focus-within:ring-t2-accent">
                <Search className="h-[15px] w-[15px] shrink-0" aria-hidden />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    placeholder={t('ext.search')}
                    aria-label={t('ext.search')}
                    className="min-w-0 flex-1 bg-transparent text-t2-ink outline-none placeholder:text-t2-ink-3"
                />
            </label>
            {groups.length === 0 ? (
                <p className="py-10 text-center text-t2-ink-3">{t('ext.empty')}</p>
            ) : (
                <SettingsPage>
                    {groups.map((g) => (
                        <SettingsSection key={g.id} title={t(`ext.group.${g.id}`)} hint={g.id === 'maintenance' ? undefined : t(`ext.group.${g.id}.hint`)}>
                            <SettingsCard>{g.items.map(renderRow)}</SettingsCard>
                        </SettingsSection>
                    ))}
                </SettingsPage>
            )}
        </div>
    );
}
