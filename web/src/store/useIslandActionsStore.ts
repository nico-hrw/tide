import { create } from 'zustand';

/**
 * Brücke zwischen Smart Island und den Seiten-Handlern (page.tsx besitzt die Schlüssel für
 * verschlüsselte Termine und den Termin-Editor). page.tsx registriert die Funktionen einmal,
 * alle Island-Layouts (Desktop, Tablet, Handy) rufen sie darüber auf.
 */
export interface IslandActions {
    /** Legt einen Termin an; liefert die ID oder null, wenn es nicht geklappt hat. */
    createEvent: ((start: Date, end: Date, title: string) => Promise<string | null>) | null;
    /** Öffnet den Termin-Editor für einen Entwurf. */
    editEvent: ((start: Date, end: Date, title: string) => void) | null;
    /** Öffnet eine Notiz, einen Termin oder ein Todo aus den Suchergebnissen der Island. */
    openItem: ((target: { id: string; type: string; title: string }) => void) | null;
}

interface IslandActionsState extends IslandActions {
    register: (actions: Partial<IslandActions>) => void;
    unregister: () => void;
}

export const useIslandActionsStore = create<IslandActionsState>()((set) => ({
    createEvent: null,
    editEvent: null,
    openItem: null,
    register: (actions) => set(actions),
    unregister: () => set({ createEvent: null, editEvent: null, openItem: null }),
}));
