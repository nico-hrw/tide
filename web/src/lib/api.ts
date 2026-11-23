// Basic API wrapper

import { isAuthOrLoginPath, getAuthPath } from './routeUtils';

export const getApiBase = () => {
    if (typeof window !== 'undefined') {
        const clientHostname = window.location.hostname;
        if (clientHostname !== 'localhost' && clientHostname !== '127.0.0.1') {
            return window.location.origin;
        }
    }

    let base = '';
    if (process.env.NEXT_PUBLIC_API_URL) {
        base = process.env.NEXT_PUBLIC_API_URL.endsWith('/') 
            ? process.env.NEXT_PUBLIC_API_URL.slice(0, -1) 
            : process.env.NEXT_PUBLIC_API_URL;
    } else if (typeof window !== 'undefined') {
        base = window.location.origin;
    }

    // Remote client support (e.g. iPad or phone connecting to host machine via LAN IP)
    if (typeof window !== 'undefined' && base) {
        const clientHostname = window.location.hostname;
        if (clientHostname && clientHostname !== 'localhost' && clientHostname !== '127.0.0.1') {
            base = base.replace(/:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, (_, __, port) => {
                return `://${clientHostname}${port || ''}`;
            });
            if (window.location.protocol === 'https:' && base.startsWith('http:')) {
                base = base.replace(/^http:/, 'https:');
            }
        }
    }

    if (base.endsWith('/api')) {
        base = base.slice(0, -4);
    }

    return base;
};

const SENSITIVE_AUTH_PATHS = [
    '/api/v1/auth/verify',
    '/api/v1/auth/login',
    '/api/v1/auth/register',
    '/api/v1/auth/request-otp',
    '/api/v1/auth/verify-otp',
    '/api/v1/auth/dev-login',
    '/api/v1/auth/logout',
    '/api/v1/api-tokens',
] as const;

const SENSITIVE_LOCAL_STORAGE_KEYS = [
    'tide_session_token',
    'tide_session_key',
    'tide_user_email',
    'tide_user_id',
    'tide_user_public_key',
    'tide_offline_notes',
    'tide_offline_events',
    'tide_offline_tasks',
    'tide_surveys_store',
    'tide-job-planner-storage',
    'tide_references',
    'tide_known_quicknotes',
] as const;

const SENSITIVE_LOCAL_STORAGE_PREFIXES = [
    'tide_unlocked_',
    'tide_unlock_',
    'tide_user_',
] as const;

function validateApiFetchOrigin(trimmedUrl: string, base: string): void {
    if (trimmedUrl.startsWith('//')) {
        throw new Error('Blocked apiFetch request to external origin');
    }

    if (/^https?:\/\//i.test(trimmedUrl)) {
        let targetOrigin: string;
        try {
            targetOrigin = new URL(trimmedUrl).origin;
        } catch {
            throw new Error('Blocked apiFetch request to external origin');
        }

        const allowedOrigins = new Set<string>();
        if (typeof window !== 'undefined' && window.location?.origin) {
            allowedOrigins.add(window.location.origin);
        }
        if (base) {
            try {
                allowedOrigins.add(new URL(base).origin);
            } catch {
                // Ignore malformed base URL
            }
        }

        if (!allowedOrigins.has(targetOrigin)) {
            throw new Error('Blocked apiFetch request to external origin');
        }
        return;
    }

    if (!trimmedUrl.startsWith('/')) {
        throw new Error('Blocked apiFetch request to external origin');
    }
}

function isSensitiveAuthCacheUrl(targetUrl: string, cleanEndpoint: string): boolean {
    const matchesSensitive = (candidate: string): boolean => {
        try {
            const parsed = new URL(candidate, 'http://localhost');
            if (parsed.search.includes('token=')) {
                return true;
            }
            return SENSITIVE_AUTH_PATHS.some(
                (path) => parsed.pathname === path || parsed.pathname.startsWith(`${path}/`)
            );
        } catch {
            return true;
        }
    };

    return matchesSensitive(targetUrl) || matchesSensitive(cleanEndpoint);
}

export async function clearAllSessionData(options?: { callServerLogout?: boolean }): Promise<void> {
    if (typeof window === 'undefined') {
        return;
    }

    if (options?.callServerLogout) {
        await fetch(`${getApiBase()}/api/v1/auth/logout`, {
            method: 'POST',
            credentials: 'include',
        }).catch(() => {});
    }

    try {
        sessionStorage.clear();
    } catch {
        // Ignore restricted storage errors
    }

    try {
        for (const key of SENSITIVE_LOCAL_STORAGE_KEYS) {
            localStorage.removeItem(key);
        }
        const prefixedKeysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && SENSITIVE_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
                prefixedKeysToRemove.push(key);
            }
        }
        for (const key of prefixedKeysToRemove) {
            localStorage.removeItem(key);
        }
    } catch {
        // Ignore restricted storage errors
    }

    const [
        { clearMasterKey, purgeLegacyKeys },
        { clearSyncQueue },
        { clearSearchIndexCache },
        { idb },
    ] = await Promise.all([
        import('./keyStorage'),
        import('./syncQueue'),
        import('./searchIndex'),
        import('./idb'),
    ]);

    purgeLegacyKeys();
    clearSearchIndexCache();

    await Promise.allSettled([
        clearMasterKey(),
        clearSyncQueue(),
        (async () => {
            const allKeys = await idb.keys();
            const apiCacheKeys = allKeys.filter(
                (key): key is string => typeof key === 'string' && key.startsWith('api_cache_')
            );
            await Promise.all(apiCacheKeys.map((key) => idb.del(key)));
        })(),
        'caches' in window ? caches.delete('apis') : Promise.resolve(false),
    ]);
}

export async function apiFetch(url: string, options: RequestInit & { _isSyncReplay?: boolean } = {}) {
    const base = getApiBase();
    const trimmedUrl = url.trim();
    validateApiFetchOrigin(trimmedUrl, base);

    let cleanEndpoint = trimmedUrl.startsWith('/') ? trimmedUrl : `/${trimmedUrl}`;
    
    // Deduplicate /api prefix if it exists in both base and endpoint
    if (base.endsWith('/api') && cleanEndpoint.startsWith('/api/')) {
        cleanEndpoint = cleanEndpoint.slice(4);
    }

    const fullUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `${base}${cleanEndpoint}`;
    
    const isGet = !options.method || options.method.toUpperCase() === 'GET';
    const skipCache = isSensitiveAuthCacheUrl(trimmedUrl, cleanEndpoint);

    try {
        const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
        if (typeof window !== 'undefined') {
            const token = localStorage.getItem("tide_session_token");
            if (token) {
                headers["Authorization"] = `Bearer ${token}`;
            }
        }

        const res = await fetch(fullUrl, {
            ...options,
            headers,
            credentials: 'include' // Use httpOnly cookie
        });

        if (res.status === 401 && typeof window !== 'undefined' && !isAuthOrLoginPath(window.location.pathname)) {
            console.warn("[apiFetch] 401 Unauthorized. Redirecting.");
            await clearAllSessionData({ callServerLogout: false });
            window.location.href = getAuthPath(window.location.pathname);
        }

        // Cache successful GET requests for offline use (excluding sensitive auth endpoints)
        if (isGet && res.ok && !skipCache && typeof window !== 'undefined') {
            const clone = res.clone();
            clone.text().then(async (text) => {
                const { idb } = await import('./idb');
                await idb.set(`api_cache_${cleanEndpoint}`, text);
            }).catch(e => console.warn("Failed to cache GET response", e));
        }

        // If this was an online success, notify that cloud is available
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent("tide-online"));
        }

        return res;
    } catch (err: any) {
        if (err?.name === 'AbortError') throw err;
        console.warn("[apiFetch] Network/Cloud unreachable:", err);
        
        // Dispatch custom event for UI to pick up
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent("tide-offline", { detail: "Cloud nicht erreichbar" }));
        }

        // Fallback to offline cache for GET requests
        if (isGet && !skipCache && typeof window !== 'undefined') {
            try {
                const { idb } = await import('./idb');
                const cachedText = await idb.get<string>(`api_cache_${cleanEndpoint}`);
                if (cachedText !== undefined) {
                    console.log(`[apiFetch] Serving from offline cache: ${cleanEndpoint}`);
                    return new Response(cachedText, { status: 200, statusText: "OK (Offline Cache)" });
                }
            } catch (cacheErr) {
                console.error("Failed to read from offline cache", cacheErr);
            }
            throw err;
        }

        // For non-GET mutations (POST, PUT, DELETE, PATCH):
        // Never enqueue auth mutations offline — must throw so client knows auth actually failed
        if (cleanEndpoint.startsWith('/api/v1/auth')) {
            throw err;
        }

        // If this is a background replay from syncQueue, rethrow so caller knows it failed
        if (options._isSyncReplay) {
            throw err;
        }

        // Do not catch network errors and silently push FormData or file uploads into offline syncQueue
        const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
        if (isFormData || (url.includes('/files') && (isFormData || cleanEndpoint.includes('/quicknotes/')))) {
            throw err;
        }

        // Otherwise, enqueue the mutation to syncQueue and return an optimistic synthetic OK response!
        if (typeof window !== 'undefined') {
            try {
                const { addToSyncQueue } = await import('./syncQueue');
                
                // Extract fileId from URL or body if applicable
                let fileId: string | undefined;
                const fileMatch = cleanEndpoint.match(/\/api\/v1\/files\/([a-zA-Z0-9_-]+)/);
                if (fileMatch && fileMatch[1] && fileMatch[1] !== 'upload' && fileMatch[1] !== 'backups') {
                    fileId = fileMatch[1];
                }

                let parsedBody: any = options.body;
                if (typeof options.body === 'string') {
                    try {
                        parsedBody = JSON.parse(options.body);
                    } catch (_) {}
                }

                // If creating a file offline, inject a client UUID if not already set
                let syntheticId = fileId;
                if (cleanEndpoint === '/api/v1/files' && options.method?.toUpperCase() === 'POST') {
                    syntheticId = (parsedBody && parsedBody.id) || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `offline_${Date.now()}`);
                    parsedBody = { ...(parsedBody || {}), id: syntheticId };
                    options.body = JSON.stringify(parsedBody);
                    fileId = syntheticId;
                }

                // If updating note content, also cache it immediately in idb so offline re-reads get latest ciphertext
                if (fileId && (options.method?.toUpperCase() === 'PUT' || cleanEndpoint.includes('/upload'))) {
                    const { idb } = await import('./idb');
                    if (parsedBody && parsedBody.content_ciphertext) {
                        await idb.set(`api_cache_/api/v1/files/${fileId}/download`, parsedBody.content_ciphertext);
                    } else if (typeof options.body === 'string') {
                        await idb.set(`api_cache_/api/v1/files/${fileId}/download`, options.body);
                    }
                }

                await addToSyncQueue({
                    url: cleanEndpoint,
                    method: options.method || 'POST',
                    headers: options.headers as Record<string, string>,
                    body: options.body,
                    fileId,
                    description: `${options.method || 'POST'} ${cleanEndpoint}`
                });

                console.log(`[apiFetch] Queued offline mutation for ${cleanEndpoint}`);

                const syntheticResponse = {
                    id: syntheticId || `offline_${Date.now()}`,
                    status: 'queued_offline',
                    ok: true,
                    ...(typeof parsedBody === 'object' ? parsedBody : {})
                };

                return new Response(JSON.stringify(syntheticResponse), {
                    status: 200,
                    statusText: "OK (Queued Offline)",
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (queueErr) {
                console.error("[apiFetch] Failed to enqueue offline mutation", queueErr);
            }
        }

        throw err; // Re-throw if queuing failed or not in browser
    }
}
