"use client";

import { X, Users, Mail, Eye, Edit3, Share2 } from "lucide-react";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export type SharePermission = 'view' | 'edit' | 'share';

interface Contact {
    id: string;
    username: string;
    email: string;
    public_key: string;
}

interface ShareModalProps {
    fileId: string;
    fileName: string;
    onClose: () => void;
    onShare: (recipientId: string, recipientEmail: string, recipientPubKey: string, permission: SharePermission) => Promise<void>;
    myId: string;
}

export default function ShareModal({
    fileId,
    fileName,
    onClose,
    onShare,
    myId
}: ShareModalProps) {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [customEmail, setCustomEmail] = useState("");
    const [searchResult, setSearchResult] = useState<Contact | null>(null);
    const [loading, setLoading] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [sharedContactId, setSharedContactId] = useState<string | null>(null);
    const [permission, setPermission] = useState<SharePermission>('view');

    useEffect(() => {
        loadContacts();
    }, []);

    const loadContacts = async () => {
        try {
            const res = await apiFetch(`/api/v1/contacts`);
            if (res.ok) {
                interface EnrichedContact {
                    partner: {
                        id: string;
                        username: string;
                        email: string;
                        public_key: string;
                    };
                }
                const enrichedContacts = await res.json().catch(() => []) as EnrichedContact[];
                if (!Array.isArray(enrichedContacts)) {
                    setContacts([]);
                    return;
                }
                // Transform enriched contacts to flat structure
                const flatContacts = (enrichedContacts || []).map((ec) => ({
                    id: ec.partner.id,
                    username: ec.partner.username,
                    email: ec.partner.email,
                    public_key: ec.partner.public_key
                }));
                setContacts(flatContacts);
            }
        } catch (e) {
            console.error("Failed to load contacts:", e);
        }
    };

    const handleSearchEmail = async () => {
        if (!customEmail.trim()) return;

        setLoading(true);
        setSearchResult(null);

        try {
            const res = await apiFetch(`/api/v1/contacts/search`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: customEmail.trim() })
            });

            if (res.ok) {
                const results = await res.json().catch(() => null);
                if (results && results.length > 0) {
                    setSearchResult(results[0]);
                } else {
                    alert("User not found");
                }
            } else {
                alert("Failed to search user");
            }
        } catch (e) {
            console.error("Search failed:", e);
            alert("Search failed");
        } finally {
            setLoading(false);
        }
    };

    const handleShareWithContact = async (contact: Contact) => {
        setSharing(true);
        try {
            setSharedContactId(contact.id);
            await onShare(contact.id, contact.email, contact.public_key, permission);
            setTimeout(() => {
                onClose();
            }, 600);
        } catch (e) {
            console.error("Share failed:", e);
            setSharedContactId(null);
        } finally {
            setSharing(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Share File</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">{fileName}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Permission Picker */}
                <div className="px-6 pt-5">
                    <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Berechtigung</h3>
                    <div className="grid grid-cols-3 gap-2">
                        {([
                            { val: 'view' as const, icon: Eye, label: 'Ansehen', desc: 'Nur lesen' },
                            { val: 'edit' as const, icon: Edit3, label: 'Bearbeiten', desc: 'Lesen + schreiben' },
                            { val: 'share' as const, icon: Share2, label: 'Teilen', desc: 'Auch weiter teilen' },
                        ]).map(opt => {
                            const Icon = opt.icon;
                            const active = permission === opt.val;
                            return (
                                <button
                                    key={opt.val}
                                    onClick={() => setPermission(opt.val)}
                                    className={`px-3 py-2.5 rounded-xl border text-left transition-all ${active ? 'border-rose-400 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-500/40' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                                >
                                    <Icon size={14} className={active ? 'text-rose-500 mb-1' : 'text-gray-500 mb-1'} />
                                    <div className={`text-xs font-bold ${active ? 'text-rose-700 dark:text-rose-300' : 'text-gray-700 dark:text-gray-300'}`}>{opt.label}</div>
                                    <div className="text-[10px] text-gray-500 dark:text-gray-500">{opt.desc}</div>
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5">Empfänger können geteilte Dateien immer als Kopie übernehmen.</p>
                </div>

                {/* Content */}
                <div className="p-6 max-h-96 overflow-y-auto">
                    {/* Contacts List */}
                    {contacts.length > 0 && (
                        <div className="mb-6">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                                <Users size={16} />
                                Your Contacts
                            </h3>
                            <div className="space-y-2">
                                {contacts.map(contact => (
                                    <button
                                        key={contact.id}
                                        onClick={() => handleShareWithContact(contact)}
                                        disabled={sharing}
                                        className={`w-full p-3 rounded-lg text-left transition-all ${sharedContactId === contact.id
                                            ? 'bg-green-500 text-white animate-pulse'
                                            : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                                            } ${sharing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <div className="font-medium text-gray-900 dark:text-white">
                                            {contact.username || contact.email}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                            {contact.email}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Custom Email Input */}
                    <div>
                        <button
                            onClick={() => setShowCustomInput(!showCustomInput)}
                            className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2 hover:text-black dark:hover:text-white transition-colors"
                        >
                            <Mail size={16} />
                            {showCustomInput ? "Hide" : "Share with"} Email Address
                        </button>

                        {showCustomInput && (
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <input
                                        type="email"
                                        value={customEmail}
                                        onChange={(e) => setCustomEmail(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSearchEmail()}
                                        placeholder="Enter email address"
                                        className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                                    />
                                    <button
                                        onClick={handleSearchEmail}
                                        disabled={loading || !customEmail.trim()}
                                        className="px-4 py-2 bg-rose-500 text-white rounded-lg text-sm font-medium hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {loading ? "..." : "Search"}
                                    </button>
                                </div>

                                {searchResult && (
                                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="font-medium text-gray-900 dark:text-white text-sm">
                                                    {searchResult.username || searchResult.email}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                    {searchResult.email}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleShareWithContact(searchResult)}
                                                disabled={sharing}
                                                className="px-3 py-1.5 bg-rose-500 text-white rounded-lg text-xs font-medium hover:bg-rose-600 disabled:opacity-50 transition-colors"
                                            >
                                                Share
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {contacts.length === 0 && !showCustomInput && (
                        <div className="text-center text-gray-400 dark:text-gray-500 py-8">
                            <p className="text-sm">No contacts yet</p>
                            <p className="text-xs mt-1">Use email input to share with someone</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
