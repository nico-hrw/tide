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
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown);

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = originalOverflow;
        };
    }, [onClose]);

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
        <div className="fixed inset-0 bg-[#111827]/20 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white dark:bg-[#18181b] border border-[#e5e7eb] dark:border-zinc-800 rounded-[24px] shadow-[0px_24px_64px_rgba(17,24,39,0.16)] max-w-[520px] w-full overflow-hidden animate-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-[#e5e7eb] dark:border-zinc-800 flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-[#111827] dark:text-zinc-100">Datei freigeben</h2>
                        <p className="text-xs text-[#596170] dark:text-zinc-400 mt-0.5 truncate max-w-[340px]">{fileName}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="h-[44px] w-[44px] rounded-[12px] bg-[#f9fafb] hover:bg-[#f3f4f6] dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-[#e5e7eb] dark:border-zinc-700 flex items-center justify-center text-[#111827] dark:text-zinc-200 transition-colors"
                        aria-label="Schließen"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Permission Picker */}
                <div className="px-6 pt-5">
                    <h3 className="text-xs font-bold text-[#596170] dark:text-zinc-400 uppercase tracking-wider mb-2.5">Berechtigung</h3>
                    <div className="grid grid-cols-3 gap-2.5">
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
                                    className={`p-3 rounded-[12px] border text-left transition-all ${
                                        active
                                            ? 'border-[#111827] bg-[#111827] text-white dark:border-white dark:bg-white dark:text-zinc-900 shadow-sm'
                                            : 'border-[#e5e7eb] dark:border-zinc-800 bg-[#f9fafb]/50 dark:bg-zinc-800/40 hover:bg-[#f9fafb] dark:hover:bg-zinc-800 hover:border-[#d1d5db] dark:hover:border-zinc-700'
                                    }`}
                                >
                                    <Icon size={16} className={active ? 'text-white dark:text-zinc-900 mb-1.5' : 'text-[#596170] dark:text-zinc-400 mb-1.5'} />
                                    <div className={`text-xs font-bold ${active ? 'text-white dark:text-zinc-900' : 'text-[#111827] dark:text-zinc-200'}`}>{opt.label}</div>
                                    <div className={`text-[10px] ${active ? 'text-zinc-300 dark:text-zinc-600' : 'text-[#596170] dark:text-zinc-400'}`}>{opt.desc}</div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 max-h-[420px] overflow-y-auto space-y-5">
                    {/* Linked Files & Dependencies Section */}
                    {dependencies.length > 0 && (
                        <div className="p-3.5 rounded-[16px] bg-[#f9fafb] dark:bg-zinc-800/50 border border-[#e5e7eb] dark:border-zinc-700 text-[#596170] dark:text-zinc-300">
                            <div className="flex items-center justify-between mb-1.5">
                                <h4 className="text-xs font-bold text-[#111827] dark:text-zinc-200 flex items-center gap-1.5">
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
                                    className="text-[11px] text-[#111827] dark:text-zinc-300 font-semibold hover:underline"
                                >
                                    {selectedDepIds.size === dependencies.length ? 'Keine' : 'Alle'}
                                </button>
                            </div>
                            <p className="text-[11px] text-[#596170] dark:text-zinc-400 mb-2.5">
                                Wähle aus, welche verlinkten Notizen der Empfänger ebenfalls einsehen darf:
                            </p>
                            <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                                {dependencies.map(dep => (
                                    <label key={dep.id} className="flex items-center gap-2 text-xs text-[#111827] dark:text-zinc-200 cursor-pointer p-1.5 rounded-[8px] hover:bg-white dark:hover:bg-zinc-700/50 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={selectedDepIds.has(dep.id)}
                                            onChange={(e) => {
                                                const next = new Set(selectedDepIds);
                                                if (e.target.checked) next.add(dep.id);
                                                else next.delete(dep.id);
                                                setSelectedDepIds(next);
                                            }}
                                            className="w-4 h-4 rounded border-[#e5e7eb] dark:border-zinc-600 text-[#111827] focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 accent-[#111827] dark:accent-white"
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
                            <h3 className="text-xs font-bold text-[#596170] dark:text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Users size={14} />
                                <span>Deine Kontakte</span>
                            </h3>
                            <div className="space-y-2">
                                {contacts.map(contact => (
                                    <button
                                        key={contact.id}
                                        onClick={() => handleShareWithContact(contact)}
                                        disabled={sharing}
                                        className={`w-full flex items-center justify-between p-3 rounded-[12px] border transition-all text-left ${
                                            sharedContactId === contact.id
                                                ? 'border-emerald-500 bg-emerald-500/10'
                                                : 'border-[#e5e7eb] dark:border-zinc-800 hover:bg-[#f9fafb] dark:hover:bg-zinc-800 hover:border-[#d1d5db] dark:hover:border-zinc-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 truncate">
                                            <div className="w-8 h-8 rounded-full bg-[#111827] text-white dark:bg-zinc-700 dark:text-zinc-100 font-bold text-xs flex items-center justify-center shrink-0">
                                                {contact.username[0]?.toUpperCase() || 'U'}
                                            </div>
                                            <div className="truncate">
                                                <p className="text-xs font-semibold text-[#111827] dark:text-zinc-100 truncate">{contact.username}</p>
                                                <p className="text-[11px] text-[#596170] dark:text-zinc-400 truncate">{contact.email}</p>
                                            </div>
                                        </div>
                                        {sharedContactId === contact.id ? (
                                            <Check size={16} className="text-emerald-500 shrink-0" />
                                        ) : (
                                            <ArrowRight size={14} className="text-[#596170] dark:text-zinc-400 shrink-0" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Custom Email Invite / Search */}
                    <div className="pt-2 border-t border-[#e5e7eb] dark:border-zinc-800">
                        {!showCustomInput ? (
                            <button
                                onClick={() => setShowCustomInput(true)}
                                className="text-xs text-[#111827] dark:text-zinc-300 font-semibold hover:underline flex items-center gap-1.5 py-1"
                            >
                                <Mail size={14} />
                                <span>Per E-Mail suchen / einladen</span>
                            </button>
                        ) : (
                            <div className="space-y-2.5">
                                <div className="flex gap-2">
                                    <input
                                        type="email"
                                        value={customEmail}
                                        onChange={e => setCustomEmail(e.target.value)}
                                        placeholder="E-Mail-Adresse eingeben..."
                                        className="flex-1 h-[44px] px-3.5 rounded-[8px] border border-[#e5e7eb] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-[#111827] dark:text-zinc-100 placeholder:text-[#596170] dark:placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400"
                                    />
                                    <button
                                        onClick={handleSearchEmail}
                                        disabled={loading || !customEmail.trim()}
                                        className="bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] h-[44px] px-4 font-semibold text-[14px] disabled:opacity-50 transition-colors shrink-0 flex items-center justify-center"
                                    >
                                        {loading ? '...' : 'Suchen'}
                                    </button>
                                </div>
                                {searchResult && (
                                    <button
                                        onClick={() => handleShareWithContact(searchResult)}
                                        className="w-full p-3 rounded-[12px] bg-[#f9fafb] dark:bg-zinc-800/60 border border-[#e5e7eb] dark:border-zinc-700 hover:border-[#111827]/40 dark:hover:border-zinc-600 text-left flex items-center justify-between transition-colors"
                                    >
                                        <div>
                                            <p className="font-semibold text-xs text-[#111827] dark:text-zinc-100">{searchResult.username}</p>
                                            <p className="text-[11px] text-[#596170] dark:text-zinc-400">{searchResult.email}</p>
                                        </div>
                                        <span className="text-xs text-[#111827] dark:text-white font-semibold flex items-center gap-1">Jetzt teilen →</span>
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
