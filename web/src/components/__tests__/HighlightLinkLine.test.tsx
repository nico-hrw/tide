import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HighlightProvider, useHighlight } from '../HighlightContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let api: ReturnType<typeof useHighlight> | null = null;
function Probe() {
    api = useHighlight();
    return null;
}

describe('link selection line', () => {
    let container: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
        vi.useFakeTimers();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => root.render(<HighlightProvider><Probe /></HighlightProvider>));
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.useRealTimers();
    });

    it('draws one smooth curve from start to end with a userSpace gradient (no dashes that fight the draw animation)', () => {
        act(() => api!.startLinkSelection(() => undefined, { x: 400, y: 300 }));
        const rect = { left: 40, top: 100, width: 120, height: 28 } as DOMRect;
        act(() => api!.highlight.onLinkSelect!({ id: 'n1', title: 'Note', type: 'file', rect }));

        const path = document.querySelector('svg path');
        expect(path).toBeTruthy();
        const d = path!.getAttribute('d')!;
        // exactly one cubic segment, starting at the click and ending in the middle of the target
        expect(d.match(/C/g)).toHaveLength(1);
        expect(d.startsWith('M 400 290')).toBe(true);
        expect(d.endsWith('100 114')).toBe(true);
        // framer-motion's pathLength animation owns the dash pattern ("<drawn> 1"); the old extra "8 8" fought with it
        expect(path!.getAttribute('stroke-dasharray') ?? '').not.toContain('8 8');
        expect(document.querySelector('linearGradient')!.getAttribute('gradientUnits')).toBe('userSpaceOnUse');
    });
});
