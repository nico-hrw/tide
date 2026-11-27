/**
 * Auto-dismiss timer of a toast that waits for slow users: while the mouse heads towards the banner the time is
 * extended (up to a cap), very close to it the timer stands still. A hard upper limit still ends the toast,
 * unless the mouse is right on it.
 */
export interface ToastTimerState {
    /** ms left until dismissal */
    remaining: number;
    /** ms the toast has been visible while the mouse was not right on it */
    life: number;
    /** last distance mouse → banner, null while unknown */
    lastDistance: number | null;
}

export interface ToastTimerConfig {
    duration: number;
    /** Extension cap for `remaining` as a multiple of the duration */
    extendCap: number;
    /** Hard limit of total visible time as a multiple of the duration */
    maxLifeFactor: number;
    /** Distance (px) at which the timer stands still */
    nearPx: number;
    /** Distance (px) in which approaching the banner extends the time */
    reachPx: number;
}

export const defaultToastTimerConfig = (duration: number): ToastTimerConfig => ({
    duration,
    extendCap: 1.75,
    maxLifeFactor: 3.5,
    nearPx: 56,
    reachPx: 360,
});

export const initialToastTimer = (duration: number): ToastTimerState => ({ remaining: duration, life: 0, lastDistance: null });

/** `distance` = px between mouse and banner (0 when over it), or null if the mouse position is unknown (touch). */
export function stepToastTimer(
    s: ToastTimerState,
    dt: number,
    distance: number | null,
    cfg: ToastTimerConfig,
): { state: ToastTimerState; expired: boolean } {
    const near = distance !== null && distance <= cfg.nearPx;
    const approaching = distance !== null && s.lastDistance !== null && distance < s.lastDistance - 0.5 && distance <= cfg.reachPx;

    let { remaining, life } = s;
    if (!near) {
        remaining -= dt;
        life += dt;
        if (approaching) remaining += dt * 3; // net +2 per ms of approach
        remaining = Math.min(remaining, cfg.duration * cfg.extendCap);
    }
    const expired = !near && (remaining <= 0 || life >= cfg.duration * cfg.maxLifeFactor);
    return { state: { remaining, life, lastDistance: distance }, expired };
}

/** 0..1 for the ring: the smaller of the time left and the time left under the hard limit, relative to the duration */
export function toastTimerProgress(s: ToastTimerState, cfg: ToastTimerConfig): number {
    const hardLeft = cfg.duration * cfg.maxLifeFactor - s.life;
    return Math.max(0, Math.min(1, Math.min(s.remaining, hardLeft) / cfg.duration));
}
