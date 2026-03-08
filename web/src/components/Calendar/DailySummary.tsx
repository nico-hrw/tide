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
        setQuote(quotes[Math.floor(Math.random() * quotes.length)]);
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[2000] flex items-center justify-center pointer-events-none">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/60 backdrop-blur-md pointer-events-auto"
                />

                <motion.div
                    initial={{ scale: 0.8, opacity: 0, y: 50 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.8, opacity: 0, y: 50 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                    className="relative w-full max-w-sm bg-white dark:bg-[#1C1C1E] rounded-[40px] shadow-2xl overflow-hidden border border-white/20 dark:border-white/10 p-8 flex flex-col items-center pointer-events-auto"
                >
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500 transition-colors"
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
                            className="text-5xl font-black text-gray-900 dark:text-white mb-2"
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
                        className="bg-gray-50 dark:bg-white/5 p-4 rounded-2xl mb-8 text-center italic text-gray-600 dark:text-gray-300 w-full"
                    >
                        "{quote}"
                    </motion.div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4 w-full mb-8">
                        <div className="bg-blue-50 dark:bg-blue-500/10 p-4 rounded-3xl border border-blue-100 dark:border-blue-500/20 flex flex-col items-center gap-1">
                            <Calendar className="w-5 h-5 text-blue-500 mb-1" />
                            <span className="text-lg font-bold text-gray-900 dark:text-white">{eventsToday}</span>
                            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-tighter">Events Today</span>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-500/10 p-4 rounded-3xl border border-emerald-100 dark:border-emerald-500/20 flex flex-col items-center gap-1">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 mb-1" />
                            <span className="text-lg font-bold text-gray-900 dark:text-white">{completedTasksToday}</span>
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter">Tasks Done</span>
                        </div>
                    </div>

                    {/* Continue Button */}
                    <button
                        onClick={onClose}
                        className="w-full py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl font-black text-lg shadow-lg shadow-blue-500/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        AWESOME!
                    </button>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
