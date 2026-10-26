"use client";

import React from 'react';
import dynamic from 'next/dynamic';

const JobPlanner = dynamic(() => import('@/components/JobPlanner/JobPlanner'), {
    loading: () => <div className="flex-1 flex items-center justify-center p-8 text-gray-400">Loading planner...</div>
});

export interface JobsWorkspaceProps {
    isActive: boolean;
    onCreateGroup: (title?: string, color?: string, effect?: string) => Promise<string | undefined>;
    onOpenCalendar: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onOpenSettings: (tab?: any) => void;
}

export function JobsWorkspace({
    isActive,
    onCreateGroup,
    onOpenCalendar,
    onOpenSettings,
}: JobsWorkspaceProps) {
    return (
        <div className={`absolute inset-0 z-10 bg-[var(--background)] overflow-y-auto ${isActive ? 'block' : 'hidden'}`}>
            {isActive && (
                <JobPlanner
                    onCreateGroup={onCreateGroup}
                    onOpenCalendar={onOpenCalendar}
                    onOpenSettings={onOpenSettings}
                />
            )}
        </div>
    );
}

export default JobsWorkspace;
