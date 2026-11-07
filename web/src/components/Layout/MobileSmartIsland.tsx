'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, MessageSquare, CloudOff } from 'lucide-react';
import { useIslandStore } from '@/components/extensions/smart_island/useIslandStore';

export interface CountdownEvent {
  id: string;
  title?: string;
  start: string;
  end?: string;
  allDay?: boolean;
  color?: string;
  is_completed?: boolean;
  is_all_day?: boolean;
  is_task?: boolean;
  isCompleted?: boolean;
  completed_dates?: string[];
}

export interface MobileSmartIslandProps {
  events?: CountdownEvent[];
  onTap?: (eventId: string) => void;
  onEventClick?: (eventId: string) => void;
  className?: string;
  isLoading?: boolean;
  userName?: string;
  placement?: 'top-right' | 'bottom-left';
}

// Math easing functions from drehendes_quadrat.html
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface AnimationState {
  state: 'IDLE' | 'STARTING' | 'RUNNING' | 'STOPPING';
  animationFrameId: number | null;
  mainAngle: number;
  bgAngle: number;
  loaderAngle: number;
  speedFactor: number;
  textProgress: number;
  offsetProgress: number;
  loaderProgress: number;
  bgProgress: number;
  lastTimestamp: number;
  waveTime: number;
  stopStartAngle: number;
  stopTargetAngle: number;
  stopProgress: number;
}

export const MobileSmartIsland = React.memo(function MobileSmartIsland({
  events = [],
  onTap,
  onEventClick,
  className,
  isLoading = false,
  userName,
  placement = 'top-right',
}: MobileSmartIslandProps) {
  const { state: islandStoreState, dismiss } = useIslandStore();
  const [now, setNow] = useState<Date>(() => new Date());
  const [isUserExpanded, setIsUserExpanded] = useState(false);
  const [animState, setAnimState] = useState<'IDLE' | 'ANIMATING'>('IDLE');
  const [isPendingSpin, setIsPendingSpin] = useState(false);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDemoLoading, setDemoLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOffline, setIsOffline] = useState(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return !navigator.onLine;
    }
    return false;
  });

  // Expand automatically when incoming message arrives in store
  const incomingMessage = islandStoreState.current?.type === 'message'
    ? islandStoreState.current.payload
    : null;

  // Determine whether loading animation should run
  const shouldBeLoading = Boolean(
    isLoading ||
    isDemoLoading ||
    isSyncing ||
    islandStoreState.current?.type === 'loading' ||
    islandStoreState.current?.type === 'upload_progress'
  );

  // Strict mutual exclusivity:
  // Expanding is ONLY allowed when animState === 'IDLE', rotation is exactly 0deg, not loading, and not collapsing
  const isExpanded =
    animState === 'IDLE' &&
    !shouldBeLoading &&
    !isPendingSpin &&
    (isUserExpanded || Boolean(incomingMessage));

  // DOM Refs for direct GPU-composited RAF updates
  const containerRef = useRef<HTMLDivElement>(null);
  const baseSquareRef = useRef<HTMLDivElement>(null);
  const idleTextRef = useRef<HTMLDivElement>(null);
  const welcomeTextRef = useRef<HTMLDivElement>(null);
  const offsetSquareRef = useRef<HTMLDivElement>(null);
  const loaderIconRef = useRef<HTMLDivElement>(null);
  const navySquareRef = useRef<HTMLDivElement>(null);
  const purpleSquareRef = useRef<HTMLDivElement>(null);

  // Animation controller state
  const animRef = useRef<AnimationState>({
    state: 'IDLE',
    animationFrameId: null,
    mainAngle: 0,
    bgAngle: 0,
    loaderAngle: 0,
    speedFactor: 0,
    textProgress: 1,
    offsetProgress: 0,
    loaderProgress: 0,
    bgProgress: 0,
    lastTimestamp: 0,
    waveTime: 0,
    stopStartAngle: 0,
    stopTargetAngle: 0,
    stopProgress: 0,
  });

  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = useCallback((eventId?: string) => {
    if (!eventId) return;
    if (onEventClick) {
      onEventClick(eventId);
    } else if (onTap) {
      onTap(eventId);
    }
  }, [onEventClick, onTap]);

  // Offline recovery
  useEffect(() => {
    if (!isOffline) return;
    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        setIsOffline(false);
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [isOffline]);

  // Sync and Network status listeners
  useEffect(() => {
    const handleSyncing = () => setIsSyncing(true);
    const handleSynced = () => {
      setIsSyncing(false);
      setIsOffline(false);
    };
    const handleTideOffline = () => {
      setIsOffline(true);
      setIsSyncing(false);
    };
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => {
      setIsOffline(true);
      setIsSyncing(false);
    };

    window.addEventListener('tide-syncing', handleSyncing);
    window.addEventListener('tide-synced', handleSynced);
    window.addEventListener('tide-online', handleOnline);
    window.addEventListener('tide-offline', handleTideOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('tide-syncing', handleSyncing);
      window.removeEventListener('tide-synced', handleSynced);
      window.removeEventListener('tide-online', handleOnline);
      window.removeEventListener('tide-offline', handleTideOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleOfflineRetry = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      setIsOffline(false);
    } else if (typeof window !== 'undefined') {
      fetch('/api/health', { method: 'HEAD', cache: 'no-store' })
        .then(() => setIsOffline(false))
        .catch(() => {});
    }
  }, []);

  // 1-second interval ticker for live countdown, guarded to prevent React reconciliation during RAF
  useEffect(() => {
    const timer = setInterval(() => {
      if (animRef.current.state === 'IDLE') {
        setNow(new Date());
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Outside click handler to collapse expanded state
  useEffect(() => {
    if (!isExpanded) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsUserExpanded(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isExpanded]);

  // Target event calculation (active or next upcoming today) + tomorrow's first event
  const { target, tomorrowFirstEvent } = useMemo(() => {
    if (!events || events.length === 0) return { target: null, tomorrowFirstEvent: null };
    const nowMs = now.getTime();
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth();
    const nowDate = now.getDate();

    const tomorrow = new Date(nowYear, nowMonth, nowDate + 1);
    const tYear = tomorrow.getFullYear();
    const tMonth = tomorrow.getMonth();
    const tDate = tomorrow.getDate();

    interface ParsedEvent {
      event: CountdownEvent;
      startMs: number;
      endMs: number;
      isToday: boolean;
      isTomorrow: boolean;
    }

    const parsed: ParsedEvent[] = [];
    for (const e of events) {
      if (e.allDay || e.is_all_day || e.is_task) continue;
      if (e.is_completed || e.isCompleted || (e.completed_dates && e.completed_dates.length > 0)) continue;
      if (!e.start) continue;
      const s = new Date(e.start);
      const startMs = s.getTime();
      if (isNaN(startMs)) continue;
      const endMs = e.end ? new Date(e.end).getTime() : startMs + 3600000;
      const isToday =
        s.getFullYear() === nowYear &&
        s.getMonth() === nowMonth &&
        s.getDate() === nowDate;
      const isTomorrow =
        s.getFullYear() === tYear &&
        s.getMonth() === tMonth &&
        s.getDate() === tDate;
      parsed.push({ event: e, startMs, endMs, isToday, isTomorrow });
    }

    // 1. Active: start <= now && end > now (earliest start if multiple)
    const active = parsed
      .filter((p) => p.startMs <= nowMs && p.endMs > nowMs)
      .sort((a, b) => a.startMs - b.startMs);

    let foundTarget: { event: CountdownEvent; isActive: boolean; startMs: number; endMs: number } | null = null;
    if (active.length > 0) {
      foundTarget = {
        event: active[0].event,
        isActive: true,
        startMs: active[0].startMs,
        endMs: active[0].endMs,
      };
    } else {
      // 2. Next: if no active, first event with start > now today
      const next = parsed
        .filter((p) => p.isToday && p.startMs > nowMs)
        .sort((a, b) => a.startMs - b.startMs);
      if (next.length > 0) {
        foundTarget = {
          event: next[0].event,
          isActive: false,
          startMs: next[0].startMs,
          endMs: next[0].endMs,
        };
      }
    }

    // Tomorrow's first event if no target today
    const tomorrowEvents = parsed
      .filter((p) => p.isTomorrow)
      .sort((a, b) => a.startMs - b.startMs);
    const firstTomorrow = tomorrowEvents[0]?.event || null;

    return { target: foundTarget, tomorrowFirstEvent: firstTomorrow };
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

  // Time & Label calculation for Idle State matching drehendes_quadrat.html
  const { displayTitle, displaySubtitle, timeMain, timeUnit, formattedCountdown } = useMemo(() => {
    let title = 'TERMIN';
    let subtitle = 'IN';
    let main = '0:00';
    let unit = 'h';
    let countdownStr = '0:00h';

    if (target) {
      title = target.event.title ? target.event.title.toUpperCase() : 'TERMIN';
      subtitle = target.isActive ? 'NOCH' : 'IN';
      if (diffSec >= 3600) {
        main = `${h}:${pad(m)}`;
        unit = 'h';
        countdownStr = `${h}:${pad(m)}h`;
      } else {
        const minsLeft = Math.max(1, Math.ceil(diffSec / 60));
        main = `${minsLeft}`;
        unit = 'm';
        countdownStr = `${minsLeft} Min`;
      }
    } else if (tomorrowFirstEvent?.start) {
      const d = new Date(tomorrowFirstEvent.start);
      title = tomorrowFirstEvent.title ? tomorrowFirstEvent.title.toUpperCase() : 'TERMIN';
      subtitle = 'MORGEN';
      main = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      unit = 'h';
      countdownStr = `Morgen ${main}h`;
    } else {
      title = 'TIDE';
      subtitle = 'HEUTE';
      main = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      unit = 'h';
      countdownStr = `${main}h`;
    }

    return {
      displayTitle: title,
      displaySubtitle: subtitle,
      timeMain: main,
      timeUnit: unit,
      formattedCountdown: countdownStr,
    };
  }, [target, diffSec, h, m, tomorrowFirstEvent, now]);

  const tomorrowTimeStr = useMemo(() => {
    if (!tomorrowFirstEvent?.start) return '';
    const d = new Date(tomorrowFirstEvent.start);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [tomorrowFirstEvent]);

  const formatEventTimeRange = useCallback((e?: CountdownEvent | null) => {
    if (!e?.start) return '';
    const s = new Date(e.start);
    const sStr = `${pad(s.getHours())}:${pad(s.getMinutes())}`;
    if (!e.end) return `${sStr} Uhr`;
    const end = new Date(e.end);
    const endStr = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
    return `${sStr} – ${endStr} Uhr`;
  }, []);

  // Loading animation controller (RAF loop from drehendes_quadrat.html)
  const startAnimation = useCallback(() => {
    const a = animRef.current;
    if (a.state === 'STARTING' || a.state === 'RUNNING') return;

    queueMicrotask(() => {
      setAnimState('ANIMATING');
    });
    a.state = 'STARTING';
    a.lastTimestamp = performance.now();

    // Disable CSS transition during RAF to eliminate 60fps frame thrashing
    if (idleTextRef.current) {
      idleTextRef.current.style.transition = 'none';
    }

    const updateLoop = (timestamp: number) => {
      const anim = animRef.current;
      if (!anim.lastTimestamp) anim.lastTimestamp = timestamp;
      const dt = Math.min((timestamp - anim.lastTimestamp) * 0.001, 0.04);
      anim.lastTimestamp = timestamp;

      const baseSquare = baseSquareRef.current;
      const idleText = idleTextRef.current;
      const offsetSquare = offsetSquareRef.current;
      const loaderIcon = loaderIconRef.current;
      const navySquare = navySquareRef.current;
      const purpleSquare = purpleSquareRef.current;

      if (!baseSquare || !idleText || !offsetSquare || !loaderIcon || !navySquare || !purpleSquare) {
        anim.animationFrameId = requestAnimationFrame(updateLoop);
        return;
      }

      if (anim.state === 'STARTING') {
        anim.speedFactor = lerp(anim.speedFactor, 1, dt * 2.2);
        anim.textProgress = Math.max(0, anim.textProgress - dt * 4.0);

        if (anim.speedFactor > 0.15) {
          anim.offsetProgress = Math.min(1, anim.offsetProgress + dt * 1.6);
        }
        if (anim.offsetProgress > 0.4) {
          anim.loaderProgress = Math.min(1, anim.loaderProgress + dt * 1.8);
        }
        if (anim.loaderProgress > 0.5) {
          anim.bgProgress = Math.min(1, anim.bgProgress + dt * 1.4);
        }

        if (anim.bgProgress >= 0.99 && anim.speedFactor > 0.95) {
          anim.bgProgress = 1;
          anim.offsetProgress = 1;
          anim.loaderProgress = 1;
          anim.speedFactor = 1;
          anim.textProgress = 0;
          anim.state = 'RUNNING';
        }

        anim.waveTime += dt;
        const burstMultiplier = 1.0 + 1.25 * Math.pow(Math.max(0, Math.sin(anim.waveTime * 1.8)), 4);
        anim.mainAngle += 110 * burstMultiplier * anim.speedFactor * dt;
        anim.bgAngle -= 75 * anim.speedFactor * dt;
        anim.loaderAngle += 340 * dt;

      } else if (anim.state === 'RUNNING') {
        anim.waveTime += dt;
        const burstMultiplier = 1.0 + 1.25 * Math.pow(Math.max(0, Math.sin(anim.waveTime * 1.8)), 4);
        anim.mainAngle += 110 * burstMultiplier * dt;
        anim.bgAngle -= 75 * dt;
        anim.loaderAngle += 340 * dt;

      } else if (anim.state === 'STOPPING') {
        anim.bgProgress = Math.max(0, anim.bgProgress - dt * 2.0);

        if (anim.bgProgress < 0.5) {
          anim.loaderProgress = Math.max(0, anim.loaderProgress - dt * 2.5);
        }
        if (anim.loaderProgress < 0.4) {
          anim.offsetProgress = Math.max(0, anim.offsetProgress - dt * 2.2);
        }

        anim.stopProgress = Math.min(1, anim.stopProgress + dt * 0.7);
        const easedStop = easeOutCubic(anim.stopProgress);

        if (anim.stopProgress > 0.65) {
          anim.textProgress = Math.min(1, anim.textProgress + dt * 2.8);
        }

        // MATHEMATICAL ORTHOGONAL DOCKING: Smooth deceleration to stopTargetAngle
        anim.mainAngle = lerp(anim.stopStartAngle, anim.stopTargetAngle, easedStop);
        anim.bgAngle -= 75 * (1 - easedStop) * dt;
        anim.loaderAngle += 340 * (1 - easedStop) * dt;

        if (anim.stopProgress >= 1 && anim.offsetProgress <= 0.01 && anim.bgProgress <= 0.01 && anim.loaderProgress <= 0.01) {
          // Normalize to exactly 0deg
          anim.mainAngle = 0;
          baseSquare.style.transform = 'translate3d(0,0,0) scale(1) rotate(0deg)';
          anim.textProgress = 1;
          idleText.style.opacity = '1';
          idleText.style.transition = '';
          offsetSquare.style.opacity = '0';
          loaderIcon.style.opacity = '0';
          navySquare.style.opacity = '0';
          purpleSquare.style.opacity = '0';

          anim.state = 'IDLE';
          anim.speedFactor = 0;
          if (anim.animationFrameId) {
            cancelAnimationFrame(anim.animationFrameId);
            anim.animationFrameId = null;
          }
          setAnimState('IDLE');
          setNow(new Date());
          return;
        }
      }

      // Direct GPU-composited CSS transforms
      idleText.style.opacity = anim.textProgress.toFixed(3);
      baseSquare.style.transform = `translate3d(0,0,0) scale(1) rotate(${anim.mainAngle.toFixed(2)}deg)`;

      if (anim.offsetProgress > 0) {
        const easedOffset = easeInOutCubic(anim.offsetProgress);
        offsetSquare.style.opacity = easedOffset.toFixed(3);
        offsetSquare.style.transform = `translate3d(0,0,0) scale(${lerp(0.85, 1, easedOffset).toFixed(3)}) rotate(${(anim.mainAngle + 45).toFixed(2)}deg)`;
      } else {
        offsetSquare.style.opacity = '0';
      }

      if (anim.loaderProgress > 0) {
        const easedLoader = easeInOutCubic(anim.loaderProgress);
        loaderIcon.style.opacity = easedLoader.toFixed(3);
        loaderIcon.style.transform = `translate3d(0,0,0) scale(${lerp(0.6, 1, easedLoader).toFixed(3)}) rotate(${anim.loaderAngle.toFixed(2)}deg)`;
      } else {
        loaderIcon.style.opacity = '0';
      }

      if (anim.bgProgress > 0.001) {
        const easedBg = easeInOutCubic(anim.bgProgress);
        const pulseCycle = (Math.sin(anim.waveTime * 2.2) + 1) * 0.5;

        const navyScale = lerp(0.4, lerp(0.85, 1.28, pulseCycle), easedBg);
        navySquare.style.opacity = (lerp(0.2, 0.95, pulseCycle) * easedBg).toFixed(3);
        navySquare.style.transform = `translate3d(0,0,0) scale(${navyScale.toFixed(3)}) rotate(${anim.bgAngle.toFixed(2)}deg)`;

        const purpleScale = lerp(0.4, lerp(0.85, 1.28, 1 - pulseCycle), easedBg);
        purpleSquare.style.opacity = (lerp(0.2, 0.95, 1 - pulseCycle) * easedBg).toFixed(3);
        purpleSquare.style.transform = `translate3d(0,0,0) scale(${purpleScale.toFixed(3)}) rotate(${(anim.bgAngle - 25).toFixed(2)}deg)`;
      } else {
        navySquare.style.opacity = '0';
        purpleSquare.style.opacity = '0';
      }

      anim.animationFrameId = requestAnimationFrame(updateLoop);
    };

    if (!a.animationFrameId) {
      a.animationFrameId = requestAnimationFrame(updateLoop);
    }
  }, []);

  const stopAnimation = useCallback(() => {
    const anim = animRef.current;
    if (anim.state !== 'RUNNING' && anim.state !== 'STARTING') return;

    anim.state = 'STOPPING';
    anim.stopStartAngle = anim.mainAngle;
    const minRunout = 240;
    // Round up to nearest forward multiple of 360deg
    anim.stopTargetAngle = Math.ceil((anim.stopStartAngle + minRunout) / 360) * 360;
    anim.stopProgress = 0;
  }, []);

  useEffect(() => {
    if (shouldBeLoading) {
      if (isUserExpanded || Boolean(incomingMessage)) {
        // If expanded, first smoothly collapse back to 92px square
        const collapseTimeout = setTimeout(() => {
          setIsUserExpanded(false);
          setIsPendingSpin(true);
        }, 0);
        if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = setTimeout(() => {
          setIsPendingSpin(false);
          startAnimation();
        }, 460);
        return () => clearTimeout(collapseTimeout);
      } else if (!isPendingSpin) {
        startAnimation();
      }
    } else {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
      if (isPendingSpin) {
        queueMicrotask(() => {
          setIsPendingSpin(false);
        });
      }
      stopAnimation();
    }
  }, [shouldBeLoading, isUserExpanded, incomingMessage, isPendingSpin, startAnimation, stopAnimation]);

  // Cleanup on unmount (zero memory leaks, 0% CPU on idle)
  useEffect(() => {
    const anim = animRef.current;
    return () => {
      if (anim.animationFrameId) {
        cancelAnimationFrame(anim.animationFrameId);
        anim.animationFrameId = null;
      }
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  // Interactive controls
  const handleBaseClick = useCallback(() => {
    if (animRef.current.state !== 'IDLE' || animState !== 'IDLE' || isPendingSpin || shouldBeLoading) return;
    setIsUserExpanded((prev) => !prev);
  }, [animState, isPendingSpin, shouldBeLoading]);

  const triggerDemoLoading = useCallback(() => {
    if (animRef.current.state !== 'IDLE' || animState !== 'IDLE') return;
    setDemoLoading(true);
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    demoTimerRef.current = setTimeout(() => {
      setDemoLoading(false);
    }, 5500);
  }, [animState]);

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

  return (
    <div
      ref={containerRef}
      className={`relative shrink-0 w-[92px] h-[92px] select-none ${animState !== 'IDLE' ? 'is-animating' : ''} ${className || ''}`}
    >
      {/* Visual styles and transitions matching drehendes_quadrat.html */}
      <style>{`
        .smart-island-layer {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border-radius: 20px;
          transform-origin: center center;
          will-change: transform, opacity;
          contain: layout style paint;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .smart-island-spring {
          transition: width 0.45s cubic-bezier(0.34, 1.25, 0.64, 1);
        }
        .smart-island-base {
          position: absolute;
          top: 0;
          width: 92px;
          height: 92px;
          border-radius: 20px;
          transform-origin: center center;
          will-change: transform, opacity, width;
          contain: layout style paint;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          z-index: 30;
        }
        .smart-island-base.placement-top-right {
          right: 0;
          left: auto;
        }
        .smart-island-base.placement-bottom-left {
          left: 0;
          right: auto;
        }
        .smart-island-base.expanded {
          width: calc(100vw - 32px);
        }
        .smart-island-idle-text {
          will-change: transform, opacity;
          contain: layout style paint;
          transition: transform 0.45s cubic-bezier(0.34, 1.35, 0.54, 1), 
                      opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .is-animating .smart-island-idle-text {
          transition: none !important;
        }
        .smart-island-welcome-text {
          will-change: transform, opacity;
          contain: layout style paint;
          transition: transform 0.45s cubic-bezier(0.34, 1.25, 0.54, 1), 
                      opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .smart-island-text-slide-out {
          opacity: 0 !important;
          transform: translate3d(24px, 0, 0) scale(0.96) !important;
          pointer-events: none;
        }
        .smart-island-welcome-hidden {
          opacity: 0;
          transform: translate3d(-24px, 0, 0) scale(0.96);
          pointer-events: none;
        }
        .smart-island-welcome-visible {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
          pointer-events: auto;
        }
      `}</style>

      {/* Anchor: Concentric 92x92px square geometry */}
      <div
        className={`absolute top-0 ${placement === 'bottom-left' ? 'left-0' : 'right-0'} w-[92px] h-[92px] pointer-events-none`}
      >
        {/* Layer 1: Navy Blue (#001f3f) */}
        <div
          ref={navySquareRef}
          className="smart-island-layer bg-[#001f3f] shadow-2xl shadow-[#001f3f]/30"
          style={{ opacity: 0, transform: 'scale(0.3) rotate(0deg)' }}
          aria-hidden="true"
        />

        {/* Layer 2: Purple (#7928ca) */}
        <div
          ref={purpleSquareRef}
          className="smart-island-layer bg-[#7928ca] shadow-2xl shadow-[#7928ca]/30"
          style={{ opacity: 0, transform: 'scale(0.3) rotate(0deg)' }}
          aria-hidden="true"
        />

        {/* Layer 3: 45° Offset Anthracite Square (#212226) */}
        <div
          ref={offsetSquareRef}
          className="smart-island-layer bg-[#212226] shadow-2xl shadow-black/30 z-10"
          style={{ opacity: 0, transform: 'scale(0.6) rotate(45deg)' }}
          aria-hidden="true"
        />

        {/* Layer 4: Central Loader SVG Icon */}
        <div
          ref={loaderIconRef}
          className="smart-island-layer z-20 flex items-center justify-center"
          style={{ opacity: 0, transform: 'scale(0.6) rotate(0deg)' }}
          aria-hidden="true"
        >
          <svg
            className="w-7 h-7 text-white drop-shadow"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="9.5"
              stroke="currentColor"
              strokeWidth="2.75"
            />
            <path
              className="opacity-95"
              fill="currentColor"
              d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5h-2.5A7 7 0 0 0 12 5V2.5z"
            />
          </svg>
        </div>
      </div>

      {/* Layer 5: Base Matte Anthracite Square */}
      <div
        ref={baseSquareRef}
        role="button"
        tabIndex={0}
        onClick={handleBaseClick}
        onDoubleClick={triggerDemoLoading}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        className={`smart-island-base smart-island-spring bg-[#212226] shadow-2xl shadow-black/35 p-2.5 text-white box-border overflow-hidden cursor-pointer ${
          placement === 'bottom-left' ? 'placement-bottom-left' : 'placement-top-right'
        } ${isExpanded ? 'expanded' : ''}`}
        style={{
          transform: 'translate3d(0,0,0) scale(1) rotate(0deg)',
        }}
      >
        {/* Offline indicator badge */}
        {isOffline && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              handleOfflineRetry();
            }}
            title="Offline - Klicken zum Wiederverbinden"
            className="absolute top-2 right-2 z-40 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-[8px] font-bold text-amber-300 cursor-pointer"
          >
            <CloudOff className="w-2.5 h-2.5 text-amber-400" />
            <span>OFF</span>
          </div>
        )}

        {/* Idle Mode: Top-left Title + Subtitle, Bottom-right Large Bold Time */}
        <div
          ref={idleTextRef}
          className={`w-full h-full flex flex-col justify-between select-none smart-island-idle-text ${
            isExpanded ? 'smart-island-text-slide-out' : ''
          }`}
          style={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
        >
          {/* Top Left: TERMIN + IN/NOCH/MORGEN/HEUTE */}
          <div className="flex flex-col items-start text-left gap-0 min-w-0 max-w-full">
            <span className="text-[13px] font-black tracking-tight text-white leading-none truncate max-w-[70px]">
              {displayTitle}
            </span>
            <span className="text-[10px] font-black tracking-widest text-[#9498a3] uppercase leading-tight mt-0.5">
              {displaySubtitle}
            </span>
          </div>

          {/* Bottom Right: Countdown Display (e.g. 3:12h or 45m) */}
          <div className="w-full flex items-baseline justify-end pb-0 pr-0.5">
            <span
              className={`${
                timeMain.length >= 5 ? 'text-[26px]' : 'text-[32px]'
              } font-black tracking-tighter text-white leading-none font-sans`}
            >
              {timeMain}
              <span className="text-[16px] font-black tracking-tight text-neutral-300 ml-0.5">
                {timeUnit}
              </span>
            </span>
          </div>
        </div>

        {/* Expanded Mode: Springs out to full width */}
        <div
          ref={welcomeTextRef}
          className={`absolute inset-0 p-2.5 flex flex-col justify-between items-start smart-island-welcome-text ${
            isExpanded ? 'smart-island-welcome-visible' : 'smart-island-welcome-hidden'
          }`}
        >
          {incomingMessage ? (
            // Message notification view
            <div className="w-full h-full flex flex-col justify-between select-none">
              <div className="w-full flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-white truncate max-w-[calc(100vw-120px)]">
                    {incomingMessage.senderName || 'Nachricht'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss();
                    setIsUserExpanded(false);
                  }}
                  className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center text-neutral-300 transition-all shrink-0 cursor-pointer"
                  aria-label="Schließen"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              <p className="text-xs text-neutral-200 truncate my-auto leading-tight">
                {incomingMessage.text || 'Neue Nachricht erhalten'}
              </p>

              <div className="w-full flex items-center justify-between text-[10px] text-neutral-400">
                <span>Tide Smart Island</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss();
                    setIsUserExpanded(false);
                  }}
                  className="text-xs font-bold text-white hover:underline cursor-pointer"
                >
                  Gelesen
                </button>
              </div>
            </div>
          ) : (
            // Default rich expanded view (Willkommen zurück Nico + Event details)
            <>
              {/* Top Row: Greeting & Close */}
              <div className="w-full flex items-start justify-between">
                <div className="flex flex-col text-left min-w-0 pr-2">
                  <span className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase leading-none">
                    {target ? (target.isActive ? 'Aktueller Termin' : 'Nächster Termin') : 'Willkommen zurück'}
                  </span>
                  <span className="text-[15px] font-black tracking-tight text-white leading-tight truncate max-w-[calc(100vw-110px)] mt-0.5">
                    {target ? (target.event.title || 'Termin') : (userName || 'Nico')}
                  </span>
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsUserExpanded(false);
                  }}
                  className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center text-neutral-300 transition-all shrink-0 cursor-pointer"
                  title="Einklappen"
                >
                  <X className="w-3 h-3" />
                </div>
              </div>

              {/* Bottom Row: Event Time & Action Button */}
              <div className="w-full flex items-end justify-between pt-0.5">
                {target ? (
                  <>
                    <div className="flex flex-col text-left min-w-0 pr-2">
                      <span className="text-[12px] font-bold text-neutral-200 leading-tight">
                        {target.isActive ? 'Läuft gerade' : `In ${formattedCountdown}`}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-medium leading-tight mt-0.5 truncate">
                        {formatEventTimeRange(target.event)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (target?.event?.id) handleTap(target.event.id);
                      }}
                      className="group w-8 h-8 bg-white/15 hover:bg-white/25 active:scale-95 text-white rounded-xl transition-all flex items-center justify-center shadow-sm shrink-0 cursor-pointer"
                      aria-label="Termin öffnen"
                    >
                      <svg
                        className="w-5 h-5 transform transition-transform duration-300 group-hover:translate-x-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs text-neutral-400 font-medium truncate pr-2">
                      {tomorrowFirstEvent
                        ? `Morgen ${tomorrowTimeStr} Uhr: ${tomorrowFirstEvent.title || 'Termin'}`
                        : 'Keine weiteren Termine heute'}
                    </span>
                    {tomorrowFirstEvent && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTap(tomorrowFirstEvent.id);
                        }}
                        className="group w-8 h-8 bg-white/15 hover:bg-white/25 active:scale-95 text-white rounded-xl transition-all flex items-center justify-center shadow-sm shrink-0 cursor-pointer"
                        aria-label="Termin öffnen"
                      >
                        <svg
                          className="w-5 h-5 transform transition-transform duration-300 group-hover:translate-x-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
