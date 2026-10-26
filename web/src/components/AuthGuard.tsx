"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useDataStore } from "@/store/useDataStore";

const PUBLIC_PATHS = ["/", "/auth", "/verify"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [authorized, setAuthorized] = useState(false);

    const { theme, themePreference, setThemePreference } = useDataStore();

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
            const isPublic = PUBLIC_PATHS.includes(pathname);
            if (isPublic) {
                setAuthorized(true);
                return;
            }

            const vaultKey = sessionStorage.getItem("tide_session_key") || localStorage.getItem("tide_session_key");
            if (!vaultKey) {
                setAuthorized(false);
                router.push("/auth");
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
                    router.push("/auth");
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
        if (PUBLIC_PATHS.includes(pathname)) {
            return <>{children}</>;
        }
        return null;
    }

    return <>{children}</>;
}
