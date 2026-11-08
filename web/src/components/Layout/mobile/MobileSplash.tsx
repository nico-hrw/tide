'use client';

import { useEffect, useLayoutEffect } from 'react';

export type IntroPhase = 'hidden' | 'greeting' | 'island' | 'content' | 'done';

const SESSION_KEY = 'tide_splash_done';
const MOBILE_MAX_WIDTH = 768;
const GREETING_START_MS = 250;
const ISLAND_SPIN_MS = 750;
const STAGGER_MS = 130;
const REVEAL_MS = 450;
const MAX_ITEMS = 8;
const H1_WAIT_MS = 2000;

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function setPhase(p: IntroPhase) {
  document.documentElement.dataset.intro = p;
}

function shouldSkipIntro(): boolean {
  if (window.innerWidth >= MOBILE_MAX_WIDTH) return true;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    if (sessionStorage.getItem(SESSION_KEY)) return true;
  } catch {
    return true;
  }
  return false;
}

/** Collect the text nodes of `root` (keeps inner elements such as the confetti span intact). */
function textNodesOf(root: HTMLElement): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode();
  while (n) { out.push(n as Text); n = walker.nextNode(); }
  return out;
}

/**
 * Mobile intro controller (renders nothing, no React state).
 * Drives `html[data-intro]` = hidden -> greeting -> island -> content -> done and
 * typewrites the real header greeting `h1[data-intro-greeting]` via DOM text nodes.
 * CSS lives in globals.css ("MOBILE INTRO" block). Runs once per session, mobile only.
 */
export default function MobileSplash() {
  useIsoLayoutEffect(() => {
    if (shouldSkipIntro()) { setPhase('done'); return; }
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ }
    setPhase('hidden');

    const timers: number[] = [];
    let raf = 0;
    let cancelled = false;
    let h1: HTMLElement | null = null;
    let nodes: Text[] = [];
    let full: string[] = [];

    const restoreText = () => {
      nodes.forEach((n, i) => { n.data = full[i]; });
      if (h1) h1.style.minHeight = '';
    };
    const finish = () => { restoreText(); setPhase('done'); };

    const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };

    const toIsland = () => {
      if (cancelled) return;
      setPhase('island');
      // Reuse MobileSmartIsland's existing sync-spinner listeners.
      window.dispatchEvent(new Event('tide-syncing'));
      later(() => {
        window.dispatchEvent(new Event('tide-synced'));
        setPhase('content');
        later(finish, MAX_ITEMS * STAGGER_MS + REVEAL_MS + 100);
      }, ISLAND_SPIN_MS);
    };

    const startTypewriter = () => {
      if (!h1) { toIsland(); return; }
      setPhase('greeting');
      const total = nodes.reduce((s, n, i) => s + full[i].length, 0);
      let idx = 0;
      const step = () => {
        if (cancelled) return;
        if (idx >= total) { later(toIsland, 250); return; }
        idx++;
        let left = idx;
        nodes.forEach((n, i) => {
          const take = Math.max(0, Math.min(full[i].length, left));
          left -= take;
          const next = full[i].slice(0, take);
          if (n.data !== next) n.data = next;
        });
        later(step, 35 + Math.random() * 35);
      };
      later(step, GREETING_START_MS);
    };

    const t0 = performance.now();
    const waitForH1 = () => {
      if (cancelled) return;
      h1 = document.querySelector<HTMLElement>('h1[data-intro-greeting]');
      if (h1 && h1.textContent) {
        h1.style.minHeight = `${h1.offsetHeight}px`;
        nodes = textNodesOf(h1);
        full = nodes.map(n => n.data);
        nodes.forEach(n => { n.data = ''; });
        startTypewriter();
      } else if (performance.now() - t0 > H1_WAIT_MS) {
        h1 = null;
        toIsland();
      } else {
        raf = requestAnimationFrame(waitForH1);
      }
    };
    waitForH1();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      timers.forEach(t => window.clearTimeout(t));
      finish();
    };
  }, []);

  return null;
}
