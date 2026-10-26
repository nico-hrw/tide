import React, { useState, useRef } from 'react';
import { Shield, Download, Copy, Check, Upload, KeyRound, LogOut } from 'lucide-react';
import {
    getMasterKey,
    storeMasterKey,
    clearMasterKey,
    purgeLegacyKeys,
    getEncryptedVault,
    storeEncryptedVault,
} from '@/lib/keyStorage';

export interface SecurityVaultTabProps {
    userProfile?: {
        id?: string;
        user_id?: string;
        username?: string;
        email?: string;
        bio?: string;
        title?: string;
        avatar_seed?: string;
        avatar_salt?: string;
        avatar_style?: string;
        is_verified?: boolean;
        profile_status?: number;
    };
    onLogout?: () => void;
}

export const SecurityVaultTab: React.FC<SecurityVaultTabProps> = ({ userProfile, onLogout }) => {
    const [pinInputValue, setPinInputValue] = useState("");
    const [copyFeedback, setCopyFeedback] = useState(false);
    const [backupStatus, setBackupStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const downloadJson = (content: string, filename: string) => {
        const blob = new Blob([content], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const setSessionAndLocal = (key: string, val?: string) => {
        if (val) {
            localStorage.setItem(key, val);
            sessionStorage.setItem(key, val);
        }
    };

    const getActivePrivateKeyJwk = async () => {
        const masterKey = await getMasterKey();
        if (masterKey) {
            try {
                return await window.crypto.subtle.exportKey("jwk", masterKey);
            } catch {
                // Non-extractable key cannot be exported as JWK
            }
        }
        const rawKey = localStorage.getItem("tide_session_key") || sessionStorage.getItem("tide_session_key");
        if (rawKey) {
            try {
                return typeof rawKey === 'string' ? JSON.parse(rawKey) : rawKey;
            } catch {
                return rawKey;
            }
        }
        return null;
    };

    const handleExportMasterKey = async () => {
        try {
            const privateKeyJwk = await getActivePrivateKeyJwk();

            if (!privateKeyJwk) {
                const encryptedVault = await getEncryptedVault();
                if (encryptedVault) {
                    const backupPayload = JSON.stringify({
                        app: "tide",
                        version: 2,
                        type: "encrypted_vault_backup",
                        exportedAt: new Date().toISOString(),
                        vault: encryptedVault
                    }, null, 2);

                    downloadJson(backupPayload, "tide-master-key-vault-backup.json");
                    setBackupStatus({ type: 'success', msg: 'Master-Schlüssel erfolgreich exportiert!' });
                    setTimeout(() => setBackupStatus(null), 4000);
                    return;
                }

                setBackupStatus({ type: 'error', msg: 'Kein aktiver Master-Schlüssel im Browser-Speicher gefunden.' });
                return;
            }

            const email = localStorage.getItem("tide_user_email") || sessionStorage.getItem("tide_user_email") || userProfile?.email || "";
            const userId = localStorage.getItem("tide_user_id") || sessionStorage.getItem("tide_user_id") || userProfile?.id || userProfile?.user_id || "";
            const publicKeySpki = localStorage.getItem("tide_user_public_key") || sessionStorage.getItem("tide_user_public_key") || "";

            const backupData = {
                app: "tide",
                version: 2,
                timestamp: new Date().toISOString(),
                email,
                userId,
                publicKeySpki,
                privateKeyJwk
            };

            const safeEmail = (email || 'user').replace(/[^a-zA-Z0-9@._-]/g, '_');
            downloadJson(JSON.stringify(backupData, null, 2), `tide-master-key-${safeEmail}-${Date.now()}.json`);
            setBackupStatus({ type: 'success', msg: 'Master-Schlüssel erfolgreich exportiert!' });
            setTimeout(() => setBackupStatus(null), 4000);
        } catch (err: any) {
            console.error("Export Master Key failed:", err);
            setBackupStatus({ type: 'error', msg: err?.message || 'Export fehlgeschlagen.' });
        }
    };

    const handleCopyMasterKey = async () => {
        try {
            const privateKeyJwk = await getActivePrivateKeyJwk();

            if (!privateKeyJwk) {
                const encryptedVault = await getEncryptedVault();
                if (encryptedVault) {
                    const backupPayload = JSON.stringify({
                        app: "tide",
                        version: 2,
                        type: "encrypted_vault_backup",
                        exportedAt: new Date().toISOString(),
                        vault: encryptedVault
                    }, null, 2);

                    await navigator.clipboard.writeText(backupPayload);
                    setCopyFeedback(true);
                    setBackupStatus({ type: 'success', msg: 'Verschlüsseltes Master-Key-Backup in die Zwischenablage kopiert!' });
                    setTimeout(() => {
                        setCopyFeedback(false);
                        setBackupStatus(null);
                    }, 2000);
                    return;
                }

                setBackupStatus({ type: 'error', msg: 'Kein aktiver Master-Schlüssel im Browser-Speicher gefunden.' });
                return;
            }

            const email = localStorage.getItem("tide_user_email") || sessionStorage.getItem("tide_user_email") || userProfile?.email || "";
            const userId = localStorage.getItem("tide_user_id") || sessionStorage.getItem("tide_user_id") || userProfile?.id || userProfile?.user_id || "";
            const publicKeySpki = localStorage.getItem("tide_user_public_key") || sessionStorage.getItem("tide_user_public_key") || "";

            const backupData = {
                app: "tide",
                version: 2,
                timestamp: new Date().toISOString(),
                email,
                userId,
                publicKeySpki,
                privateKeyJwk
            };

            await navigator.clipboard.writeText(JSON.stringify(backupData, null, 2));
            setCopyFeedback(true);
            setTimeout(() => setCopyFeedback(false), 2000);
        } catch (err: any) {
            console.error("Copy Master Key failed:", err);
            setBackupStatus({ type: 'error', msg: 'Kopieren fehlgeschlagen.' });
        }
    };

    const handleImportMasterKey = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const text = event.target?.result as string;
                if (!text) throw new Error("Datei ist leer.");

                const parsed = JSON.parse(text);

                // Handle encrypted vault backup format
                if (parsed && (parsed.type === "encrypted_vault_backup" || (parsed.app === "tide" && parsed.vault))) {
                    const vaultData = parsed.vault || parsed;
                    await storeEncryptedVault(vaultData);
                    purgeLegacyKeys();

                    setSessionAndLocal("tide_user_id", vaultData.userId || parsed.userId);
                    setSessionAndLocal("tide_user_email", vaultData.email || parsed.email);

                    setBackupStatus({
                        type: 'success',
                        msg: 'Verschlüsseltes Master-Key-Backup erfolgreich importiert! Die Seite wird neu geladen...'
                    });

                    setTimeout(() => {
                        window.location.reload();
                    }, 1200);
                    return;
                }

                const privateKey = parsed.privateKeyJwk || parsed;

                // Validate privateKeyJwk: checks for kty === "RSA" and existence of n and d
                if (!privateKey || privateKey.kty !== "RSA" || !privateKey.n || !privateKey.d) {
                    throw new Error("Ungültiges RSA-Schlüsselformat: kty muss 'RSA' sein und Komponenten 'n' & 'd' müssen existieren.");
                }

                // Import RSA private key to CryptoKey and store securely
                const importedKey = await window.crypto.subtle.importKey(
                    "jwk",
                    privateKey,
                    { name: "RSA-OAEP", hash: "SHA-256" },
                    true,
                    ["decrypt"]
                );

                await storeMasterKey(importedKey);
                purgeLegacyKeys();

                setSessionAndLocal("tide_user_id", parsed.userId);
                setSessionAndLocal("tide_user_email", parsed.email);
                setSessionAndLocal("tide_user_public_key", parsed.publicKeySpki);

                setBackupStatus({
                    type: 'success',
                    msg: 'Schlüssel erfolgreich importiert! Die Seite wird neu geladen...'
                });

                setTimeout(() => {
                    window.location.reload();
                }, 1200);
            } catch (err: any) {
                console.error("Import Master Key failed:", err);
                setBackupStatus({
                    type: 'error',
                    msg: err?.message || 'Fehler beim Lesen oder Validieren der Schlüsseldatei.'
                });
            } finally {
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
            }
        };

        reader.onerror = () => {
            setBackupStatus({ type: 'error', msg: 'Fehler beim Lesen der Datei.' });
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        };

        reader.readAsText(file);
    };

    const handleLogout = async () => {
        try {
            await clearMasterKey();
            purgeLegacyKeys();
        } catch (err) {
            console.error("Error clearing master key:", err);
        }
        if (onLogout) {
            onLogout();
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Security</h3>
                <div className="space-y-4">
                    {/* Master-Key Vault Backup */}
                    <div className="p-6 rounded-2xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 space-y-4">
                        <div className="flex items-center gap-3 mb-2">
                            <Shield className="w-5 h-5 text-gray-400" />
                            <span className="font-semibold text-gray-900 dark:text-white">Master-Key Vault Backup</span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 text-[10px] font-bold uppercase ml-auto">
                                Zero Knowledge
                            </span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Sichere deinen privaten RSA-Master-Schlüssel als JSON-Datei. Bei einem Rechner- oder Browserwechsel kannst du deine Notizen damit sofort wiederherstellen.
                        </p>

                        {backupStatus && (
                            <div className={`p-3 rounded-xl text-xs font-semibold ${backupStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
                                {backupStatus.msg}
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2.5 pt-1">
                            <button
                                type="button"
                                onClick={handleExportMasterKey}
                                className="inline-flex items-center gap-2 bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] h-[44px] px-4 font-semibold text-[14px] transition-all active:scale-95"
                            >
                                <Download className="w-4 h-4" />
                                <span>Schlüssel herunterladen (JSON)</span>
                            </button>

                            <button
                                type="button"
                                onClick={handleCopyMasterKey}
                                className="inline-flex items-center gap-2 px-4 h-[44px] bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 border border-[#e5e7eb] dark:border-zinc-700 rounded-[8px] text-[14px] font-semibold transition-all active:scale-95"
                            >
                                {copyFeedback ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                <span>{copyFeedback ? "Kopiert!" : "In Zwischenablage kopieren"}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="inline-flex items-center gap-2 px-4 h-[44px] bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 border border-[#e5e7eb] dark:border-zinc-700 rounded-[8px] text-[14px] font-semibold transition-all active:scale-95"
                            >
                                <Upload className="w-4 h-4" />
                                <span>Schlüssel importieren (JSON)</span>
                            </button>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json,application/json"
                                className="hidden"
                                onChange={handleImportMasterKey}
                            />
                        </div>
                    </div>

                    {/* PIN Setup */}
                    <div className="p-6 rounded-2xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 space-y-4">
                        <div className="flex items-center gap-3 mb-2">
                            <KeyRound className="w-5 h-5 text-gray-400" />
                            <span className="font-semibold text-gray-900 dark:text-white">PIN Setup</span>
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300 text-[10px] font-bold uppercase ml-auto">Local Encryption</span>
                        </div>
                        <p className="text-sm text-gray-500">Set a 5-digit PIN to secure local vault cache.</p>
                        <div className="flex gap-2">
                            <input
                                type="password"
                                maxLength={5}
                                placeholder="•••••"
                                className="w-32 bg-white dark:bg-black/40 border border-[#e5e7eb] dark:border-zinc-700 rounded-[8px] px-4 py-2 text-center tracking-[0.5em] font-mono outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 transition-colors"
                                value={pinInputValue}
                                onChange={(e) => setPinInputValue(e.target.value.replace(/[^0-9]/g, ''))}
                            />
                            <button className="bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] h-[44px] px-4 font-semibold text-[14px] transition-all active:scale-95">
                                Save PIN
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-white/5">
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors font-bold group w-fit"
                >
                    <LogOut className="w-5 h-5 text-rose-400 group-hover:text-rose-500" />
                    <span>Sign out of all sessions</span>
                </button>
            </div>
        </div>
    );
};

export default SecurityVaultTab;
