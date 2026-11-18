import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cx } from './cx';
import { useT } from '../useT';
import { Chip } from './Controls';

/**
 * Baukasten fuer alle Einstellungsseiten:
 * SettingsPage > SettingsSection > SettingsCard > SettingsRow
 */

export interface SettingsPageProps {
    children: React.ReactNode;
}

/**
 * Stapelt Sektionen mit 40px Abstand und Trennlinie dazwischen.
 * Funktioniert ueber DOM-Geschwister, daher duerfen Sektionen auch aus Unterkomponenten kommen.
 */
export function SettingsPage({ children }: SettingsPageProps) {
    return (
        <div className="[&>section+section]:mt-10 [&>section+section]:border-t [&>section+section]:border-t2-line [&>section+section]:pt-10">
            {children}
        </div>
    );
}

export interface SettingsSectionProps {
    title: string;
    hint?: string;
    /** Aktion rechts neben der Ueberschrift (z. B. "Neuer Token") */
    action?: React.ReactNode;
    tone?: 'default' | 'danger';
    children: React.ReactNode;
}

export function SettingsSection({ title, hint, action, tone = 'default', children }: SettingsSectionProps) {
    return (
        <section aria-label={title}>
            <div className="mb-3 flex items-end justify-between gap-3">
                <div className="min-w-0">
                    <h3 className={cx('text-[15.5px] font-semibold leading-[1.3] tracking-[-0.01em]', tone === 'danger' ? 'text-t2-late' : 'text-t2-ink')}>
                        {title}
                    </h3>
                    {hint && <p className="mt-0.5 text-[13px] leading-[1.4] text-t2-ink-3">{hint}</p>}
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </div>
            {children}
        </section>
    );
}

export interface SettingsCardProps {
    tone?: 'default' | 'danger' | 'muted';
    className?: string;
    children: React.ReactNode;
}

/** Gruppierte, abgerundete Karte; direkte Kinder werden durch feine Linien getrennt. */
export function SettingsCard({ tone = 'default', className, children }: SettingsCardProps) {
    return (
        <div
            className={cx(
                'overflow-hidden rounded-card bg-t2-surface shadow-sm [&>*+*]:border-t [&>*+*]:border-t2-line-soft',
                tone === 'danger'
                    ? 'ring-1 ring-t2-line shadow-[0_0_0_1px_color-mix(in_srgb,var(--t2-late)_32%,var(--t2-line))]'
                    : 'ring-1 ring-t2-line',
                className,
            )}
        >
            {children}
        </div>
    );
}

export interface SettingsRowProps {
    title: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
    /** Bedienelement soll auf schmalen Breiten die volle Breite nutzen */
    wide?: boolean;
    /** Noch nicht verfuegbar: ausgegraut mit Hinweis "bald" */
    soon?: boolean;
    htmlFor?: string;
}

export function SettingsRow({ title, description, children, wide, soon, htmlFor }: SettingsRowProps) {
    const t = useT();
    const Label = htmlFor ? 'label' : 'div';
    return (
        <div className={cx('flex flex-wrap items-center justify-between gap-x-5 gap-y-2.5 px-4 py-3.5 sm:flex-nowrap', soon && 'opacity-50')} aria-disabled={soon || undefined}>
            <Label {...(htmlFor ? { htmlFor } : {})} className="min-w-0 flex-1 basis-[150px]">
                <span className="flex items-center gap-2 text-[14px] font-medium text-t2-ink">
                    {title}
                    {soon && <Chip>{t('common.soon')}</Chip>}
                </span>
                {description && <span className="mt-0.5 block text-[12.5px] leading-[1.35] text-t2-ink-3">{description}</span>}
            </Label>
            {children != null && (
                <div className={cx('flex shrink-0 items-center gap-2 sm:max-w-[60%]', wide ? 'w-full sm:w-auto' : '', soon && 'pointer-events-none')}>
                    {children}
                </div>
            )}
        </div>
    );
}

/** Zeile, die eine Unterseite oeffnet oder einen Link ausloest. */
export function SettingsLinkRow({
    title,
    description,
    onClick,
    href,
    external,
}: {
    title: React.ReactNode;
    description?: React.ReactNode;
    onClick?: () => void;
    href?: string;
    external?: boolean;
}) {
    const inner = (
        <>
            <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-t2-ink">{title}</span>
                {description && <span className="mt-0.5 block text-[12.5px] leading-[1.35] text-t2-ink-3">{description}</span>}
            </span>
            <ChevronRight className="h-[15px] w-[15px] shrink-0 text-t2-ink-3" aria-hidden />
        </>
    );
    const cls = 'flex w-full items-center gap-5 px-4 py-3.5 text-left transition-colors hover:bg-t2-hover';
    if (href) {
        return (
            <a href={href} className={cls} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {inner}
            </a>
        );
    }
    return (
        <button type="button" onClick={onClick} className={cls}>
            {inner}
        </button>
    );
}

/** Freier Block innerhalb einer Karte (z. B. Palettenkarten, Code). */
export function SettingsBlock({ children, className }: { children: React.ReactNode; className?: string }) {
    return <div className={cx('p-4', className)}>{children}</div>;
}

/** Leiser Hinweistext in oder unter einer Karte. */
export function SettingsEmpty({ children }: { children: React.ReactNode }) {
    return <p className="px-4 py-6 text-center text-[13px] text-t2-ink-3">{children}</p>;
}

/** Seitenkopf (nur Desktop; mobil uebernimmt die obere Leiste). */
export function SettingsPageHeader({ title, lead }: { title: string; lead?: string }) {
    return (
        <header className="mb-8 hidden sm:block">
            <h2 className="text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-t2-ink">{title}</h2>
            {lead && <p className="mt-0.5 text-t2-ink-3">{lead}</p>}
        </header>
    );
}
