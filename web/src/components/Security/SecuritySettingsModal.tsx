"use client";

import React, { useState, useEffect } from 'react';
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

    // Escape key listener & body scroll lock
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = originalOverflow;
        };
    }, [isOpen, onClose]);

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
        <div 
            onClick={onClose}
            className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-[#111827]/20 animate-in fade-in duration-200"
        >
            <div 
                className="w-full max-w-md rounded-[24px] shadow-[0px_24px_64px_rgba(17,24,39,0.16)] border border-[#e5e7eb] dark:border-zinc-800 bg-white dark:bg-[#18181b] overflow-hidden p-6 animate-in zoom-in-95 duration-150 flex flex-col gap-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center border-b border-[#e5e7eb] dark:border-zinc-800 pb-3">
                    <div className="flex items-center gap-3">
                        <div className="h-[40px] w-[40px] rounded-[12px] bg-[#f3f4f6] dark:bg-zinc-800 border border-[#e5e7eb] dark:border-zinc-700 flex items-center justify-center text-[#111827] dark:text-zinc-200">
                            <Shield size={18} />
                        </div>
                        <div>
                            <h2 className="text-[15px] font-bold text-[#111827] dark:text-zinc-100">
                                {isCurrentlyProtected ? 'Sicherheit & PIN verwalten' : 'PIN-Schutz aktivieren'}
                            </h2>
                            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate max-w-[240px]">
                                {item.title}
                            </p>
                        </div>
                    </div>
                    <button 
                        type="button"
                        onClick={onClose}
                        className="h-[44px] w-[44px] rounded-[12px] bg-[#f9fafb] hover:bg-[#f3f4f6] dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-[#e5e7eb] dark:border-zinc-700 flex items-center justify-center text-[#111827] dark:text-zinc-200 cursor-pointer transition-colors"
                        aria-label="Schließen"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Notifications */}
                {errorMessage && (
                    <div className="p-3 rounded-[12px] bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                        <AlertTriangle size={15} className="shrink-0" />
                        <span>{errorMessage}</span>
                    </div>
                )}
                {successMessage && (
                    <div className="p-3 rounded-[12px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                        <CheckCircle2 size={15} className="shrink-0" />
                        <span>{successMessage}</span>
                    </div>
                )}

                {/* Main Settings Form */}
                <div className="space-y-4">
                    {/* Current PIN verification if changing */}
                    {isCurrentlyProtected && recoveryStep !== 'success' && (
                        <div className="space-y-1.5 p-3 rounded-[12px] bg-zinc-50 dark:bg-zinc-800/60 border border-[#e5e7eb] dark:border-zinc-700/60">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                    Aktuelle PIN
                                </label>
                                <button
                                    type="button"
                                    onClick={handleRequestRecoveryEmail}
                                    className="text-[11px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline font-medium"
                                >
                                    PIN vergessen?
                                </button>
                            </div>
                            <input
                                type="password"
                                value={currentPin}
                                onChange={e => setCurrentPin(e.target.value)}
                                placeholder="Aktuelle PIN eingeben..."
                                className="w-full h-[40px] px-3.5 rounded-[8px] border border-[#e5e7eb] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 transition-colors"
                            />
                        </div>
                    )}

                    {/* Recovery Flow Banner */}
                    {recoveryStep === 'code_sent' && (
                        <div className="p-3.5 rounded-[12px] bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 space-y-2.5">
                            <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">{recoveryMessage}</p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    maxLength={6}
                                    value={recoveryOtp}
                                    onChange={e => setRecoveryOtp(e.target.value)}
                                    placeholder="6-stelliger Code..."
                                    className="flex-1 h-[40px] px-3 rounded-[8px] border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-mono text-center text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400"
                                />
                                <button
                                    type="button"
                                    onClick={handleVerifyRecoveryOtp}
                                    className="bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] h-[40px] px-3.5 font-semibold text-xs transition-colors"
                                >
                                    Prüfen
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 1-Field PIN Workflow */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                {pinStep === 'enter' ? 'Neue PIN / Passwort festlegen' : 'PIN bestätigen'}
                            </label>
                            {pinStep === 'confirm' && (
                                <button
                                    type="button"
                                    onClick={() => { setPinStep('enter'); setConfirmPin(''); }}
                                    className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 flex items-center gap-1 font-medium"
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
                                    className="flex-1 h-[42px] px-3.5 rounded-[8px] border border-[#e5e7eb] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 transition-colors"
                                />
                                <button
                                    type="button"
                                    onClick={handleFirstPinSubmit}
                                    disabled={!firstPin.trim()}
                                    className="h-[42px] px-4 rounded-[8px] bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 text-xs font-semibold disabled:opacity-50 transition-colors flex items-center gap-1.5"
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
                                    className={`w-full h-[42px] pl-3.5 pr-10 rounded-[8px] border text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none transition-colors ${
                                        isMatch ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/5' :
                                        isMismatch ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-500/5' :
                                        'border-[#e5e7eb] dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400'
                                    }`}
                                />
                                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                                    {isMatch && (
                                        <span title="PIN identisch" className="text-emerald-500 flex items-center gap-1 text-[11px] font-medium animate-in fade-in">
                                            <CheckCircle2 size={16} />
                                        </span>
                                    )}
                                    {isMismatch && (
                                        <span title="PIN nicht identisch" className="text-rose-500 flex items-center gap-1 text-[11px] font-medium animate-in fade-in">
                                            <AlertTriangle size={16} />
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Streamlined Frequency Configuration */}
                    <div className="space-y-2 pt-1 border-t border-[#e5e7eb] dark:border-zinc-800">
                        <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            PIN-Abfragehäufigkeit
                        </label>
                        
                        <div className="space-y-1.5 text-xs">
                            {/* Line 1: Always */}
                            <label className="flex items-center gap-2 p-2 rounded-[8px] hover:bg-zinc-50 dark:hover:bg-zinc-800/60 cursor-pointer transition-colors border border-transparent has-[:checked]:border-zinc-300 dark:has-[:checked]:border-zinc-700 has-[:checked]:bg-zinc-100 dark:has-[:checked]:bg-zinc-800">
                                <input
                                    type="radio"
                                    name="frequency"
                                    checked={frequencyMode === 'always'}
                                    onChange={() => setFrequencyMode('always')}
                                    className="w-4 h-4 text-[#111827] focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 accent-zinc-900 dark:accent-white"
                                />
                                <span className="text-zinc-700 dark:text-zinc-200 font-medium">Jedes Mal beim Öffnen</span>
                            </label>

                            {/* Line 2: Session & Once */}
                            <div className="grid grid-cols-2 gap-2">
                                <label className="flex items-center gap-2 p-2 rounded-[8px] hover:bg-zinc-50 dark:hover:bg-zinc-800/60 cursor-pointer transition-colors border border-transparent has-[:checked]:border-zinc-300 dark:has-[:checked]:border-zinc-700 has-[:checked]:bg-zinc-100 dark:has-[:checked]:bg-zinc-800">
                                    <input
                                        type="radio"
                                        name="frequency"
                                        checked={frequencyMode === 'session'}
                                        onChange={() => setFrequencyMode('session')}
                                        className="w-4 h-4 text-[#111827] focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 accent-zinc-900 dark:accent-white"
                                    />
                                    <span className="text-zinc-700 dark:text-zinc-200 truncate font-medium">Einmal pro Sitzung</span>
                                </label>
                                <label className="flex items-center gap-2 p-2 rounded-[8px] hover:bg-zinc-50 dark:hover:bg-zinc-800/60 cursor-pointer transition-colors border border-transparent has-[:checked]:border-zinc-300 dark:has-[:checked]:border-zinc-700 has-[:checked]:bg-zinc-100 dark:has-[:checked]:bg-zinc-800">
                                    <input
                                        type="radio"
                                        name="frequency"
                                        checked={frequencyMode === 'once'}
                                        onChange={() => setFrequencyMode('once')}
                                        className="w-4 h-4 text-[#111827] focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 accent-zinc-900 dark:accent-white"
                                    />
                                    <span className="text-zinc-700 dark:text-zinc-200 truncate font-medium">Einmal auf diesem Gerät</span>
                                </label>
                            </div>

                            {/* Line 3: Custom Interval */}
                            <div className={`flex items-center gap-2 p-2 rounded-[8px] border transition-all ${
                                frequencyMode === 'custom' ? 'border-zinc-400 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800' : 'border-[#e5e7eb] dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                            }`}>
                                <input
                                    type="radio"
                                    name="frequency"
                                    checked={frequencyMode === 'custom'}
                                    onChange={() => setFrequencyMode('custom')}
                                    className="w-4 h-4 text-[#111827] focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 accent-zinc-900 dark:accent-white"
                                />
                                <span className="text-zinc-700 dark:text-zinc-200 font-medium">Alle</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={999}
                                    disabled={frequencyMode !== 'custom'}
                                    value={frequencyValue}
                                    onChange={e => setFrequencyValue(parseInt(e.target.value, 10) || 1)}
                                    className="w-14 px-2 py-1 text-center font-bold rounded-[6px] border border-[#e5e7eb] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400"
                                />
                                <select
                                    disabled={frequencyMode !== 'custom'}
                                    value={customUnit}
                                    onChange={e => setCustomUnit(e.target.value as any)}
                                    className="flex-1 px-2 py-1 rounded-[6px] border border-[#e5e7eb] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400"
                                >
                                    <option value="timeout_minutes">Minuten</option>
                                    <option value="every_x_times">Öffnungen</option>
                                    <option value="timeout_days">Tage</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Require for shares checkbox */}
                    <label className="flex items-center gap-2.5 pt-1 text-xs cursor-pointer text-zinc-700 dark:text-zinc-300 font-medium">
                        <input
                            type="checkbox"
                            checked={requireForShares}
                            onChange={e => setRequireForShares(e.target.checked)}
                            className="w-4 h-4 rounded text-[#111827] focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 accent-zinc-900 dark:accent-white"
                        />
                        <span>PIN auch für freigegebene Empfänger verlangen</span>
                    </label>
                </div>

                {/* Actions Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-[#e5e7eb] dark:border-zinc-800">
                    {isCurrentlyProtected ? (
                        <button
                            type="button"
                            onClick={handleRemoveProtection}
                            disabled={isSaving}
                            className="h-[44px] px-3 rounded-[8px] text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-[14px] font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                            <Trash2 size={15} />
                            <span>Schutz entfernen</span>
                        </button>
                    ) : <div />}

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="bg-white dark:bg-zinc-800 text-[#111827] dark:text-white border border-[#e5e7eb] dark:border-zinc-700 rounded-[8px] h-[44px] px-4 font-semibold text-[14px] hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                        >
                            Abbrechen
                        </button>
                        <button
                            type="button"
                            onClick={handleSavePin}
                            disabled={isSaving || (pinStep === 'confirm' && (!isMatch || isMismatch))}
                            className="bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] h-[44px] px-4 font-semibold text-[14px] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        >
                            {isSaving ? <RefreshCw size={15} className="animate-spin" /> : <Check size={15} />}
                            <span>Speichern</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
