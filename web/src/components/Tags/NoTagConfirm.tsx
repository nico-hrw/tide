'use client';

import React from 'react';

export interface NoTagConfirmProps {
  onConfirm: () => void;
  onChoose: () => void;
}

/** Inline question shown when saving without any tag. */
export const NoTagConfirm: React.FC<NoTagConfirmProps> = ({ onConfirm, onChoose }) => (
  <div className="flex flex-wrap items-center gap-2 text-xs text-t2-ink-2">
    <span>Ohne Tag speichern?</span>
    <button
      type="button"
      onClick={onConfirm}
      className="px-3 py-1.5 rounded-xl font-medium bg-t2-hover text-t2-ink transition-colors cursor-pointer min-h-[32px]"
    >
      Ohne Tag speichern
    </button>
    <button
      type="button"
      onClick={onChoose}
      className="px-3 py-1.5 rounded-xl font-medium text-t2-accent-ink bg-t2-accent hover:opacity-90 transition-all cursor-pointer min-h-[32px]"
    >
      Tag wählen
    </button>
  </div>
);

export default NoTagConfirm;
