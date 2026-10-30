import React, { useState, useEffect } from 'react';
import { KeyRound, Plus, Trash2, Copy, Check, Shield, Calendar, FileText, AlertTriangle, Clock, Terminal, HardDrive } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { apiFetch } from '@/lib/api';
import { DT } from '@/lib/designTokens';

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

interface ScopeDefinition {
    key: string;
    labelDe: string;
    labelEn: string;
    descDe: string;
    descEn: string;
    type: 'events' | 'notes' | 'storage';
    implemented: boolean;
}

const SCOPE_DEFINITIONS: ScopeDefinition[] = [
    {
        key: 'events:read',
        labelDe: 'Termine abfragen',
        labelEn: 'Read Events',
        descDe: 'Erlaubt das Abfragen von Kalendereinträgen und Terminen',
        descEn: 'Allows querying calendar entries and events',
        type: 'events',
        implemented: true,
    },
    {
        key: 'events:write',
        labelDe: 'Termine verwalten',
        labelEn: 'Manage Events',
        descDe: 'Erlaubt das Erstellen, Ändern und Löschen von Terminen',
        descEn: 'Allows creating, modifying and deleting events',
        type: 'events',
        implemented: false,
    },
    {
        key: 'notes:read',
        labelDe: 'Notizen abfragen',
        labelEn: 'Read Notes',
        descDe: 'Erlaubt das Abrufen von Notizen über die API',
        descEn: 'Allows querying notes via the API',
        type: 'notes',
        implemented: false,
    },
    {
        key: 'notes:write',
        labelDe: 'Notizen verwalten',
        labelEn: 'Manage Notes',
        descDe: 'Erlaubt das Erstellen und Bearbeiten von Notizen',
        descEn: 'Allows creating and updating notes',
        type: 'notes',
        implemented: false,
    },
    {
        key: 'storage:expand',
        labelDe: 'Upload-Speicher Erweiterung (>250MB)',
        labelEn: 'Upload Storage Extension (>250MB)',
        descDe: 'Erlaubt das Hochladen großer Dateien und Anhänge über das 250MB-Limit pro Notiz',
        descEn: 'Allows uploading large files and attachments beyond the 250MB per-note limit',
        type: 'storage',
        implemented: true,
    },
];

export const APIAccessSettings: React.FC = () => {
    const language = useDataStore(s => s.language || 'de');
    const isDe = language === 'de';

    const [tokens, setTokens] = useState<APITokenItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal state for creating token
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [nameInput, setNameInput] = useState('');
    const [selectedScopes, setSelectedScopes] = useState<string[]>(['events:read']);
    const [expiryDays, setExpiryDays] = useState<number>(90);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // Newly created token display
    const [createdToken, setCreatedToken] = useState<CreatedTokenResponse | null>(null);
    const [copiedToken, setCopiedToken] = useState(false);

    // Deleting token state
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadTokens = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiFetch('/api/v1/api-tokens');
            if (!res.ok) {
                throw new Error(isDe ? 'Fehler beim Laden der Tokens' : 'Failed to load tokens');
            }
            const data: APITokenItem[] = await res.json();
            setTokens(Array.isArray(data) ? data : []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [isDe]);

    useEffect(() => {
        loadTokens();
    }, [loadTokens]);

    const handleCreateToken = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateError(null);

        if (!nameInput.trim()) {
            setCreateError(isDe ? 'Bitte gib einen Namen ein.' : 'Please enter a token name.');
            return;
        }

        if (selectedScopes.length === 0) {
            setCreateError(isDe ? 'Bitte wähle mindestens ein Recht aus.' : 'Please select at least one scope.');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await apiFetch('/api/v1/api-tokens', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: nameInput.trim(),
                    scopes: selectedScopes,
                    expires_in_days: expiryDays,
                }),
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || (isDe ? 'Token konnte nicht erstellt werden' : 'Failed to create token'));
            }

            const data: CreatedTokenResponse = await res.json();
            setCreatedToken(data);
            setNameInput('');
            setSelectedScopes(['events:read']);
            setExpiryDays(90);
            loadTokens();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setCreateError(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteToken = async (tokenId: string) => {
        if (!confirm(isDe ? 'Möchtest du diesen Token wirklich widerrufen? Externe Dienste mit diesem Token verlieren sofort den Zugriff.' : 'Are you sure you want to revoke this token? External services using it will immediately lose access.')) {
            return;
        }

        setDeletingId(tokenId);
        try {
            const res = await apiFetch(`/api/v1/api-tokens/${tokenId}`, {
                method: 'DELETE',
            });
            if (!res.ok) {
                throw new Error(isDe ? 'Löschen fehlgeschlagen' : 'Failed to delete token');
            }
            setTokens(prev => prev.filter(t => t.id !== tokenId));
        } catch (err) {
            alert(err instanceof Error ? err.message : String(err));
        } finally {
            setDeletingId(null);
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
    };

    const toggleScope = (key: string) => {
        setSelectedScopes(prev => 
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return isDe ? 'Nie' : 'Never';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString(isDe ? 'de-DE' : 'en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            });
        } catch {
            return dateStr;
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-white/5">
                <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <KeyRound className="w-5 h-5 text-blue-500" />
                        {isDe ? 'API-Zugriff & Personal Access Tokens' : 'API Access & Personal Access Tokens'}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
                        {isDe 
                            ? 'Erstelle Zugriffstoken für externe Dienste, Drittanbieter-Tools, Heimautomatisierung (z. B. Home Assistant) oder Skripte, um Termine und Notizen abzufragen.'
                            : 'Create access tokens for external services, third-party integrations, home automation, or custom scripts to query calendar events and notes.'}
                    </p>
                </div>

                <button
                    onClick={() => {
                        setIsCreateOpen(true);
                        setCreatedToken(null);
                        setCreateError(null);
                    }}
                    style={{ borderRadius: DT.radius }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md shadow-blue-500/20 active:scale-95 shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    <span>{isDe ? 'Neuen Token erstellen' : 'Create New Token'}</span>
                </button>
            </div>

            {/* Error banner */}
            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400">
                    {error}
                </div>
            )}

            {/* Tokens list */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                        {isDe ? 'Aktive Zugriffstoken' : 'Active Access Tokens'} ({tokens.length})
                    </h4>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-xs text-gray-400">
                        {isDe ? 'Tokens werden geladen...' : 'Loading tokens...'}
                    </div>
                ) : tokens.length === 0 ? (
                    <div className="p-8 text-center rounded-2xl border border-dashed border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/[0.02]">
                        <KeyRound className="w-8 h-8 text-gray-400 mx-auto mb-2 opacity-50" />
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            {isDe ? 'Noch keine Tokens erstellt' : 'No API tokens created yet'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {isDe 
                                ? 'Klicke auf "Neuen Token erstellen", um externe Dienste anzubinden.'
                                : 'Click "Create New Token" to connect external applications.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {tokens.map(token => {
                            const isExpired = token.expires_at ? new Date(token.expires_at).getTime() < Date.now() : false;

                            return (
                                <div
                                    key={token.id}
                                    style={{ borderRadius: DT.radius }}
                                    className="p-4 bg-white dark:bg-white/[0.03] border border-gray-100 dark:border-white/5 hover:border-gray-200 dark:hover:border-white/10 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                >
                                    <div className="space-y-1.5 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-sm text-gray-900 dark:text-white truncate">
                                                {token.name}
                                            </span>
                                            <code className="text-[11px] font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300">
                                                {token.token_prefix}
                                            </code>
                                            {isExpired && (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 uppercase">
                                                    {isDe ? 'Abgelaufen' : 'Expired'}
                                                </span>
                                            )}
                                        </div>

                                        {/* Scope badges */}
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {token.scopes.map(scope => {
                                                const isEvents = scope.startsWith('events:');
                                                const isStorage = scope.startsWith('storage:');
                                                return (
                                                    <span
                                                        key={scope}
                                                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                                                            isEvents 
                                                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 border border-blue-100 dark:border-blue-500/20'
                                                                : isStorage
                                                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                                                : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300 border border-amber-100 dark:border-amber-500/20'
                                                        }`}
                                                    >
                                                        {isEvents ? (
                                                            <Calendar className="w-2.5 h-2.5" />
                                                        ) : isStorage ? (
                                                            <HardDrive className="w-2.5 h-2.5" />
                                                        ) : (
                                                            <FileText className="w-2.5 h-2.5" />
                                                        )}
                                                        {scope}
                                                    </span>
                                                );
                                            })}
                                        </div>

                                        {/* Dates */}
                                        <div className="flex items-center gap-4 text-[11px] text-gray-400">
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {isDe ? 'Erstellt:' : 'Created:'} {formatDate(token.created_at)}
                                            </span>
                                            <span>
                                                {isDe ? 'Gültig bis:' : 'Expires:'} {formatDate(token.expires_at)}
                                            </span>
                                            <span>
                                                {isDe ? 'Zuletzt genutzt:' : 'Last used:'} {token.last_used_at ? formatDate(token.last_used_at) : (isDe ? 'Nie' : 'Never')}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleDeleteToken(token.id)}
                                        disabled={deletingId === token.id}
                                        title={isDe ? 'Token widerrufen' : 'Revoke token'}
                                        className="self-end sm:self-center p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Quick documentation card */}
            <div className="p-5 rounded-2xl bg-gray-50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/5 space-y-3">
                <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-blue-500" />
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                        {isDe ? 'API-Nutzung & Beispiel' : 'API Usage & Example'}
                    </h4>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    {isDe 
                        ? 'Sende HTTP GET-Anfragen mit deinem Token im Authorization-Header an /api/v1/external/events:'
                        : 'Send HTTP GET requests with your Bearer token in the Authorization header to /api/v1/external/events:'}
                </p>
                <div className="p-3 bg-gray-900 text-gray-200 rounded-xl font-mono text-xs overflow-x-auto space-y-1.5">
                    <div className="text-gray-400"># {isDe ? 'Alle anstehenden Termine abrufen' : 'Get upcoming events'}</div>
                    <div className="text-emerald-400">curl -H &quot;Authorization: Bearer tide_pat_...&quot; \</div>
                    <div className="pl-4 text-gray-300">https://go-tide.app/api/v1/external/events?start=2026-10-01</div>
                </div>
            </div>

            {/* Token Creation / Success Modal */}
            {isCreateOpen && (
                <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div 
                        style={{ borderRadius: DT.radius }}
                        className="bg-white dark:bg-[#1E1E20] border border-gray-200 dark:border-white/10 shadow-2xl p-6 w-full max-w-lg space-y-5 animate-in zoom-in-95 duration-200"
                    >
                        {createdToken ? (
                            /* Success Screen */
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                                        <Check className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="text-base font-bold text-gray-900 dark:text-white">
                                            {isDe ? 'Token erfolgreich erstellt!' : 'Token Created Successfully!'}
                                        </h4>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {createdToken.name}
                                        </p>
                                    </div>
                                </div>

                                <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>
                                        {isDe 
                                            ? 'Kopiere diesen Token jetzt! Aus Sicherheitsgründen wird er dir nie wieder im Klartext angezeigt.'
                                            : 'Copy this token now! For your security, it will never be displayed in plain text again.'}
                                    </span>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                        {isDe ? 'Dein API-Token' : 'Your API Token'}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value={createdToken.token}
                                            className="w-full bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 font-mono text-xs text-gray-900 dark:text-gray-100 select-all"
                                        />
                                        <button
                                            onClick={() => handleCopy(createdToken.token)}
                                            style={{ borderRadius: DT.radius }}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
                                        >
                                            {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                            <span>{copiedToken ? (isDe ? 'Kopiert!' : 'Copied!') : (isDe ? 'Kopieren' : 'Copy')}</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="pt-3 border-t border-gray-100 dark:border-white/5 flex justify-end">
                                    <button
                                        onClick={() => {
                                            setIsCreateOpen(false);
                                            setCreatedToken(null);
                                        }}
                                        style={{ borderRadius: DT.radius }}
                                        className="px-5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-bold hover:opacity-90 transition-opacity"
                                    >
                                        {isDe ? 'Schließen' : 'Close'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* Creation Form */
                            <form onSubmit={handleCreateToken} className="space-y-5">
                                <div className="flex items-center gap-2.5">
                                    <Shield className="w-5 h-5 text-blue-500" />
                                    <h4 className="text-base font-bold text-gray-900 dark:text-white">
                                        {isDe ? 'Neuen API-Token erstellen' : 'Create New API Token'}
                                    </h4>
                                </div>

                                {createError && (
                                    <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400">
                                        {createError}
                                    </div>
                                )}

                                {/* Token Name */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                        {isDe ? 'Bezeichnung / Name' : 'Name / Label'}
                                    </label>
                                    <input
                                        type="text"
                                        placeholder={isDe ? 'z. B. Home Assistant, Kalender-Sync, Backup-Skript' : 'e.g. Home Assistant, Calendar Sync'}
                                        value={nameInput}
                                        onChange={e => setNameInput(e.target.value)}
                                        maxLength={100}
                                        className="w-full bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-blue-500 transition-colors"
                                        required
                                    />
                                </div>

                                {/* Scopes selection */}
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                        {isDe ? 'Berechtigungen (Rechte)' : 'Scopes (Permissions)'}
                                    </label>
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                        {isDe ? 'Wähle aus, auf welche Module dieser Token Zugriff haben darf:' : 'Select which modules this token is allowed to access:'}
                                    </p>

                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                        {SCOPE_DEFINITIONS.map(scope => {
                                            const isSelected = selectedScopes.includes(scope.key);

                                            return (
                                                <div
                                                    key={scope.key}
                                                    onClick={() => toggleScope(scope.key)}
                                                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                                                        isSelected 
                                                            ? 'bg-blue-50/50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30'
                                                            : 'bg-white dark:bg-white/[0.02] border-gray-100 dark:border-white/5 hover:border-gray-200 dark:hover:border-white/10'
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleScope(scope.key)}
                                                        className="mt-0.5 rounded text-blue-600 focus:ring-0 cursor-pointer"
                                                    />
                                                    <div className="space-y-0.5 flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold text-gray-900 dark:text-white">
                                                                {isDe ? scope.labelDe : scope.labelEn}
                                                            </span>
                                                            <code className="text-[10px] text-gray-500 font-mono bg-gray-100 dark:bg-white/10 px-1.5 py-0.2 rounded">
                                                                {scope.key}
                                                            </code>
                                                            {scope.implemented ? (
                                                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 uppercase">
                                                                    {isDe ? 'Aktiv' : 'Active'}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded-full bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400">
                                                                    {isDe ? 'Vorbereitet' : 'Planned'}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                                            {isDe ? scope.descDe : scope.descEn}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Expiration */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                        {isDe ? 'Gültigkeitsdauer (Ablauf)' : 'Expiration'}
                                    </label>
                                    <select
                                        value={expiryDays}
                                        onChange={e => setExpiryDays(parseInt(e.target.value, 10))}
                                        className="w-full bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-blue-500 transition-colors"
                                    >
                                        <option value={30}>{isDe ? '30 Tage' : '30 days'}</option>
                                        <option value={60}>{isDe ? '60 Tage' : '60 days'}</option>
                                        <option value={90}>{isDe ? '90 Tage' : '90 days'}</option>
                                        <option value={365}>{isDe ? '1 Jahr (365 Tage)' : '1 year (365 days)'}</option>
                                        <option value={0}>{isDe ? 'Kein Ablauf (Nie)' : 'No expiration (Never)'}</option>
                                    </select>
                                </div>

                                {/* Action buttons */}
                                <div className="pt-3 border-t border-gray-100 dark:border-white/5 flex items-center justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsCreateOpen(false)}
                                        className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-semibold transition-colors"
                                    >
                                        {isDe ? 'Abbrechen' : 'Cancel'}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        style={{ borderRadius: DT.radius }}
                                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md shadow-blue-500/20 disabled:opacity-50"
                                    >
                                        {isSubmitting ? (isDe ? 'Wird erstellt...' : 'Creating...') : (isDe ? 'Token erstellen' : 'Create Token')}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default APIAccessSettings;
