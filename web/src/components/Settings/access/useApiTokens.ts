import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export interface APITokenItem {
    id: string;
    user_id: string;
    name: string;
    token_prefix: string;
    scopes: string[];
    created_at: string;
    expires_at: string | null;
    last_used_at: string | null;
}

export interface CreatedTokenResponse {
    id: string;
    name: string;
    token: string;
    token_prefix: string;
    scopes: string[];
    created_at: string;
    expires_at: string | null;
}

export interface CreateTokenInput {
    name: string;
    scopes: string[];
    expiresInDays: number;
}

/** Laden, Erstellen und Widerrufen von Personal-Access-Tokens (Requests unveraendert). */
export function useApiTokens() {
    const [tokens, setTokens] = useState<APITokenItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadFailed(false);
        try {
            const res = await apiFetch('/api/v1/api-tokens');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: APITokenItem[] = await res.json();
            setTokens(Array.isArray(data) ? data : []);
        } catch {
            setLoadFailed(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    /** Wirft bei Fehlern; die Meldung ist fuer die Anzeige gedacht. */
    const create = useCallback(
        async (input: CreateTokenInput): Promise<CreatedTokenResponse> => {
            const res = await apiFetch('/api/v1/api-tokens', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: input.name, scopes: input.scopes, expires_in_days: input.expiresInDays }),
            });
            if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
            const data: CreatedTokenResponse = await res.json();
            void load();
            return data;
        },
        [load],
    );

    const revoke = useCallback(async (id: string): Promise<void> => {
        const res = await apiFetch(`/api/v1/api-tokens/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setTokens((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return { tokens, loading, loadFailed, reload: load, create, revoke };
}
