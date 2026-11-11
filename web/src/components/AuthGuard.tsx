"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useDataStore } from "@/store/useDataStore";
import { normalizePath, getAuthPath } from "@/lib/routeUtils";

const PUBLIC_PATHS = ["/", "/auth", "/verify"];

const isPublic = (path: string) => {
  const clean = normalizePath(path);
  return PUBLIC_PATHS.includes(clean) || clean === "/notes" || clean.startsWith("/notes/") || clean.startsWith("/files/public/");
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
        const checkAuth = async () => {
            if (isPublic(pathname)) {
                setAuthorized(true);
                return;
            }

            const vaultKey = sessionStorage.getItem("tide_session_key") || localStorage.getItem("tide_session_key");
            if (!vaultKey) {
                setAuthorized(false);
                router.push(getAuthPath(pathname));
                return;
            }

            try {
                const { apiFetch } = await import("@/lib/api");
                const res = await apiFetch("/api/v1/auth/me");
                if (res.ok) {
                    setAuthorized(true);
                } else {
                    setAuthorized(false);
                    sessionStorage.clear();
                    localStorage.removeItem("tide_session_token");
                    router.push(getAuthPath(pathname));
                }
            } catch (err) {
                console.error("Auth check failed:", err);
                // If offline, maybe allow if vault key exists?
                setAuthorized(true); 
            }
        };

        checkAuth();
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
