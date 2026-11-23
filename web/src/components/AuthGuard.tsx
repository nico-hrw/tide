"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useDataStore } from "@/store/useDataStore";
import { normalizePath, getAuthPath } from "@/lib/routeUtils";
import { getMasterKey } from "@/lib/keyStorage";
import { apiFetch, clearAllSessionData } from "@/lib/api";
import { idb } from "@/lib/idb";

const PUBLIC_PATHS = ["/", "/auth", "/verify"];

const isPublic = (path: string) => {
  const clean = normalizePath(path);
  return PUBLIC_PATHS.includes(clean) || clean === "/notes" || clean.startsWith("/notes/") || clean.startsWith("/files/public/") || clean === "/docs/api" || clean.startsWith("/docs/api/");
};

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [authorized, setAuthorized] = useState(false);

    const theme = useDataStore(s => s.theme);
    const themePreference = useDataStore(s => s.themePreference);
    const setThemePreference = useDataStore(s => s.setThemePreference);

    useEffect(() => {
        // Initialize theme class
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    // Listen for OS color-scheme changes when preference is 'system'
    useEffect(() => {
        if (themePreference !== 'system') return;
        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => setThemePreference('system'); // re-resolve
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
    }, [themePreference, setThemePreference]);

    useEffect(() => {
        let cancelled = false;

        const checkAuth = async () => {
            if (isPublic(pathname)) {
                if (!cancelled) setAuthorized(true);
                return;
            }

            const masterKey = await getMasterKey();
            if (cancelled) return;

            if (!masterKey) {
                setAuthorized(false);
                await clearAllSessionData({ callServerLogout: false });
                if (!cancelled) {
                    router.push(getAuthPath(pathname));
                }
                return;
            }

            try {
                const res = await apiFetch("/api/v1/auth/me");
                if (cancelled) return;

                if (res.ok) {
                    setAuthorized(true);
                } else {
                    setAuthorized(false);
                    await clearAllSessionData({ callServerLogout: false });
                    if (!cancelled) {
                        router.push(getAuthPath(pathname));
                    }
                }
            } catch (err) {
                console.error("Auth check failed:", err);
                if (cancelled) return;

                const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
                const hasOfflineCache = isOffline || Boolean(await idb.get("api_cache_/api/v1/auth/me"));
                if (cancelled) return;

                if (masterKey && hasOfflineCache) {
                    setAuthorized(true);
                } else {
                    setAuthorized(false);
                    router.push(getAuthPath(pathname));
                }
            }
        };

        void checkAuth();

        return () => {
            cancelled = true;
        };
    }, [pathname, router]);

    // Prevent flash of content
    if (!authorized) {
        if (isPublic(pathname)) {
            return <>{children}</>;
        }
        return null;
    }

    return <>{children}</>;
}
