"use client";

import React from 'react';
import { Eye } from 'lucide-react';
import Avatar from '@/components/Profile/Avatar';
import { useT } from '@/components/Settings/useT';

interface ContactProfileCardProps {
    userId: string;
    username: string;
    avatarSeed: string;
    avatarStyle: 'notionists' | 'openPeeps';
    shared: boolean;
    alignRight?: boolean;
    /** What is shared: a note (default) or an event */
    kind?: 'note' | 'event';
    onOpenProfile: () => void;
}

/** Small card under a contact mention chip: avatar, name, access line and a profile button. */
export function ContactProfileCard({ userId, username, avatarSeed, avatarStyle, shared, alignRight, kind, onOpenProfile }: ContactProfileCardProps) {
    const t = useT();
    return (
        <div
            data-contact-card
            role="dialog"
            aria-label={username}
            contentEditable={false}
            className={`absolute ${alignRight ? 'right-0' : 'left-0'} top-full mt-1.5 z-50 w-56 p-3 rounded-2xl border border-t2-line bg-t2-surface shadow-float text-t2-ink font-normal text-left whitespace-normal`}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className="flex items-center gap-3">
                <Avatar seed={avatarSeed || userId} style={avatarStyle} size={48} />
                <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{username}</div>
                    <div className="text-xs text-t2-ink-3 truncate">@{username} · {t('mention.contactLabel')}</div>
                </div>
            </div>
            {shared && (
                <div className="mt-2.5 flex items-center gap-1.5 text-xs text-t2-ink-2">
                    <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{t(kind === 'event' ? 'mention.canViewEvent' : 'mention.canView')}</span>
                </div>
            )}
            <button
                type="button"
                data-contact-open-profile
                onClick={onOpenProfile}
                className="mt-3 w-full px-3 py-1.5 rounded-xl bg-t2-accent text-t2-accent-ink text-xs font-semibold hover:opacity-90 transition-opacity"
            >
                {t('mention.openProfile')}
            </button>
        </div>
    );
}

export default ContactProfileCard;
