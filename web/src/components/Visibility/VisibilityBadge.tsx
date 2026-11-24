'use client';

import React from 'react';
import { Eye, Globe, Lock, Users } from 'lucide-react';
import { useT } from '@/components/Settings/useT';
import type { SettingsKey } from '@/lib/i18n';
import type { VisibilityKind } from './visibilityState';

const ICONS = { private: Lock, shared: Users, 'shared-with-me': Eye, public: Globe } as const;
const LABEL_KEYS: Record<VisibilityKind, SettingsKey> = {
  private: 'visibility.private',
  shared: 'visibility.shared',
  'shared-with-me': 'visibility.sharedWithMe',
  public: 'visibility.public',
};

export interface VisibilityBadgeProps {
  kind: VisibilityKind;
  count?: number;
  size?: 12 | 14 | 16;
}

export function VisibilityBadge({ kind, count = 0, size = 14 }: VisibilityBadgeProps) {
  const t = useT();
  const Icon = ICONS[kind];
  const label = t(LABEL_KEYS[kind]);
  return (
    <span aria-label={label} title={label} className="inline-flex items-center gap-0.5 text-t2-ink-2" style={{ fontSize: size }}>
      <Icon size={size} aria-hidden="true" />
      {kind === 'shared' && count > 0 ? <span>{count}</span> : null}
    </span>
  );
}
