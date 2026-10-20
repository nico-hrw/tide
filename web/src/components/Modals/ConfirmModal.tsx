import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmModal({
    isOpen,
    title,
    message,
    confirmText = "Bestätigen",
    cancelText = "Abbrechen",
    isDestructive = true,
    onConfirm,
    onCancel
}: ConfirmModalProps) {
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCancel();
            }
        };

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = originalOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onCancel]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-[#111827]/20"
                        onClick={onCancel}
                    />
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 10 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 10 }}
                        className="relative w-full max-w-sm rounded-[24px] shadow-[0px_24px_64px_rgba(17,24,39,0.16)] border border-[#e5e7eb] dark:border-zinc-800 bg-white dark:bg-[#18181b] p-6 overflow-hidden"
                    >
                        <div className="flex flex-col items-center text-center">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${isDestructive ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-semibold text-[#111827] dark:text-white mb-2">
                                {title}
                            </h3>
                            <p className="text-[15px] leading-relaxed text-[#596170] dark:text-zinc-400 mb-6">
                                {message}
                            </p>

                            <div className="flex w-full gap-3">
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    className="flex-1 bg-white dark:bg-zinc-800 text-[#111827] dark:text-white border border-[#e5e7eb] dark:border-zinc-700 hover:bg-[#f9fafb] dark:hover:bg-zinc-700 rounded-[8px] h-[44px] px-5 font-semibold text-[14px] transition-colors"
                                >
                                    {cancelText}
                                </button>
                                <button
                                    type="button"
                                    onClick={onConfirm}
                                    className={`flex-1 rounded-[8px] h-[44px] px-5 font-semibold text-[14px] transition-colors ${
                                        isDestructive 
                                        ? 'bg-[#b42318] hover:bg-[#91180e] text-white' 
                                        : 'bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900'
                                    }`}
                                >
                                    {confirmText}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
