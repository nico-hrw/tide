'use client';

import React from 'react';
import { Users, FileText, Calendar, CheckSquare, Tag } from 'lucide-react';
import Avatar from '@/components/Profile/Avatar';
import { useT } from '@/components/Settings/useT';
import type { SettingsKey } from '@/lib/i18n';
import { GROUP_ORDER, type MentionFilter, type MentionGroupKey } from './mentionGroups';

const CHIP_KEYS: Record<MentionFilter, SettingsKey> = {
    all: 'mention.chipAll',
    person: 'mention.chipPerson',
    note: 'mention.chipNote',
    event: 'mention.chipEvent',
    todo: 'mention.chipTodo',
    tag: 'mention.chipTag',
};
const SECTION_KEYS: Record<MentionGroupKey, SettingsKey> = {
    person: 'mention.secPerson',
    note: 'mention.secNote',
    event: 'mention.secEvent',
    todo: 'mention.secTodo',
    tag: 'mention.secTag',
};
const SECTION_ICONS = { person: Users, note: FileText, event: Calendar, todo: CheckSquare, tag: Tag } as const;

export interface MentionMenuChromeProps {
    filter: MentionFilter;
    onFilterChange: (filter: MentionFilter) => void;
    counts: Partial<Record<MentionGroupKey, number>>;
}

export function MentionMenuChrome({ filter, onFilterChange, counts }: MentionMenuChromeProps) {
    const t = useT();
    const chips: MentionFilter[] = ['all', ...GROUP_ORDER];
    return (
        <div className="flex flex-wrap gap-1 px-1 pt-0.5 pb-1">
            {chips.map((key) => {
                const active = filter === key;
                const disabled = key !== 'all' && !counts[key];
                return (
                    <button
                        key={key}
                        type="button"
                        aria-disabled={disabled && !active}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            if (disabled && !active) return;
                            onFilterChange(key);
                        }}
                        className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                            active
                                ? 'bg-t2-accent text-t2-surface border-t2-accent'
                                : 'border-t2-line text-t2-ink-2 hover:bg-t2-hover aria-disabled:opacity-40'
                        }`}
                    >
                        {t(CHIP_KEYS[key])}
                    </button>
                );
            })}
        </div>
    );
}

export function MentionSectionHeader({ group }: { group: MentionGroupKey }) {
    const t = useT();
    const Icon = SECTION_ICONS[group];
    return (
        <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-t2-ink-3">
            <Icon size={11} aria-hidden="true" />
            <span className="truncate">{t(SECTION_KEYS[group])}</span>
        </div>
    );
}

export function MentionMenuFooter() {
    const t = useT();
    return (
        <div className="px-2 pt-1.5 pb-1 mt-1 border-t border-t2-line-soft text-[11px] text-t2-ink-3">
            {t('mention.footer')}
        </div>
    );
}

interface ContactRowProps {
    id: string;
    username: string;
    avatar: { avatar_seed?: string; avatar_salt?: string; avatar_style?: string };
    shareable: boolean;
}

export function MentionContactRow({ id, username, avatar, shareable }: ContactRowProps) {
    const t = useT();
    return (
        <>
            <Avatar
                seed={(avatar.avatar_seed || id) + (avatar.avatar_salt || '')}
                style={avatar.avatar_style === 'openPeeps' ? 'openPeeps' : 'notionists'}
                size={22}
                className="shrink-0"
            />
            <div
                className="flex items-center justify-between min-w-0 flex-1 gap-1.5"
                title={shareable ? undefined : t('mention.notShareable')}
            >
                <span className="font-medium truncate">{username}</span>
                <span className="text-[11px] text-t2-ink-3 flex-shrink-0 font-normal">@{username}</span>
            </div>
        </>
    );
}
