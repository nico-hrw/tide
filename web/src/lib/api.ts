// Basic API wrapper
export async function apiFetch(url: string, options: RequestInit = {}) {
    try {
        const res = await fetch(url, options);
        return res;
    } catch (err) {
        console.error("API Fetch Error:", err);
        // Dispatch custom event for UI to pick up
        const event = new CustomEvent("tide-offline", { detail: "Cloud unreachable" });
        window.dispatchEvent(event);
        throw err; // Re-throw so caller knows it failed
    }
}
