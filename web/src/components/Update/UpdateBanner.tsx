'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
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

function isAuthOrLoginRoute(path: string | null): boolean {
    const current = path ?? (typeof window !== 'undefined' ? window.location.pathname : '');
    if (!current) return false;
    return current.startsWith('/auth') || current.startsWith('/login');
}

function hasAuthToken(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const tokenKeys = [
            'tide_session_token',
            'tide_session_key',
            'token',
            'session_token',
            'auth_token',
        ];
        return tokenKeys.some(key => {
            const lVal = localStorage.getItem(key);
            const sVal = sessionStorage.getItem(key);
            return (lVal !== null && lVal !== '') || (sVal !== null && sVal !== '');
        });
    } catch {
        return false;
    }
}

function isVersionDismissed(version: string): boolean {
    if (typeof window === 'undefined' || !version) return false;
    try {
        const cleanVersion = version.replace(/^v/i, '');
        if (
            localStorage.getItem(`dismissed_${version}`) ||
            localStorage.getItem(`dismissed_${cleanVersion}`) ||
            localStorage.getItem(`dismissed_v${cleanVersion}`)
        ) {
            return true;
        }
        if (version === getStoredDismissedVersion() || cleanVersion === getStoredDismissedVersion()) {
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

function persistDismissedVersion(version: string): void {
    if (typeof window === 'undefined' || !version) return;
    try {
        const cleanVersion = version.replace(/^v/i, '');
        localStorage.setItem(`dismissed_${version}`, 'true');
        localStorage.setItem(`dismissed_${cleanVersion}`, 'true');
        setStoredDismissedVersion(version);
    } catch {
        // Ignore storage errors
    }
}

export default function UpdateBanner() {
    const pathname = usePathname();
    const [mounted, setMounted] = useState<boolean>(false);
    const [authTokenPresent, setAuthTokenPresent] = useState<boolean>(false);

    const [bannerState, setBannerState] = useState<BannerState>(() => {
        if (typeof window !== 'undefined' && checkAndClearPostUpdateFlag()) {
            return 'success';
        }
        return 'idle';
    });
    const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
    const remoteVersionRef = useRef<string | null>(null);
    const [isUpdating, setIsUpdating] = useState<boolean>(false);
    const [isMobile, setIsMobile] = useState<boolean>(false);
    const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setMounted(true);
        setAuthTokenPresent(hasAuthToken());
    }, [pathname]);

    // Track responsive layout for starting coordinate of the ascending sphere
    useEffect(() => {
        const updateIsMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        updateIsMobile();
        window.addEventListener('resize', updateIsMobile);
        return () => window.removeEventListener('resize', updateIsMobile);
    }, []);

    // If on auth/login or no token, ensure any active banner state is reset
    useEffect(() => {
        if (mounted && (isAuthOrLoginRoute(pathname) || !authTokenPresent)) {
            setBannerState(prev => {
                if (prev === 'ascending') {
                    window.dispatchEvent(
                        new CustomEvent('tide:bubble_traversing', { detail: { active: false } })
                    );
                }
                return 'idle';
            });
        }
    }, [mounted, pathname, authTokenPresent]);

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
        if (isAuthOrLoginRoute(pathname) || !hasAuthToken()) {
            return;
        }
        if (isVersionDismissed(newVer)) {
            return;
        }
        remoteVersionRef.current = newVer;
        setRemoteVersion(newVer);
        setBannerState(prev => {
            if (prev === 'banner' || prev === 'ascending') return prev;
            window.dispatchEvent(
                new CustomEvent('tide:bubble_traversing', { detail: { active: true } })
            );
            return 'ascending';
        });
    }, [pathname]);

    const checkForUpdate = useCallback(async () => {
        if (isAuthOrLoginRoute(pathname) || !hasAuthToken()) {
            return;
        }
        try {
            const res = await apiFetch('/api/v1/version');
            if (res.ok) {
                const data = await res.json();
                const version = data?.version;
                if (
                    version &&
                    isNewerVersion(version, CURRENT_APP_VERSION) &&
                    !isVersionDismissed(version)
                ) {
                    triggerUpdate(version);
                }
            }
        } catch {
            // Silently ignore network or offline failures
        }
    }, [pathname, triggerUpdate]);

    useEffect(() => {
        if (!mounted || isAuthOrLoginRoute(pathname) || !authTokenPresent) {
            return;
        }

        const initialTimer = setTimeout(() => {
            void checkForUpdate();
        }, 500);

        // Periodic background version check every 15 minutes
        const interval = setInterval(checkForUpdate, 15 * 60 * 1000);

        const handleAppUpdate = (event: Event) => {
            if (isAuthOrLoginRoute(pathname) || !hasAuthToken()) {
                return;
            }
            const customEvent = event as CustomEvent;
            const version = customEvent.detail?.version || customEvent.detail?.data?.version;
            if (version) {
                if (
                    isNewerVersion(version, CURRENT_APP_VERSION) &&
                    !isVersionDismissed(version)
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
    }, [mounted, pathname, authTokenPresent, checkForUpdate, triggerUpdate]);

    const handleReload = () => {
        setIsUpdating(true);
        const versionToDismiss = remoteVersion || remoteVersionRef.current;
        if (versionToDismiss) {
            persistDismissedVersion(versionToDismiss);
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
        const versionToDismiss = remoteVersion || remoteVersionRef.current;
        if (versionToDismiss) {
            persistDismissedVersion(versionToDismiss);
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

    if (!mounted || isAuthOrLoginRoute(pathname) || !authTokenPresent) {
        return null;
    }

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
