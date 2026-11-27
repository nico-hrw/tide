'use client';

import React from 'react';

const label = (s: string) => (s === 'main' ? 'Standard' : s);

/**
 * Marks an item that is shown in the active workspaces but belongs to another one. Reads as a
 * prefix to the title ("Uni: Stundenplan"); hovering lists the item's tags.
 */
export const ExternalSafeBadge: React.FC<{ safe: string; tags?: string[]; className?: string }> = ({ safe, tags, className = '' }) => (
  <span
    title={`Aus dem Workspace „${label(safe)}“ eingeblendet${tags && tags.length > 0 ? `\nTags: ${tags.join(', ')}` : ''}`}
    className={`inline-flex shrink-0 items-center text-[11px] font-semibold text-t2-ink-3 ${className}`.trim()}
  >
    {label(safe)}:
  </span>
);

export default ExternalSafeBadge;
