'use client';

import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { useT } from '@/components/Settings/useT';
import { useDataStore } from '@/store/useDataStore';
import { askConfirm, notifyError } from '@/lib/feedback';
import { isOwnedEvent } from '@/lib/calendarShare';
import { groupRecipientsWithShare, revokeEventShares } from '@/lib/calendarShareActions';

export interface EventPrivateToggleProps {
    eventId: string;
    isPrivate: boolean;
    /** Persists `private` on the event (EventPopover's strict onEventSave); rejects when the save failed. */
    onChange: (next: boolean) => void | Promise<void>;
}

/**
 * The event lock ("Privat halten", `metadata.private`): excludes the event from its calendars' share rules.
 * Turning it on asks first when people of those calendars already have the event, then revokes their access.
 * Only shown for own events: changing or revoking shares is owner-only.
 */
export function EventPrivateToggle({ eventId, isPrivate, onChange }: EventPrivateToggleProps) {
    const t = useT();
    const baseId = eventId.split('_')[0];
    const owned = useDataStore((s) => {
        const e = (s.events as unknown as Array<{ id: string; owner_id?: string; share_status?: string }>).find((x) => x.id === baseId);
        return !!e && isOwnedEvent(e, s.myId);
    });
    const [busy, setBusy] = useState(false);
    if (!owned) return null;

    const toggle = async () => {
        if (busy) return;
        if (isPrivate) {
            try { await onChange(false); } catch { notifyError(t('calShare.privateSaveFailed')); }
            return;
        }
        setBusy(true);
        try {
            const holders = await groupRecipientsWithShare(baseId);
            if (holders === null) { notifyError(t('calShare.loadFailed')); return; }
            if (holders.length > 0) {
                const yes = await askConfirm({
                    title: t('calShare.privateAsk', { count: holders.length }),
                    confirmLabel: t('calShare.privateConfirm'),
                    cancelLabel: t('calShare.cancel'),
                    tone: 'danger',
                });
                if (!yes) return;
            }
            try {
                await onChange(true);
            } catch {
                // Not saved as private: revoking now would leave a "shared" event without access, so nothing is revoked.
                notifyError(t('calShare.privateSaveFailed'));
                return;
            }
            if (holders.length > 0) {
                const res = await revokeEventShares(baseId, holders);
                if (res.failed > 0) notifyError(t('calShare.privateRevokeFailed', { count: res.failed }));
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex items-center justify-between rounded-xl px-1 py-1.5">
            <div className="flex items-center gap-2">
                <div className={`rounded-lg p-1.5 ${isPrivate ? 'bg-t2-sub text-t2-accent' : 'bg-t2-hover text-t2-ink-3'}`}>
                    <Lock size={12} aria-hidden />
                </div>
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-t2-ink">{t('calShare.private')}</span>
                    <span className="text-[11px] text-t2-ink-3">{t('calShare.privateHint')}</span>
                </div>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={isPrivate}
                aria-label={t('calShare.private')}
                disabled={busy}
                onClick={() => void toggle()}
                className={`relative h-5 w-8 rounded-full transition-all duration-300 disabled:opacity-50 ${isPrivate ? 'bg-t2-accent' : 'bg-t2-stage'}`}
            >
                <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-t2-surface shadow-sm transition-transform duration-300 ${isPrivate ? 'translate-x-3' : 'translate-x-0'}`} />
            </button>
        </div>
    );
}
