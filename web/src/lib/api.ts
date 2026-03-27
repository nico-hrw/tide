// Basic API wrapper
export async function apiFetch(url: string, options: RequestInit = {}) {
    try {
        const res = await fetch(url, {
            ...options,
            credentials: 'include' // Use httpOnly cookie
        });

        if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
            console.warn("[apiFetch] 401 Unauthorized. Redirecting.");
            window.location.href = '/auth';
        }

        return res;
    } catch (err) {
        console.error("API Fetch Error:", err);
        // Dispatch custom event for UI to pick up
        const event = new CustomEvent("tide-offline", { detail: "Cloud unreachable" });
        if (typeof window !== 'undefined') window.dispatchEvent(event);
        throw err; // Re-throw so caller knows it failed
    }
}
