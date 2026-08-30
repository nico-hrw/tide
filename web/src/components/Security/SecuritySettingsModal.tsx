"use client";

import React, { useState } from 'react';
import { 
    Shield, 
    Lock, 
    Key, 
    Clock, 
    Users, 
    Mail, 
    Eye, 
    EyeOff, 
    Check, 
    X, 
    AlertTriangle, 
    Trash2, 
    RefreshCw,
    ShieldAlert,
    CheckCircle2
} from 'lucide-react';
import { 
    ItemSecuritySettings, 
    generateSalt, 
    hashPin, 
    verifyPin,
    lockItem,
    recordItemUnlock
} from '@/lib/pinSecurity';
import { apiFetch } from '@/lib/api';

interface SecuritySettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: {
        id: string;
        title: string;
        type: 'file' | 'folder' | 'canvas' | 'note';
        metadata?: any;
    };
    userEmail?: string;
    onSaveSettings: (settings: ItemSecuritySettings | null) => Promise<void>;
}

export default function SecuritySettingsModal({
    isOpen,
    onClose,
    item,
    userEmail,
    onSaveSettings
}: SecuritySettingsModalProps) {
    const existingSettings: ItemSecuritySettings | null = 
        item.metadata?.security_settings || 
        (item.metadata?.has_custom_password ? {
            has_custom_password: true,
            pwd_salt: item.metadata.pwd_salt || '',
            pin_hash: item.metadata.pin_hash || '',
            frequency: item.metadata.frequency || 'session',
            require_for_shares: item.metadata.require_for_shares ?? true,
        } : null);

    const isCurrentlyProtected = !!existingSettings?.has_custom_password;

    const [pin, setPin] = useState('');
    const [pinConfirm, setPinConfirm] = useState('');
    const [currentPin, setCurrentPin] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [frequency, setFrequency] = useState<ItemSecuritySettings['frequency']>(
        existingSettings?.frequency || 'session'
    );
    const [frequencyValue, setFrequencyValue] = useState<number>(
        existingSettings?.frequency_value || (existingSettings?.frequency === 'timeout_minutes' ? 30 : 5)
    );
    const [requireForShares, setRequireForShares] = useState<boolean>(
        existingSettings?.require_for_shares ?? true
    );

    // E-Mail Recovery State
    const [recoveryStep, setRecoveryStep] = useState<'idle' | 'sending' | 'code_sent' | 'verifying' | 'success'>('idle');
    const [recoveryOtp, setRecoveryOtp] = useState('');
    const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);

    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    if (!isOpen) return null;

    const handleSavePin = async () => {
        setErrorMessage(null);
        setSuccessMessage(null);

        if (!pin.trim()) {
            setErrorMessage('Bitte gib eine PIN oder ein Passwort ein.');
            return;
        }

        if (pin !== pinConfirm) {
            setErrorMessage('Die PIN-Bestätigung stimmt nicht überein.');
            return;
        }

        // If updating an existing PIN and not in recovery mode, verify current PIN
        if (isCurrentlyProtected && recoveryStep !== 'success') {
            if (!currentPin) {
                setErrorMessage('Bitte gib deine aktuelle PIN ein, um sie zu ändern.');
                return;
            }
            if (existingSettings?.pwd_salt && existingSettings?.pin_hash) {
                const isValid = await verifyPin(currentPin, existingSettings.pwd_salt, existingSettings.pin_hash);
                if (!isValid) {
                    setErrorMessage('Die aktuelle PIN ist nicht korrekt.');
                    return;
                }
            }
        }

        setIsSaving(true);
        try {
            const salt = generateSalt();
            const hashed = await hashPin(pin, salt);

            const newSettings: ItemSecuritySettings = {
                has_custom_password: true,
                pwd_salt: salt,
                pin_hash: hashed,
                require_for_shares: requireForShares,
                frequency: frequency,
                frequency_value: frequencyValue,
                updated_at: new Date().toISOString()
            };

            await onSaveSettings(newSettings);
            recordItemUnlock(item.id, newSettings, pin);
            setSuccessMessage('Sicherheitseinstellungen erfolgreich gespeichert!');
            setTimeout(() => {
                onClose();
            }, 1200);
        } catch (e: any) {
            setErrorMessage(e.message || 'Fehler beim Speichern der Einstellungen.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveProtection = async () => {
        if (!confirm('Möchtest du den PIN-Schutz für diese(n) ' + (item.type === 'folder' ? 'Ordner' : 'Notiz') + ' wirklich entfernen?')) {
            return;
        }

        setIsSaving(true);
        try {
            await onSaveSettings(null);
            lockItem(item.id);
            setSuccessMessage('PIN-Schutz wurde erfolgreich aufgehoben.');
            setTimeout(() => {
                onClose();
            }, 1200);
        } catch (e: any) {
            setErrorMessage(e.message || 'Fehler beim Entfernen des Schutzes.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRequestRecoveryEmail = async () => {
        setRecoveryStep('sending');
        setRecoveryMessage(null);
        setErrorMessage(null);

        try {
            // Request an OTP code to the registered email address via existing cloud auth / OTP service
            const targetEmail = userEmail || localStorage.getItem('tide_user_email') || '';
            const res = await apiFetch('/api/v1/request-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: targetEmail, purpose: 'pin_reset', file_id: item.id })
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Fehler beim Senden der Wiederherstellungs-Mail.');
            }

            setRecoveryStep('code_sent');
            setRecoveryMessage(`Ein 6-stelliger Wiederherstellungscode wurde an ${targetEmail || 'deine E-Mail-Adresse'} gesendet.`);
        } catch (e: any) {
            setRecoveryStep('idle');
            setErrorMessage(e.message || 'E-Mail-Versand fehlgeschlagen. Bitte prüfe deine Internetverbindung.');
        }
    };

    const handleVerifyRecoveryOtp = async () => {
        if (!recoveryOtp.trim()) {
            setErrorMessage('Bitte gib den Code aus der E-Mail ein.');
            return;
        }

        setRecoveryStep('verifying');
        setErrorMessage(null);

        try {
            const targetEmail = userEmail || localStorage.getItem('tide_user_email') || '';
            const res = await apiFetch('/api/v1/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: targetEmail, code: recoveryOtp.trim(), purpose: 'pin_reset' })
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Ungültiger oder abgelaufener Code.');
            }

            setRecoveryStep('success');
            setRecoveryMessage('Identität erfolgreich bestätigt! Du kannst nun eine neue PIN festlegen.');
        } catch (e: any) {
            setRecoveryStep('code_sent');
            setErrorMessage(e.message || 'Ungültiger Code.');
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div 
                className="w-full max-w-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/30">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${isCurrentlyProtected ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-purple-500/15 text-purple-600 dark:text-purple-400'}`}>
                            <Shield size={20} />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                                {isCurrentlyProtected ? 'Sicherheit & PIN verwalten' : 'PIN-Schutz einrichten'}
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[280px]">
                                {item.type === 'folder' ? 'Ordner' : 'Notiz'}: <span className="font-semibold">{item.title}</span>
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
                    {/* Status Feedback */}
                    {errorMessage && (
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                            <AlertTriangle size={15} className="flex-shrink-0" />
                            <span>{errorMessage}</span>
                        </div>
                    )}
                    {successMessage && (
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                            <CheckCircle2 size={15} className="flex-shrink-0" />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    {/* Section 1: PIN Input */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            <Key size={14} className="text-purple-500" />
                            <span>{isCurrentlyProtected ? 'PIN / Passwort ändern' : 'PIN / Passwort festlegen'}</span>
                        </div>

                        {isCurrentlyProtected && recoveryStep !== 'success' && (
                            <div className="space-y-1">
                                <label className="text-xs text-gray-600 dark:text-gray-400">Aktuelle PIN</label>
                                <input
                                    type={showPin ? 'text' : 'password'}
                                    value={currentPin}
                                    onChange={e => setCurrentPin(e.target.value)}
                                    placeholder="Aktuelle PIN eingeben..."
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500/40 text-sm"
                                />
                            </div>
                        )}

                        <div className="space-y-1">
                            <div className="flex justify-between items-center">
                                <label className="text-xs text-gray-600 dark:text-gray-400">
                                    {isCurrentlyProtected ? 'Neue PIN / Passwort' : 'PIN / Passwort'}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setShowPin(!showPin)}
                                    className="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                                >
                                    {showPin ? <EyeOff size={12} /> : <Eye size={12} />}
                                    <span>{showPin ? 'Verbergen' : 'Anzeigen'}</span>
                                </button>
                            </div>
                            <input
                                type={showPin ? 'text' : 'password'}
                                value={pin}
                                onChange={e => setPin(e.target.value)}
                                placeholder="Beliebige PIN (Zahlen, Buchstaben, Zeichen)..."
                                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500/40 text-sm"
                            />
                            <p className="text-[11px] text-gray-400">Kann Zahlen, Buchstaben und Sonderzeichen jeder Länge enthalten.</p>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs text-gray-600 dark:text-gray-400">PIN bestätigen</label>
                            <input
                                type={showPin ? 'text' : 'password'}
                                value={pinConfirm}
                                onChange={e => setPinConfirm(e.target.value)}
                                placeholder="PIN wiederholen..."
                                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500/40 text-sm"
                            />
                        </div>
                    </div>

                    <div className="h-px bg-gray-100 dark:bg-slate-800" />

                    {/* Section 2: Frequency Rules */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            <Clock size={14} className="text-purple-500" />
                            <span>Wie oft muss die PIN neu eingegeben werden?</span>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                            {[
                                { id: 'always', label: 'Jedes Mal beim Öffnen', desc: 'Höchste Sicherheit – erfordert bei jedem Klick die PIN' },
                                { id: 'session', label: 'Einmal pro Sitzung', desc: 'Bleibt entsperrt, bis der Tab oder die App geschlossen wird' },
                                { id: 'timeout_minutes', label: `Nach Inaktivität (${frequencyValue || 30} Minuten)`, desc: 'Sperrt sich automatisch nach einer bestimmten Zeitspanne' },
                                { id: 'every_x_times', label: `Alle ${frequencyValue || 5} Öffnungen`, desc: 'Wird nach einer festgelegten Anzahl an Zugriffen erneut abgefragt' },
                                { id: 'once', label: 'Einmalig auf diesem Gerät', desc: 'Bleibt dauerhaft auf diesem Rechner entsperrt' }
                            ].map(opt => (
                                <label 
                                    key={opt.id}
                                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                        frequency === opt.id 
                                            ? 'border-purple-500/50 bg-purple-500/5 dark:bg-purple-500/10' 
                                            : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="frequency"
                                        value={opt.id}
                                        checked={frequency === opt.id}
                                        onChange={() => setFrequency(opt.id as any)}
                                        className="mt-0.5 text-purple-600 focus:ring-purple-500"
                                    />
                                    <div className="flex-1">
                                        <div className="font-medium text-gray-900 dark:text-gray-100 text-xs">
                                            {opt.label}
                                        </div>
                                        <div className="text-[11px] text-gray-500 dark:text-gray-400">
                                            {opt.desc}
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>

                        {/* Frequency value adjustment */}
                        {(frequency === 'timeout_minutes' || frequency === 'every_x_times') && (
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-800/40 border border-gray-200 dark:border-slate-700/60">
                                <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                                    {frequency === 'timeout_minutes' ? 'Minuten bis Sperrung:' : 'Anzahl Öffnungen:'}
                                </span>
                                <input
                                    type="number"
                                    min="1"
                                    max="999"
                                    value={frequencyValue}
                                    onChange={e => setFrequencyValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                    className="w-20 px-2.5 py-1 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 text-xs text-center font-bold"
                                />
                            </div>
                        )}
                    </div>

                    <div className="h-px bg-gray-100 dark:bg-slate-800" />

                    {/* Section 3: Shared Access Rules */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            <Users size={14} className="text-purple-500" />
                            <span>Zugriffsregeln für Freigaben</span>
                        </div>

                        <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700 cursor-pointer transition-all">
                            <input
                                type="checkbox"
                                checked={requireForShares}
                                onChange={e => setRequireForShares(e.target.checked)}
                                className="mt-0.5 rounded text-purple-600 focus:ring-purple-500"
                            />
                            <div>
                                <div className="font-medium text-gray-900 dark:text-gray-100 text-xs">
                                    PIN-Zwang für Freigaben und andere Nutzer
                                </div>
                                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                                    Wenn aktiviert, müssen andere Personen, mit denen du diesen Inhalt teilst, ebenfalls die PIN eingeben.
                                </div>
                            </div>
                        </label>
                    </div>

                    {/* Section 4: PIN vergessen / E-Mail Recovery */}
                    {isCurrentlyProtected && (
                        <>
                            <div className="h-px bg-gray-100 dark:bg-slate-800" />
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                    <Mail size={14} className="text-purple-500" />
                                    <span>PIN vergessen? E-Mail-Wiederherstellung</span>
                                </div>

                                {recoveryStep === 'idle' && (
                                    <button
                                        type="button"
                                        onClick={handleRequestRecoveryEmail}
                                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-medium border border-purple-500/20 transition-all"
                                    >
                                        <Mail size={14} />
                                        <span>Wiederherstellungs-Code an {userEmail || 'hinterlegte E-Mail'} senden</span>
                                    </button>
                                )}

                                {recoveryStep === 'sending' && (
                                    <div className="flex items-center justify-center gap-2 py-2 text-xs text-purple-600 dark:text-purple-400">
                                        <RefreshCw size={14} className="animate-spin" />
                                        <span>Sende Wiederherstellungs-Mail...</span>
                                    </div>
                                )}

                                {(recoveryStep === 'code_sent' || recoveryStep === 'verifying') && (
                                    <div className="space-y-2 p-3 rounded-xl bg-purple-500/5 border border-purple-500/20">
                                        {recoveryMessage && (
                                            <p className="text-xs text-purple-700 dark:text-purple-300 font-medium">{recoveryMessage}</p>
                                        )}
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                maxLength={6}
                                                value={recoveryOtp}
                                                onChange={e => setRecoveryOtp(e.target.value)}
                                                placeholder="6-stelliger Code..."
                                                className="flex-1 px-3 py-1.5 rounded-lg border border-purple-300 dark:border-purple-700/60 bg-white dark:bg-slate-900 text-xs font-mono tracking-widest text-center"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleVerifyRecoveryOtp}
                                                disabled={recoveryStep === 'verifying'}
                                                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors"
                                            >
                                                {recoveryStep === 'verifying' ? 'Prüfe...' : 'Bestätigen'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {recoveryStep === 'success' && (
                                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
                                        <CheckCircle2 size={16} />
                                        <span>Verifiziert! Du kannst oben ohne Eingabe der alten PIN eine neue vergeben.</span>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/30">
                    <div>
                        {isCurrentlyProtected && (
                            <button
                                type="button"
                                onClick={handleRemoveProtection}
                                disabled={isSaving}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-xs font-medium transition-colors"
                            >
                                <Trash2 size={14} />
                                <span>Schutz aufheben</span>
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 text-xs font-medium transition-colors"
                        >
                            Abbrechen
                        </button>
                        <button
                            type="button"
                            onClick={handleSavePin}
                            disabled={isSaving}
                            className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-lg shadow-purple-500/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
                        >
                            {isSaving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={14} />}
                            <span>Speichern</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
