"use client";

import { useEffect, useState } from "react";
import { Users, X, ShieldAlert, UserMinus, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import Avatar from "@/components/Profile/Avatar";

interface Share {
    file_id: string;
    user_id: string;
    status: string;
    permission: 'view' | 'edit' | 'share';
    username?: string;
    avatar_seed?: string;
    avatar_salt?: string;
    avatar_style?: string;
}

interface ShareManagementPanelProps {
    fileId: string;
    onClose: () => void;
    isOwner: boolean;
    myPermission?: string;
    onLeave?: () => void;
}

export default function ShareManagementPanel({ fileId, onClose, isOwner, myPermission, onLeave }: ShareManagementPanelProps) {
    const [shares, setShares] = useState<Share[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    useEffect(() => {
        loadShares();
    }, [fileId]);

    const loadShares = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiFetch(`/api/v1/files/${fileId}/shares`);
            if (res.ok) {
                const data = await res.json();
                setShares(data || []);
            } else {
                setError("Fehler beim Laden der Berechtigungen");
            }
        } catch (e) {
            console.error("Failed to load shares", e);
            setError("Netzwerkfehler");
        } finally {
            setLoading(false);
        }
    };

    const handleRevoke = async (userId: string) => {
        if (!confirm("Zugriff für diesen Nutzer wirklich entfernen?")) return;
        setRevokingId(userId);
        try {
            const res = await apiFetch(`/api/v1/files/${fileId}/shares/${userId}`, {
                method: "DELETE"
            });
            if (res.ok) {
                setShares(prev => prev.filter(s => s.user_id !== userId));
            } else {
                alert("Fehler beim Entfernen des Zugriffs");
            }
        } catch (e) {
            console.error(e);
            alert("Fehler beim Entfernen des Zugriffs");
        } finally {
            setRevokingId(null);
        }
    };

    const handleUpdatePermission = async (userId: string, newPermission: string) => {
        try {
            setShares(prev => prev.map(s => s.user_id === userId ? { ...s, permission: newPermission as any } : s));
            const res = await apiFetch(`/api/v1/files/${fileId}/shares/${userId}`, {
                method: "PATCH",
                body: JSON.stringify({ permission: newPermission })
            });
            if (!res.ok) throw new Error();
        } catch (e) {
            console.error(e);
            alert("Fehler beim Aktualisieren der Berechtigung");
            loadShares(); // Revert
        }
    };

    return (
        <div className="absolute right-0 top-12 w-88 max-w-[calc(100vw-2rem)] bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-gray-100 dark:border-white/10 flex items-center justify-between bg-gray-50/70 dark:bg-white/[0.03]">
                <div className="flex items-center gap-2 text-gray-800 dark:text-gray-200 font-semibold text-sm">
                    <Users size={16} className="text-blue-500" />
                    <span>Geteilter Zugriff</span>
                </div>
                <button 
                    onClick={onClose} 
                    className="p-1 hover:bg-gray-200/60 dark:hover:bg-white/10 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                >
                    <X size={16} />
                </button>
            </div>
            
            <div className="p-3 max-h-72 overflow-y-auto">
                {loading ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-gray-400">
                        <Loader2 size={20} className="animate-spin text-blue-500" />
                        <span>Lade Berechtigungen...</span>
                    </div>
                ) : error ? (
                    <div className="py-6 text-center text-xs text-rose-500 font-medium">{error}</div>
                ) : !isOwner ? (
                    <div className="p-4 flex flex-col items-center justify-center text-center space-y-2.5">
                        <ShieldAlert size={32} className="text-blue-500 mb-1 opacity-80" />
                        <p className="text-xs text-gray-700 dark:text-gray-300">
                            Der Eigentümer hat dieses Dokument mit dir geteilt.
                        </p>
                        <div className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                            Deine Rolle: {myPermission === 'view' ? 'Lesezugriff' : myPermission === 'edit' ? 'Bearbeiter' : 'Vollzugriff'}
                        </div>
                        {onLeave && (
                            <button
                                onClick={onLeave}
                                className="mt-3 w-full py-2 px-3 text-xs font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl transition-all border border-rose-200/50 dark:border-rose-900/40 active:scale-[0.98]"
                            >
                                Notiz verlassen
                            </button>
                        )}
                    </div>
                ) : shares.length === 0 ? (
                    <div className="py-6 text-center flex flex-col items-center justify-center text-gray-400 gap-2">
                        <ShieldAlert size={28} className="opacity-40" />
                        <span className="text-xs">Noch mit niemandem geteilt.</span>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {shares.map(share => (
                            <div 
                                key={share.user_id} 
                                className="flex items-center justify-between p-2.5 hover:bg-gray-50 dark:hover:bg-white/[0.04] rounded-xl group transition-colors border border-transparent hover:border-gray-100 dark:hover:border-white/5"
                            >
                                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                    <Avatar 
                                        seed={(share.avatar_seed || share.user_id) + (share.avatar_salt || '')} 
                                        style={share.avatar_style as any} 
                                        size={32} 
                                    />
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                                            {share.username || 'Unbekannter Nutzer'}
                                        </span>
                                        <span className="text-[10px] text-gray-400">
                                            {share.status === 'accepted' ? 'Akzeptiert' : 'Ausstehend'}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <select
                                        value={share.permission}
                                        onChange={(e) => handleUpdatePermission(share.user_id, e.target.value)}
                                        className="text-[11px] bg-gray-100 dark:bg-white/10 hover:bg-gray-200/70 dark:hover:bg-white/15 text-gray-700 dark:text-gray-200 font-medium rounded-lg px-2 py-1 border-none focus:ring-1 focus:ring-blue-500 cursor-pointer transition-colors"
                                    >
                                        <option value="view">Lesen</option>
                                        <option value="edit">Bearbeiten</option>
                                        <option value="share">Vollzugriff</option>
                                    </select>
                                    <button 
                                        onClick={() => handleRevoke(share.user_id)}
                                        disabled={revokingId === share.user_id}
                                        className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0 disabled:opacity-50"
                                        title="Zugriff entfernen"
                                    >
                                        <UserMinus size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
