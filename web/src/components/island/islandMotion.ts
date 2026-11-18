'use client';

import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

const subscribeNever = () => () => undefined;

/** true erst nach dem Mounten im Browser (für Portale). */
export const useIsClient = (): boolean => useSyncExternalStore(subscribeNever, () => true, () => false);

const EASE = 'cubic-bezier(.32,.72,0,1)';

/**
 * Animiert den Wechsel zwischen Quadrat und Karte (FLIP): die neue Größe wird von der alten aus
 * skaliert, der Inhalt blendet ein. Nur transform und opacity; bei reduzierter Bewegung entfällt es.
 */
export function useIslandFlip(ref: React.RefObject<HTMLElement | null>, key: string) {
    const prev = useRef<{ w: number; h: number; key: string } | null>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const p = prev.current;
        prev.current = { w, h, key };
        if (!p || p.key === key) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (typeof el.animate !== 'function') return;
        if (p.w !== w || p.h !== h) {
            el.animate(
                [{ transform: `scale(${p.w / w},${p.h / h})` }, { transform: 'scale(1,1)' }],
                { duration: 440, easing: EASE }
            );
        }
        Array.from(el.children).forEach((c) =>
            c.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: 440, easing: 'ease-out' })
        );
    });
}

/** Klick außerhalb und Escape schließen die geöffnete Island. */
export function useIslandDismiss(
    active: boolean,
    inside: React.RefObject<HTMLElement | null>[],
    onClose: () => void
) {
    const closeRef = useRef(onClose);
    const insideRef = useRef(inside);
    useEffect(() => {
        closeRef.current = onClose;
        insideRef.current = inside;
    });
    useEffect(() => {
        if (!active) return;
        const onDown = (e: PointerEvent) => {
            const t = e.target as Node | null;
            if (t && insideRef.current.some((r) => r.current?.contains(t))) return;
            closeRef.current();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeRef.current();
        };
        document.addEventListener('pointerdown', onDown, true);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDown, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [active]);
}

/** Aktivierung per Tastatur für Elemente mit role="button". */
export function onActivateKey(handler: () => void) {
    return (e: React.KeyboardEvent) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handler();
        }
    };
}

export interface Rect { left: number; top: number; width: number; height: number }

/**
 * Verfolgt Position und Sichtbarkeit des Platzhalters. "Sichtbar" heißt: nicht per display:none,
 * Deckkraft 0 oder Überlauf (z. B. eingeklappte Seitenleiste) komplett ausgeblendet.
 */
export function useSlotRect(ref: React.RefObject<HTMLElement | null>): (Rect & { visible: boolean }) | null {
    const [state, setState] = useState<(Rect & { visible: boolean }) | null>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        let inView = true;
        const update = () => {
            const r = el.getBoundingClientRect();
            const shown =
                r.width > 0 &&
                inView &&
                (typeof el.checkVisibility !== 'function' || el.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
            setState((p) =>
                p && p.left === r.left && p.top === r.top && p.width === r.width && p.height === r.height && p.visible === shown
                    ? p
                    : { left: r.left, top: r.top, width: r.width, height: r.height, visible: shown }
            );
        };
        const io = new IntersectionObserver((entries) => {
            inView = entries.some((e) => e.isIntersecting);
            update();
        });
        io.observe(el);
        const ro = new ResizeObserver(update);
        ro.observe(el);
        ro.observe(document.documentElement);
        window.addEventListener('resize', update);
        const poll = window.setInterval(update, 500);
        update();
        return () => {
            io.disconnect();
            ro.disconnect();
            window.removeEventListener('resize', update);
            window.clearInterval(poll);
        };
    }, [ref]);
    return state;
}
