import type { DecryptedFile } from "./types";
import SidebarNavTree from "./SidebarNavTree";

/**
 * Filter files by active safes.
 * Notes/files must match one of the active safes (default: 'Standard').
 * Folders remain visible so folder hierarchies are navigable.
 */
export function filterFilesBySafe(files: DecryptedFile[], activeSafes: string[]): DecryptedFile[] {
    if (!files) return [];
    if (!activeSafes || activeSafes.length === 0) return files;

    const normActiveSafes = activeSafes.map((s) => (s === 'Standard' ? 'main' : s));

    return files.filter((f) => {
        if (f.type === 'folder') return true;

        const rawSafe = f.safe || (f.metadata && f.metadata.safe) || 'main';
        const primarySafe = rawSafe === 'Standard' ? 'main' : rawSafe;

        if (normActiveSafes.includes(primarySafe)) return true;

        const rawLinked: string[] = Array.isArray(f.linkedSafes)
            ? f.linkedSafes
            : Array.isArray(f.metadata?.linkedSafes)
            ? f.metadata.linkedSafes
            : [];
        const normLinked = rawLinked.map((s) => (s === 'Standard' ? 'main' : s));

        return normLinked.some((s) => normActiveSafes.includes(s));
    });
}

export { SidebarNavTree as SidebarFiles };
export default SidebarNavTree;
