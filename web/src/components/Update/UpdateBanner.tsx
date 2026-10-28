'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2 } from 'lucide-react';
import {
    CURRENT_APP_VERSION,
    getStoredDismissedVersion,
    setStoredDismissedVersion,
    setPostUpdateFlag,
    checkAndClearPostUpdateFlag,
    isNewerVersion,
} from '@/lib/version';
import { apiFetch } from '@/lib/api';

type BannerState = 'idle' | 'ascending' | 'banner' | 'success';

export default function UpdateBanner() {
    const [bannerState, setBannerState] = useState<BannerState>(() => {
        if (typeof window !== 'undefined' && checkAndClearPostUpdateFlag()) {
            return 'success';
        }
        return 'idle';
    });
    const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
    const [isUpdating, setIsUpdating] = useState<boolean>(false);
    const [isMobile, setIsMobile] = useState<boolean>(false);
    const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Track responsive layout for starting coordinate of the ascending sphere
    useEffect(() => {
        const updateIsMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        updateIsMobile();
        window.addEventListener('resize', updateIsMobile);
        return () => window.removeEventListener('resize', updateIsMobile);
    }, []);

    // Handle auto-dismissal if initialized in success state
    useEffect(() => {
        if (bannerState === 'success') {
            successTimerRef.current = setTimeout(() => {
                setBannerState('idle');
            }, 3500);
            return () => {
                if (successTimerRef.current) clearTimeout(successTimerRef.current);
            };
        }
    }, [bannerState]);

    const triggerUpdate = useCallback((newVer: string) => {
        setRemoteVersion(newVer);
        setBannerState(prev => {
            if (prev === 'banner' || prev === 'ascending') return prev;
            window.dispatchEvent(
                new CustomEvent('tide:bubble_traversing', { detail: { active: true } })
            );
            return 'ascending';
        });
    }, []);

    const checkForUpdate = useCallback(async () => {
        try {
            const res = await apiFetch('/api/v1/version');
            if (res.ok) {
                const data = await res.json();
                const version = data?.version;
                if (
                    version &&
                    isNewerVersion(version, CURRENT_APP_VERSION) &&
                    version !== getStoredDismissedVersion()
                ) {
                    triggerUpdate(version);
                }
            }
        } catch {
            // Silently ignore network or offline failures
        }
    }, [triggerUpdate]);

    useEffect(() => {
        const initialTimer = setTimeout(() => {
            void checkForUpdate();
        }, 500);

        // Periodic background version check every 15 minutes
        const interval = setInterval(checkForUpdate, 15 * 60 * 1000);

        const handleAppUpdate = (event: Event) => {
            const customEvent = event as CustomEvent;
            const version = customEvent.detail?.version || customEvent.detail?.data?.version;
            if (version) {
                if (
                    isNewerVersion(version, CURRENT_APP_VERSION) &&
                    version !== getStoredDismissedVersion()
                ) {
                    triggerUpdate(version);
                }
            } else {
                void checkForUpdate();
            }
        };

        window.addEventListener('tide:app_update', handleAppUpdate);

        return () => {
            clearTimeout(initialTimer);
            clearInterval(interval);
            window.removeEventListener('tide:app_update', handleAppUpdate);
            window.dispatchEvent(
                new CustomEvent('tide:bubble_traversing', { detail: { active: false } })
            );
        };
    }, [checkForUpdate, triggerUpdate]);

    const handleReload = () => {
        setIsUpdating(true);
        if (remoteVersion) {
            setStoredDismissedVersion(remoteVersion);
        }
        setPostUpdateFlag();
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(regs => {
                regs.forEach(reg => reg.waiting?.postMessage({ type: 'SKIP_WAITING' }));
            });
        }
        window.location.reload();
    };

    const handleDismiss = useCallback(() => {
        if (remoteVersion) {
            setStoredDismissedVersion(remoteVersion);
        }
        setBannerState('idle');
    }, [remoteVersion]);

    // Auto-dismiss banner after 10s
    useEffect(() => {
        if (bannerState === 'banner') {
            const timer = setTimeout(() => {
                handleDismiss();
            }, 10000);
            return () => clearTimeout(timer);
        }
    }, [bannerState, handleDismiss]);

    return (
        <AnimatePresence>
            {bannerState === 'ascending' && (
                <motion.div
                    key="bubble-ascend"
                    initial={{
                        bottom: isMobile ? '24px' : '40px',
                        left: isMobile ? '50%' : '20px',
                        x: isMobile ? '-50%' : '0%',
                        top: 'auto',
                        scale: 1,
                        opacity: 1,
                    }}
                    animate={{
                        bottom: isMobile ? '96px' : '260px',
                        left: isMobile ? '50%' : '20px',
                        x: isMobile ? '-50%' : '0%',
                        top: 'auto',
                        scale: 1,
                        opacity: 1,
                    }}
                    transition={{
                        duration: 1.1,
                        ease: [0.16, 1, 0.3, 1],
                    }}
                    onAnimationComplete={() => {
                        window.dispatchEvent(
                            new CustomEvent('tide:bubble_traversing', { detail: { active: false } })
                        );
                        setBannerState('banner');
                    }}
                    className="fixed z-[10000] pointer-events-none w-9 h-9 rounded-full bg-gray-900 text-white ring-1 ring-white/20 shadow-2xl flex items-center justify-center"
                >
                    <span className="text-base leading-none select-none">⚡</span>
                </motion.div>
            )}

            {bannerState === 'banner' && (
                <motion.div
                    key="update-banner"
                    initial={{ scale: 0.3, opacity: 0.8 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                    className="fixed bottom-24 md:bottom-[260px] left-1/2 md:left-4 -translate-x-1/2 md:translate-x-0 z-[10000] w-[90%] md:w-auto md:max-w-md bg-gray-900 text-white rounded-full pl-4 pr-2 py-1.5 flex items-center gap-3 shadow-2xl ring-1 ring-white/10"
                >
                    <span className="text-base leading-none select-none">⚡</span>
                    <span className="text-sm font-medium tracking-wide truncate">
                        Ein neues Update ist verfügbar
                    </span>
                    <div className="flex-grow" />
                    <button
                        onClick={handleReload}
                        disabled={isUpdating}
                        className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-full px-3 py-1 transition-colors whitespace-nowrap disabled:opacity-50 shadow-sm"
                    >
                        {isUpdating ? 'Wird geladen...' : 'Aktualisieren'}
                    </button>
                    <button
                        onClick={handleDismiss}
                        title="Schließen"
                        className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10 ml-1 shrink-0"
                    >
                        <X size={16} />
                    </button>
                </motion.div>
            )}

            {bannerState === 'success' && (
                <motion.div
                    key="success-banner"
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                    className="fixed bottom-24 md:bottom-[260px] left-1/2 md:left-4 -translate-x-1/2 md:translate-x-0 z-[10000] pointer-events-auto"
                >
                    <div className="bg-gray-900 text-white rounded-full pl-4 pr-4 py-1.5 flex items-center gap-2.5 shadow-2xl ring-1 ring-white/10">
                        <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                        <span className="text-sm font-medium tracking-wide">Erfolgreich geupdated!</span>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export { UpdateBanner };
