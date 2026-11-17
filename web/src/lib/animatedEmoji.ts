'use client';

import { useSyncExternalStore } from 'react';

/**
 * Animierte Emojis aus dem Fluent-Emoji-Set von Microsoft (MIT).
 * Statisch: fluentui-emoji (Color-SVG). Animiert: fluentui-emoji-animated (APNG).
 * Der Index (glyph → Dateipfade) liegt unter /emoji/index.json.
 */

export interface EmojiIndexEntry {
  /** Name im Fluent-Set, z. B. "Thumbs up" */
  n: string;
  /** Pfad der animierten Datei im Repo fluentui-emoji-animated */
  a?: string;
  /** Pfad der statischen Datei im Repo fluentui-emoji */
  s?: string;
}
export type EmojiIndex = Record<string, EmojiIndexEntry>;

const SETTING_KEY = 'tide_animated_emoji';
const CHANGE_EVENT = 'tide-animated-emoji-change';
const ANIMATED_BASE = 'https://media.githubusercontent.com/media/microsoft/fluentui-emoji-animated/main/';
const STATIC_BASE = 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/';
/** Wie lange eine Animation läuft, bevor wieder das statische Bild gezeigt wird. */
const PLAY_MS = 3000;
/** Alle wie viele Millisekunden jede Emoji-Animation von selbst abspielt. */
const EVERY_MS = 20000;

/** Erkennt Emoji-Sequenzen (inkl. Hautfarbe, ZWJ-Kombinationen, Variation Selector). */
export const EMOJI_PATTERN = '\\p{Extended_Pictographic}(?:\\uFE0F|\\u20E3|\\p{Emoji_Modifier}|\\u200D\\p{Extended_Pictographic}\\uFE0F?)*';

export function getAnimatedEmojiEnabled(): boolean {
  try {
    return localStorage.getItem(SETTING_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setAnimatedEmojiEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SETTING_KEY, enabled ? 'true' : 'false');
  } catch {
    /* privater Modus: nur für diese Sitzung */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribeSetting(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function subscribeEmojiSettings(cb: () => void): () => void {
  return subscribeSetting(cb);
}

/** Einstellung als React-Wert, aktualisiert sich über alle Stellen der App. */
export function useAnimatedEmojiEnabled(): boolean {
  return useSyncExternalStore(subscribeSetting, getAnimatedEmojiEnabled, () => true);
}

let indexPromise: Promise<EmojiIndex> | null = null;
let indexCache: EmojiIndex | null = null;

export function loadEmojiIndex(): Promise<EmojiIndex> {
  if (!indexPromise) {
    indexPromise = fetch('/emoji/index.json')
      .then((r) => (r.ok ? (r.json() as Promise<EmojiIndex>) : ({} as EmojiIndex)))
      .catch(() => ({} as EmojiIndex))
      .then((idx) => {
        indexCache = idx;
        return idx;
      });
  }
  return indexPromise;
}

const stripVs = (s: string) => s.replace(/️/g, '');

export function lookupEmoji(glyph: string): EmojiIndexEntry | undefined {
  if (!indexCache) return undefined;
  return indexCache[glyph] ?? indexCache[stripVs(glyph)];
}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');
const staticUrl = (e: EmojiIndexEntry) => (e.s ? STATIC_BASE + encodePath(e.s) : '');
const animatedUrl = (e: EmojiIndexEntry) => (e.a ? ANIMATED_BASE + encodePath(e.a) : '');

/**
 * Baut das DOM-Element für ein Emoji. Ohne Index-Eintrag oder bei deaktivierter
 * Einstellung bleibt es das Textzeichen. Sonst ein Bild, das bei Hover und alle
 * 20 Sekunden kurz die Animation zeigt.
 */
export function createAnimatedEmojiElement(glyph: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'tide-emoji';
  span.textContent = glyph;

  const entry = lookupEmoji(glyph);
  if (!entry || !entry.s || !getAnimatedEmojiEnabled()) return span;

  const img = document.createElement('img');
  img.className = 'tide-emoji-img';
  img.alt = glyph;
  img.draggable = false;
  img.decoding = 'async';
  img.src = staticUrl(entry);
  span.textContent = '';
  span.appendChild(img);

  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  let restore: number | undefined;
  const play = () => {
    if (reduceMotion || !entry.a) return;
    img.src = animatedUrl(entry);
    window.clearTimeout(restore);
    restore = window.setTimeout(() => { img.src = staticUrl(entry); }, PLAY_MS);
  };

  span.addEventListener('mouseenter', play);
  const timer = window.setInterval(() => {
    if (!span.isConnected) {
      window.clearInterval(timer);
      window.clearTimeout(restore);
      return;
    }
    play();
  }, EVERY_MS);

  return span;
}
