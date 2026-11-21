'use client';

import React, { useRef } from 'react';
import { Bell, Plus } from 'lucide-react';
import { paletteFor } from '@/components/Layout/mobile/eventPalette';
import { useIslandModel, type IslandModel } from './useIslandModel';
import { useIslandText, type IslandText } from './islandText';
import { onActivateKey, useIslandDismiss, useIslandFlip, useSlotRect } from './islandMotion';
import IslandBody from './IslandBody';

const SMALL = 'text-[9.5px] font-bold uppercase leading-none tracking-[0.08em] opacity-80';

/** Quadrat-Inhalt (kompakt): Datum in Ruhe, Minuten beim laufenden, Uhrzeit beim nächsten Termin. */
function SquareFace({ model, text }: { model: IslandModel; text: IslandText }) {
    const wrap = 'flex h-full flex-col items-center justify-center gap-1';
    if (model.state === 'notice') {
        return (
            <div className={wrap}>
                <Bell size={22} strokeWidth={1.8} />
                <small className={SMALL}>{text.tr('noticeBadge', { n: 1 })}</small>
            </div>
        );
    }
    if (model.state === 'capture') {
        return (
            <div className={wrap}>
                <Plus size={24} strokeWidth={1.8} />
            </div>
        );
    }
    if (model.running) {
        const m = model.running.countdown.minutes;
        return (
            <div className="flex h-full flex-col justify-between">
                <span className="block truncate text-[12.5px] font-bold leading-tight">{model.running.event.title || text.tr('untitledEvent')}</span>
                <div className="flex items-baseline gap-1">
                    <b className={`font-bold leading-[0.9] tracking-[-0.05em] ${m >= 100 ? 'text-[34px]' : 'text-[42px]'}`}>{m}</b>
                    <span className="text-[12px] font-semibold">{text.tr('minUnit')}</span>
                </div>
            </div>
        );
    }
    if (model.next) {
        return (
            <div className="flex h-full flex-col justify-between">
                <span className="block truncate text-[12.5px] font-bold leading-tight">{model.next.event.title || text.tr('untitledEvent')}</span>
                <b className="text-[30px] font-bold leading-[0.9] tracking-[-0.05em]">{text.time(model.next.event.start)}</b>
            </div>
        );
    }
    return (
        <div className="flex h-full flex-col justify-between">
            <small className="block text-[11px] font-bold uppercase leading-tight tracking-[0.09em]">{text.weekdayShort(model.now)}</small>
            <div className="flex items-end justify-between">
                <b className="text-[42px] font-bold leading-[0.9] tracking-[-0.05em]">{model.now.getDate()}</b>
                <small className="text-[11px] font-bold uppercase tracking-[0.09em] opacity-55">{text.monthName(model.now).slice(0, 3)}</small>
            </div>
        </div>
    );
}

/**
 * Handy: ein Quadrat in der Farbe des laufenden bzw. nächsten Termins (sonst neutral).
 * Tippen öffnet die Karte, weiteres Tippen wechselt zwischen den Zuständen, außerhalb tippen schließt.
 */
export default function MobileIsland({ className }: { className?: string }) {
    const hostRef = useRef<HTMLDivElement>(null);
    const rect = useSlotRect(hostRef);
    // Bei Desktop-/Tablet-Breite ist das Handy-Layout ausgeblendet: dann kein zweites Modell mounten.
    return (
        <div ref={hostRef} className={`relative h-[92px] w-24 shrink-0 ${className ?? ''}`}>
            {rect?.visible && <MobilePanel />}
        </div>
    );
}

function MobilePanel() {
    const model = useIslandModel('mobile');
    const text = useIslandText();
    const panelRef = useRef<HTMLDivElement>(null);
    const open = model.expanded;

    useIslandFlip(panelRef, `${model.state}:${open}`);
    useIslandDismiss(open, [panelRef], model.close);

    const focus = model.state === 'running' ? model.running?.event : model.state === 'next' ? model.next?.event : null;
    const pal = focus ? paletteFor(focus.color) : null;
    const interactive = model.state !== 'capture';

    const cardWidth = 'w-[min(318px,calc(100vw-28px))]';
    const sizeClass = open
        ? `${cardWidth} ${model.state === 'rest' ? 'h-[250px]' : ''}`
        : 'h-[92px] w-24';

    return (
        <>
            <div
                ref={panelRef}
                data-island-state={model.state}
                role={interactive ? 'button' : 'group'}
                tabIndex={interactive ? 0 : undefined}
                aria-label={text.tr(model.state === 'rest' ? 'monthOverview' : 'dayOverview')}
                aria-expanded={interactive ? open : undefined}
                onClick={interactive ? model.tap : undefined}
                onKeyDown={interactive ? onActivateKey(model.tap) : undefined}
                style={!open && pal ? { background: pal.bg, color: pal.ink } : undefined}
                className={`absolute right-0 top-0 origin-top-right select-none overflow-hidden text-left will-change-transform ${sizeClass} ${
                    open
                        ? 'z-50 rounded-[18px] bg-t2-surface text-t2-ink shadow-[0_0_0_1px_var(--t2-line),var(--shadow-float)]'
                        : `z-[1] rounded-[20px] p-3 ${pal ? '' : 'bg-t2-ink text-t2-bg'} active:scale-[0.98]`
                } ${interactive ? 'cursor-pointer' : ''}`}
            >
                {open ? <IslandBody model={model} text={text} /> : <SquareFace model={model} text={text} />}
            </div>
        </>
    );
}
