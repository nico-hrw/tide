"use client";

import React, { useMemo } from 'react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { useDataStore } from '@/store/useDataStore';

export default function WeekStrip() {
    const events = useDataStore(s => s.events) || [];
    const today = useMemo(() => new Date(), []);
    
    // Get the start of the current week (Monday)
    const weekStart = useMemo(() => {
        return startOfWeek(today, { weekStartsOn: 1 });
    }, [today]);

    // Generate 7 days of the week
    const days = useMemo(() => {
        return Array.from({ length: 7 }).map((_, idx) => addDays(weekStart, idx));
    }, [weekStart]);

    // Check if a day has any events
    const dayHasEvents = (day: Date) => {
        return events.some(event => {
            try {
                const eventStart = new Date(event.start);
                return isSameDay(day, eventStart);
            } catch {
                return false;
            }
        });
    };

    const weekdaysGerman = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

    return (
        <div className="w-full py-2 border-b border-white/5 select-none">
            <div className="grid grid-cols-7 gap-1 text-center">
                {days.map((day, idx) => {
                    const isTodayActive = isSameDay(day, today);
                    const hasEv = dayHasEvents(day);
                    const formattedDayNum = format(day, 'd');
                    
                    return (
                        <div key={day.toISOString()} className="flex flex-col items-center gap-1.5">
                            {/* Weekday Label */}
                            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                                {weekdaysGerman[idx]}
                            </span>
                            
                            {/* Day Number bubble */}
                            <div 
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                    isTodayActive 
                                    ? 'bg-white text-zinc-950 shadow-md shadow-black/10 scale-105' 
                                    : 'text-zinc-300 hover:bg-white/5'
                                }`}
                            >
                                {formattedDayNum}
                            </div>
                            
                            {/* Event Dot */}
                            <div className="h-1 flex items-center justify-center">
                                {hasEv && (
                                    <span className={`w-1 h-1 rounded-full ${isTodayActive ? 'bg-zinc-950' : 'bg-indigo-400'}`} />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
