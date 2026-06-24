import React, { useState, useEffect } from 'react';
import { X, User, Shield, Trash2, ShieldAlert, Loader2, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import Avatar from '../Profile/Avatar';

interface ShareManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
    fileId: string;
    fileTitle: string;
}

interface FileShare {
    file_id: string;
    user_id: string;
    username?: string;
    status: string;
    permission: 'view' | 'edit' | 'share';
    avatar_seed?: string;
    avatar_salt?: string;
    avatar_style?: string;
}

export default function ShareManagementModal({ isOpen, onClose, fileId, fileTitle }: ShareManagementModalProps) {
    const [shares, setShares] = useState<FileShare[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchShares = async () => {
        if (!fileId) return;
        setLoading(true);
        setError('');
        try {
            const res = await apiFetch(`/api/v1/files/${fileId}/shares`);
            if (res.ok) {
                const data = await res.json();
                setShares(data || []);
            } else {
                setError('Fehler beim Laden der Berechtigungen');
            }
        } catch (e) {
            setError('Netzwerkfehler');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchShares();
        }
    }, [isOpen, fileId]);

    const handleUpdatePermission = async (userId: string, newPermission: string) => {
        try {
            // Optimistic update
            setShares(prev => prev.map(s => s.user_id === userId ? { ...s, permission: newPermission as any } : s));
            
            const res = await apiFetch(`/api/v1/files/${fileId}/shares/${userId}`, {
                method: 'PATCH',
                body: JSON.stringify({ permission: newPermission })
            });
            if (!res.ok) throw new Error();
        } catch (e) {
            alert("Fehler beim Aktualisieren der Berechtigung.");
            fetchShares(); // revert
        }
    };

    const handleRevokeShare = async (userId: string) => {
        if (!confirm("Zugriff für diese Person wirklich entfernen?")) return;
        try {
            setShares(prev => prev.filter(s => s.user_id !== userId));
            const res = await apiFetch(`/api/v1/files/${fileId}/shares/${userId}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error();
        } catch (e) {
            alert("Fehler beim Entfernen des Zugriffs.");
            fetchShares(); // revert
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-white/10 flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Berechtigungen verwalten</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[280px]">Für "{fileTitle}"</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X size={20} className="text-gray-500 dark:text-slate-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="flex justify-center items-center py-12">
                            <Loader2 size={24} className="animate-spin text-blue-500" />
                        </div>
                    ) : error ? (
                        <div className="text-center text-red-500 py-8 text-sm">{error}</div>
                    ) : shares.length === 0 ? (
                        <div className="text-center text-gray-400 py-8 text-sm">
                            <ShieldAlert size={32} className="mx-auto mb-3 opacity-50" />
                            Diese Notiz ist noch nicht privat geteilt.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {shares.map(share => (
                                <div key={share.user_id} className="flex items-center justify-between bg-gray-50 dark:bg-white/5 p-3 rounded-xl border border-gray-100 dark:border-white/10">
                                    <div className="flex items-center gap-3">
                                        <Avatar seed={(share.avatar_seed || share.user_id) + (share.avatar_salt || '')} style={share.avatar_style as any} size={36} />
                                        <div>
                                            <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                                {share.username || 'Unbekannt'}
                                            </p>
                                            <p className="text-[11px] text-gray-500">Status: {share.status === 'accepted' ? 'Akzeptiert' : 'Ausstehend'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={share.permission}
                                            onChange={(e) => handleUpdatePermission(share.user_id, e.target.value)}
                                            className="text-xs bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500"
                                        >
                                            <option value="view">Lesezugriff</option>
                                            <option value="edit">Bearbeiter</option>
                                        </select>
                                        <button
                                            onClick={() => handleRevokeShare(share.user_id)}
                                            className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors"
                                            title="Zugriff entfernen"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
