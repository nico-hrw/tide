'use client';

import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useIslandModel } from './useIslandModel';
import { useIslandText } from './islandText';
import { onActivateKey, useIsClient, useIslandDismiss, useIslandFlip, useSlotRect, type Rect } from './islandMotion';
import IslandBody from './IslandBody';

interface DesktopIslandProps {
    /** Klassen des Platzhalters, der die Größe des Quadrats bestimmt (Seitenleiste: quadratisch, volle Breite) */
    slotClassName: string;
    selectedDate?: Date;
    onSelectDate?: (d: Date) => void;
}

/**
 * Desktop/Tablet: ein Quadrat mit dem Monatsraster. Die Karte wächst daraus nach oben und über die
 * Seitenleisten-Grenze hinaus; sie liegt in einem Portal über allem, die Seitenleiste behält ihre Breite.
 */
export default function DesktopIsland({ slotClassName, selectedDate, onSelectDate }: DesktopIslandProps) {
    const slotRef = useRef<HTMLDivElement>(null);
    const rect = useSlotRect(slotRef);
    const client = useIsClient();
    // Nur eine sichtbare Island trägt ein Modell: ist der Platzhalter ausgeblendet (Seitenleiste zu,
    // Handy-Breite), wird nichts gemountet, damit sich Warteschlange und Erfassung nicht doppeln.
    const visible = client && rect !== null && rect.visible;
    return (
        <>
            <div ref={slotRef} className={slotClassName} aria-hidden="true" />
            {visible && rect &&
                createPortal(<DesktopPanel rect={rect} selectedDate={selectedDate} onSelectDate={onSelectDate} />, document.body)}
        </>
    );
}

function DesktopPanel({ rect, selectedDate, onSelectDate }: { rect: Rect } & Pick<DesktopIslandProps, 'selectedDate' | 'onSelectDate'>) {
    const model = useIslandModel('desktop');
    const text = useIslandText();
    const panelRef = useRef<HTMLDivElement>(null);

    useIslandFlip(panelRef, `${model.state}:${model.expanded}`);
    useIslandDismiss(model.expanded, [panelRef], model.close);

    const interactive = model.state !== 'capture';
    const label = text.tr(model.state === 'rest' ? 'monthOverview' : model.state === 'day' ? 'dayOverview' : 'quickCapture');

    return (
        <div
            className="pointer-events-none fixed z-[150]"
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
                className={`pointer-events-auto absolute bottom-0 left-0 origin-bottom-left overflow-hidden rounded-[18px] bg-[color-mix(in_srgb,var(--t2-ink)_4%,var(--t2-surface))] text-left text-t2-ink shadow-[0_0_0_1.5px_var(--t2-line),var(--shadow-float)] will-change-transform ${
                    model.expanded ? 'w-[340px] max-w-[calc(100vw-24px)]' : 'h-full w-full'
                } ${interactive ? 'cursor-pointer' : ''}`}
            >
                <IslandBody model={model} text={text} selectedDate={selectedDate} onSelectDate={onSelectDate} />
            </div>
        </div>
    );
}
