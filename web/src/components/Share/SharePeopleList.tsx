'use client';

import React from 'react';
import { Loader2, UserMinus } from 'lucide-react';
import Avatar from '@/components/Profile/Avatar';
import { useT } from '@/components/Settings/useT';
import { useShareOriginText } from './ShareOriginLabel';

export type SharePermissionValue = 'view' | 'edit' | 'share';

export interface SharePerson {
    user_id: string;
    status: string;
    permission: SharePermissionValue;
    username?: string;
    email?: string;
    avatar_seed?: string;
    avatar_salt?: string;
    avatar_style?: string;
}

export interface SharePeopleListProps {
    fileId: string;
    shares: SharePerson[];
    /** Only the owner sees rights menus and removal (the server enforces owner-only). */
    isOwner: boolean;
    groupIds: string[];
    groupTitles?: Record<string, string>;
    updatingUserId?: string | null;
    revokingUserId?: string | null;
    onRoleChange: (userId: string, permission: SharePermissionValue) => void;
    onRevoke: (userId: string) => void;
}

const avatarStyleOf = (s?: string): 'notionists' | 'openPeeps' => (s === 'openPeeps' ? 'openPeeps' : 'notionists');

/**
 * "Personen mit Zugriff": owner row first, then one row per person with name, origin line and a rights
 * menu (Ansehen / Bearbeiten). The technical `share` permission is shown as "Bearbeiten" plus the
 * "Darf weiterteilen" switch under "Mehr"; the values handed to `onRoleChange` stay view | edit | share.
 */
export function SharePeopleList({ fileId, shares, isOwner, groupIds, groupTitles, updatingUserId, revokingUserId, onRoleChange, onRevoke }: SharePeopleListProps) {
    const t = useT();
    return (
        <ul className="space-y-2" aria-label={t('share.people')}>
            {isOwner && (
                <li className="flex items-center gap-2.5 p-3 rounded-[12px] bg-t2-surface border border-t2-line">
                    <div className="w-8 h-8 rounded-full bg-t2-sub text-t2-ink font-bold text-xs flex items-center justify-center shrink-0" aria-hidden="true">
                        {t('share.you')[0]}
                    </div>
                    <p className="text-xs font-semibold text-t2-ink">{t('share.you')} · {t('share.owner')}</p>
                </li>
            )}
            {shares.map((share) => {
                const name = share.username || share.email || t('share.unknownUser');
                const busy = updatingUserId === share.user_id || revokingUserId === share.user_id;
                const level = share.permission === 'view' ? 'view' : 'edit';
                return (
                    <li key={share.user_id} className="p-3 rounded-[12px] bg-t2-surface border border-t2-line">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <Avatar seed={(share.avatar_seed || share.user_id) + (share.avatar_salt || '')} style={avatarStyleOf(share.avatar_style)} size={32} />
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-t2-ink truncate">{name}</p>
                                    <p className="text-[11px] text-t2-ink-2">
                                        {share.status === 'accepted' ? t('share.accepted') : t('share.pending')}
                                        <ShareOriginSeparated fileId={fileId} userId={share.user_id} groupIds={groupIds} groupTitles={groupTitles} />
                                    </p>
                                </div>
                            </div>
                            {isOwner ? (
                                <div className="flex items-center gap-2 shrink-0">
                                    <select
                                        value={level}
                                        disabled={busy}
                                        aria-label={t('share.rightsFor', { name })}
                                        onChange={(e) => onRoleChange(share.user_id, e.target.value === 'view' ? 'view' : share.permission === 'share' ? 'share' : 'edit')}
                                        className="text-xs bg-t2-sub hover:bg-t2-hover text-t2-ink font-medium rounded-[8px] px-2.5 py-1.5 border border-t2-line cursor-pointer outline-none focus:ring-1 focus:ring-t2-accent transition-colors"
                                    >
                                        <option value="view">{t('share.view')}</option>
                                        <option value="edit">{t('share.edit')}</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => onRevoke(share.user_id)}
                                        disabled={revokingUserId === share.user_id}
                                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-[8px] border border-rose-200 transition-colors disabled:opacity-50"
                                        title={t('share.revoke')}
                                        aria-label={t('share.revoke')}
                                    >
                                        {revokingUserId === share.user_id ? <Loader2 size={14} className="animate-spin text-rose-500" /> : <UserMinus size={14} />}
                                    </button>
                                </div>
                            ) : (
                                <span className="text-xs text-t2-ink-2 shrink-0">{t(level === 'view' ? 'share.view' : 'share.edit')}</span>
                            )}
                        </div>
                        {isOwner && level === 'edit' && (
                            <details className="mt-2 ml-[42px]">
                                <summary className="text-[11px] text-t2-ink-2 cursor-pointer select-none">{t('share.more')}</summary>
                                <label className="mt-1.5 flex items-center gap-2 text-xs text-t2-ink cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={share.permission === 'share'}
                                        disabled={busy}
                                        onChange={(e) => onRoleChange(share.user_id, e.target.checked ? 'share' : 'edit')}
                                        className="w-4 h-4 rounded border-t2-line accent-t2-accent"
                                    />
                                    {t('share.canReshare')}
                                </label>
                            </details>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

/** " · origin" after the status text; nothing when the person has no origin. */
function ShareOriginSeparated(props: { fileId: string; userId: string; groupIds: string[]; groupTitles?: Record<string, string> }) {
    const text = useShareOriginText(props);
    return text ? <> · {text}</> : null;
}
