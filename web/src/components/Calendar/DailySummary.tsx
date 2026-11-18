"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Snowflake, X, Calendar, CheckCircle2, Trophy } from 'lucide-react';
import Image from 'next/image';

interface DailySummaryProps {
    isOpen: boolean;
    onClose: () => void;
    streak: number;
    hasFreeze?: boolean;
    eventsToday: number;
    completedTasksToday: number;
}

const quotes = [
    "You're on fire! Keep it up!",
    "Success is a series of small wins.",
    "Consistency is the key to mastery.",
    "Every day is a fresh start.",
    "Make today count!",
    "Your future self will thank you.",
    "Don't stop until you're proud.",
    "Small steps lead to big changes."
];

export default function DailySummary({
    isOpen,
    onClose,
    streak,
    hasFreeze = false,
    eventsToday,
    completedTasksToday
}: DailySummaryProps) {
    const [quote, setQuote] = useState("");

    useEffect(() => {
        if (!isOpen) return;
        setQuote(quotes[Math.floor(Math.random() * quotes.length)]);
    }, [isOpen]);

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

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[2000] flex items-center justify-center pointer-events-none">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-[#111827]/20 pointer-events-auto"
                />

                <motion.div
                    initial={{ scale: 0.8, opacity: 0, y: 50 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.8, opacity: 0, y: 50 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                    className="relative w-full max-w-sm bg-t2-surface  rounded-[24px] shadow-[0px_24px_64px_rgba(17,24,39,0.16)] overflow-hidden border border-t2-line  p-8 flex flex-col items-center pointer-events-auto"
                >
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="absolute top-6 right-6 h-[44px] w-[44px] rounded-[12px] bg-t2-sub hover:bg-t2-hover   border border-t2-line  flex items-center justify-center text-t2-ink  cursor-pointer transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    {/* Streak Icon */}
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: 'spring', damping: 15 }}
                        className="relative w-32 h-32 mb-6"
                    >
                        <div className="absolute inset-0 bg-orange-500/20 blur-3xl rounded-full" />
                        <img
                            src={hasFreeze ? "/freeze.png" : "/flame.png"}
                            alt="Streak"
                            className="w-full h-full object-contain relative z-10"
                        />
                    </motion.div>

                    {/* Streak Count */}
                    <div className="text-center mb-8">
                        <motion.h2
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="text-5xl font-black text-t2-ink  mb-2"
                        >
                            {streak}
                        </motion.h2>
                        <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            className="text-lg font-bold text-orange-500 uppercase tracking-widest"
                        >
                            Day Streak!
                        </motion.p>
                    </div>

                    {/* Motivational Quote */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="bg-t2-sub  p-4 rounded-2xl mb-8 text-center italic text-t2-ink-2  w-full"
                    >
                        "{quote}"
                    </motion.div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4 w-full mb-8">
                        <div className="bg-t2-sub  p-4 rounded-3xl border border-t2-line  flex flex-col items-center gap-1">
                            <Calendar className="w-5 h-5 text-t2-accent mb-1" />
                            <span className="text-lg font-bold text-t2-ink ">{eventsToday}</span>
                            <span className="text-[10px] font-bold text-t2-accent  uppercase tracking-tighter">Events Today</span>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-500/10 p-4 rounded-3xl border border-emerald-100 dark:border-emerald-500/20 flex flex-col items-center gap-1">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 mb-1" />
                            <span className="text-lg font-bold text-t2-ink ">{completedTasksToday}</span>
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter">Tasks Done</span>
                        </div>
                    </div>

                    {/* Continue Button */}
                    <button
                        onClick={onClose}
                        className="w-full h-[44px] bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] font-semibold text-[14px] transition-colors flex items-center justify-center cursor-pointer"
                    >
                        AWESOME!
                    </button>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
