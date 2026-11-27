/**
 * Last known mouse position, shared by everything that reacts to the pointer's distance (toasts, popups).
 * Stays null on touch devices (no mouse), so nothing there ever expires because of "the mouse is far away".
 */
let mousePos: { x: number; y: number } | null = null;
let listening = false;

/** Starts listening once; safe to call from every effect. */
export function trackMouse(): void {
    if (listening || typeof window === 'undefined') return;
    listening = true;
    const set = (e: MouseEvent) => { mousePos = { x: e.clientX, y: e.clientY }; };
    // mousedown / contextmenu: a menu opens at the click, before any mousemove has been seen
    // Capture phase: elements that stop mousemove from bubbling (calendar drag handling) must not freeze the position.
    window.addEventListener('mousemove', set, { passive: true, capture: true });
    window.addEventListener('pointermove', set, { passive: true, capture: true });
    window.addEventListener('mousedown', set, { passive: true, capture: true });
    window.addEventListener('contextmenu', set, { passive: true, capture: true });
}

export function getMousePos(): { x: number; y: number } | null {
    return mousePos;
}

// Listen from the start: a popup opened by a click must already know where the mouse is. Starting the listener
// only when the first popup mounts misses that click (mousedown happened before), so its timer did not run until
// a right click.
trackMouse();

/** px between a point and a rectangle (0 inside it). */
export function distanceToRect(p: { x: number; y: number }, r: { left: number; right: number; top: number; bottom: number }): number {
    const dx = Math.max(r.left - p.x, 0, p.x - r.right);
    const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
    return Math.hypot(dx, dy);
}
