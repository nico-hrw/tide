/**
 * Small event bus between the places that change notes (creating a note, adding a link) and the island that
 * shows the little graph animation. Events carry ids only; titles are looked up by the listener.
 */
export type GraphEventDetail =
    | { kind: 'note'; id: string; /** note the user was in when creating, shown as the surroundings */ contextId?: string | null }
    | { kind: 'link'; a: string; b: string };

const EVENT_NAME = 'tide:graph-event';

export function emitGraphEvent(detail: GraphEventDetail): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<GraphEventDetail>(EVENT_NAME, { detail }));
}

export function onGraphEvent(cb: (detail: GraphEventDetail) => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const handler = (e: Event) => cb((e as CustomEvent<GraphEventDetail>).detail);
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
}
