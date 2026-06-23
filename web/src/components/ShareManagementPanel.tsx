"use client";

import { useEffect, useState } from "react";
import { Users, X, ShieldAlert, Check, UserMinus } from "lucide-react";
import { apiFetch } from "@/lib/api";

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
}

export default function ShareManagementPanel({ fileId, onClose }: ShareManagementPanelProps) {
    const [shares, setShares] = useState<Share[]>([]);
    const [loading, setLoading] = useState(true);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    useEffect(() => {
        loadShares();
    }, [fileId]);

    const loadShares = async () => {
        setLoading(true);
        try {
            const res = await apiFetch(`/api/v1/files/${fileId}/shares`);
            if (res.ok) {
                const data = await res.json();
                setShares(data || []);
            }
        } catch (e) {
            console.error("Failed to load shares", e);
        } finally {
            setLoading(false);
        }
    };

    const handleRevoke = async (userId: string) => {
        if (!confirm("Remove access for this user?")) return;
        setRevokingId(userId);
        try {
            const res = await apiFetch(`/api/v1/files/${fileId}/shares/${userId}`, {
                method: "DELETE"
            });
            if (res.ok) {
                setShares(prev => prev.filter(s => s.user_id !== userId));
            } else {
                alert("Failed to remove access");
            }
        } catch (e) {
            console.error(e);
            alert("Error removing access");
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
            alert("Failed to update permission");
            loadShares(); // Revert
        }
    };

    return (
        <div className="absolute right-0 top-12 w-80 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200 font-semibold">
                    <Users size={16} />
                    <span>Shared Access</span>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-500 transition-colors">
                    <X size={16} />
                </button>
            </div>
            
            <div className="p-2 max-h-64 overflow-y-auto">
                {loading ? (
                    <div className="p-4 text-center text-sm text-gray-500 animate-pulse">Loading shares...</div>
                ) : shares.length === 0 ? (
                    <div className="p-4 text-center flex flex-col items-center justify-center text-gray-500 gap-2">
                        <ShieldAlert size={24} className="text-gray-300" />
                        <span className="text-sm">This note isn't shared with anyone yet.</span>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1">
                        {shares.map(share => (
                            <div key={share.user_id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">
                                        {(share.username || '?')[0].toUpperCase()}
                                    </div>
                                    <div className="flex flex-col truncate">
                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                            {share.username || 'Unknown User'}
                                        </span>
                                        <span className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                            <select
                                                value={share.permission}
                                                onChange={(e) => handleUpdatePermission(share.user_id, e.target.value)}
                                                className="bg-transparent border-none p-0 focus:ring-0 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300"
                                            >
                                                <option value="view">Lesezugriff</option>
                                                <option value="edit">Bearbeiter</option>
                                                <option value="share">Vollzugriff</option>
                                            </select>
                                        </span>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleRevoke(share.user_id)}
                                    disabled={revokingId === share.user_id}
                                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                    title="Remove Access"
                                >
                                    <UserMinus size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
