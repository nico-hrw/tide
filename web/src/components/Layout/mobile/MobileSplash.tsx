'use client';

import React, { useEffect, useLayoutEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Caveat } from 'next/font/google';
import { DT } from '@/lib/designTokens';
import { pickGreetingTemplate, formatGreeting } from '../MobileHeaderWidgets';

const handwriting = Caveat({ subsets: ['latin'], weight: ['600'], display: 'swap' });

export type SplashPhase = 'white' | 'greeting' | 'island' | 'content' | 'done';

const ORDER: readonly SplashPhase[] = ['white', 'greeting', 'island', 'content', 'done'];
const SESSION_KEY = 'tide_splash_done';
const MOBILE_MAX_WIDTH = 768;

/** Duration (ms) each phase lasts before advancing to the next one. */
const PHASE_MS: Record<Exclude<SplashPhase, 'done'>, number> = {
  white: 450,
  greeting: 2600,
  island: 650,
  content: 1000,
};

export const SPLASH_WRITE_SECONDS = 1.9;

/** True when `current` has reached (or passed) `target`. */
export function phaseAtLeast(current: SplashPhase, target: SplashPhase): boolean {
  return ORDER.indexOf(current) >= ORDER.indexOf(target);
}

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function shouldSkipSplash(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.innerWidth >= MOBILE_MAX_WIDTH) return true;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    if (sessionStorage.getItem(SESSION_KEY)) return true;
  } catch {
    return true;
  }
  return false;
}

/**
 * Splash phase controller. Runs once per session on mobile viewports only,
 * and is skipped for prefers-reduced-motion. Returns 'done' when inactive.
 */
export function useSplashPhase(): SplashPhase {
  const [phase, setPhase] = useState<SplashPhase>('done');

  useIsoLayoutEffect(() => {
    if (shouldSkipSplash()) return;
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ }
    setPhase('white');
  }, []);

  useEffect(() => {
    if (phase === 'done') return;
    const t = window.setTimeout(() => {
      setPhase(ORDER[ORDER.indexOf(phase) + 1]);
    }, PHASE_MS[phase]);
    return () => window.clearTimeout(t);
  }, [phase]);

  return phase;
}

interface MobileSplashProps {
  phase: SplashPhase;
  name: string;
}

/** Full-screen white overlay with a handwritten-style greeting (left-to-right reveal). */
export default function MobileSplash({ phase, name }: MobileSplashProps) {
  const [template] = useState(() => pickGreetingTemplate(new Date()));
  const text = formatGreeting(template, name);
  const visible = phase === 'white' || phase === 'greeting';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="tide-splash"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35, ease: 'easeOut' } }}
          className="fixed inset-0 flex items-center justify-center px-8 md:hidden"
          style={{ zIndex: 9999, background: '#ffffff', pointerEvents: 'all' }}
          aria-hidden="true"
        >
          {phase === 'greeting' && (
            <div style={{ position: 'relative', textAlign: 'center' }}>
              {/* Pen-stroke wipe: the text is revealed by a mask sliding away to the right */}
              <p
                className={handwriting.className}
                style={{
                  fontSize: 'clamp(2rem, 11vw, 3rem)',
                  lineHeight: 1.15,
                  color: '#111827',
                  fontFamily: `${handwriting.style.fontFamily}, ${DT.fontSans}`,
                  margin: 0,
                }}
              >
                {text}
              </p>
              <motion.div
                initial={{ x: '0%' }}
                animate={{ x: '101%' }}
                transition={{ duration: SPLASH_WRITE_SECONDS, ease: [0.45, 0.05, 0.35, 1] }}
                style={{
                  position: 'absolute',
                  inset: '-8px -12px',
                  background: '#ffffff',
                  boxShadow: '-14px 0 14px 0 #ffffff',
                  willChange: 'transform',
                }}
              />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
