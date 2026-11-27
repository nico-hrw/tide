import { normalizeSafe } from '@/lib/todoSafes';

export const WORKSPACE_ICON_PRESETS = ['🏠', '🎓', '💼', '🧪', '🌿', '🎨', '⚡', '📚', '🛠️', '🗂️'] as const;

export function workspaceDisplayName(safe: string): string {
    return safe === 'main' || safe === 'Standard' ? 'Standard' : safe;
}

/**
 * Returns the custom icon for a workspace if configured, otherwise the uppercase first letter
 * of its display name.
 */
export function workspaceBadgeText(safe: string, safeIcons?: Record<string, string>): string {
    const key = normalizeSafe(safe || 'main');
    const custom = safeIcons?.[key]?.trim();
    if (custom) return custom;
    return workspaceDisplayName(key).charAt(0).toUpperCase() || 'S';
}
