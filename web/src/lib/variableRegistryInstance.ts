import { useDataStore } from '@/store/useDataStore';
import { VariableRegistry } from './variableRegistry';
import { createApiRegistryStorage } from './variableRegistryStorage';

let instance: { userId: string | null; registry: VariableRegistry } | null = null;

/** The registry of the signed-in user; a new one is created when another user signs in. */
export function getVariableRegistry(): VariableRegistry {
    const userId = useDataStore.getState().myId ?? null;
    if (!instance || instance.userId !== userId) {
        const storage = createApiRegistryStorage(() => {
            const s = useDataStore.getState();
            return s.privateKey && s.publicKey && s.myId
                ? { privateKey: s.privateKey, publicKey: s.publicKey, userId: s.myId }
                : null;
        });
        instance = { userId, registry: new VariableRegistry(storage) };
    }
    return instance.registry;
}
