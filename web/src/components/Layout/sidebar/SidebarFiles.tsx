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
    return files.filter((f) => {
        if (f.type === 'folder') return true;
        const noteSafe = f.safe || (f.metadata && f.metadata.safe) || 'Standard';
        return activeSafes.includes(noteSafe);
    });
}

export { SidebarNavTree as SidebarFiles };
export default SidebarNavTree;
