"use client";

import { useState, useRef, useCallback } from 'react';
import { addDays } from 'date-fns';

export interface UseMobileSwipeGesturesOptions {
  calViewMode: 'day' | 'week' | 'agenda' | 'month' | string;
  onNavigate?: (deltaDays: number) => void;
  setActiveDate?: React.Dispatch<React.SetStateAction<Date>>;
}

export function useMobileSwipeGestures({
  calViewMode,
  onNavigate,
  setActiveDate,
}: UseMobileSwipeGesturesOptions) {
  const swipeX0 = useRef(0);
  const swipeY0 = useRef(0);
  // Live drag offset lives in a ref and is written straight to the DOM (rAF-throttled)
  // so touchmove never triggers a React re-render.
  const swipeDxRef = useRef(0);
  const swipeElRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [snapping, setSnapping] = useState<'left' | 'right' | null>(null);
  const isSwipingWeek = useRef(false);
  const eventDragActiveRef = useRef(false);
  const [eventDragActive, setEventDragActive] = useState(false);

  const writeTransform = useCallback((dx: number, animated: boolean) => {
    const el = swipeElRef.current;
    if (!el) return;
    el.style.transition = animated ? 'transform 0.18s ease-out' : 'none';
    el.style.transform = `translateX(${dx * 0.4}px)`;
  }, []);

  const handleEventDragChange = useCallback((active: boolean) => {
    eventDragActiveRef.current = active;
    setEventDragActive(active);
  }, []);

  const onSwipeStart = useCallback((e: React.TouchEvent) => {
    if (snapping || eventDragActiveRef.current) return;
    swipeX0.current = e.touches[0].clientX;
    swipeY0.current = e.touches[0].clientY;
    isSwipingWeek.current = false;
    swipeDxRef.current = 0;
  }, [snapping]);

  const onSwipeMove = useCallback((e: React.TouchEvent) => {
    if (snapping || eventDragActiveRef.current || document.body.hasAttribute('data-ev-drag')) return;
    const dx = e.touches[0].clientX - swipeX0.current;
    const dy = Math.abs(e.touches[0].clientY - swipeY0.current);
    if (dy > 12 && !isSwipingWeek.current) return;
    if (!isSwipingWeek.current && Math.abs(dx) > dy && Math.abs(dx) > 12 && swipeX0.current > 50) {
      isSwipingWeek.current = true;
    }
    if (isSwipingWeek.current) {
      swipeDxRef.current = dx;
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          writeTransform(swipeDxRef.current, false);
        });
      }
    }
  }, [snapping, writeTransform]);

  const onSwipeEnd = useCallback((_e?: React.TouchEvent) => {
    if (snapping) return;
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const swipeDx = swipeDxRef.current;
    swipeDxRef.current = 0;
    if (isSwipingWeek.current && Math.abs(swipeDx) > 45) {
      const dir = swipeDx < 0 ? 'left' : 'right';
      setSnapping(dir);
      setTimeout(() => {
        const delta = calViewMode === 'day' ? (dir === 'left' ? 1 : -1) : (dir === 'left' ? 7 : -7);
        if (onNavigate) {
          onNavigate(delta);
        } else if (setActiveDate) {
          setActiveDate(d => addDays(d, delta));
        }
        setSnapping(null);
      }, 240);
    } else if (swipeDx !== 0) {
      writeTransform(0, true);
    }
    isSwipingWeek.current = false;
  }, [snapping, calViewMode, onNavigate, setActiveDate, writeTransform]);

  return {
    // Kept for API compatibility; live offset is applied imperatively via swipeElRef.
    swipeDx: 0,
    swipeElRef,
    snapping,
    eventDragActive,
    setEventDragActive,
    eventDragActiveRef,
    onEventDragChange: handleEventDragChange,
    onSwipeStart,
    onSwipeMove,
    onSwipeEnd,
  };
}
