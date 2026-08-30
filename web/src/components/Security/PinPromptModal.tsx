"use client";

import React, { useState } from 'react';
import { Lock, Key, Eye, EyeOff, X, AlertCircle, ArrowRight, ShieldCheck, Mail, RefreshCw, CheckCircle2 } from 'lucide-react';
import { ItemSecuritySettings, verifyPin, recordItemUnlock } from '@/lib/pinSecurity';
import { apiFetch } from '@/lib/api';

interface PinPromptModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: {
        id: string;
        title: string;
        type: 'file' | 'folder' | 'canvas' | 'note';
        metadata?: any;
    };
    userEmail?: string;
    onUnlock: (pin: string) => void;
    onOpenSecuritySettings?: () => void;
}

export default function PinPromptModal({
    isOpen,
    onClose,
    item,
    userEmail,
    onUnlock,
    onOpenSecuritySettings
}: PinPromptModalProps) {
    const [pin, setPin] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);

    // E-Mail Recovery flow
    const [showRecovery, setShowRecovery] = useState(false);
    const [recoveryStep, setRecoveryStep] = useState<'idle' | 'sending' | 'code_sent' | 'verifying' | 'success'>('idle');
    const [recoveryOtp, setRecoveryOtp] = useState('');
    const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);

    if (!isOpen) return null;

    const securitySettings: ItemSecuritySettings | null = 
        item.metadata?.security_settings || 
        (item.metadata?.has_custom_password ? {
            has_custom_password: true,
            pwd_salt: item.metadata.pwd_salt || '',
            pin_hash: item.metadata.pin_hash || '',
            frequency: item.metadata.frequency || 'session',
        } : null);

    const handleUnlock = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setError(null);

        if (!pin) {
            setError('Bitte gib deine PIN ein.');
            return;
        }

        setIsVerifying(true);
        try {
            if (securitySettings?.pwd_salt && securitySettings?.pin_hash) {
                const isValid = await verifyPin(pin, securitySettings.pwd_salt, securitySettings.pin_hash);
                if (!isValid) {
                    setError('Falsche PIN. Bitte versuche es erneut.');
                    setIsVerifying(false);
                    return;
                }
            }

            if (securitySettings) {
                recordItemUnlock(item.id, securitySettings, pin);
            }
            
            onUnlock(pin);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Fehler beim Überprüfen der PIN.');
        } finally {
            setIsVerifying(false);
        }
    };

    const handleRequestRecoveryEmail = async () => {
        setRecoveryStep('sending');
        setRecoveryMessage(null);
        setError(null);

        try {
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
            setRecoveryMessage(`Wiederherstellungscode an ${targetEmail || 'deine E-Mail'} gesendet.`);
        } catch (e: any) {
            setRecoveryStep('idle');
            setError(e.message || 'E-Mail-Versand fehlgeschlagen.');
        }
    };

    const handleVerifyRecoveryOtp = async () => {
        if (!recoveryOtp.trim()) {
            setError('Bitte gib den Code aus der E-Mail ein.');
            return;
        }

        setRecoveryStep('verifying');
        setError(null);

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
            // Unlocks item and allows user to update security settings
            if (securitySettings) {
                recordItemUnlock(item.id, securitySettings);
            }
            onUnlock('');
            onClose();
            if (onOpenSecuritySettings) {
                onOpenSecuritySettings();
            }
        } catch (e: any) {
            setRecoveryStep('code_sent');
            setError(e.message || 'Ungültiger Code.');
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div 
                className="w-full max-w-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 animate-in zoom-in-95 duration-150"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-start mb-4">
                    <div className="p-3 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        <Lock size={24} />
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                    {item.type === 'folder' ? 'Ordner ist geschützt' : 'Notiz ist geschützt'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-5">
                    Bitte gib die PIN für <span className="font-semibold text-gray-700 dark:text-gray-200">„{item.title}“</span> ein.
                </p>

                {error && (
                    <div className="mb-4 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                        <AlertCircle size={14} className="flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {!showRecovery ? (
                    <form onSubmit={handleUnlock} className="space-y-4">
                        <div className="relative">
                            <input
                                type={showPin ? 'text' : 'password'}
                                autoFocus
                                value={pin}
                                onChange={e => setPin(e.target.value)}
                                placeholder="PIN / Passwort eingeben..."
                                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40 text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPin(!showPin)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                            <button
                                type="button"
                                onClick={() => setShowRecovery(true)}
                                className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-medium"
                            >
                                PIN vergessen?
                            </button>

                            <button
                                type="submit"
                                disabled={isVerifying || !pin}
                                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
                            >
                                <span>{isVerifying ? 'Prüfe...' : 'Entsperren'}</span>
                                <ArrowRight size={14} />
                            </button>
                        </div>
                    </form>
                ) : (
                    /* Recovery Flow */
                    <div className="space-y-4 pt-1">
                        <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 text-xs">
                            <div className="font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1.5 mb-1">
                                <Mail size={13} />
                                <span>Wiederherstellung per E-Mail</span>
                            </div>
                            <p className="text-gray-500 dark:text-gray-400">
                                Wir senden einen Bestätigungscode an deine hinterlegte E-Mail-Adresse.
                            </p>
                        </div>

                        {recoveryStep === 'idle' && (
                            <button
                                type="button"
                                onClick={handleRequestRecoveryEmail}
                                className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-lg shadow-purple-500/20 transition-colors"
                            >
                                Bestätigungscode anfordern
                            </button>
                        )}

                        {recoveryStep === 'sending' && (
                            <div className="flex items-center justify-center gap-2 py-3 text-xs text-purple-600 dark:text-purple-400">
                                <RefreshCw size={14} className="animate-spin" />
                                <span>Sende E-Mail...</span>
                            </div>
                        )}

                        {(recoveryStep === 'code_sent' || recoveryStep === 'verifying') && (
                            <div className="space-y-3">
                                {recoveryMessage && (
                                    <p className="text-xs text-purple-700 dark:text-purple-300">{recoveryMessage}</p>
                                )}
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        maxLength={6}
                                        value={recoveryOtp}
                                        onChange={e => setRecoveryOtp(e.target.value)}
                                        placeholder="6-stelliger Code..."
                                        className="flex-1 px-3 py-2 rounded-xl border border-purple-300 dark:border-purple-700/60 bg-white dark:bg-slate-900 text-xs font-mono tracking-widest text-center"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleVerifyRecoveryOtp}
                                        disabled={recoveryStep === 'verifying'}
                                        className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors"
                                    >
                                        {recoveryStep === 'verifying' ? '...' : 'OK'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => { setShowRecovery(false); setError(null); }}
                            className="w-full text-center text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                            ← Zurück zur PIN-Eingabe
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
