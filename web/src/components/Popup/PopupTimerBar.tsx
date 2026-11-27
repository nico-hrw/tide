import type { RefObject } from 'react';

interface PopupTimerBarProps {
    fillRef: RefObject<HTMLDivElement | null>;
    restRef: RefObject<HTMLDivElement | null>;
}

/**
 * The close timer of a popup as a bar along its top edge: two rounded segments side by side that always add up
 * to the full width. The left one is the time left, the right one the time used up; as the mouse moves away the
 * left one gives way to the right one, and back when the mouse returns. Put it inside the popup, which needs
 * `relative`. Driven by usePopupTimer.
 */
export function PopupTimerBar({ fillRef, restRef }: PopupTimerBarProps) {
    return (
        <div className="pointer-events-none absolute inset-x-3 top-1 z-10 flex h-[3px] gap-[3px]" aria-hidden="true">
            <div ref={fillRef} className="min-w-0 rounded-full bg-t2-ink-3" style={{ flex: '1 1 0%' }} />
            <div ref={restRef} className="min-w-0 rounded-full bg-t2-line" style={{ flex: '0 1 0%' }} />
        </div>
    );
}

export default PopupTimerBar;
