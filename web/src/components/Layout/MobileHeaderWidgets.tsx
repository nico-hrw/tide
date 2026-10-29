'use client';

import React from 'react';
import { MobileSmartIsland, type CountdownEvent, type MobileSmartIslandProps } from './MobileSmartIsland';

export { MobileSmartIsland };
export type { CountdownEvent, MobileSmartIslandProps };

const NIGHT_TEMPLATES: readonly string[] = [
  'Gute Nacht{name} – noch wach?', 'Späte Stunde{name}!', 'Schlaf gut{name}!',
  'Noch fleißig unterwegs{name}?', 'Ruhige Nacht{name}!',
];

const MORNING_TEMPLATES: readonly string[] = [
  'Guten Morgen{name}!', 'Frisch in den Tag{name}!', 'Guten Start in den Tag{name}!',
  'Morgenstund hat Gold im Mund{name}!', 'Kaffee bereit{name}?',
];

const MIDDAY_TEMPLATES: readonly string[] = [
  'Mahlzeit{name}!', 'Guten Mittag{name}!', 'Schöne Mittagspause{name}!', 'Halbzeit für heute{name}!',
];

const AFTERNOON_TEMPLATES: readonly string[] = [
  'Guten Tag{name}!', 'Schönen Nachmittag{name}!', 'Weiterhin viel Erfolg{name}!',
  'Energie fürs Nachmittagstief{name}?',
];

const EVENING_TEMPLATES: readonly string[] = [
  'Guten Abend{name}!', 'Feierabend in Sicht{name}!', 'Schönen Ausklang{name}!',
  'Zeit zum Durchatmen{name}!',
];

const GENERAL_TEMPLATES: readonly string[] = [
  'Schön, dich zu sehen{name}!', 'Willkommen zurück{name}!', 'Bereit für den Tag{name}?',
  'Alles im Griff{name}?', 'Hallo{name}!', 'Hi{name}, was steht an?',
  'Dein Tag, dein Tempo{name}!', 'Auf geht\'s{name}!', 'Schön, dass du da bist{name}!',
];

export function pickGreetingTemplate(date: Date): string {
  const h = date.getHours();
  let timePool: readonly string[];

  if (h >= 22 || h < 5) timePool = NIGHT_TEMPLATES;
  else if (h >= 5 && h < 11) timePool = MORNING_TEMPLATES;
  else if (h >= 11 && h < 14) timePool = MIDDAY_TEMPLATES;
  else if (h >= 14 && h < 18) timePool = AFTERNOON_TEMPLATES;
  else timePool = EVENING_TEMPLATES;

  const pool = [...timePool, ...GENERAL_TEMPLATES];
  let last = '';
  if (typeof window !== 'undefined') {
    try {
      last = localStorage.getItem('tide_last_greeting') || '';
    } catch {
      // ignore
    }
  }

  let picked = pool[Math.floor(Math.random() * pool.length)];
  if (picked === last && pool.length > 1) {
    const candidates = pool.filter((t) => t !== last);
    if (candidates.length > 0) {
      picked = candidates[Math.floor(Math.random() * candidates.length)];
    }
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('tide_last_greeting', picked);
    } catch {
      // ignore
    }
  }

  return picked;
}

export function formatGreeting(template: string, name: string): string {
  const trimmed = name?.trim();
  const replacement = trimmed ? `, ${trimmed}` : '';
  return template.split('{name}').join(replacement);
}

export const NextEventCountdown = React.memo(function NextEventCountdown(props: MobileSmartIslandProps) {
  return <MobileSmartIsland {...props} />;
});

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  wobble: number;
  wobbleSpeed: number;
  opacity: number;
  decay: number;
  isCircle: boolean;
}

let activeConfettiCanvas: HTMLCanvasElement | null = null;
let activeConfettiAnimId: number | null = null;

export function fireConfetti(originEl: HTMLElement): void {
  if (typeof window === 'undefined') return;

  if (activeConfettiAnimId !== null) {
    cancelAnimationFrame(activeConfettiAnimId);
    activeConfettiAnimId = null;
  }
  if (activeConfettiCanvas) {
    activeConfettiCanvas.remove();
    activeConfettiCanvas = null;
  }

  const rect = originEl.getBoundingClientRect();
  const startX = rect.left + rect.width / 2;
  const startY = rect.top;

  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '99999';
  canvas.style.willChange = 'transform';
  canvas.style.transform = 'translateZ(0)';
  document.body.appendChild(canvas);
  activeConfettiCanvas = canvas;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    if (activeConfettiCanvas === canvas) activeConfettiCanvas = null;
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  const colors = ['#A855F7', '#EC4899', '#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4'];
  const particles: ConfettiParticle[] = [];
  const particleCount = 38;

  for (let i = 0; i < particleCount; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI * 0.45);
    const speed = Math.random() * 8 + 7;
    particles.push({
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 2,
      vy: Math.sin(angle) * speed,
      size: Math.random() * 6 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.15,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: Math.random() * 0.08 + 0.04,
      opacity: 1,
      decay: 0.016 + Math.random() * 0.008,
      isCircle: Math.random() < 0.2,
    });
  }

  const gravity = 0.22;
  const drag = 0.985;

  const step = () => {
    ctx.clearRect(0, 0, width, height);

    let activeCount = 0;

    for (const p of particles) {
      if (p.opacity <= 0 || p.y > height + 20) {
        continue;
      }

      p.vx *= drag;
      p.vy += gravity;
      p.vy *= drag;

      p.x += p.vx;
      p.y += p.vy;

      p.rotation += p.rotationSpeed;
      p.wobble += p.wobbleSpeed;
      p.opacity -= p.decay;

      if (p.opacity <= 0 || p.y > height + 20) {
        continue;
      }

      activeCount++;

      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.fillStyle = p.color;

      if (p.isCircle) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const w = Math.max(1, p.size * Math.abs(Math.cos(p.wobble)));
        ctx.fillRect(p.x - w / 2, p.y - p.size / 2, w, p.size);
      }
    }

    if (activeCount === 0) {
      if (activeConfettiAnimId !== null) {
        cancelAnimationFrame(activeConfettiAnimId);
        activeConfettiAnimId = null;
      }
      if (activeConfettiCanvas === canvas) {
        activeConfettiCanvas = null;
      }
      canvas.remove();
      return;
    }

    activeConfettiAnimId = requestAnimationFrame(step);
  };

  activeConfettiAnimId = requestAnimationFrame(step);
}
