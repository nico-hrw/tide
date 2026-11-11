import type { DecryptedFile } from "./types";
import SidebarNavTree from "./SidebarNavTree";

/**
 * Filter files and folders by active workspaces/safes.
 * Items must match one of the active workspaces (default: 'Standard' / 'main').
 */
export function filterFilesBySafe(files: DecryptedFile[], activeSafes: string[]): DecryptedFile[] {
    if (!files) return [];
    if (!activeSafes || activeSafes.length === 0) return files;

    const normActiveSafes = activeSafes.map((s) => (s === 'Standard' ? 'main' : s));

    const fileMap = new Map<string, DecryptedFile>();
    for (const f of files) {
        if (f.id) fileMap.set(f.id, f);
    }

    const normSafe = (s?: string) => (!s || s === 'Standard' ? 'main' : s);

    const getDirectSafe = (f: DecryptedFile): string | undefined => {
        return f.safe || (f.metadata && f.metadata.safe);
    };

    const getLinkedSafes = (f: DecryptedFile): string[] => {
        const rawLinked: string[] = Array.isArray(f.linkedSafes)
            ? f.linkedSafes
            : Array.isArray(f.metadata?.linkedSafes)
            ? f.metadata.linkedSafes
            : [];
        return rawLinked.map(normSafe);
    };

    // Resolves the effective safe of an item, traversing up ancestors if item defaults to 'main'
    const memoEffectiveSafe = new Map<string, string>();
    const getEffectiveSafe = (f: DecryptedFile, visited = new Set<string>()): string => {
        if (memoEffectiveSafe.has(f.id)) return memoEffectiveSafe.get(f.id)!;
        if (visited.has(f.id)) return normSafe(getDirectSafe(f));
        visited.add(f.id);

        const direct = normSafe(getDirectSafe(f));
        // If direct safe is explicit non-main, use it
        if (direct !== 'main') {
            memoEffectiveSafe.set(f.id, direct);
            return direct;
        }

        // If direct is 'main' or undefined, inherit parent's effective safe if parent exists
        if (f.parent_id && fileMap.has(f.parent_id)) {
            const parent = fileMap.get(f.parent_id)!;
            const parentEff = getEffectiveSafe(parent, visited);
            if (parentEff !== 'main') {
                memoEffectiveSafe.set(f.id, parentEff);
                return parentEff;
            }
        }

        memoEffectiveSafe.set(f.id, direct);
        return direct;
    };

    const hasAncestorInActiveSafes = (f: DecryptedFile): boolean => {
        let curr = f;
        const visited = new Set<string>();
        while (curr.parent_id && fileMap.has(curr.parent_id)) {
            if (visited.has(curr.parent_id)) break;
            visited.add(curr.parent_id);
            const parent = fileMap.get(curr.parent_id)!;
            const parentEff = getEffectiveSafe(parent);
            if (normActiveSafes.includes(parentEff)) return true;
            const parentLinked = getLinkedSafes(parent);
            if (parentLinked.some((s) => normActiveSafes.includes(s))) return true;
            curr = parent;
        }
        return false;
    };

    return files.filter((f) => {
        const effSafe = getEffectiveSafe(f);
        if (normActiveSafes.includes(effSafe)) return true;

        const linked = getLinkedSafes(f);
        if (linked.some((s) => normActiveSafes.includes(s))) return true;

        if (hasAncestorInActiveSafes(f)) return true;

        return false;
    });
}

export { SidebarNavTree as SidebarFiles };
export default SidebarNavTree;
