"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

const PUBLIC_PATHS = ["/", "/auth", "/verify"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [authorized, setAuthorized] = useState(false);

    useEffect(() => {
        // Check session
        const sessionKey = sessionStorage.getItem("tide_session_key");
        const isPublic = PUBLIC_PATHS.includes(pathname);

        if (isPublic) {
            setAuthorized(true);
            // Optional: If already logged in and visiting /, redirect to dashboard?
            // For now, keep it simple.
        } else {
            if (sessionKey) {
                setAuthorized(true);
            } else {
                setAuthorized(false);
                router.push("/");
            }
        }
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
