// Basic API wrapper

const getApiBase = () => {
    if (typeof window !== 'undefined') {
        // Nimmt den aktuellen Hostnamen (raspi.local oder localhost) und setzt Port 8080
        return `${window.location.protocol}//${window.location.hostname}:8080`;
    }
    return ''; 
};

export async function apiFetch(url: string, options: RequestInit = {}) {
    const baseUrl = getApiBase();
    const fullUrl = url.startsWith('http') ? url  : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    
    
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
