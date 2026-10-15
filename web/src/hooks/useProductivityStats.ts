import { useEffect, useRef } from "react";

/**
 * Hook to passively track user productivity stats:
 * - Updates `tide_last_active` timestamp on user interaction (mouse, key, click), throttled to 10 seconds.
 * - Increments `tide_stats_active_minutes` each minute if activity occurred during the past minute.
 */
export function useProductivityStats() {
    const wasActiveInLastMinuteRef = useRef(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Activity listener to update last active timestamp & set activity flag
        const handleUserActivity = () => {
            wasActiveInLastMinuteRef.current = true;

            const now = Date.now();
            const lastActiveStr = localStorage.getItem('tide_last_active');
            const lastActive = lastActiveStr ? parseInt(lastActiveStr, 10) : 0;

            // Throttle localStorage writes to once every 10 seconds
            if (now - lastActive > 10000) {
                localStorage.setItem('tide_last_active', now.toString());
            }
        };

        window.addEventListener('mousemove', handleUserActivity, { passive: true });
        window.addEventListener('keydown', handleUserActivity, { passive: true });
        window.addEventListener('click', handleUserActivity, { passive: true });

        // Interval to track active minutes (checks once a minute)
        const activeMinutesInterval = setInterval(() => {
            if (wasActiveInLastMinuteRef.current) {
                try {
                    const currentMins = parseInt(localStorage.getItem('tide_stats_active_minutes') || '0', 10);
                    localStorage.setItem('tide_stats_active_minutes', (currentMins + 1).toString());
                } catch (e) {
                    console.error("Failed to update active minutes stat", e);
                }
                wasActiveInLastMinuteRef.current = false;
            }
        }, 60000);

        return () => {
            window.removeEventListener('mousemove', handleUserActivity);
            window.removeEventListener('keydown', handleUserActivity);
            window.removeEventListener('click', handleUserActivity);
            clearInterval(activeMinutesInterval);
        };
    }, []);
}

export default useProductivityStats;
