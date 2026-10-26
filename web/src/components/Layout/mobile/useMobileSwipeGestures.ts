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
  const [swipeDx, setSwipeDx] = useState(0);
  const [snapping, setSnapping] = useState<'left' | 'right' | null>(null);
  const isSwipingWeek = useRef(false);
  const eventDragActiveRef = useRef(false);
  const [eventDragActive, setEventDragActive] = useState(false);

  const handleEventDragChange = useCallback((active: boolean) => {
    eventDragActiveRef.current = active;
    setEventDragActive(active);
  }, []);

  const onSwipeStart = useCallback((e: React.TouchEvent) => {
    if (snapping || eventDragActiveRef.current) return;
    swipeX0.current = e.touches[0].clientX;
    swipeY0.current = e.touches[0].clientY;
    isSwipingWeek.current = false;
    setSwipeDx(0);
  }, [snapping]);

  const onSwipeMove = useCallback((e: React.TouchEvent) => {
    if (snapping || eventDragActiveRef.current || document.body.hasAttribute('data-ev-drag')) return;
    const dx = e.touches[0].clientX - swipeX0.current;
    const dy = Math.abs(e.touches[0].clientY - swipeY0.current);
    if (dy > 12 && !isSwipingWeek.current) return;
    if (!isSwipingWeek.current && Math.abs(dx) > dy && Math.abs(dx) > 12 && swipeX0.current > 50) {
      isSwipingWeek.current = true;
    }
    if (isSwipingWeek.current) setSwipeDx(dx);
  }, [snapping]);

  const onSwipeEnd = useCallback((_e?: React.TouchEvent) => {
    if (snapping) return;
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
        setSwipeDx(0);
      }, 240);
    } else {
      setSwipeDx(0);
    }
    isSwipingWeek.current = false;
  }, [snapping, swipeDx, calViewMode, onNavigate, setActiveDate]);

  return {
    swipeDx,
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
