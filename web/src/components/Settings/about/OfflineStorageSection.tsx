"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { SettingsCard, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { ConfirmButton } from '../ui/Controls';
import { useLocale, useT } from '../useT';
import {
    clearOfflineData,
    getLastMirroredAt,
    getOfflineUserId,
    getStorageStatus,
    type StorageStatus,
} from '@/lib/offline/store';

function formatBytes(n: number | null): string {
    if (n === null) return '–';
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Small settings block: how much the offline copy uses, whether the browser keeps it, and a delete button. */
export function OfflineStorageSection() {
    const t = useT();
    const locale = useLocale();
    const [status, setStatus] = useState<StorageStatus | null>(null);
    const [lastAt, setLastAt] = useState<number | null>(null);
    const [cleared, setCleared] = useState(false);

    const refresh = useCallback(async () => {
        setStatus(await getStorageStatus());
        setLastAt(await getLastMirroredAt());
    }, []);

    useEffect(() => {
        let alive = true;
        void Promise.all([getStorageStatus(), getLastMirroredAt()]).then(([st, at]) => {
            if (!alive) return;
            setStatus(st);
            setLastAt(at);
        });
        return () => {
            alive = false;
        };
    }, []);

    const handleClear = async () => {
        await clearOfflineData(getOfflineUserId());
        setCleared(true);
        await refresh();
    };

    const usage = status?.supported
        ? `${formatBytes(status.usage)} / ${formatBytes(status.quota)}`
        : t('offline.unsupported');
    const persistent = status?.persisted === null || status === null
        ? t('offline.unsupported')
        : status.persisted
            ? t('offline.persistentYes')
            : t('offline.persistentNo');

    return (
        <SettingsSection title={t('offline.title')} hint={t('offline.hint')}>
            <SettingsCard>
                <SettingsRow title={t('offline.usage')} description={t('offline.usageDesc')}>
                    <span className="font-mono text-[12.5px] text-t2-ink-2">{usage}</span>
                </SettingsRow>
                <SettingsRow title={t('offline.persistent')}>
                    <span className="text-[12.5px] text-t2-ink-2">{persistent}</span>
                </SettingsRow>
                <SettingsRow title={t('offline.lastSync')}>
                    <span className="text-[12.5px] text-t2-ink-2">
                        {lastAt ? new Date(lastAt).toLocaleString(locale) : t('offline.lastSyncNone')}
                    </span>
                </SettingsRow>
                <SettingsRow
                    title={t('offline.clear')}
                    description={cleared ? t('offline.cleared') : t('offline.clearDesc')}
                >
                    <ConfirmButton label={t('offline.clear')} confirmLabel={t('offline.clearConfirm')} onConfirm={handleClear} />
                </SettingsRow>
            </SettingsCard>
        </SettingsSection>
    );
}
