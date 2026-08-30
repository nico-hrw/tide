// Basic API wrapper

export const getApiBase = () => {
    let base = '';
    if (process.env.NEXT_PUBLIC_API_URL) {
        base = process.env.NEXT_PUBLIC_API_URL.endsWith('/') 
            ? process.env.NEXT_PUBLIC_API_URL.slice(0, -1) 
            : process.env.NEXT_PUBLIC_API_URL;
    } else if (typeof window !== 'undefined') {
        base = window.location.origin;
    }

    if (base.endsWith('/api')) {
        base = base.slice(0, -4);
    }

    return base;
};

export async function apiFetch(url: string, options: RequestInit & { _isSyncReplay?: boolean } = {}) {
    const base = getApiBase();
    let cleanEndpoint = url.startsWith('/') ? url : `/${url}`;
    
    // Deduplicate /api prefix if it exists in both base and endpoint
    if (base.endsWith('/api') && cleanEndpoint.startsWith('/api/')) {
        cleanEndpoint = cleanEndpoint.slice(4);
    }

    const fullUrl = url.startsWith('http') ? url : `${base}${cleanEndpoint}`;
    
    const isGet = !options.method || options.method.toUpperCase() === 'GET';

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

        if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
            console.warn("[apiFetch] 401 Unauthorized. Redirecting.");
            sessionStorage.clear();
            localStorage.removeItem("tide_session_key");
            localStorage.removeItem("tide_session_token");
            window.location.href = '/auth';
        }

        // Cache successful GET requests for offline use
        if (isGet && res.ok && typeof window !== 'undefined') {
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
        console.warn("[apiFetch] Network/Cloud unreachable:", err);
        
        // Dispatch custom event for UI to pick up
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent("tide-offline", { detail: "Cloud nicht erreichbar" }));
        }

        // Fallback to offline cache for GET requests
        if (isGet && typeof window !== 'undefined') {
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
        // If this is a background replay from syncQueue, rethrow so caller knows it failed
        if (options._isSyncReplay) {
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
