/**
 * Position based close timer of a popup (menus, event and note popups). The time left runs down while the
 * mouse is away from the popup, is refilled while it is close, and grows while it heads back towards the popup.
 * Same idea as the toast timer (toastTimer.ts), but a popup never has a hard upper limit: it stays as long as
 * the mouse stays near. Pure functions; the hook (usePopupTimer) feeds them the distance each frame.
 */
export interface PopupTimerConfig {
    /** ms from "mouse far away" until the popup closes */
    duration: number;
    /** Distance (px) up to which the mouse counts as "at the popup": the timer refills */
    nearPx: number;
    /** Distance (px) in which moving towards the popup wins time back */
    reachPx: number;
    /** Refill speed near the popup, in ms of time per ms passed */
    refillPerMs: number;
}

export const defaultPopupTimerConfig = (duration = 2200): PopupTimerConfig => ({
    duration,
    nearPx: 48,
    reachPx: 320,
    refillPerMs: 3,
});

export interface PopupTimerState {
    /** ms left until the popup closes */
    remaining: number;
    /** last distance mouse -> popup, null while unknown */
    lastDistance: number | null;
}

export const initialPopupTimer = (duration: number): PopupTimerState => ({ remaining: duration, lastDistance: null });

/**
 * `distance` = px between mouse and popup (0 over it), or null if unknown (touch): then the popup never expires.
 * `hold` keeps it open and full (e.g. while a text field inside has focus).
 */
export function stepPopupTimer(
    s: PopupTimerState,
    dt: number,
    distance: number | null,
    cfg: PopupTimerConfig,
    hold = false,
): { state: PopupTimerState; expired: boolean } {
    if (hold || distance === null) {
        return { state: { remaining: cfg.duration, lastDistance: distance }, expired: false };
    }
    let remaining = s.remaining;
    if (distance <= cfg.nearPx) {
        remaining = Math.min(cfg.duration, remaining + dt * cfg.refillPerMs);
    } else {
        remaining -= dt;
        const approaching = s.lastDistance !== null && distance < s.lastDistance - 0.5 && distance <= cfg.reachPx;
        if (approaching) remaining += dt * 3; // net +2 per ms of approach
        remaining = Math.min(remaining, cfg.duration);
    }
    return { state: { remaining, lastDistance: distance }, expired: remaining <= 0 };
}

/** 0..1: how much of the time is left (1 = full). */
export function popupTimerProgress(s: PopupTimerState, cfg: PopupTimerConfig): number {
    return Math.max(0, Math.min(1, s.remaining / cfg.duration));
}
