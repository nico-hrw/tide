import { Node } from '@tiptap/core';

/** One DIN A4 page on screen: 297 mm at 96 dpi, and the 25 mm top/bottom margin of the sheet (see .a4-sheet). */
export const A4_PAGE_PX = 1123;
export const A4_MARGIN_PX = 96;
/** Height of the break in a free layout (no page edges): a visible gap with a dashed rule. */
const FREE_GAP_PX = 72;

/**
 * Page break. Free layout: a gap with a dashed rule. A4 layout: the break fills the rest of the current
 * page, so the next block starts at the top of the next page, like a page break in Word. The height is
 * recalculated whenever the content above or the layout changes, so the text after it stays on its page.
 */
export const PageBreakNode = Node.create({
    name: 'pageBreak',
    group: 'block',
    atom: true,
    selectable: true,
    draggable: false,

    parseHTML() {
        return [{ tag: 'div[data-page-break]' }];
    },

    renderHTML() {
        return ['div', { 'data-page-break': '' }];
    },

    addNodeView() {
        return ({ editor }) => {
            const dom = document.createElement('div');
            dom.className = 'tide-page-break';
            dom.setAttribute('contenteditable', 'false');
            const label = document.createElement('span');
            label.className = 'tide-page-break__label';
            label.textContent = 'Seitenumbruch';
            dom.appendChild(label);

            let observer: ResizeObserver | null = null;
            let frame = 0;

            const sheetOf = (): HTMLElement | null => dom.closest<HTMLElement>('.a4-sheet');

            const recalc = () => {
                const sheet = sheetOf();
                let height = FREE_GAP_PX;
                if (sheet) {
                    const top = dom.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
                    const pageStart = Math.floor(Math.max(top, 0) / A4_PAGE_PX) * A4_PAGE_PX;
                    // Already at the top of a page's text area: the break adds no empty page.
                    const nextTextTop = top <= pageStart + A4_MARGIN_PX + 1
                        ? pageStart + A4_MARGIN_PX
                        : pageStart + A4_PAGE_PX + A4_MARGIN_PX;
                    height = Math.max(0, Math.round(nextTextTop - top));
                }
                const next = `${height}px`;
                if (dom.style.height !== next) dom.style.height = next;
                dom.dataset.mode = sheet ? 'a4' : 'free';
            };

            // Any document change can move the break (text typed above it), even when the editor's total
            // height stays the same. Layout switches (free <-> A4) change the surface width.
            const onUpdate = () => {
                cancelAnimationFrame(frame);
                frame = requestAnimationFrame(recalc);
            };
            editor?.on('update', onUpdate);

            frame = requestAnimationFrame(() => {
                recalc();
                const surface = dom.closest<HTMLElement>('.ProseMirror');
                if (surface && typeof ResizeObserver !== 'undefined') {
                    observer = new ResizeObserver(onUpdate);
                    observer.observe(surface);
                }
            });

            return {
                dom,
                update: (node) => {
                    if (node.type.name !== 'pageBreak') return false;
                    onUpdate();
                    return true;
                },
                destroy: () => {
                    cancelAnimationFrame(frame);
                    editor?.off('update', onUpdate);
                    observer?.disconnect();
                },
            };
        };
    },
});
