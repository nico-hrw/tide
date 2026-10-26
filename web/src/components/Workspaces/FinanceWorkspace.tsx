"use client";

import React from 'react';
import dynamic from 'next/dynamic';

const FinanceDashboard = dynamic(() => import('@/components/Finance/FinanceDashboard'), {
    loading: () => <div className="flex-1 flex items-center justify-center p-8 text-gray-400">Loading module...</div>
});

export interface FinanceWorkspaceProps {
    isActive: boolean;
    enabled: boolean;
}

export function FinanceWorkspace({ isActive, enabled }: FinanceWorkspaceProps) {
    return (
        <div className={`absolute inset-0 z-10 bg-[var(--background)] ${isActive ? 'block' : 'hidden'}`}>
            {enabled ? <FinanceDashboard /> : null}
        </div>
    );
}

export default FinanceWorkspace;
