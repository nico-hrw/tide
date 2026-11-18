import { describe, it, expect } from 'vitest';
import { snapToPage, resolveSnappedLeft, SNAP_PX } from '../canvasSnap';

describe('snapToPage', () => {
    it('pulls an element near the left edge onto it', () => {
        const r = snapToPage(SNAP_PX - 1, 100, 200, 800);
        expect(r.left).toBe(0);
        expect(r.edges).toContain('left');
    });

    it('pulls an element near the right edge onto it', () => {
        const r = snapToPage(800 - 200 - 5, 100, 200, 800);
        expect(r.left).toBe(600);
        expect(r.edges).toContain('right');
    });

    it('does not snap in the middle', () => {
        const r = snapToPage(300, 120, 200, 800);
        expect(r).toEqual({ left: 300, top: 120, edges: [] });
    });

    it('keeps an element inside the page instead of letting the edge cut it off', () => {
        expect(snapToPage(-80, 50, 200, 800).left).toBe(0);
        expect(snapToPage(900, 50, 200, 800).left).toBe(600);
        expect(snapToPage(300, -40, 200, 800).top).toBe(0);
    });

    it('snaps to the top edge and reports it', () => {
        const r = snapToPage(300, 6, 200, 800);
        expect(r.top).toBe(0);
        expect(r.edges).toEqual(['top']);
    });

    it('pins an element wider than the page to the left', () => {
        const r = snapToPage(40, 100, 900, 800);
        expect(r.left).toBe(0);
        expect(r.edges).toContain('left');
    });
});

describe('resolveSnappedLeft', () => {
    it('follows the right edge when the page gets wider', () => {
        expect(resolveSnappedLeft('right', 600, 200, 1000)).toBe(800);
    });
    it('keeps the stored position without a snap', () => {
        expect(resolveSnappedLeft(undefined, 320, 200, 1000)).toBe(320);
    });
});
