"use client";

import { X, Users, Mail, Eye, Edit3, Share2, Link2, Check, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useDataStore } from "@/store/useDataStore";

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
    onShare: (recipientId: string, recipientEmail: string, recipientPubKey: string, permission: SharePermission, dependencyFileIds?: string[]) => Promise<void>;
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

    // Linked files / dependencies state
    const [dependencies, setDependencies] = useState<{ id: string; title: string; type: string }[]>([]);
    const [selectedDepIds, setSelectedDepIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        loadContacts();
        scanDependencies();
    }, [fileId]);

    const scanDependencies = () => {
        const allNotes = useDataStore.getState().notes;
        const noteBackupStr = localStorage.getItem(`tide_backup_${fileId}`);
        const foundDeps: { id: string; title: string; type: string }[] = [];
        const seenIds = new Set<string>();

        if (noteBackupStr) {
            try {
                // Match data-id="..." or "id":"..." in JSON / HTML
                const idMatches = noteBackupStr.matchAll(/"(?:data-)?id"\s*:\s*"([a-f0-9-]+)"/gi);
                for (const m of idMatches) {
                    const matchedId = m[1];
                    if (matchedId !== fileId && !seenIds.has(matchedId)) {
                        seenIds.add(matchedId);
                        const matchNote = allNotes.find(n => n.id === matchedId);
                        if (matchNote) {
                            foundDeps.push({
                                id: matchNote.id,
                                title: matchNote.title,
                                type: matchNote.type
                            });
                        }
                    }
                }
            } catch (e) {}
        }

        setDependencies(foundDeps);
        setSelectedDepIds(new Set(foundDeps.map(d => d.id)));
    };

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
                    alert("Nutzer nicht gefunden.");
                }
            } else {
                alert("Suche fehlgeschlagen.");
            }
        } catch (e) {
            console.error("Search failed:", e);
            alert("Suche fehlgeschlagen.");
        } finally {
            setLoading(false);
        }
    };

    const handleShareWithContact = async (contact: Contact) => {
        setSharing(true);
        try {
            setSharedContactId(contact.id);
            await onShare(contact.id, contact.email, contact.public_key, permission, Array.from(selectedDepIds));
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-gray-900 dark:text-white">Datei freigeben</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[280px]">{fileName}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Permission Picker */}
                <div className="px-5 pt-4">
                    <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Berechtigung</h3>
                    <div className="grid grid-cols-3 gap-2">
                        {([
                            { val: 'view' as const, icon: Eye, label: 'Ansehen', desc: 'Nur lesen' },
                            { val: 'edit' as const, icon: Edit3, label: 'Bearbeiten', desc: 'Lesen + schreiben' },
                            { val: 'share' as const, icon: Share2, label: 'Teilen', desc: 'Weiter teilen' },
                        ]).map(opt => {
                            const Icon = opt.icon;
                            const active = permission === opt.val;
                            return (
                                <button
                                    key={opt.val}
                                    onClick={() => setPermission(opt.val)}
                                    className={`px-3 py-2 rounded-xl border text-left transition-all ${active ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 dark:border-purple-500/40 shadow-sm' : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700'}`}
                                >
                                    <Icon size={14} className={active ? 'text-purple-600 dark:text-purple-400 mb-1' : 'text-gray-400 mb-1'} />
                                    <div className={`text-xs font-bold ${active ? 'text-purple-700 dark:text-purple-300' : 'text-gray-700 dark:text-gray-300'}`}>{opt.label}</div>
                                    <div className="text-[10px] text-gray-500 dark:text-gray-400">{opt.desc}</div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Content */}
                <div className="p-5 max-h-[380px] overflow-y-auto space-y-4">
                    {/* Linked Files & Dependencies Section */}
                    {dependencies.length > 0 && (
                        <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20">
                            <div className="flex items-center justify-between mb-1">
                                <h4 className="text-xs font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                                    <Link2 size={13} />
                                    <span>Verlinkte Notizen & Medien ({dependencies.length})</span>
                                </h4>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (selectedDepIds.size === dependencies.length) {
                                            setSelectedDepIds(new Set());
                                        } else {
                                            setSelectedDepIds(new Set(dependencies.map(d => d.id)));
                                        }
                                    }}
                                    className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold hover:underline"
                                >
                                    {selectedDepIds.size === dependencies.length ? 'Keine' : 'Alle'}
                                </button>
                            </div>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
                                Wähle aus, welche verlinkten Notizen der Empfänger ebenfalls einsehen darf:
                            </p>
                            <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                                {dependencies.map(dep => (
                                    <label key={dep.id} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200 cursor-pointer p-1 rounded hover:bg-purple-500/10 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={selectedDepIds.has(dep.id)}
                                            onChange={(e) => {
                                                const next = new Set(selectedDepIds);
                                                if (e.target.checked) next.add(dep.id);
                                                else next.delete(dep.id);
                                                setSelectedDepIds(next);
                                            }}
                                            className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500"
                                        />
                                        <span className="truncate flex-1">{dep.title}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Contacts List */}
                    {contacts.length > 0 && (
                        <div>
                            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Users size={14} />
                                <span>Deine Kontakte</span>
                            </h3>
                            <div className="space-y-1.5">
                                {contacts.map(contact => (
                                    <button
                                        key={contact.id}
                                        onClick={() => handleShareWithContact(contact)}
                                        disabled={sharing}
                                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all text-left ${
                                            sharedContactId === contact.id
                                                ? 'border-emerald-500 bg-emerald-500/10'
                                                : 'border-gray-200 dark:border-slate-800 hover:border-purple-500/40 hover:bg-purple-500/5'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5 truncate">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shrink-0">
                                                {contact.username[0]?.toUpperCase() || 'U'}
                                            </div>
                                            <div className="truncate">
                                                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{contact.username}</p>
                                                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{contact.email}</p>
                                            </div>
                                        </div>
                                        {sharedContactId === contact.id ? (
                                            <Check size={16} className="text-emerald-500 shrink-0" />
                                        ) : (
                                            <ArrowRight size={14} className="text-gray-400 shrink-0" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Custom Email Invite / Search */}
                    <div className="pt-2 border-t border-gray-100 dark:border-slate-800">
                        {!showCustomInput ? (
                            <button
                                onClick={() => setShowCustomInput(true)}
                                className="text-xs text-purple-600 dark:text-purple-400 font-semibold hover:underline flex items-center gap-1.5"
                            >
                                <Mail size={14} />
                                <span>Per E-Mail suchen / einladen</span>
                            </button>
                        ) : (
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <input
                                        type="email"
                                        value={customEmail}
                                        onChange={e => setCustomEmail(e.target.value)}
                                        placeholder="E-Mail-Adresse eingeben..."
                                        className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs outline-none focus:ring-1 focus:ring-purple-500"
                                    />
                                    <button
                                        onClick={handleSearchEmail}
                                        disabled={loading || !customEmail.trim()}
                                        className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold disabled:opacity-50"
                                    >
                                        {loading ? '...' : 'Suchen'}
                                    </button>
                                </div>
                                {searchResult && (
                                    <button
                                        onClick={() => handleShareWithContact(searchResult)}
                                        className="w-full p-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-left flex items-center justify-between text-xs"
                                    >
                                        <div>
                                            <p className="font-semibold text-gray-900 dark:text-gray-100">{searchResult.username}</p>
                                            <p className="text-[11px] text-gray-500">{searchResult.email}</p>
                                        </div>
                                        <span className="text-xs text-purple-600 font-semibold">Jetzt teilen →</span>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
