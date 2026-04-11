// Basic API wrapper

export const getApiBase = () => {
    if (process.env.NEXT_PUBLIC_API_URL) {
        return process.env.NEXT_PUBLIC_API_URL.endsWith('/') 
            ? process.env.NEXT_PUBLIC_API_URL.slice(0, -1) 
            : process.env.NEXT_PUBLIC_API_URL;
    }

    if (typeof window !== 'undefined') {
        return window.location.origin;
    }

    return ''; 
};

export async function apiFetch(url: string, options: RequestInit = {}) {
    const base = getApiBase();
    const cleanEndpoint = url.startsWith('/') ? url : `/${url}`;
    const fullUrl = url.startsWith('http') ? url : `${base}${cleanEndpoint}`;

    console.log("[apiFetch] Requesting:", fullUrl);
    
    try {
        const res = await fetch(fullUrl, {
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
