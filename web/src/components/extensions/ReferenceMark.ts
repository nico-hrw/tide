import { Mark, mergeAttributes } from '@tiptap/core';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import 'tippy.js/themes/light.css';
import { useReferenceStore } from '@/store/useReferenceStore';
import { Plugin, PluginKey } from 'prosemirror-state';

export interface ReferenceOptions {
    HTMLAttributes: Record<string, any>;
    onNavigate?: (noteId: string) => void;
}

export const ReferenceMark = Mark.create<ReferenceOptions>({
    name: 'reference',

    addOptions() {
        return {
            HTMLAttributes: {
                class: 'reference-mark',
            },
            onNavigate: () => {},
        };
    },

    addAttributes() {
        return {
            referenceId: {
                default: null,
                parseHTML: element => element.getAttribute('data-reference-id'),
                renderHTML: attributes => {
                    if (!attributes.referenceId) return {};
                    return { 'data-reference-id': attributes.referenceId };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                // Only parse permanent marks — NOT autopilot decoration spans
                tag: 'span[data-reference-id]:not(.autopilot-reference)',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
    },

    addProseMirrorPlugins() {
        // A single shared singleton Tippy instance. We reuse it for all hovers
        // by updating its content and reference element on the fly.
        // This way Tippy is NEVER attached to an internal PM editor node —
        // it is anchored to a virtual element we control, so zero DOM mutations
        // happen inside the contenteditable.
        let singleton: TippyInstance | null = null;
        let currentTarget: HTMLElement | null = null;

        const getOrCreateSingleton = (): TippyInstance => {
            if (singleton) return singleton;

            // Virtual reference element: a 0×0 rect we update to match the hovered word
            const virtualRef = {
                getBoundingClientRect: (): DOMRect => {
                    if (currentTarget) {
                        return currentTarget.getBoundingClientRect();
                    }
                    return new DOMRect(0, 0, 0, 0);
                },
                contextElement: document.body,
            };

            singleton = tippy(document.createElement('div'), {
                getReferenceClientRect: () => virtualRef.getBoundingClientRect(),
                content: '',
                allowHTML: true,
                placement: 'top',
                animation: 'shift-away',
                appendTo: () => document.body,
                arrow: true,
                interactive: false,
                // White background via inline styles instead of theme
                // (avoids needing to import the light theme CSS separately)
                onShow(instance) {
                    const box = instance.popper.querySelector('.tippy-box') as HTMLElement | null;
                    if (box) {
                        box.style.background = '#ffffff';
                        box.style.color = '#374151';
                        box.style.border = '1px solid #e5e7eb';
                        box.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
                        box.style.borderRadius = '8px';
                    }
                    const arrow = instance.popper.querySelector('.tippy-arrow') as HTMLElement | null;
                    if (arrow) {
                        arrow.style.color = '#ffffff';
                    }
                },
            });

            return singleton;
        };

        return [
            new Plugin({
                key: new PluginKey('reference-interactions'),
                props: {
                    handleDOMEvents: {
                        mouseover(view, event) {
                            const target = event.target as HTMLElement;
                            const mark = target.closest('[data-reference-id]') as HTMLElement | null;

                            if (!mark) {
                                // Mouse left all reference marks — hide tooltip
                                singleton?.hide();
                                currentTarget = null;
                                return false;
                            }

                            const refId = mark.getAttribute('data-reference-id');
                            if (!refId) return false;

                            const state = useReferenceStore.getState();
                            const reference = state.references.find((r: any) => r.id === refId);
                            if (!reference) return false;

                            // Update the shared virtual anchor and content
                            currentTarget = mark;
                            const tip = getOrCreateSingleton();

                            const previewText = reference.previewText || reference.term;
                            tip.setContent(
                                `<div style="padding:6px 10px;font-family:sans-serif;font-size:13px;font-weight:500;color:#374151;background:#fff;border-radius:6px;">${previewText}</div>`
                            );
                            tip.show();

                            return false;
                        },

                        mouseout(view, event) {
                            const relatedTarget = event.relatedTarget as HTMLElement | null;
                            // Only hide if we're truly leaving the reference mark area
                            if (!relatedTarget?.closest('[data-reference-id]')) {
                                singleton?.hide();
                                currentTarget = null;
                            }
                            return false;
                        },

                        // Use click (not mousedown) so ProseMirror's selection logic runs first
                        // and our navigation fires after. Return true to prevent PM from
                        // doing anything further with the event.
                        click(view, event) {
                            const target = event.target as HTMLElement;
                            const mark = target.closest('[data-reference-id]') as HTMLElement | null;
                            if (!mark) return false;

                            const refId = mark.getAttribute('data-reference-id');
                            if (!refId) return false;

                            const state = useReferenceStore.getState();
                            const reference = state.references.find((r: any) => r.id === refId);

                            if (reference?.sourceNoteId) {
                                event.preventDefault();
                                singleton?.hide();
                                window.dispatchEvent(new CustomEvent('tide:navigate', {
                                    detail: { noteId: reference.sourceNoteId }
                                }));
                                return true;
                            }

                            return false;
                        },
                    },
                },

                view() {
                    return {
                        destroy() {
                            singleton?.destroy();
                            singleton = null;
                            currentTarget = null;
                        },
                    };
                },
            }),
        ];
    },
});
