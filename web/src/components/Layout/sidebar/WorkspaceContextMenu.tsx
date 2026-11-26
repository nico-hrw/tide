'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePopupTimer } from '@/hooks/usePopupTimer';
import { PopupTimerBar } from '@/components/Popup/PopupTimerBar';

export interface WorkspaceMenuState {
  safe: string;
  x: number;
  y: number;
}

interface WorkspaceContextMenuProps {
  menu: WorkspaceMenuState;
  isActive: boolean;
  isDefault: boolean;
  onClose: () => void;
  onShowOnly: () => void;
  onToggle: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}

const itemClass = 'flex w-full items-center whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-[13px] text-t2-ink hover:bg-t2-hover cursor-pointer disabled:cursor-default disabled:text-t2-ink-3 disabled:hover:bg-transparent';

/** Right-click menu for a workspace in the sidebar. Rendered in a portal so the sidebar cannot clip it. Closes when the mouse stays away. */
export function WorkspaceContextMenu({ menu, isActive, isDefault, onClose, onShowOnly, onToggle, onSetDefault, onDelete }: WorkspaceContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isMain = menu.safe === 'main';
  const { fillRef, restRef } = usePopupTimer({ refs: [ref], onExpire: onClose });

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  const run = (fn: () => void) => () => { fn(); onClose(); };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Workspace"
      style={{ top: menu.y, left: menu.x }}
      className="fixed z-[700] w-[240px] rounded-xl border border-t2-line bg-t2-surface p-1 pt-3 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.25)]"
    >
      <PopupTimerBar fillRef={fillRef} restRef={restRef} />
      <button type="button" role="menuitem" className={itemClass} onClick={run(onShowOnly)}>Nur diesen anzeigen</button>
      <button type="button" role="menuitem" className={itemClass} onClick={run(onToggle)}>
        {isActive ? 'Aus der Ansicht entfernen' : 'Zur Ansicht hinzufügen'}
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={run(onSetDefault)}>
        {isDefault ? 'Nicht mehr für neue Inhalte' : 'Für neue Inhalte verwenden'}
      </button>
      <div className="my-1 h-px bg-t2-line-soft" />
      <button type="button" role="menuitem" className={`${itemClass} text-[#A12A1B]`} disabled={isMain} onClick={run(onDelete)}>
        Löschen…
      </button>
    </div>,
    document.body,
  );
}

export default WorkspaceContextMenu;
