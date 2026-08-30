"use client";

import React, { useState } from 'react';
import { 
    Shield, 
    Lock, 
    Key, 
    Mail, 
    Check, 
    X, 
    AlertTriangle, 
    Trash2, 
    RefreshCw,
    CheckCircle2,
    ArrowRight,
    ArrowLeft
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

    // PIN 1-Field Workflow State
    const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter');
    const [firstPin, setFirstPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [currentPin, setCurrentPin] = useState('');

    // Frequency state
    const [frequencyMode, setFrequencyMode] = useState<'always' | 'session' | 'once' | 'custom'>(
        existingSettings?.frequency === 'always' ? 'always' :
        existingSettings?.frequency === 'session' ? 'session' :
        existingSettings?.frequency === 'once' ? 'once' : 'custom'
    );
    const [customUnit, setCustomUnit] = useState<'timeout_minutes' | 'every_x_times' | 'timeout_days'>(
        existingSettings?.frequency === 'every_x_times' ? 'every_x_times' :
        existingSettings?.frequency === 'timeout_days' ? 'timeout_days' : 'timeout_minutes'
    );
    const [frequencyValue, setFrequencyValue] = useState<number>(
        existingSettings?.frequency_value || 30
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

    const handleFirstPinSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setErrorMessage(null);

        if (!firstPin.trim()) {
            setErrorMessage('Bitte gib eine PIN oder ein Passwort ein.');
            return;
        }

        setPinStep('confirm');
    };

    const handleSavePin = async () => {
        setErrorMessage(null);
        setSuccessMessage(null);

        if (!firstPin.trim()) {
            setErrorMessage('Bitte gib eine PIN ein.');
            return;
        }

        if (firstPin !== confirmPin) {
            setErrorMessage('Die wiederholte PIN stimmt nicht überein.');
            return;
        }

        // If updating existing PIN and not in recovery mode, verify current PIN
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
            const hashed = await hashPin(firstPin, salt);

            const effectiveFrequency: ItemSecuritySettings['frequency'] = 
                frequencyMode === 'custom' ? customUnit : frequencyMode;

            const newSettings: ItemSecuritySettings = {
                has_custom_password: true,
                pwd_salt: salt,
                pin_hash: hashed,
                require_for_shares: requireForShares,
                frequency: effectiveFrequency,
                frequency_value: frequencyMode === 'custom' ? Math.max(1, frequencyValue) : undefined,
                updated_at: new Date().toISOString()
            };

            await onSaveSettings(newSettings);
            recordItemUnlock(item.id, newSettings, firstPin);
            setSuccessMessage('Sicherheitseinstellungen gespeichert!');
            setTimeout(() => {
                onClose();
            }, 1000);
        } catch (e: any) {
            setErrorMessage(e.message || 'Fehler beim Speichern der Einstellungen.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveProtection = async () => {
        if (!confirm('Möchtest du den PIN-Schutz wirklich entfernen?')) {
            return;
        }

        setIsSaving(true);
        try {
            await onSaveSettings(null);
            lockItem(item.id);
            setSuccessMessage('PIN-Schutz wurde aufgehoben.');
            setTimeout(() => {
                onClose();
            }, 1000);
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
            const targetEmail = userEmail || localStorage.getItem('tide_user_email') || '';
            const res = await apiFetch('/api/v1/request-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: targetEmail, purpose: 'pin_reset', file_id: item.id })
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Fehler beim Senden der E-Mail.');
            }

            setRecoveryStep('code_sent');
            setRecoveryMessage(`Wiederherstellungscode an ${targetEmail || 'deine E-Mail'} gesendet.`);
        } catch (e: any) {
            setRecoveryStep('idle');
            setErrorMessage(e.message || 'E-Mail-Versand fehlgeschlagen.');
        }
    };

    const handleVerifyRecoveryOtp = async () => {
        if (!recoveryOtp.trim()) {
            setErrorMessage('Bitte gib den 6-stelligen Code ein.');
            return;
        }

        setRecoveryStep('verifying');
        setErrorMessage(null);

        try {
            const targetEmail = userEmail || localStorage.getItem('tide_user_email') || '';
            const res = await apiFetch('/api/v1/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: targetEmail, otp: recoveryOtp.trim(), code: recoveryOtp.trim(), purpose: 'pin_reset' })
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Ungültiger Code.');
            }

            setRecoveryStep('success');
            setSuccessMessage('Identität per E-Mail verifiziert. Du kannst nun eine neue PIN festlegen.');
        } catch (e: any) {
            setRecoveryStep('code_sent');
            setErrorMessage(e.message || 'Ungültiger Code.');
        }
    };

    const isMatch = confirmPin.length > 0 && confirmPin === firstPin;
    const isMismatch = confirmPin.length > 0 && confirmPin !== firstPin;

    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div 
                className="w-full max-w-md bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-5 animate-in zoom-in-95 duration-150 flex flex-col gap-4"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center border-b border-gray-100 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                            <Shield size={18} />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                {isCurrentlyProtected ? 'Sicherheit & PIN verwalten' : 'PIN-Schutz aktivieren'}
                            </h2>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[260px]">
                                {item.title}
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Notifications */}
                {errorMessage && (
                    <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                        <AlertTriangle size={14} className="shrink-0" />
                        <span>{errorMessage}</span>
                    </div>
                )}
                {successMessage && (
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                        <CheckCircle2 size={14} className="shrink-0" />
                        <span>{successMessage}</span>
                    </div>
                )}

                {/* Main Settings Form */}
                <div className="space-y-4">
                    {/* Current PIN verification if changing */}
                    {isCurrentlyProtected && recoveryStep !== 'success' && (
                        <div className="space-y-1.5 p-3 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700/60">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                    Aktuelle PIN
                                </label>
                                <button
                                    type="button"
                                    onClick={handleRequestRecoveryEmail}
                                    className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline"
                                >
                                    PIN vergessen?
                                </button>
                            </div>
                            <input
                                type="password"
                                value={currentPin}
                                onChange={e => setCurrentPin(e.target.value)}
                                placeholder="Aktuelle PIN eingeben..."
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:ring-2 focus:ring-purple-500/30 outline-none"
                            />
                        </div>
                    )}

                    {/* Recovery Flow Banner */}
                    {recoveryStep === 'code_sent' && (
                        <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 space-y-2">
                            <p className="text-xs text-purple-700 dark:text-purple-300 font-medium">{recoveryMessage}</p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    maxLength={6}
                                    value={recoveryOtp}
                                    onChange={e => setRecoveryOtp(e.target.value)}
                                    placeholder="6-stelliger Code..."
                                    className="flex-1 px-3 py-1.5 rounded-lg border border-purple-300 dark:border-purple-700 text-xs font-mono text-center"
                                />
                                <button
                                    type="button"
                                    onClick={handleVerifyRecoveryOtp}
                                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold"
                                >
                                    Prüfen
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 1-Field PIN Workflow */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                {pinStep === 'enter' ? 'Neue PIN / Passwort festlegen' : 'PIN bestätigen'}
                            </label>
                            {pinStep === 'confirm' && (
                                <button
                                    type="button"
                                    onClick={() => { setPinStep('enter'); setConfirmPin(''); }}
                                    className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex items-center gap-1"
                                >
                                    <ArrowLeft size={11} /> Ändern
                                </button>
                            )}
                        </div>

                        {pinStep === 'enter' ? (
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    autoFocus
                                    value={firstPin}
                                    onChange={e => setFirstPin(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleFirstPinSubmit(e); }}
                                    placeholder="PIN / Passwort eingeben..."
                                    className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500/30 outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={handleFirstPinSubmit}
                                    disabled={!firstPin.trim()}
                                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold disabled:opacity-50 transition-all flex items-center gap-1"
                                >
                                    <span>Weiter</span>
                                    <ArrowRight size={13} />
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <input
                                    type="password"
                                    autoFocus
                                    value={confirmPin}
                                    onChange={e => setConfirmPin(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && isMatch) handleSavePin(); }}
                                    placeholder="PIN erneut eingeben..."
                                    className={`w-full pl-3 pr-10 py-2 rounded-xl border text-xs text-gray-900 dark:text-gray-100 focus:outline-none transition-all ${
                                        isMatch ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/5' :
                                        isMismatch ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-500/5' :
                                        'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-purple-500/30'
                                    }`}
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                                    {isMatch && (
                                        <span title="PIN identisch" className="text-emerald-500 flex items-center gap-1 text-[11px] font-medium animate-in fade-in">
                                            <CheckCircle2 size={15} />
                                        </span>
                                    )}
                                    {isMismatch && (
                                        <span title="PIN nicht identisch" className="text-rose-500 flex items-center gap-1 text-[11px] font-medium animate-in fade-in">
                                            <AlertTriangle size={15} />
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Streamlined Frequency Configuration */}
                    <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-slate-800">
                        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            PIN-Abfragehäufigkeit
                        </label>
                        
                        <div className="space-y-1.5 text-xs">
                            {/* Line 1: Always */}
                            <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                                <input
                                    type="radio"
                                    name="frequency"
                                    checked={frequencyMode === 'always'}
                                    onChange={() => setFrequencyMode('always')}
                                    className="text-purple-600 focus:ring-purple-500"
                                />
                                <span className="text-gray-700 dark:text-gray-200">Jedes Mal beim Öffnen</span>
                            </label>

                            {/* Line 2: Session & Once */}
                            <div className="grid grid-cols-2 gap-2">
                                <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer transition-colors border border-transparent has-[:checked]:border-purple-500/30 has-[:checked]:bg-purple-500/5">
                                    <input
                                        type="radio"
                                        name="frequency"
                                        checked={frequencyMode === 'session'}
                                        onChange={() => setFrequencyMode('session')}
                                        className="text-purple-600 focus:ring-purple-500"
                                    />
                                    <span className="text-gray-700 dark:text-gray-200 truncate">Einmal pro Sitzung</span>
                                </label>
                                <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer transition-colors border border-transparent has-[:checked]:border-purple-500/30 has-[:checked]:bg-purple-500/5">
                                    <input
                                        type="radio"
                                        name="frequency"
                                        checked={frequencyMode === 'once'}
                                        onChange={() => setFrequencyMode('once')}
                                        className="text-purple-600 focus:ring-purple-500"
                                    />
                                    <span className="text-gray-700 dark:text-gray-200 truncate">Einmal auf diesem Gerät</span>
                                </label>
                            </div>

                            {/* Line 3: Custom Interval */}
                            <div className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                                frequencyMode === 'custom' ? 'border-purple-500/40 bg-purple-500/5' : 'border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800'
                            }`}>
                                <input
                                    type="radio"
                                    name="frequency"
                                    checked={frequencyMode === 'custom'}
                                    onChange={() => setFrequencyMode('custom')}
                                    className="text-purple-600 focus:ring-purple-500"
                                />
                                <span className="text-gray-700 dark:text-gray-200 font-medium">Alle</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={999}
                                    disabled={frequencyMode !== 'custom'}
                                    value={frequencyValue}
                                    onChange={e => setFrequencyValue(parseInt(e.target.value, 10) || 1)}
                                    className="w-14 px-2 py-1 text-center font-bold rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                                />
                                <select
                                    disabled={frequencyMode !== 'custom'}
                                    value={customUnit}
                                    onChange={e => setCustomUnit(e.target.value as any)}
                                    className="flex-1 px-2 py-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                                >
                                    <option value="timeout_minutes">Minuten</option>
                                    <option value="every_x_times">Öffnungen</option>
                                    <option value="timeout_days">Tage</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Require for shares checkbox */}
                    <label className="flex items-center gap-2.5 pt-1 text-xs cursor-pointer text-gray-700 dark:text-gray-300">
                        <input
                            type="checkbox"
                            checked={requireForShares}
                            onChange={e => setRequireForShares(e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500"
                        />
                        <span>PIN auch für freigegebene Empfänger verlangen</span>
                    </label>
                </div>

                {/* Actions Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-slate-800">
                    {isCurrentlyProtected ? (
                        <button
                            type="button"
                            onClick={handleRemoveProtection}
                            disabled={isSaving}
                            className="px-3 py-1.5 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        >
                            <Trash2 size={13} />
                            <span>Schutz entfernen</span>
                        </button>
                    ) : <div />}

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 text-xs font-medium transition-colors"
                        >
                            Abbrechen
                        </button>
                        <button
                            type="button"
                            onClick={handleSavePin}
                            disabled={isSaving || (pinStep === 'confirm' && (!isMatch || isMismatch))}
                            className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-lg shadow-purple-500/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
                        >
                            {isSaving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                            <span>Speichern</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
