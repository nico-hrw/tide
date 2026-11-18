import { useState } from 'react';
import { useMobileConnectionStore } from '@/store/useMobileConnectionStore';

/**
 * Gemeinsame Schaltlogik fuer Erweiterungen:
 * Aktivieren = ein Klick, Deaktivieren verlangt einen Bestaetigungsschritt (`pendingOff`).
 */
export function useExtensionSwitch(onToggleExtension: (extensionId: string, enabled: boolean) => void) {
    const [pendingOff, setPendingOff] = useState<string | null>(null);

    const apply = (id: string, enabled: boolean) => {
        if (id === 'mobile_connection') useMobileConnectionStore.getState().setEnabled(enabled);
        onToggleExtension(id, enabled);
    };

    return {
        pendingOff,
        toggle: (id: string, next: boolean) => {
            if (next) {
                setPendingOff(null);
                apply(id, true);
            } else {
                setPendingOff(id);
            }
        },
        confirmOff: (id: string) => {
            setPendingOff(null);
            apply(id, false);
        },
        cancel: () => setPendingOff(null),
    };
}
