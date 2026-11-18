'use client';

import React, { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useIslandModel } from './useIslandModel';
import { useIslandText } from './islandText';
import { onActivateKey, useIslandDismiss, useIslandFlip } from './islandMotion';
import IslandBody from './IslandBody';

interface DesktopIslandProps {
    /** Klassen des Platzhalters, der die Größe des Quadrats bestimmt (Seitenleiste: quadratisch, volle Breite) */
    slotClassName: string;
    selectedDate?: Date;
    onSelectDate?: (d: Date) => void;
}

const subscribeNever = () => () => undefined;

interface Rect { left: number; top: number; width: number; height: number }

/** Verfolgt die Bildschirmposition des Platzhalters (Seitenleiste kann sich verschieben/skalieren). */
function useSlotRect(ref: React.RefObject<HTMLElement | null>): Rect | null {
    const [rect, setRect] = useState<Rect | null>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const update = () => {
            const r = el.getBoundingClientRect();
            setRect((p) =>
                p && p.left === r.left && p.top === r.top && p.width === r.width && p.height === r.height
                    ? p
                    : { left: r.left, top: r.top, width: r.width, height: r.height }
            );
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        ro.observe(document.documentElement);
        window.addEventListener('resize', update);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', update);
        };
    }, [ref]);
    return rect;
}

/**
 * Desktop/Tablet: ein Quadrat mit dem Monatsraster. Die Karte wächst daraus nach oben und über die
 * Seitenleisten-Grenze hinaus; sie liegt in einem Portal über allem, die Seitenleiste behält ihre Breite.
 */
export default function DesktopIsland({ slotClassName, selectedDate, onSelectDate }: DesktopIslandProps) {
    const model = useIslandModel('desktop');
    const text = useIslandText();
    const slotRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const rect = useSlotRect(slotRef);
    const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

    useIslandFlip(panelRef, `${model.state}:${model.expanded}`);
    useIslandDismiss(model.expanded, [panelRef], model.close);

    const interactive = model.state !== 'capture';
    const label = text.tr(model.state === 'rest' ? 'monthOverview' : model.state === 'day' ? 'dayOverview' : 'quickCapture');

    return (
        <>
            <div ref={slotRef} className={slotClassName} aria-hidden="true" />
            {mounted && rect &&
                createPortal(
                    <div
                        className="pointer-events-none fixed z-[500]"
                        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
                    >
                        <div
                            ref={panelRef}
                            data-island-state={model.state}
                            role={interactive ? 'button' : 'group'}
                            tabIndex={interactive ? 0 : undefined}
                            aria-label={label}
                            aria-expanded={interactive ? model.expanded : undefined}
                            onClick={interactive ? model.tap : undefined}
                            onKeyDown={interactive ? onActivateKey(model.tap) : undefined}
                            style={{ maxHeight: 'calc(100dvh - 24px)' }}
                            className={`pointer-events-auto absolute bottom-0 left-0 origin-bottom-left overflow-hidden rounded-[18px] bg-t2-surface text-left text-t2-ink shadow-[0_0_0_1px_var(--t2-line),var(--shadow-float)] will-change-transform ${
                                model.expanded ? 'w-[340px] max-w-[calc(100vw-24px)]' : 'h-full w-full'
                            } ${interactive ? 'cursor-pointer' : ''}`}
                        >
                            <IslandBody model={model} text={text} selectedDate={selectedDate} onSelectDate={onSelectDate} />
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}
