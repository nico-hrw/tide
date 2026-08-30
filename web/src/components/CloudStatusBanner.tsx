"use client";

import React, { useEffect, useState } from 'react';
import { CloudOff, RefreshCw, CheckCircle2, Wifi, ArrowUpRight } from 'lucide-react';
import { flushSyncQueue, getSyncQueue, initSyncQueueListener } from '@/lib/syncQueue';

export default function CloudStatusBanner() {
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [isCloudUnreachable, setIsCloudUnreachable] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [justSynced, setJustSynced] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);

    useEffect(() => {
        initSyncQueueListener();

        // Check initial queue count
        getSyncQueue().then(queue => {
            setPendingCount(queue.length);
        });

        const handleOnline = () => {
            setIsOnline(true);
            setIsCloudUnreachable(false);
            setIsDismissed(false);
        };

        const handleOffline = () => {
            setIsOnline(false);
            setIsCloudUnreachable(true);
            setIsDismissed(false);
        };

        const handleTideOffline = () => {
            setIsCloudUnreachable(true);
            setIsDismissed(false);
        };

        const handleTideOnline = () => {
            setIsCloudUnreachable(false);
        };

        const handleQueueUpdated = (e: Event) => {
            const count = (e as CustomEvent)?.detail?.pendingCount ?? 0;
            setPendingCount(count);
            if (count > 0) {
                setIsDismissed(false);
            }
        };

        const handleSyncing = () => {
            setIsSyncing(true);
            setJustSynced(false);
        };

        const handleSynced = (e: Event) => {
            setIsSyncing(false);
            const success = (e as CustomEvent)?.detail?.success ?? 0;
            if (success > 0) {
                setJustSynced(true);
                setTimeout(() => {
                    setJustSynced(false);
                }, 3500);
            }
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('tide-offline', handleTideOffline);
        window.addEventListener('tide-online', handleTideOnline);
        window.addEventListener('tide-sync-queue-updated', handleQueueUpdated);
        window.addEventListener('tide-syncing', handleSyncing);
        window.addEventListener('tide-synced', handleSynced);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('tide-offline', handleTideOffline);
            window.removeEventListener('tide-online', handleTideOnline);
            window.removeEventListener('tide-sync-queue-updated', handleQueueUpdated);
            window.removeEventListener('tide-syncing', handleSyncing);
            window.removeEventListener('tide-synced', handleSynced);
        };
    }, []);

    const showOffline = (!isOnline || isCloudUnreachable) && !justSynced;

    if (isDismissed && !isSyncing && !justSynced) {
        // Render tiny subtle indicator pill in bottom-right if dismissed but still offline
        if (showOffline || pendingCount > 0) {
            return (
                <button
                    onClick={() => setIsDismissed(false)}
                    className="fixed bottom-4 right-4 z-[999] flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-medium backdrop-blur-md shadow-lg hover:bg-amber-500/25 transition-all"
                    title="Offline-Status anzeigen"
                >
                    <CloudOff size={13} />
                    <span>Offline {pendingCount > 0 ? `(${pendingCount})` : ''}</span>
                </button>
            );
        }
        return null;
    }

    if (!showOffline && !isSyncing && !justSynced && pendingCount === 0) {
        return null;
    }

    return (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[999] pointer-events-auto max-w-md w-[calc(100%-2rem)] transition-all animate-in fade-in slide-in-from-top-2 duration-200">
            {showOffline ? (
                <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/25 backdrop-blur-xl shadow-xl text-amber-900 dark:text-amber-200 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                            <CloudOff size={13} className="text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="font-semibold truncate">
                                Cloud nicht erreichbar · Offline-Stand aktiv
                            </span>
                            <span className="text-[11px] text-amber-700/80 dark:text-amber-300/80 truncate">
                                {pendingCount > 0 
                                    ? `${pendingCount} Änderung${pendingCount > 1 ? 'en' : ''} werden lokal gespeichert & später synchronisiert`
                                    : 'Du kannst nahtlos weiterarbeiten, Daten werden lokal gesichert'}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                            onClick={() => flushSyncQueue()}
                            disabled={isSyncing}
                            className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 font-medium transition-colors flex items-center gap-1"
                            title="Verbindung prüfen und synchronisieren"
                        >
                            <RefreshCw size={11} className={isSyncing ? 'animate-spin' : ''} />
                            <span>Prüfen</span>
                        </button>
                        <button
                            onClick={() => setIsDismissed(true)}
                            className="p-1 rounded-md text-amber-700/60 hover:text-amber-800 dark:text-amber-300/60 dark:hover:text-amber-200 transition-colors"
                            title="Ausblenden"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            ) : isSyncing ? (
                <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-2xl bg-purple-500/10 dark:bg-purple-500/15 border border-purple-500/25 backdrop-blur-xl shadow-xl text-purple-900 dark:text-purple-200 text-xs">
                    <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                            <RefreshCw size={13} className="animate-spin text-purple-600 dark:text-purple-400" />
                        </div>
                        <span className="font-medium">
                            Synchronisiere {pendingCount} Änderung{pendingCount > 1 ? 'en' : ''} mit der Cloud...
                        </span>
                    </div>
                </div>
            ) : justSynced ? (
                <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/25 backdrop-blur-xl shadow-xl text-emerald-900 dark:text-emerald-200 text-xs">
                    <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                            <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <span className="font-medium">
                            Alle Daten erfolgreich synchronisiert
                        </span>
                    </div>
                    <button
                        onClick={() => setJustSynced(false)}
                        className="p-1 rounded-md text-emerald-700/60 hover:text-emerald-800 dark:text-emerald-300/60 transition-colors"
                    >
                        ✕
                    </button>
                </div>
            ) : null}
        </div>
    );
}
