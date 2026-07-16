import React from 'react';
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
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={onCancel}
                    />
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 10 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 10 }}
                        className="relative w-full max-w-sm bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl p-6 overflow-hidden"
                    >
                        {/* Decorative background glow for destructive actions */}
                        {isDestructive && (
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-red-500/20 rounded-full blur-[50px] -z-10 pointer-events-none" />
                        )}

                        <div className="flex flex-col items-center text-center">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${isDestructive ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                                {title}
                            </h3>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">
                                {message}
                            </p>

                            <div className="flex w-full gap-3">
                                <button
                                    onClick={onCancel}
                                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                                >
                                    {cancelText}
                                </button>
                                <button
                                    onClick={onConfirm}
                                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors shadow-lg ${
                                        isDestructive 
                                        ? 'bg-red-500 hover:bg-red-600 shadow-red-500/25' 
                                        : 'bg-zinc-900 dark:bg-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200'
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
