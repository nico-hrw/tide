// Basic API wrapper
export async function apiFetch(url: string, options: RequestInit = {}) {
    try {
        // Inject Auth Token
        const token = typeof window !== 'undefined' ? (sessionStorage.getItem("tide_session_token") || localStorage.getItem("tide_session_token")) : null;
        
        const headers = new Headers(options.headers || {});
        if (token) {
            headers.set("Authorization", `Bearer ${token}`);
        }

        const res = await fetch(url, {
            ...options,
            headers: headers
        });

        if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
            console.warn("[apiFetch] 401 Unauthorized. Clearing session and redirecting.");
            sessionStorage.clear();
            localStorage.removeItem("tide_session_token");
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
