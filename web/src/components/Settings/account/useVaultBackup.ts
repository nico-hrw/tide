import { useState } from 'react';
import { getMasterKey, storeMasterKey, clearMasterKey, purgeLegacyKeys, getEncryptedVault, storeEncryptedVault } from '@/lib/keyStorage';
import { useT } from '../useT';

export interface VaultUserProfile {
    id?: string;
    user_id?: string;
    email?: string;
}

export interface BackupStatus {
    type: 'success' | 'error';
    msg: string;
}

interface BackupFile {
    json: string;
    filename: string;
}

const readStored = (key: string): string => localStorage.getItem(key) || sessionStorage.getItem(key) || '';

function downloadJson(content: string, filename: string) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function setSessionAndLocal(key: string, val?: string) {
    if (val) {
        localStorage.setItem(key, val);
        sessionStorage.setItem(key, val);
    }
}

async function getActivePrivateKeyJwk(): Promise<JsonWebKey | string | null> {
    const masterKey = await getMasterKey();
    if (masterKey) {
        try {
            return await window.crypto.subtle.exportKey('jwk', masterKey);
        } catch {
            // Nicht exportierbarer Schluessel: auf Session-Kopie zurueckfallen
        }
    }
    const rawKey = readStored('tide_session_key');
    if (rawKey) {
        try {
            return JSON.parse(rawKey) as JsonWebKey;
        } catch {
            return rawKey;
        }
    }
    return null;
}

async function buildBackup(userProfile?: VaultUserProfile): Promise<BackupFile | null> {
    const privateKeyJwk = await getActivePrivateKeyJwk();
    if (!privateKeyJwk) {
        const vault = await getEncryptedVault();
        if (!vault) return null;
        return {
            json: JSON.stringify({ app: 'tide', version: 2, type: 'encrypted_vault_backup', exportedAt: new Date().toISOString(), vault }, null, 2),
            filename: 'tide-master-key-vault-backup.json',
        };
    }
    const email = readStored('tide_user_email') || userProfile?.email || '';
    const userId = readStored('tide_user_id') || userProfile?.id || userProfile?.user_id || '';
    const publicKeySpki = readStored('tide_user_public_key');
    const safeEmail = (email || 'user').replace(/[^a-zA-Z0-9@._-]/g, '_');
    return {
        json: JSON.stringify({ app: 'tide', version: 2, timestamp: new Date().toISOString(), email, userId, publicKeySpki, privateKeyJwk }, null, 2),
        filename: `tide-master-key-${safeEmail}-${Date.now()}.json`,
    };
}

/** Schluessel-Backup (Export, Kopieren, Import) und Abmelden. Logik unveraendert aus dem frueheren Security-Tab. */
export function useVaultBackup(userProfile?: VaultUserProfile, onLogout?: () => void) {
    const t = useT();
    const [status, setStatus] = useState<BackupStatus | null>(null);
    const [copied, setCopied] = useState(false);

    const flash = (s: BackupStatus, ms = 4000) => {
        setStatus(s);
        setTimeout(() => setStatus(null), ms);
    };

    const exportKey = async () => {
        try {
            const backup = await buildBackup(userProfile);
            if (!backup) return setStatus({ type: 'error', msg: t('vault.noKey') });
            downloadJson(backup.json, backup.filename);
            flash({ type: 'success', msg: t('vault.exported') });
        } catch (err) {
            console.error('Export Master Key failed:', err);
            setStatus({ type: 'error', msg: err instanceof Error && err.message ? err.message : t('vault.exportFailed') });
        }
    };

    const copyKey = async () => {
        try {
            const backup = await buildBackup(userProfile);
            if (!backup) return setStatus({ type: 'error', msg: t('vault.noKey') });
            await navigator.clipboard.writeText(backup.json);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Copy Master Key failed:', err);
            setStatus({ type: 'error', msg: t('vault.copyFailed') });
        }
    };

    const importKey = (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.target;
        const file = input.files?.[0];
        if (!file) return;
        const reset = () => {
            input.value = '';
        };
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const text = event.target?.result as string;
                if (!text) throw new Error(t('vault.emptyFile'));
                const parsed = JSON.parse(text);

                if (parsed && (parsed.type === 'encrypted_vault_backup' || (parsed.app === 'tide' && parsed.vault))) {
                    const vaultData = parsed.vault || parsed;
                    await storeEncryptedVault(vaultData);
                    purgeLegacyKeys();
                    setSessionAndLocal('tide_user_id', vaultData.userId || parsed.userId);
                    setSessionAndLocal('tide_user_email', vaultData.email || parsed.email);
                    setStatus({ type: 'success', msg: t('vault.importedVault') });
                    setTimeout(() => window.location.reload(), 1200);
                    return;
                }

                const privateKey = parsed.privateKeyJwk || parsed;
                if (!privateKey || privateKey.kty !== 'RSA' || !privateKey.n || !privateKey.d) throw new Error(t('vault.invalidKey'));

                const importedKey = await window.crypto.subtle.importKey('jwk', privateKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt']);
                await storeMasterKey(importedKey);
                purgeLegacyKeys();
                setSessionAndLocal('tide_user_id', parsed.userId);
                setSessionAndLocal('tide_user_email', parsed.email);
                setSessionAndLocal('tide_user_public_key', parsed.publicKeySpki);
                setStatus({ type: 'success', msg: t('vault.imported') });
                setTimeout(() => window.location.reload(), 1200);
            } catch (err) {
                console.error('Import Master Key failed:', err);
                setStatus({ type: 'error', msg: err instanceof Error && err.message ? err.message : t('vault.importFailed') });
            } finally {
                reset();
            }
        };
        reader.onerror = () => {
            setStatus({ type: 'error', msg: t('vault.readFailed') });
            reset();
        };
        reader.readAsText(file);
    };

    const logout = async () => {
        try {
            await clearMasterKey();
            purgeLegacyKeys();
        } catch (err) {
            console.error('Error clearing master key:', err);
        }
        onLogout?.();
    };

    return { status, copied, exportKey, copyKey, importKey, logout };
}
