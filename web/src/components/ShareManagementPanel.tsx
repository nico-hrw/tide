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
        <div className="absolute right-0 top-12 w-88 max-w-[calc(100vw-2rem)] bg-t2-surface  rounded-2xl shadow-2xl border border-t2-line-soft  z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-t2-line-soft  flex items-center justify-between bg-t2-sub ">
                <div className="flex items-center gap-2 text-t2-ink  font-semibold text-sm">
                    <Users size={16} className="text-t2-accent" />
                    <span>Geteilter Zugriff</span>
                </div>
                <button 
                    onClick={onClose} 
                    className="p-1 hover:bg-t2-stage  rounded-full text-t2-ink-3 hover:text-t2-ink-2  transition-colors"
                >
                    <X size={16} />
                </button>
            </div>
            
            <div className="p-3 max-h-72 overflow-y-auto">
                {loading ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-t2-ink-3">
                        <Loader2 size={20} className="animate-spin text-t2-accent" />
                        <span>Lade Berechtigungen...</span>
                    </div>
                ) : error ? (
                    <div className="py-6 text-center text-xs text-rose-500 font-medium">{error}</div>
                ) : !isOwner ? (
                    <div className="p-4 flex flex-col items-center justify-center text-center space-y-2.5">
                        <ShieldAlert size={32} className="text-t2-accent mb-1 opacity-80" />
                        <p className="text-xs text-t2-ink ">
                            Der Eigentümer hat dieses Dokument mit dir geteilt.
                        </p>
                        <div className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-t2-sub text-t2-accent  ">
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
                    <div className="py-6 text-center flex flex-col items-center justify-center text-t2-ink-3 gap-2">
                        <ShieldAlert size={28} className="opacity-40" />
                        <span className="text-xs">Noch mit niemandem geteilt.</span>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {shares.map(share => (
                            <div 
                                key={share.user_id} 
                                className="flex items-center justify-between p-2.5 hover:bg-t2-sub  rounded-xl group transition-colors border border-transparent hover:border-t2-line-soft "
                            >
                                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                    <Avatar 
                                        seed={(share.avatar_seed || share.user_id) + (share.avatar_salt || '')} 
                                        style={share.avatar_style as any} 
                                        size={32} 
                                    />
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-xs font-medium text-t2-ink  truncate">
                                            {share.username || 'Unbekannter Nutzer'}
                                        </span>
                                        <span className="text-[11px] text-t2-ink-3">
                                            {share.status === 'accepted' ? 'Akzeptiert' : 'Ausstehend'}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <select
                                        value={share.permission}
                                        onChange={(e) => handleUpdatePermission(share.user_id, e.target.value)}
                                        className="text-[11px] bg-t2-hover  hover:bg-t2-stage  text-t2-ink  font-medium rounded-lg px-2 py-1 border-none focus:ring-1 focus:ring-t2-accent cursor-pointer transition-colors"
                                    >
                                        <option value="view">Lesen</option>
                                        <option value="edit">Bearbeiten</option>
                                        <option value="share">Vollzugriff</option>
                                    </select>
                                    <button 
                                        onClick={() => handleRevoke(share.user_id)}
                                        disabled={revokingId === share.user_id}
                                        className="p-1.5 text-t2-ink-3 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0 disabled:opacity-50"
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
