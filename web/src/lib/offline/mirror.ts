/** Glue between `apiFetch` and the offline store: decide what is mirrored and build the offline response. */
import { mirrorRead, mirrorWrite } from './store';

/** Gateway statuses that mean "backend unreachable" rather than an application answer. */
const UNREACHABLE_STATUSES = new Set([502, 503, 504]);

export function isBackendUnreachableStatus(status: number): boolean {
    return UNREACHABLE_STATUSES.has(status);
}

/** Mirror a successful GET response body (called with a clone; the caller's Response stays untouched). */
export function mirrorSuccessfulGet(endpoint: string, res: Response): void {
    res.clone()
        .text()
        .then((text) => mirrorWrite(endpoint, text))
        .catch((e) => console.warn('Failed to mirror GET response', e));
}

/**
 * Build the Response for a GET from the offline mirror, or null when nothing is mirrored for this
 * user. Announces the offline state ("Offline – Stand von ...") to the UI.
 */
export async function serveFromMirror(endpoint: string): Promise<Response | null> {
    const hit = await mirrorRead(endpoint);
    if (!hit) return null;
    if (typeof window !== 'undefined') {
        window.dispatchEvent(
            new CustomEvent('tide-offline', { detail: { message: 'Cloud nicht erreichbar', cachedAt: hit.cachedAt } }),
        );
    }
    const headers: Record<string, string> = { 'X-Tide-Offline': '1' };
    if (hit.cachedAt !== null) headers['X-Tide-Cached-At'] = String(hit.cachedAt);
    return new Response(hit.body, { status: 200, statusText: 'OK (Offline Cache)', headers });
}
