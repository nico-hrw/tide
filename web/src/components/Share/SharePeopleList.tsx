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
    /** Server flag from the shares list (set by an invite with "Darf weiterteilen"). */
    can_reshare?: boolean;
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

/** Colour of a rights level (same hues as the link chips): view blue, edit green, share violet. */
export const permissionTint = (p: SharePermissionValue): string =>
    p === 'view' ? 'var(--perm-view)' : p === 'edit' ? 'var(--perm-edit)' : 'var(--mention-note)';

const avatarStyleOf = (s?: string): 'notionists' | 'openPeeps' => (s === 'openPeeps' ? 'openPeeps' : 'notionists');

/**
 * "Personen mit Zugriff": owner row first, then one row per person with name, origin line and a rights
 * menu (Ansehen / Bearbeiten). The technical `share` permission is shown as "Bearbeiten" plus the
 * "Darf weiterteilen" switch under "Mehr"; the values handed to `onRoleChange` stay view | edit | share.
 */
export function SharePeopleList({ fileId, shares, isOwner, groupIds, groupTitles, updatingUserId, revokingUserId, onRoleChange, onRevoke }: SharePeopleListProps) {
    const t = useT();
    return (
        <ul className="space-y-0.5" aria-label={t('share.people')}>
            {isOwner && (
                <li className="flex items-center gap-2.5 py-1.5">
                    <div className="w-7 h-7 rounded-full bg-t2-sub text-t2-ink font-medium text-xs flex items-center justify-center shrink-0" aria-hidden="true">
                        {t('share.you')[0]}
                    </div>
                    <p className="text-xs font-medium text-t2-ink">{t('share.you')} · {t('share.owner')}</p>
                </li>
            )}
            {shares.map((share) => {
                const name = share.username || share.email || t('share.unknownUser');
                const busy = updatingUserId === share.user_id || revokingUserId === share.user_id;
                const level = share.permission; // 'share' only for legacy rows
                return (
                    <li key={share.user_id} className="py-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <Avatar seed={(share.avatar_seed || share.user_id) + (share.avatar_salt || '')} style={avatarStyleOf(share.avatar_style)} size={28} />
                                <div className="min-w-0">
                                    <p className="text-xs font-medium text-t2-ink truncate">{name}</p>
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
                                        onChange={(e) => onRoleChange(share.user_id, e.target.value as SharePermissionValue)}
                                        style={{ '--chip': permissionTint(level) } as React.CSSProperties}
                                        className="mention-chip text-xs font-medium rounded-[6px] px-2 py-1 cursor-pointer outline-none focus:ring-1 focus:ring-t2-accent transition-colors"
                                    >
                                        <option value="view">{t('share.view')}</option>
                                        <option value="edit">{t('share.edit')}</option>
                                        {share.permission === 'share' && <option value="share">{t('share.legacyFull')}</option>}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => onRevoke(share.user_id)}
                                        disabled={revokingUserId === share.user_id}
                                        className="p-1.5 text-t2-ink-3 hover:text-t2-late hover:bg-t2-sub rounded-[8px] transition-colors disabled:opacity-50"
                                        title={t('share.revoke')}
                                        aria-label={t('share.revoke')}
                                    >
                                        {revokingUserId === share.user_id ? <Loader2 size={14} className="animate-spin text-t2-late" /> : <UserMinus size={14} />}
                                    </button>
                                </div>
                            ) : (
                                <span style={{ '--chip': permissionTint(level) } as React.CSSProperties} className="mention-chip text-xs font-medium rounded-[6px] px-2 py-1 shrink-0">{t(level === 'view' ? 'share.view' : level === 'share' ? 'share.legacyFull' : 'share.edit')}</span>
                            )}
                        </div>
                        {isOwner && share.can_reshare === true && <ReshareState />}
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

/**
 * Read-only: "Darf weiterteilen" was set when the person was invited (can_reshare on the share row).
 * The server can't change it afterwards (PATCH only takes `permission`), and re-sharing is decided by
 * `can_reshare` alone, so rows without the flag show nothing here.
 */
function ReshareState() {
    const t = useT();
    return (
        <label className="mt-2 ml-[42px] flex items-center gap-2 text-xs text-t2-ink">
            <input type="checkbox" checked disabled readOnly className="w-4 h-4 rounded border-t2-line accent-t2-accent" />
            <span>{t('share.canReshare')}</span>
            <span className="text-[11px] text-t2-ink-2">· {t('share.reshareSetAtInvite')}</span>
        </label>
    );
}
