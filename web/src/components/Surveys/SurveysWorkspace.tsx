"use client";

import React from 'react';
import dynamic from 'next/dynamic';

function cn(...classes: (string | boolean | undefined | null)[]) {
    return classes.filter(Boolean).join(' ');
}

const SurveyAnalytics = dynamic(() => import('@/components/Surveys/SurveyAnalytics'), {
    loading: () => (
        <div className="flex-1 flex items-center justify-center p-8 text-gray-400">
            Loading analytics...
        </div>
    )
});

export interface SurveysWorkspaceProps {
    isActive: boolean;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onOpenTab?: (id: string, type?: unknown) => void;
}

export function SurveysWorkspace({
    isActive,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onOpenTab,
}: SurveysWorkspaceProps) {
    return (
        <div className={cn("absolute inset-0 z-10 bg-[var(--background)] overflow-y-auto", !isActive && "hidden")}>
            <SurveyAnalytics />
        </div>
    );
}

export default SurveysWorkspace;
