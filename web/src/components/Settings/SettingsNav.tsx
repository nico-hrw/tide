import React from 'react';
import { Calendar, CheckSquare, ChevronRight, FileText, Info, KeyRound, Layers, Palette, Puzzle, Tag, User } from 'lucide-react';
import { ABOUT_PAGE, NAV_GROUPS, type SettingsPageId } from './settingsPages';
import { cx } from './ui/cx';
import { useT } from './useT';

const ICONS: Record<SettingsPageId, React.ComponentType<{ className?: string }>> = {
    account: User,
    appearance: Palette,
    calendar: Calendar,
    tags: Tag,
    notes: FileText,
    todos: CheckSquare,
    workspaces: Layers,
    extensions: Puzzle,
    access: KeyRound,
    about: Info,
};

export interface SettingsNavProps {
    active: SettingsPageId;
    onSelect: (page: SettingsPageId) => void;
}

function NavButton({ page, active, onSelect, muted }: { page: SettingsPageId; active: boolean; onSelect: (p: SettingsPageId) => void; muted?: boolean }) {
    const t = useT();
    const Icon = ICONS[page];
    return (
        <button
            type="button"
            onClick={() => onSelect(page)}
            aria-current={active ? 'page' : undefined}
            className={cx(
                'flex w-full items-center gap-2.5 rounded-ui px-3 py-3 text-left text-[14px] text-t2-ink-2 transition-colors hover:bg-t2-hover sm:px-2.5 sm:py-2 sm:text-[14px]',
                active && 'sm:bg-t2-hover sm:font-semibold sm:text-t2-ink',
                muted && 'sm:text-[13px] sm:text-t2-ink-3 sm:hover:text-t2-ink',
            )}
        >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className="min-w-0 truncate">{t(`nav.${page}`)}</span>
            <ChevronRight className="ml-auto h-[15px] w-[15px] shrink-0 text-t2-ink-3 sm:hidden" aria-hidden />
        </button>
    );
}

/** Seitenleiste mit Zwischenueberschriften; mobil eine Liste gruppierter Karten. */
export function SettingsNav({ active, onSelect }: SettingsNavProps) {
    const t = useT();
    return (
        <nav aria-label={t('nav.label')} className="flex min-h-0 flex-1 flex-col">
            {NAV_GROUPS.map((g) => (
                <div key={g.id}>
                    <div className="px-1.5 pb-1.5 pt-[18px] text-[11.5px] font-semibold uppercase tracking-[0.05em] text-t2-ink-3 sm:px-2.5 sm:pb-[5px] sm:pt-3.5">{t(`navGroup.${g.id}`)}</div>
                    <div className="flex flex-col gap-0.5 rounded-card bg-t2-surface p-1 ring-1 ring-t2-line sm:rounded-none sm:bg-transparent sm:p-0 sm:ring-0">
                        {g.pages.map((p) => (
                            <NavButton key={p} page={p} active={active === p} onSelect={onSelect} />
                        ))}
                    </div>
                </div>
            ))}
            <div className="mt-6 sm:mt-auto sm:border-t sm:border-t2-line sm:pt-2">
                <div className="flex flex-col gap-0.5 rounded-card bg-t2-surface p-1 ring-1 ring-t2-line sm:rounded-none sm:bg-transparent sm:p-0 sm:ring-0">
                    <NavButton page={ABOUT_PAGE} active={active === ABOUT_PAGE} onSelect={onSelect} muted />
                </div>
            </div>
        </nav>
    );
}
