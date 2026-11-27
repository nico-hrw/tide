'use client';

import React from 'react';
import { useDataStore } from '@/store/useDataStore';
import { workspaceBadgeText, workspaceDisplayName } from '@/lib/workspaceBadge';

/**
 * Small square prefix box showing a workspace's custom icon or initial letter.
 */
export const WorkspacePrefixBox: React.FC<{ safe: string; className?: string }> = ({ safe, className = '' }) => {
    const safeIcons = useDataStore((s) => s.safeIcons);
    return (
        <span
            title={`Workspace: ${workspaceDisplayName(safe)}`}
            className={`inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-[4px] border border-t2-line bg-t2-sub px-1 text-[10px] font-bold leading-none text-t2-ink-2 ${className}`.trim()}
        >
            {workspaceBadgeText(safe, safeIcons)}
        </span>
    );
};

export default WorkspacePrefixBox;
