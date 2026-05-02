"use client";

import React, { useEffect, useState } from 'react';
import { useDataStore } from '@/store/useDataStore';
import { Check, Edit3, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SmartIsland({ onConfirm, onEdit }: { onConfirm: (data: any, text: string) => void, onEdit: (data: any, text: string) => void }) {
    const smartIslandState = useDataStore(s => s.smartIslandState);
    const setSmartIsland = useDataStore(s => s.setSmartIsland);

    useEffect(() => {
        if (smartIslandState?.show) {
            const timer = setTimeout(() => {
                setSmartIsland(null);
            }, 6000);
            return () => clearTimeout(timer);
        }
    }, [smartIslandState, setSmartIsland]);

    return (
        <AnimatePresence>
            {smartIslandState?.show && (
                <motion.div
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] bg-white/85 dark:bg-gray-800/80 backdrop-blur-xl border border-[var(--border-ui)] rounded-[var(--radius-lg)] p-5 flex items-center gap-4 max-w-sm w-full"
                    style={{ boxShadow: 'var(--shadow-float)' }}
                >
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] uppercase tracking-[1px] font-medium text-[var(--text-subtle)] mb-1">Calendar Capture</p>
                        <p className="text-sm font-medium text-[var(--text-body)] dark:text-gray-100 truncate">
                            "{smartIslandState.text}"
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                            Today {smartIslandState.parsedData?.startMins !== null && smartIslandState.parsedData?.startMins !== undefined ? `at ${Math.floor(smartIslandState.parsedData.startMins / 60).toString().padStart(2, '0')}:${(smartIslandState.parsedData.startMins % 60).toString().padStart(2, '0')}` : ""}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                onEdit(smartIslandState.parsedData, smartIslandState.text!);
                                setSmartIsland(null);
                            }}
                            className="p-2 rounded-[var(--radius)] bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-400 dark:hover:bg-yellow-900 transition-colors"
                            title="Edit in Modal"
                        >
                            <Edit3 size={16} />
                        </button>
                        <button
                            onClick={() => {
                                onConfirm(smartIslandState.parsedData, smartIslandState.text!);
                                setSmartIsland(null);
                            }}
                            className="p-2 rounded-[var(--radius)] bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-400 dark:hover:bg-green-900 transition-colors"
                            title="Confirm Creation"
                        >
                            <Check size={16} />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
