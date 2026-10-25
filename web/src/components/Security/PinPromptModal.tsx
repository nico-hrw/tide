"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Eye, EyeOff, X, AlertCircle, ArrowRight, Mail, RefreshCw } from 'lucide-react';
import { ItemSecuritySettings, verifyPin, recordItemUnlock } from '@/lib/pinSecurity';
import { apiFetch } from '@/lib/api';

interface PinPromptModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: {
        id: string;
        title: string;
        type: 'file' | 'folder' | 'canvas' | 'note';
        metadata?: {
            security_settings?: ItemSecuritySettings;
            has_custom_password?: boolean;
            pwd_salt?: string;
            pin_hash?: string;
            frequency?: ItemSecuritySettings['frequency'];
            [key: string]: unknown;
        };
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

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = originalOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen || typeof document === 'undefined') return null;

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
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Fehler beim Überprüfen der PIN.';
            setError(message);
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
        } catch (e: unknown) {
            setRecoveryStep('idle');
            const message = e instanceof Error ? e.message : 'E-Mail-Versand fehlgeschlagen.';
            setError(message);
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
        } catch (e: unknown) {
            setRecoveryStep('code_sent');
            const message = e instanceof Error ? e.message : 'Ungültiger Code.';
            setError(message);
        }
    };

    return createPortal(
        <div 
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 overflow-y-auto bg-[#111827]/30 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div 
                className="w-full max-w-sm rounded-[24px] shadow-[0px_24px_64px_rgba(17,24,39,0.16)] border border-[#e5e7eb] dark:border-zinc-800 bg-white dark:bg-[#18181b] overflow-hidden p-6 animate-in zoom-in-95 duration-150 my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-start mb-4">
                    <div className="p-3 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        <Lock size={24} />
                    </div>
                    <button 
                        type="button"
                        onClick={onClose}
                        className="h-[44px] w-[44px] rounded-[12px] bg-[#f9fafb] hover:bg-[#f3f4f6] dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-[#e5e7eb] dark:border-zinc-700 flex items-center justify-center text-[#111827] dark:text-zinc-200 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400"
                        aria-label="Schließen"
                    >
                        <X size={18} />
                    </button>
                </div>

                <h3 className="text-base font-bold text-[#111827] dark:text-zinc-100">
                    {item.type === 'folder' ? 'Ordner ist geschützt' : 'Notiz ist geschützt'}
                </h3>
                <p className="text-xs text-[#596170] dark:text-zinc-400 mt-1 mb-5">
                    Bitte gib die PIN für <span className="font-semibold text-[#111827] dark:text-zinc-200">„{item.title}“</span> ein.
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
                                className="w-full pl-3.5 pr-10 h-[44px] rounded-[8px] border border-[#e5e7eb] dark:border-zinc-700 bg-white dark:bg-zinc-800/80 text-[#111827] dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 text-sm transition-all"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPin(!showPin)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#111827] dark:hover:text-zinc-200 transition-colors"
                            >
                                {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                            <button
                                type="button"
                                onClick={() => setShowRecovery(true)}
                                className="text-xs text-[#596170] hover:text-[#111827] dark:text-zinc-400 dark:hover:text-zinc-200 hover:underline font-medium focus:outline-none"
                            >
                                PIN vergessen?
                            </button>

                            <button
                                type="submit"
                                disabled={isVerifying || !pin}
                                className="bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] h-[44px] px-4 font-semibold text-[14px] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 cursor-pointer"
                            >
                                <span>{isVerifying ? 'Prüfe...' : 'Entsperren'}</span>
                                <ArrowRight size={14} />
                            </button>
                        </div>
                    </form>
                ) : (
                    /* Recovery Flow */
                    <div className="space-y-4 pt-1">
                        <div className="p-3.5 rounded-[12px] bg-zinc-50 dark:bg-zinc-800/50 border border-[#e5e7eb] dark:border-zinc-800 text-xs">
                            <div className="font-semibold text-[#111827] dark:text-zinc-100 flex items-center gap-1.5 mb-1">
                                <Mail size={14} />
                                <span>Wiederherstellung per E-Mail</span>
                            </div>
                            <p className="text-[#596170] dark:text-zinc-400">
                                Wir senden einen Bestätigungscode an deine hinterlegte E-Mail-Adresse.
                            </p>
                        </div>

                        {recoveryStep === 'idle' && (
                            <button
                                type="button"
                                onClick={handleRequestRecoveryEmail}
                                className="w-full bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] h-[44px] px-4 font-semibold text-[14px] transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 cursor-pointer"
                            >
                                Bestätigungscode anfordern
                            </button>
                        )}

                        {recoveryStep === 'sending' && (
                            <div className="flex items-center justify-center gap-2 py-3 text-xs text-[#111827] dark:text-zinc-300">
                                <RefreshCw size={14} className="animate-spin" />
                                <span>Sende E-Mail...</span>
                            </div>
                        )}

                        {(recoveryStep === 'code_sent' || recoveryStep === 'verifying') && (
                            <div className="space-y-3">
                                {recoveryMessage && (
                                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{recoveryMessage}</p>
                                )}
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        maxLength={6}
                                        value={recoveryOtp}
                                        onChange={e => setRecoveryOtp(e.target.value)}
                                        placeholder="6-stelliger Code..."
                                        className="flex-1 px-3 h-[44px] rounded-[8px] border border-[#e5e7eb] dark:border-zinc-700 bg-white dark:bg-zinc-800/80 text-[#111827] dark:text-zinc-100 text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleVerifyRecoveryOtp}
                                        disabled={recoveryStep === 'verifying'}
                                        className="bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] h-[44px] px-4 font-semibold text-[14px] transition-colors focus:outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 cursor-pointer disabled:opacity-50 flex items-center justify-center"
                                    >
                                        {recoveryStep === 'verifying' ? '...' : 'OK'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => { setShowRecovery(false); setError(null); }}
                            className="w-full rounded-[8px] h-[44px] border border-[#e5e7eb] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[#111827] dark:text-zinc-200 hover:bg-[#f9fafb] dark:hover:bg-zinc-700/60 font-semibold text-[14px] transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 cursor-pointer"
                        >
                            ← Zurück zur PIN-Eingabe
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
