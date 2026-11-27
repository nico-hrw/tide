"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderPlus, GraduationCap, LogOut, Plus, Settings, Smile } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { setAnimatedEmojiEnabled, useAnimatedEmojiEnabled } from '@/lib/animatedEmoji';
import { workspaceLabel, workspaceTone } from '@/lib/workspaceColor';
import Avatar from '@/components/Profile/Avatar';
import { handleSignOut } from '../sidebar/SidebarUserMenu';

export interface MobileSidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNewNote: () => void;
  onNewFolder?: () => void;
  onOpenExams: () => void;
  onOpenSettings: () => void;
  enabledExtensions?: string[];
  displayName?: string;
  avatarSeed?: string;
  avatarStyle?: 'notionists' | 'openPeeps';
}

interface SheetRowProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  right?: React.ReactNode;
}

/** Flat row like the desktop sidebar rows: icon, label, optional control on the right. */
const SheetRow: React.FC<SheetRowProps> = ({ icon, label, onClick, danger, right }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px] active:bg-t2-hover ${danger ? 'text-t2-late' : 'text-t2-ink'}`}
  >
    <span className={`shrink-0 ${danger ? '' : 'text-t2-ink-2'}`}>{icon}</span>
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {right}
  </button>
);

/**
 * The "more" sheet of the mobile bottom nav: slides up from the bottom and looks like the desktop sidebar
 * (flat rows, tinted workspace chips) with the create actions, plugins, settings and sign-out.
 */
export const MobileSidebarDrawer: React.FC<MobileSidebarDrawerProps> = ({
  isOpen,
  onClose,
  onNewNote,
  onNewFolder,
  onOpenExams,
  onOpenSettings,
  enabledExtensions,
  displayName,
  avatarSeed,
  avatarStyle = 'notionists',
}) => {
  const storeExtensions = useDataStore((s) => s.enabledExtensions);
  const resolvedExtensions = enabledExtensions ?? storeExtensions;
  const availableSafes = useDataStore((s) => s.availableSafes);
  const activeSafes = useDataStore((s) => s.activeSafes);
  const toggleSafe = useDataStore((s) => s.toggleSafe);
  const animatedEmojiOn = useAnimatedEmojiEnabled();

  const act = (fn: () => void) => () => { onClose(); fn(); };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="more-back"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-[color-mix(in_srgb,var(--t2-ink)_30%,transparent)]"
            onClick={onClose}
          />
          <motion.div
            key="more-sheet"
            role="dialog"
            aria-label="Menü"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 500) onClose(); }}
            className="fixed inset-x-0 bottom-0 z-[95] max-h-[85dvh] overflow-y-auto rounded-t-[20px] border-t border-t2-line bg-t2-surface px-3 pt-2"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
          >
            <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-t2-line" aria-hidden="true" />

            <div className="flex items-center gap-2.5 px-3 pb-2 pt-1">
              {avatarSeed && <Avatar seed={avatarSeed} style={avatarStyle} size={36} />}
              <span className="min-w-0 truncate text-[15px] font-semibold text-t2-ink">{displayName || 'Profil'}</span>
            </div>

            {availableSafes.length > 1 && (
              <div className="px-3 pb-2">
                <p className="pb-1.5 text-[11px] font-medium text-t2-ink-3">Workspaces</p>
                <div className="flex flex-wrap gap-1.5">
                  {availableSafes.map((safe) => (
                    <button
                      key={safe}
                      type="button"
                      aria-pressed={activeSafes.includes(safe)}
                      onClick={() => toggleSafe(safe)}
                      style={{ '--chip': workspaceTone(safe).hex } as React.CSSProperties}
                      className={`rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
                        activeSafes.includes(safe) ? 'mention-chip' : 'bg-t2-sub text-t2-ink-2'
                      }`}
                    >
                      {workspaceLabel(safe)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mx-3 my-1.5 h-px bg-t2-line-soft" role="separator" />

            <SheetRow icon={<Plus size={18} />} label="Neue Notiz" onClick={act(onNewNote)} />
            <SheetRow
              icon={<FolderPlus size={18} />}
              label="Neuer Ordner"
              onClick={act(() => (onNewFolder ? onNewFolder() : window.dispatchEvent(new CustomEvent('mobile_new_folder'))))}
            />
            {resolvedExtensions.includes('job_planner') && (
              <SheetRow icon={<GraduationCap size={18} />} label="Job & Uni" onClick={act(onOpenExams)} />
            )}

            <div className="mx-3 my-1.5 h-px bg-t2-line-soft" role="separator" />

            <SheetRow icon={<Settings size={18} />} label="Einstellungen" onClick={act(onOpenSettings)} />
            <SheetRow
              icon={<Smile size={18} />}
              label="Animierte Emojis"
              onClick={() => setAnimatedEmojiEnabled(!animatedEmojiOn)}
              right={
                <span
                  role="switch"
                  aria-checked={animatedEmojiOn}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${animatedEmojiOn ? 'bg-t2-ink' : 'bg-t2-line'}`}
                >
                  <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-t2-surface shadow transition-transform ${animatedEmojiOn ? 'translate-x-5' : ''}`} />
                </span>
              }
            />

            <div className="mx-3 my-1.5 h-px bg-t2-line-soft" role="separator" />

            <SheetRow icon={<LogOut size={18} />} label="Abmelden" danger onClick={() => { void handleSignOut(); }} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default MobileSidebarDrawer;
