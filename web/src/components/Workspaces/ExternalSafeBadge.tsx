'use client';

import React from 'react';
import { Layers } from 'lucide-react';

const label = (s: string) => (s === 'main' ? 'Standard' : s);

/**
 * Marks an item that is shown in the active workspaces but belongs to another one.
 * Dashed outline, so it reads as "view only here, edit in its own workspace".
 */
export const ExternalSafeBadge: React.FC<{ safe: string; className?: string }> = ({ safe, className = '' }) => (
  <span
    title={`Aus dem Workspace „${label(safe)}“ eingeblendet`}
    className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-t2-line px-1.5 py-px text-[11px] font-medium text-t2-ink-3 ${className}`.trim()}
  >
    <Layers size={10} aria-hidden="true" />
    {label(safe)}
  </span>
);

export default ExternalSafeBadge;
