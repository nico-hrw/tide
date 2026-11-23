import { format } from 'date-fns';
import { moveRange, pxToMin, type Range } from './quickEditMath';
import { DAY_PX_PER_MIN } from './timelineMath';

/**
 * Moves one event card inside the open day list: the card follows the finger, everything else is faded
 * and inert, a small badge shows the resulting time. All visuals are written straight to the DOM (no React
 * state), so dragging stays smooth. Nothing is saved here: `onCommit` gets the final range on release.
 */

/** Press feedback while a finger rests on a card: a light lift first, a stronger one when the drag is armed. */
export const PRESS_STYLE = {
  light: { transform: 'scale(1.015)', boxShadow: '0 6px 16px -8px rgba(0,0,0,0.30)' },
  armed: { transform: 'scale(1.04)', boxShadow: '0 16px 30px -10px rgba(0,0,0,0.45)' },
} as const;

const SCROLL_ZONE = 70;
const CARD_SEL = '[id^="ev-"]';

export function setPressLevel(card: HTMLElement | null, level: 'none' | 'light' | 'armed'): void {
  if (!card) return;
  card.style.transition = 'transform 0.16s cubic-bezier(0.2,0.8,0.2,1), box-shadow 0.16s ease';
  if (level === 'none') {
    card.style.transform = '';
    card.style.boxShadow = '';
    return;
  }
  card.style.transform = PRESS_STYLE[level].transform;
  card.style.boxShadow = PRESS_STYLE[level].boxShadow;
}

function findTouch(list: TouchList, id: number): Touch | null {
  for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
  return null;
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'auto' || oy === 'scroll') return p;
  }
  return null;
}

export interface InlineDragOptions {
  root: HTMLElement;
  card: HTMLElement;
  touchId: number;
  startY: number;
  origin: Range;
  dayStartMs: number;
  /** Final range after release (not called when the card ended where it started, or on cancel). */
  onCommit: (range: Range) => void;
  /** Always called once when the drag is over. */
  onEnd: () => void;
}

/** Starts the drag; returns a cleanup that ends it without committing. */
export function startInlineDrag(o: InlineDragOptions): () => void {
  const { root, card, origin, dayStartMs } = o;
  const scroller = scrollParent(card);
  const startScroll = scroller?.scrollTop ?? 0;
  const others = Array.from(root.querySelectorAll<HTMLElement>(CARD_SEL)).filter(el => el !== card);
  const saved = others.map(el => ({ el, opacity: el.style.opacity, pe: el.style.pointerEvents, tr: el.style.transition }));
  const cardPos = getComputedStyle(card).position;

  // Everything else steps back and cannot be grabbed while one card is in the hand.
  saved.forEach(({ el }) => {
    el.style.transition = 'opacity 0.16s ease';
    el.style.opacity = '0.28';
    el.style.pointerEvents = 'none';
  });
  if (cardPos === 'static') card.style.position = 'relative';
  card.style.zIndex = '600';
  card.style.willChange = 'transform';
  card.style.touchAction = 'none';
  document.body.setAttribute('data-ev-drag', '1');

  const badge = document.createElement('div');
  badge.setAttribute('data-inline-drag-badge', '1');
  Object.assign(badge.style, {
    position: 'fixed', zIndex: '1400', pointerEvents: 'none', whiteSpace: 'nowrap',
    fontSize: '12px', fontWeight: '700', padding: '3px 9px', borderRadius: '10px',
    background: 'var(--t2-ink)', color: 'var(--t2-surface)', boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
  } as CSSStyleDeclaration);
  document.body.appendChild(badge);

  let lastY = o.startY;
  let frame = 0;
  let autoFrame = 0;
  let current: Range = { ...origin };
  let dy = 0;

  const label = (r: Range) => {
    const e = new Date(r.end);
    const endsNextDay = r.end - dayStartMs > 24 * 3_600_000;
    return `${format(new Date(r.start), 'HH:mm')} – ${endsNextDay ? '24:00+' : format(e, 'HH:mm')}`;
  };

  const apply = () => {
    frame = 0;
    dy = lastY - o.startY + ((scroller?.scrollTop ?? 0) - startScroll);
    current = moveRange(origin, pxToMin(dy, 60 * DAY_PX_PER_MIN), dayStartMs);
    card.style.transition = 'box-shadow 0.16s ease';
    card.style.transform = `translateY(${dy}px) scale(1.04)`;
    card.style.boxShadow = PRESS_STYLE.armed.boxShadow;
    const r = card.getBoundingClientRect();
    badge.textContent = label(current);
    badge.style.left = `${Math.max(8, Math.min(window.innerWidth - 120, r.right - 110))}px`;
    badge.style.top = `${Math.max(8, r.top - 30)}px`;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };

  const autoScroll = () => {
    autoFrame = 0;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    if (rect.height <= 0) return;
    const fromTop = lastY - rect.top;
    const fromBottom = rect.bottom - lastY;
    let step = 0;
    if (fromTop < SCROLL_ZONE) step = -Math.max(2, (SCROLL_ZONE - fromTop) / 6);
    else if (fromBottom < SCROLL_ZONE) step = Math.max(2, (SCROLL_ZONE - fromBottom) / 6);
    if (step === 0) return;
    const before = scroller.scrollTop;
    scroller.scrollTop = before + step;
    if (scroller.scrollTop !== before) schedule();
    autoFrame = requestAnimationFrame(autoScroll);
  };

  const onMove = (evt: TouchEvent) => {
    const t = findTouch(evt.touches, o.touchId);
    if (!t) return;
    // Own the gesture: no scrolling, and no day swipe in the handlers above us.
    evt.preventDefault();
    evt.stopPropagation();
    lastY = t.clientY;
    schedule();
    if (!autoFrame) autoFrame = requestAnimationFrame(autoScroll);
  };

  let done = false;
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    if (frame) cancelAnimationFrame(frame);
    if (autoFrame) cancelAnimationFrame(autoFrame);
    document.removeEventListener('touchmove', onMove, { capture: true });
    document.removeEventListener('touchend', onEnd, { capture: true });
    document.removeEventListener('touchcancel', onEnd, { capture: true });
    document.body.removeAttribute('data-ev-drag');
    badge.remove();
    saved.forEach(({ el, opacity, pe, tr }) => { el.style.opacity = opacity; el.style.pointerEvents = pe; el.style.transition = tr; });
    // Back to rest; if the time changed the list re-lays out and the card appears at its new place.
    card.style.transition = 'transform 0.16s cubic-bezier(0.2,0.8,0.2,1), box-shadow 0.16s ease';
    card.style.transform = '';
    card.style.boxShadow = '';
    card.style.zIndex = '';
    card.style.willChange = '';
    card.style.touchAction = '';
    if (cardPos === 'static') card.style.position = '';
    if (commit && (current.start !== origin.start || current.end !== origin.end)) o.onCommit(current);
    o.onEnd();
    // iOS: preventDefault() during the drag can freeze UIScrollView. Jiggling scrollTop re-enables it.
    if (scroller) { const st = scroller.scrollTop; scroller.scrollTop = st + 1; scroller.scrollTop = st; }
  };

  function onEnd(evt: TouchEvent) {
    if (!findTouch(evt.changedTouches, o.touchId)) return;
    if (frame) { cancelAnimationFrame(frame); apply(); }
    finish(evt.type !== 'touchcancel');
  }

  document.addEventListener('touchmove', onMove, { passive: false, capture: true });
  document.addEventListener('touchend', onEnd, { capture: true });
  document.addEventListener('touchcancel', onEnd, { capture: true });
  apply();
  return () => finish(false);
}
