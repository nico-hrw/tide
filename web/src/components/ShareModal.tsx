"use client";

import { X, Users, Mail, Eye, Edit3, Share2, Link2, Check, ArrowRight, UserMinus, Loader2, ShieldCheck } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import * as Y from "yjs";
import { apiFetch } from "@/lib/api";
import { useDataStore } from "@/store/useDataStore";
import { useActiveNoteStore } from "@/store/activeNoteStore";
import { useSocialStore } from "@/store/useSocialStore";
import { generateAndWrapRotatedDEK, base64ToArrayBuffer, arrayBufferToBase64 } from "@/lib/crypto";
import { encryptSnapshot } from "@/lib/e2eeFraming";

export type SharePermission = 'view' | 'edit' | 'share';

interface Contact {
    id: string;
    username: string;
    email: string;
    public_key: string;
}

interface ExistingShare {
    file_id: string;
    user_id: string;
    status: string;
    permission: 'view' | 'edit' | 'share';
    username?: string;
    email?: string;
    public_key?: string;
    avatar_seed?: string;
    avatar_salt?: string;
    avatar_style?: string;
}

interface ShareModalProps {
    fileId: string;
    fileName: string;
    onClose: () => void;
    onShare: (recipientId: string, recipientEmail: string, recipientPubKey: string, permission: SharePermission, dependencyFileIds?: string[], canReshare?: boolean) => Promise<void>;
    myId: string;
    callerPermission?: 'owner' | 'view' | 'edit' | 'share';
}

export default function ShareModal({
    fileId,
    fileName,
    onClose,
    onShare,
    myId,
    callerPermission = 'owner'
}: ShareModalProps) {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [customEmail, setCustomEmail] = useState("");
    const [searchResult, setSearchResult] = useState<Contact | null>(null);
    const [loading, setLoading] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [sharedContactId, setSharedContactId] = useState<string | null>(null);
    const [permission, setPermission] = useState<SharePermission>(callerPermission === 'view' ? 'view' : 'view');
    const [canReshare, setCanReshare] = useState(false);

    // Existing shares state for DEK rotation & live role management
    const [existingShares, setExistingShares] = useState<ExistingShare[]>([]);
    const [loadingShares, setLoadingShares] = useState(false);
    const [revokingUserId, setRevokingUserId] = useState<string | null>(null);
    const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

    useEffect(() => {
        if (callerPermission === 'view') {
            setPermission('view');
        } else if (callerPermission === 'edit' && permission === 'share') {
            setPermission('edit');
        }
    }, [callerPermission, permission]);

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

    const loadExistingShares = useCallback(async () => {
        if (callerPermission !== 'owner') return;
        setLoadingShares(true);
        try {
            let res = await apiFetch(`/api/v1/files/${fileId}/shares`);
            if (res.status === 404) {
                res = await apiFetch(`/api/files/${fileId}/shares`);
            }
            if (res.ok) {
                const data = await res.json().catch(() => []);
                setExistingShares(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error("[ShareModal] Failed to load existing shares:", e);
        } finally {
            setLoadingShares(false);
        }
    }, [fileId, callerPermission]);

    const scanDependencies = useCallback(() => {
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
            } catch {
                // Ignore parse errors from invalid backup formats
            }
        }

        setDependencies(foundDeps);
        setSelectedDepIds(new Set(foundDeps.map(d => d.id)));
    }, [fileId]);

    useEffect(() => {
        loadContacts();
        scanDependencies();
        loadExistingShares();
    }, [fileId, loadExistingShares, scanDependencies]);

    const loadContacts = async () => {
        try {
            let res = await apiFetch(`/api/v1/contacts`);
            if (res.status === 404) {
                res = await apiFetch(`/api/contacts`);
            }
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
            let res = await apiFetch(`/api/v1/contacts/search`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: customEmail.trim() })
            });
            if (res.status === 404) {
                res = await apiFetch(`/api/contacts/search`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: customEmail.trim() })
                });
            }

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

    const isOptDisabled = (val: SharePermission) => {
        if (callerPermission === 'view') {
            return val !== 'view';
        }
        if (callerPermission === 'edit') {
            return val === 'share';
        }
        return false;
    };

    const handleShareWithContact = async (contact: Contact) => {
        setSharing(true);
        try {
            setSharedContactId(contact.id);
            await onShare(contact.id, contact.email, contact.public_key, permission, Array.from(selectedDepIds), canReshare);
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

    /**
     * Live role change:
     * PATCH /api/files/${noteId}/shares/${shareId} with { permission: newPermission }
     */
    const handleRoleChange = async (targetUserId: string, newPerm: SharePermission) => {
        setUpdatingRoleId(targetUserId);
        try {
            setExistingShares(prev => prev.map(s => s.user_id === targetUserId ? { ...s, permission: newPerm } : s));

            let res = await apiFetch(`/api/v1/files/${fileId}/shares/${targetUserId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ permission: newPerm }),
            });
            if (res.status === 404) {
                res = await apiFetch(`/api/files/${fileId}/shares/${targetUserId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ permission: newPerm }),
                });
            }

            if (!res.ok) {
                throw new Error(`Role update failed with status ${res.status}`);
            }
        } catch (err) {
            console.error("[ShareModal] Error updating role:", err);
            alert("Fehler beim Aktualisieren der Berechtigung");
            loadExistingShares();
        } finally {
            setUpdatingRoleId(null);
        }
    };

    /**
     * Chapter 2.3 DEK Rotation & Forward Secrecy:
     * When owner revokes access for targetUserId:
     * - Fetch remaining collaborators public RSA keys.
     * - Call generateAndWrapRotatedDEK(remainingPublicKeys) to generate newDEK and newAccessKeys.
     * - Encode current Y.Doc, encrypt with newDEK via encryptSnapshot.
     * - Encrypt secured_meta with newDEK.
     * - Call POST /api/files/${noteId}/revoke-and-rotate with
     *   { targetUserId, newKeyEpoch: currentEpoch + 1, newAccessKeys, newSecuredMeta, snapshot: { ivBase64, ciphertextBase64 } }
     * - Update activeDEK and keyEpoch in store.
     */
    const handleRevokeShare = async (targetUserId: string) => {
        if (!confirm("Zugriff für diesen Nutzer wirklich widerrufen? (Schlüsselrotation & Vorwärtsgeheimnis werden angewendet)")) {
            return;
        }

        setRevokingUserId(targetUserId);
        try {
            // 1. Fetch remaining collaborators public RSA keys
            const remainingUsers = existingShares.filter(s => s.user_id !== targetUserId);
            const remainingPublicKeys: Record<string, CryptoKey> = {};

            // Owner public key (mandatory so owner retains decrypt capability)
            const ownerPubKey = useDataStore.getState().publicKey;
            if (ownerPubKey) {
                remainingPublicKeys[myId] = ownerPubKey;
            }

            // Resolve public key for each remaining collaborator
            const socialContacts = useSocialStore.getState().contacts;
            for (const rem of remainingUsers) {
                let pubKeySpki = rem.public_key;
                if (!pubKeySpki) {
                    const match = socialContacts.find(c => c.partner.id === rem.user_id);
                    if (match?.partner?.public_key) {
                        pubKeySpki = match.partner.public_key;
                    }
                }
                if (!pubKeySpki) {
                    try {
                        let profRes = await apiFetch(`/api/v1/profiles/${rem.user_id}`);
                        if (profRes.status === 404) {
                            profRes = await apiFetch(`/api/profiles/${rem.user_id}`);
                        }
                        if (profRes.ok) {
                            const profData = await profRes.json().catch(() => null);
                            pubKeySpki = profData?.public_key || profData?.publicKey;
                        }
                    } catch {
                        // Profile fetch fallback failed, continue
                    }
                }

                if (pubKeySpki) {
                    try {
                        const importedKey = await window.crypto.subtle.importKey(
                            "spki",
                            base64ToArrayBuffer(pubKeySpki),
                            { name: "RSA-OAEP", hash: "SHA-256" },
                            true,
                            ["encrypt"]
                        );
                        remainingPublicKeys[rem.user_id] = importedKey;
                    } catch (keyErr) {
                        console.warn(`[ShareModal] Could not import public key for ${rem.user_id}:`, keyErr);
                    }
                }
            }

            // 2. Call generateAndWrapRotatedDEK(remainingPublicKeys)
            const { newDEK, wrappedKeys } = await generateAndWrapRotatedDEK(remainingPublicKeys);

            const newAccessKeys: Record<string, { wrapped_key: string; enc_dek: string; iv: string }> = {};
            for (const [uid, wKey] of Object.entries(wrappedKeys)) {
                newAccessKeys[uid] = {
                    wrapped_key: wKey.enc_dek,
                    enc_dek: wKey.enc_dek,
                    iv: wKey.iv,
                };
            }

            // 3. Encode current Y.Doc, encrypt with newDEK via encryptSnapshot
            const ydoc = useActiveNoteStore.getState().activeYDoc
                || (typeof window !== "undefined" && (window as unknown as { __tideActiveYDoc?: Y.Doc }).__tideActiveYDoc)
                || new Y.Doc();
            const stateBytes = Y.encodeStateAsUpdate(ydoc);
            const currentEpoch = useActiveNoteStore.getState().keyEpoch || 1;
            const newKeyEpoch = currentEpoch + 1;
            const snapshot = await encryptSnapshot(fileId, newKeyEpoch, newDEK, stateBytes);

            // 4. Encrypt secured_meta with newDEK
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const metaBytes = new TextEncoder().encode(JSON.stringify({ title: fileName }));
            const encryptedMeta = await window.crypto.subtle.encrypt(
                { name: "AES-GCM", iv },
                newDEK,
                metaBytes
            );
            const combinedMeta = new Uint8Array(12 + encryptedMeta.byteLength);
            combinedMeta.set(iv, 0);
            combinedMeta.set(new Uint8Array(encryptedMeta), 12);
            const newSecuredMeta = arrayBufferToBase64(combinedMeta.buffer);

            // 5. Call POST /api/files/${noteId}/revoke-and-rotate
            const rotatePayload = {
                targetUserId,
                newKeyEpoch,
                newAccessKeys,
                newSecuredMeta,
                snapshot: {
                    ivBase64: snapshot.ivBase64,
                    ciphertextBase64: snapshot.ciphertextBase64,
                },
            };

            let res = await apiFetch(`/api/v1/files/${fileId}/revoke-and-rotate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(rotatePayload),
            });
            if (res.status === 404) {
                res = await apiFetch(`/api/files/${fileId}/revoke-and-rotate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(rotatePayload),
                });
            }

            if (!res.ok) {
                throw new Error(`revoke-and-rotate failed with status ${res.status}`);
            }

            // 6. Update activeDEK and keyEpoch in store
            useActiveNoteStore.getState().setKeyEpoch(newKeyEpoch);
            useActiveNoteStore.setState({ keyEpoch: newKeyEpoch } as Partial<import("@/store/activeNoteStore").ActiveNoteState>);
            if (typeof window !== "undefined") {
                (window as unknown as { __tideActiveDEK?: CryptoKey }).__tideActiveDEK = newDEK;
            }
            useDataStore.getState().updateFileRaw(fileId, {
                key_epoch: newKeyEpoch,
                access_keys: newAccessKeys,
                secured_meta: newSecuredMeta,
            });

            // Update local list
            setExistingShares(prev => prev.filter(s => s.user_id !== targetUserId));
        } catch (err) {
            console.error("[ShareModal] Revoke & rotate failed:", err);
            alert("Fehler beim Widerrufen der Freigabe");
        } finally {
            setRevokingUserId(null);
        }
    };

    return (
        <div className="fixed inset-0 bg-[#111827]/20 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white dark:bg-[#18181b] border border-[#e5e7eb] dark:border-zinc-800 rounded-[24px] shadow-[0px_24px_64px_rgba(17,24,39,0.16)] max-w-[540px] w-full overflow-hidden animate-in zoom-in-95 duration-150"
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

                <div className="max-h-[520px] overflow-y-auto">
                    {/* Existing Collaborators Section (Owner only) */}
                    {callerPermission === 'owner' && existingShares.length > 0 && (
                        <div className="p-6 border-b border-[#e5e7eb] dark:border-zinc-800 bg-[#f9fafb]/50 dark:bg-zinc-800/30">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-bold text-[#596170] dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <ShieldCheck size={14} className="text-emerald-500" />
                                    <span>Aktive Freigaben ({existingShares.length})</span>
                                </h3>
                                {loadingShares && <Loader2 size={12} className="animate-spin text-zinc-400" />}
                            </div>

                            <div className="space-y-2">
                                {existingShares.map(share => {
                                    const isRevoking = revokingUserId === share.user_id;
                                    const isUpdating = updatingRoleId === share.user_id;
                                    return (
                                        <div
                                            key={share.user_id}
                                            className="flex items-center justify-between p-3 rounded-[12px] bg-white dark:bg-zinc-800 border border-[#e5e7eb] dark:border-zinc-700"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                                <div className="w-8 h-8 rounded-full bg-[#111827] text-white dark:bg-zinc-700 dark:text-zinc-100 font-bold text-xs flex items-center justify-center shrink-0">
                                                    {(share.username || 'U')[0]?.toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-semibold text-[#111827] dark:text-zinc-100 truncate">
                                                        {share.username || share.email || "Nutzer"}
                                                    </p>
                                                    <p className="text-[10px] text-[#596170] dark:text-zinc-400">
                                                        {share.status === "accepted" ? "Akzeptiert" : "Ausstehend"}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                {/* Role change dropdown */}
                                                <select
                                                    value={share.permission}
                                                    disabled={isUpdating || isRevoking}
                                                    onChange={(e) => handleRoleChange(share.user_id, e.target.value as SharePermission)}
                                                    className="text-xs bg-[#f9fafb] dark:bg-zinc-700 hover:bg-[#f3f4f6] dark:hover:bg-zinc-600 text-[#111827] dark:text-zinc-200 font-medium rounded-[8px] px-2.5 py-1.5 border border-[#e5e7eb] dark:border-zinc-600 cursor-pointer outline-none focus:ring-1 focus:ring-[#111827] dark:focus:ring-white transition-colors"
                                                >
                                                    <option value="view">Lesen</option>
                                                    <option value="edit">Bearbeiten</option>
                                                    <option value="share">Vollzugriff</option>
                                                </select>

                                                {/* Revoke button */}
                                                <button
                                                    onClick={() => handleRevokeShare(share.user_id)}
                                                    disabled={isRevoking}
                                                    className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-[8px] border border-rose-200 dark:border-rose-900/40 transition-colors disabled:opacity-50"
                                                    title="Zugriff widerrufen & DEK rotieren"
                                                >
                                                    {isRevoking ? (
                                                        <Loader2 size={14} className="animate-spin text-rose-500" />
                                                    ) : (
                                                        <UserMinus size={14} />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Permission Picker for new invites */}
                    <div className="px-6 pt-5">
                        <h3 className="text-xs font-bold text-[#596170] dark:text-zinc-400 uppercase tracking-wider mb-2.5">Berechtigung für neue Freigabe</h3>
                        <div className="grid grid-cols-3 gap-2.5">
                            {([
                                { val: 'view' as const, icon: Eye, label: 'Ansehen', desc: 'Nur lesen' },
                                { val: 'edit' as const, icon: Edit3, label: 'Bearbeiten', desc: 'Lesen + schreiben' },
                                { val: 'share' as const, icon: Share2, label: 'Teilen', desc: 'Weiter teilen' },
                            ]).map(opt => {
                                const Icon = opt.icon;
                                const disabled = isOptDisabled(opt.val);
                                const active = permission === opt.val && !disabled;
                                return (
                                    <button
                                        key={opt.val}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => {
                                            if (!disabled) setPermission(opt.val);
                                        }}
                                        className={`p-3 rounded-[12px] border text-left transition-all ${
                                            disabled
                                                ? 'border-[#e5e7eb] dark:border-zinc-800 bg-[#f9fafb]/30 dark:bg-zinc-800/20 opacity-40 cursor-not-allowed'
                                                : active
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

                        {/* Info banner for view-only */}
                        {callerPermission === 'view' && (
                            <div className="mt-3 p-3 rounded-[12px] bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-xs text-blue-700 dark:text-blue-300">
                                Du hast Lesezugriff und kannst diese Notiz nur mit Lesezugriff weiterleiten.
                            </div>
                        )}

                        {/* Re-sharing checkbox for owners only */}
                        {callerPermission === 'owner' && (
                            <div className="mt-3 p-3 rounded-[12px] bg-[#f9fafb] dark:bg-zinc-800/40 border border-[#e5e7eb] dark:border-zinc-800">
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={canReshare}
                                        onChange={(e) => setCanReshare(e.target.checked)}
                                        className="mt-0.5 w-4 h-4 rounded border-[#e5e7eb] dark:border-zinc-600 text-[#111827] focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 accent-[#111827] dark:accent-white"
                                    />
                                    <div className="flex-1">
                                        <div className="text-xs font-bold text-[#111827] dark:text-zinc-200">Weiterleiten erlauben</div>
                                        <div className="text-[11px] text-[#596170] dark:text-zinc-400 mt-0.5">Empfänger darf diese Notiz mit gleichen oder geringeren Rechten weiterleiten</div>
                                    </div>
                                </label>
                            </div>
                        )}
                    </div>

                    {/* Content Section */}
                    <div className="p-6 space-y-5">
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
        </div>
    );
}
