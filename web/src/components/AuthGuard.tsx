"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useDataStore } from "@/store/useDataStore";

const PUBLIC_PATHS = ["/", "/auth", "/verify"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [authorized, setAuthorized] = useState(false);

    const { theme } = useDataStore();

    useEffect(() => {
        // Initialize theme class
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        const checkAuth = async () => {
            const isPublic = PUBLIC_PATHS.includes(pathname);
            if (isPublic) {
                setAuthorized(true);
                return;
            }

            const vaultKey = sessionStorage.getItem("tide_session_key");
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

    // Offline / Error State
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        const handleOffline = () => {
            setIsOffline(true);
            setTimeout(() => setIsOffline(false), 5000); // Auto-hide after 5s
        };
        window.addEventListener("tide-offline", handleOffline);
        return () => window.removeEventListener("tide-offline", handleOffline);
    }, []);

    // Prevent flash of content
    if (!authorized) {
        if (PUBLIC_PATHS.includes(pathname)) {
            return (
                <>
                    {isOffline && (
                        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: '#ef4444', color: 'white', textAlign: 'center', padding: '0.5rem', zIndex: 9999 }}>
                            ⚠️ Cloud Unreachable. Please check your connection.
                        </div>
                    )}
                    {children}
                </>
            );
        }
        return null;
    }

    return (
        <>
            {isOffline && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: '#ef4444', color: 'white', textAlign: 'center', padding: '0.5rem', zIndex: 9999 }}>
                    ⚠️ Cloud Unreachable. Please check your connection.
                </div>
            )}
            {children}
        </>
    );
}
