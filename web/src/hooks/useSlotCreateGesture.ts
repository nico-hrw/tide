import { useEffect, useRef, type RefObject } from 'react';

/**
 * Touch gesture "create an event on an empty spot": double tap or long press (about 450 ms, without
 * movement) on an empty calendar cell. Mouse and pen are ignored on purpose (they keep click and drag).
 *
 * The gesture is listener-only: it never calls preventDefault on pointer events and never changes
 * touch-action, so scrolling and swipes stay with the browser (and with useCalendarTouch). Any movement
 * above the slop, a scroll, a second finger or pointercancel aborts it.
 */

export const LONG_PRESS_MS = 450;
/** Visual hint ("pressing") appears a little before the long press fires. */
export const PRESS_HINT_MS = 160;
export const MOVE_SLOP_PX = 10;
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_DIST_PX = 30;
/** A tap is shorter than this; anything longer is a (cancelled) hold. */
export const TAP_MAX_MS = 350;
/** A touch right after scrolling stops momentum scroll; it is not a tap. */
export const SCROLL_QUIET_MS = 120;
export const CLICK_SWALLOW_MS = 600;
export const SLOT_STEP_MIN = 15;
export const SLOT_DEFAULT_MIN = 60;

export type SlotVia = 'double-tap' | 'long-press';

export interface SlotHit {
    start: Date;
    end: Date;
    /** Element that receives the press highlight; it should be a positioned element. */
    feedbackEl?: HTMLElement | null;
    /** Highlight band inside feedbackEl in px (default: the whole element). */
    feedbackTop?: number;
    feedbackHeight?: number;
}

export interface SlotGestureOptions {
    /** Maps a touch point to a slot, or null when the point is not a creatable empty spot. */
    resolve: (target: EventTarget | null, clientX: number, clientY: number) => SlotHit | null;
    onCreate: (hit: SlotHit, via: SlotVia) => void;
    /** Extra selector of elements the gesture must leave alone (on top of the built-in list). */
    ignoreSelector?: string;
    now?: () => number;
}

const BASE_IGNORE =
    'button, a, input, textarea, select, [contenteditable="true"], [role="button"], [role="dialog"], ' +
    '[data-event-id], .event-item, #active-event-popover, .popover, .modal, [data-slot-ignore]';

export const prefersReducedMotion = (): boolean =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Rounds a minute-of-day down to the slot grid. */
export function floorToSlot(minutes: number, step: number = SLOT_STEP_MIN): number {
    return Math.floor(Math.max(0, minutes) / step) * step;
}

/** Start/end of a default-length slot on `day` at `minutes` (clamped so the slot ends by midnight). */
export function slotForMinutes(day: Date, minutes: number, durationMin: number = SLOT_DEFAULT_MIN): { start: Date; end: Date } {
    const startMin = Math.min(floorToSlot(minutes), 1440 - SLOT_STEP_MIN);
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(startMin / 60), startMin % 60, 0, 0);
    const endMin = Math.min(startMin + durationMin, 1440);
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, endMin, 0, 0);
    return { start, end };
}

/** Parses "yyyy-MM-dd" as a LOCAL date (new Date('yyyy-MM-dd') would be UTC midnight). */
export function parseLocalDay(s: string | null | undefined): Date | null {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

function showHint(hit: SlotHit): HTMLElement | null {
    const host = hit.feedbackEl;
    if (!host) return null;
    const el = document.createElement('div');
    el.setAttribute('data-slot-press', '1');
    el.setAttribute('aria-hidden', 'true');
    const top = hit.feedbackTop ?? 0;
    el.style.cssText =
        `position:absolute;left:2px;right:2px;top:${top}px;` +
        (hit.feedbackHeight !== undefined ? `height:${hit.feedbackHeight}px;` : 'bottom:0;') +
        'pointer-events:none;z-index:60;border-radius:8px;' +
        'background:color-mix(in srgb, var(--t2-accent, currentColor) 18%, transparent);' +
        'border:1.5px solid color-mix(in srgb, var(--t2-accent, currentColor) 55%, transparent);';
    if (!prefersReducedMotion()) {
        el.style.opacity = '0';
        el.style.transition = 'opacity 120ms ease-out';
        requestAnimationFrame(() => { el.style.opacity = '1'; });
    }
    host.appendChild(el);
    return el;
}

/** Wires the gesture to `container`; returns the detach function. Exported for tests. */
export function attachSlotGesture(container: HTMLElement, getOptions: () => SlotGestureOptions | null): () => void {
    interface Press { id: number; x: number; y: number; t: number; hit: SlotHit | null; moved: boolean; fired: boolean }
    let press: Press | null = null;
    let lastTap: { x: number; y: number; t: number } | null = null;
    let longTimer: ReturnType<typeof setTimeout> | null = null;
    let hintTimer: ReturnType<typeof setTimeout> | null = null;
    let hintEl: HTMLElement | null = null;
    let lastScrollAt = -Infinity;
    let swallowOff: (() => void) | null = null;

    const clock = () => (getOptions()?.now ?? Date.now)();

    const clearTimers = () => {
        if (longTimer) clearTimeout(longTimer);
        if (hintTimer) clearTimeout(hintTimer);
        longTimer = null;
        hintTimer = null;
    };
    const hideHint = () => {
        hintEl?.remove();
        hintEl = null;
    };
    const abort = () => {
        clearTimers();
        hideHint();
        if (press) press.moved = true;
    };

    /** The click that follows the creating touch must not also open a day or select a cell. */
    const swallowNextClick = () => {
        swallowOff?.();
        const handler = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); off(); };
        const timer = setTimeout(() => off(), CLICK_SWALLOW_MS);
        const off = () => {
            clearTimeout(timer);
            window.removeEventListener('click', handler, true);
            if (swallowOff === off) swallowOff = null;
        };
        window.addEventListener('click', handler, true);
        swallowOff = off;
    };

    const fire = (hit: SlotHit, via: SlotVia) => {
        getOptions()?.onCreate(hit, via);
    };

    const onDown = (e: PointerEvent) => {
        const opts = getOptions();
        if (!opts || e.pointerType !== 'touch') return;
        if (press) { abort(); lastTap = null; press = null; return; } // second finger: not ours
        if (clock() - lastScrollAt < SCROLL_QUIET_MS) { lastTap = null; return; }
        const target = e.target as Element | null;
        if (target?.closest?.(opts.ignoreSelector ? `${BASE_IGNORE}, ${opts.ignoreSelector}` : BASE_IGNORE)) { lastTap = null; return; }
        const hit = opts.resolve(e.target, e.clientX, e.clientY);
        if (!hit) { lastTap = null; return; }

        press = { id: e.pointerId, x: e.clientX, y: e.clientY, t: clock(), hit, moved: false, fired: false };
        clearTimers();
        hintTimer = setTimeout(() => { if (press && !press.moved) hintEl = showHint(hit); }, PRESS_HINT_MS);
        longTimer = setTimeout(() => {
            if (!press || press.moved || press.fired) return;
            press.fired = true;
            clearTimers();
            hideHint();
            try { navigator.vibrate?.(30); } catch { /* not supported */ }
            lastTap = null;
            fire(hit, 'long-press');
        }, LONG_PRESS_MS);
    };

    const onMove = (e: PointerEvent) => {
        if (!press || e.pointerId !== press.id || press.moved || press.fired) return;
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_SLOP_PX) abort();
    };

    const onUp = (e: PointerEvent) => {
        if (!press || e.pointerId !== press.id) return;
        const p = press;
        press = null;
        clearTimers();
        hideHint();
        if (p.fired) { swallowNextClick(); return; }
        const now = clock();
        const isTap = !p.moved && now - p.t <= TAP_MAX_MS;
        if (!isTap) { lastTap = null; return; }
        const prev = lastTap;
        if (prev && now - prev.t <= DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) <= DOUBLE_TAP_DIST_PX) {
            lastTap = null;
            const hit = getOptions()?.resolve(e.target, e.clientX, e.clientY) ?? p.hit;
            if (hit) {
                swallowNextClick();
                fire(hit, 'double-tap');
            }
            return;
        }
        lastTap = { x: e.clientX, y: e.clientY, t: now };
    };

    const onCancel = (e: PointerEvent) => {
        if (press && e.pointerId !== press.id) return;
        abort();
        press = null;
        lastTap = null;
    };

    const onScroll = () => {
        lastScrollAt = clock();
        if (press) abort();
        lastTap = null;
    };

    // Android fires a context menu on long press; while a press is armed it would swallow the gesture.
    const onContextMenu = (e: Event) => {
        if (press && !press.moved) e.preventDefault();
    };

    container.addEventListener('pointerdown', onDown as EventListener, true);
    container.addEventListener('pointermove', onMove as EventListener, true);
    container.addEventListener('pointerup', onUp as EventListener, true);
    container.addEventListener('pointercancel', onCancel as EventListener, true);
    container.addEventListener('contextmenu', onContextMenu, true);
    container.addEventListener('scroll', onScroll, true);

    return () => {
        clearTimers();
        hideHint();
        swallowOff?.();
        container.removeEventListener('pointerdown', onDown as EventListener, true);
        container.removeEventListener('pointermove', onMove as EventListener, true);
        container.removeEventListener('pointerup', onUp as EventListener, true);
        container.removeEventListener('pointercancel', onCancel as EventListener, true);
        container.removeEventListener('contextmenu', onContextMenu, true);
        container.removeEventListener('scroll', onScroll, true);
    };
}

/**
 * React binding: attaches the gesture to the element in `containerRef` while `enabled`.
 * `options` may change on every render (kept in a ref).
 */
export function useSlotCreateGesture(
    containerRef: RefObject<HTMLElement | null>,
    options: SlotGestureOptions,
    enabled: boolean = true,
    deps: ReadonlyArray<unknown> = [],
): void {
    const optsRef = useRef(options);
    optsRef.current = options;
    useEffect(() => {
        const el = containerRef.current;
        if (!enabled || !el) return;
        return attachSlotGesture(el, () => optsRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [containerRef, enabled, ...deps]);
}
