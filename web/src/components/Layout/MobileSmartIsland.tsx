'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Bell, X } from 'lucide-react';
import { useIslandStore } from '@/components/extensions/smart_island/useIslandStore';

export interface CountdownEvent {
  id: string;
  title?: string;
  start: string;
  end?: string;
  allDay?: boolean;
  color?: string;
}

export interface MobileSmartIslandProps {
  events: CountdownEvent[];
  onTap?: (eventId: string) => void;
  className?: string;
  isLoading?: boolean;
}

export const MobileSmartIsland = React.memo(function MobileSmartIsland({
  events,
  onTap,
  className,
  isLoading = false,
}: MobileSmartIslandProps) {
  const { state, dismiss } = useIslandStore();
  const [now, setNow] = useState<Date>(() => new Date());
  const [dismissedImminentId, setDismissedImminentId] = useState<string | null>(null);
  const [isDemoLoading, setDemoLoading] = useState(false);

  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1-second interval ticker for live countdown
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  // Long-press / double-tap demo trigger
  const triggerDemoLoading = useCallback(() => {
    setDemoLoading(true);
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    demoTimerRef.current = setTimeout(() => {
      setDemoLoading(false);
    }, 6000);
  }, []);

  const handleTouchStart = useCallback(() => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      triggerDemoLoading();
    }, 500);
  }, [triggerDemoLoading]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Target event calculation (active or next upcoming today)
  const target = useMemo(() => {
    if (!events || events.length === 0) return null;
    const nowMs = now.getTime();
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth();
    const nowDate = now.getDate();

    interface ParsedEvent {
      event: CountdownEvent;
      startMs: number;
      endMs: number;
      isToday: boolean;
    }

    const parsed: ParsedEvent[] = [];
    for (const e of events) {
      if (e.allDay || !e.start) continue;
      const s = new Date(e.start);
      const startMs = s.getTime();
      if (isNaN(startMs)) continue;
      const endMs = e.end ? new Date(e.end).getTime() : startMs + 3600000;
      const isToday =
        s.getFullYear() === nowYear &&
        s.getMonth() === nowMonth &&
        s.getDate() === nowDate;
      parsed.push({ event: e, startMs, endMs, isToday });
    }

    // 1. Active: start <= now && end > now (earliest start if multiple)
    const active = parsed
      .filter((p) => p.startMs <= nowMs && p.endMs > nowMs)
      .sort((a, b) => a.startMs - b.startMs);

    if (active.length > 0) {
      return {
        event: active[0].event,
        isActive: true,
        startMs: active[0].startMs,
        endMs: active[0].endMs,
      };
    }

    // 2. Next: if no active, first event with start > now today
    const next = parsed
      .filter((p) => p.isToday && p.startMs > nowMs)
      .sort((a, b) => a.startMs - b.startMs);

    if (next.length > 0) {
      return {
        event: next[0].event,
        isActive: false,
        startMs: next[0].startMs,
        endMs: next[0].endMs,
      };
    }

    return null;
  }, [events, now]);

  const nowMs = now.getTime();
  const diffSec = target
    ? Math.max(
        0,
        Math.floor((target.isActive ? target.endMs - nowMs : target.startMs - nowMs) / 1000)
      )
    : 0;

  const pad = (n: number) => n.toString().padStart(2, '0');
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const formattedHoursMins = `${h}:${pad(m)}h`;
  const isUnderOneHour = Boolean(target && diffSec < 3600);
  const formattedCountdown = target
    ? isUnderOneHour
      ? `${Math.max(1, Math.ceil(diffSec / 60))} Min`
      : formattedHoursMins
    : '0:00h';

  // Imminent event: starting in 15 minutes or less
  const isImminent = !target?.isActive && target !== null && diffSec > 0 && diffSec <= 900;
  const isImminentDismissed = target?.event?.id ? dismissedImminentId === target.event.id : false;

  // Active mode resolution
  type IslandMode = 'loading' | 'message' | 'imminent' | 'idle';

  let mode: IslandMode = 'idle';
  if (
    isLoading ||
    isDemoLoading ||
    state.current?.type === 'loading' ||
    state.current?.type === 'upload_progress'
  ) {
    mode = 'loading';
  } else if (state.current?.type === 'message') {
    mode = 'message';
  } else if (state.current?.type === 'reminder' || (!isImminentDismissed && isImminent)) {
    mode = 'imminent';
  } else {
    mode = 'idle';
  }

  const isExpanded = mode === 'message' || mode === 'imminent';

  const senderName =
    typeof state.current?.payload?.senderName === 'string'
      ? state.current.payload.senderName
      : 'Nachricht';

  const messageText =
    typeof state.current?.payload?.text === 'string'
      ? state.current.payload.text
      : 'Neue Nachricht';

  const imminentTitle =
    (typeof state.current?.payload?.title === 'string' ? state.current.payload.title : '') ||
    target?.event.title ||
    'Termin steht an';

  const imminentMinutes = Math.max(1, Math.ceil(diffSec / 60));
  const imminentLabel =
    diffSec <= 60 ? "Gleich geht's los!" : `In ${imminentMinutes} Min!`;

  // If in idle mode and nothing is active or upcoming today, hide completely
  if (mode === 'idle' && !target) {
    return null;
  }

  return (
    <div className={`relative shrink-0 w-20 h-20 ${className || ''}`}>
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        onDoubleClick={triggerDemoLoading}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        whileTap={{ scale: 0.97 }}
        className={`absolute right-0 top-0 h-20 bg-[#18181b]/95 dark:bg-[#09090b]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-xl text-white overflow-hidden ${
          isExpanded ? 'w-[min(320px,calc(100vw-32px))] z-30' : 'w-20 z-20'
        }`}
      >
        <AnimatePresence mode="wait">
          {mode === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.18 }}
              className="relative w-full h-full flex items-center justify-center select-none"
            >
              {/* Outer Shape (morphing & spinning clockwise with variable speed) */}
              <motion.div
                animate={{
                  rotate: [0, 90, 320, 540, 720],
                  borderRadius: ['22%', '40%', '50%', '35%', '22%'],
                  scale: [1, 1.08, 0.94, 1.06, 1],
                }}
                transition={{
                  duration: 3.2,
                  repeat: Infinity,
                  ease: ['easeInOut', 'circIn', 'circOut', 'easeInOut'],
                }}
                className="absolute w-11 h-11 border-2 border-indigo-400/90 shadow-[0_0_15px_rgba(129,140,248,0.6)]"
              />

              {/* Inner Shape (morphing & spinning counter-clockwise in opposite direction) */}
              <motion.div
                animate={{
                  rotate: [0, -180, -360, -540, -720],
                  borderRadius: ['50%', '15%', '45%', '20%', '50%'],
                  scale: [0.92, 1.12, 0.88, 1.1, 0.92],
                }}
                transition={{
                  duration: 2.6,
                  repeat: Infinity,
                  ease: ['easeInOut', 'anticipate', 'circOut', 'easeInOut'],
                }}
                className="absolute w-7 h-7 border-2 border-cyan-400/90 shadow-[0_0_12px_rgba(34,211,238,0.7)]"
              />

              {/* Center core dot */}
              <motion.div
                animate={{
                  scale: [0.8, 1.3, 0.85, 1.25, 0.8],
                  opacity: [0.7, 1, 0.6, 1, 0.7],
                }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]"
              />
            </motion.div>
          )}

          {mode === 'message' && (
            <motion.div
              key="message"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full px-3 py-2 flex items-center gap-2.5 select-none"
            >
              <div className="relative shrink-0 w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <MessageSquare className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-indigo-400" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center text-left">
                <span className="text-xs font-bold text-white truncate leading-tight">
                  {senderName}
                </span>
                <span className="text-[11px] text-gray-300 truncate mt-0.5 leading-snug">
                  {messageText}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss();
                }}
                className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-white/10 active:scale-90 transition-all shrink-0"
                aria-label="Schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {mode === 'imminent' && (
            <motion.div
              key="imminent"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full px-3 py-2 flex items-center gap-2.5 cursor-pointer select-none"
              onClick={() => {
                if (target?.event?.id) {
                  onTap?.(target.event.id);
                }
              }}
            >
              <div className="relative shrink-0 w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Bell className="w-5 h-5 animate-bounce" />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-400/40 animate-ping" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center text-left">
                <span className="text-xs font-bold text-white truncate leading-tight">
                  {imminentTitle}
                </span>
                <div className="text-[11px] font-medium text-amber-300 truncate flex items-center gap-1.5 mt-0.5">
                  <span>{imminentLabel}</span>
                  <span className="text-white/60 font-mono text-[10px]">({formattedHoursMins})</span>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (state.current) {
                    dismiss();
                  }
                  if (target) {
                    setDismissedImminentId(target.event.id);
                  }
                }}
                className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-white/10 active:scale-90 transition-all shrink-0"
                aria-label="Schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {mode === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="w-full h-full p-2 flex flex-col justify-between items-start text-left select-none cursor-pointer"
              onClick={() => {
                if (target?.event?.id) {
                  onTap?.(target.event.id);
                }
              }}
            >
              <span className="text-xs font-bold text-white truncate max-w-full leading-tight">
                {target?.event.title || 'Frei'}
              </span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider leading-none">
                {target?.isActive ? 'NOCH' : (target ? 'STARTET IN' : 'HEUTE')}
              </span>
              <span
                className={`${
                  isUnderOneHour ? 'text-lg' : 'text-2xl sm:text-[26px]'
                } font-black tracking-tight tabular-nums text-white leading-none whitespace-nowrap`}
              >
                {formattedCountdown}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
});
