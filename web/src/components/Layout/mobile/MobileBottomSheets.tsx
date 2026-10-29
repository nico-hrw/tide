"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  X,
  PenLine,
  Trash2,
  Folder,
  FolderPlus,
  FileText,
  Search,
  Plus,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { T } from './mobileTheme';

export interface OverlayShellProps {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
  from?: 'right' | 'bottom';
}

export const OverlayShell = ({
  title,
  onBack,
  children,
  from = 'right',
}: OverlayShellProps) => (
  <motion.div
    initial={{ [from === 'right' ? 'x' : 'y']: '100%' }}
    animate={{ [from === 'right' ? 'x' : 'y']: 0 }}
    exit={{ [from === 'right' ? 'x' : 'y']: '100%' }}
    transition={{ type: 'spring', damping: 30, stiffness: 300 }}
    className="fixed inset-0 z-50 flex flex-col overflow-hidden"
    style={{ background: T.bg }}
  >
    <div
      className="flex items-center gap-3 px-4 shrink-0"
      style={{
        paddingTop: 'max(52px, calc(env(safe-area-inset-top) + 10px))',
        paddingBottom: 10,
        borderBottom: `1px solid ${T.brd}`,
      }}
    >
      <button onClick={onBack} className="p-2 rounded-full" style={{ background: T.hov }}>
        <ArrowLeft size={18} style={{ color: T.accent }} />
      </button>
      <span className="font-bold text-base flex-1 truncate" style={{ color: T.pri }}>
        {title}
      </span>
    </div>
    {children}
  </motion.div>
);

export interface EventSheetProps {
  event: any;
  now: Date;
  onDelete: () => void;
  onEdit?: () => void;
  onDismiss: () => void;
}

export const EventSheet = ({
  event,
  now,
  onDelete,
  onEdit,
  onDismiss,
}: EventSheetProps) => {
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : start;
  const isPast = end < now;
  const isActive = start <= now && now < end;
  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 32, stiffness: 300 }}
      className="fixed left-0 right-0 z-[65] rounded-t-3xl overflow-hidden"
      style={{
        bottom: 0,
        background: T.card,
        border: `1px solid ${T.brd}`,
        maxHeight: '60vh',
        paddingBottom: 'max(80px, calc(env(safe-area-inset-bottom) + 64px))',
      }}
    >
      <div className="flex justify-center pt-2.5 pb-1">
        <div className="w-9 h-1 rounded-full" style={{ background: T.brd }} />
      </div>
      <div className="px-5 pb-6 pt-2">
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-3 h-3 rounded-full mt-1.5 shrink-0"
            style={{ background: event.color || T.accent }}
          />
          <div>
            <p className="text-base font-bold" style={{ color: T.pri }}>
              {event.title}
            </p>
            <p className="text-sm mt-0.5" style={{ color: T.sec }}>
              {format(start, 'EEE d. MMM', { locale: de })} · {format(start, 'HH:mm')} –{' '}
              {format(end, 'HH:mm')}
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="ml-auto p-1.5 rounded-full"
            style={{ background: T.hov }}
          >
            <X size={14} style={{ color: T.sec }} />
          </button>
        </div>
        <div
          className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-semibold mb-4"
          style={{
            background: `${event.color || T.accent}18`,
            color: event.color || T.accent,
          }}
        >
          {isActive ? 'Läuft gerade' : isPast ? 'Beendet' : `Startet ${format(start, 'HH:mm')}`}
        </div>
        {event.description && (
          <p className="text-sm mb-4" style={{ color: T.sec }}>
            {event.description}
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => {
              onEdit?.();
              onDismiss();
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: `${T.accent}14`, color: T.accent }}
          >
            <PenLine size={15} /> Bearbeiten
          </button>
          <button
            onClick={() => {
              onDelete();
              onDismiss();
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: '#EF444414', color: T.danger }}
          >
            <Trash2 size={15} /> Löschen
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export const COLOR_OPTIONS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#F43F5E', // Rose
  '#06B6D4', // Cyan
];

export interface MobileNewEventSheetProps {
  initialDate: Date;
  onSave: (start: Date, end: Date, meta: { title: string; color: string; description?: string }) => void;
  onDismiss: () => void;
}

export const MobileNewEventSheet = ({
  initialDate,
  onSave,
  onDismiss,
}: MobileNewEventSheetProps) => {
  const [title, setTitle] = useState('');
  const [dateStr, setDateStr] = useState(() => format(initialDate, 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState(() => {
    const h = initialDate.getHours();
    const m = Math.floor(initialDate.getMinutes() / 15) * 15;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
  const [endTime, setEndTime] = useState(() => {
    const h = (initialDate.getHours() + 1) % 24;
    const m = Math.floor(initialDate.getMinutes() / 15) * 15;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);

    const start = new Date(dateStr);
    start.setHours(isNaN(sH) ? 0 : sH, isNaN(sM) ? 0 : sM, 0, 0);

    const end = new Date(dateStr);
    end.setHours(isNaN(eH) ? 1 : eH, isNaN(eM) ? 0 : eM, 0, 0);
    if (end <= start) {
      end.setTime(start.getTime() + 3_600_000);
    }

    onSave(start, end, {
      title: title.trim(),
      color: selectedColor,
      description: description.trim() || undefined,
    });
    onDismiss();
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60]"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={onDismiss}
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        className="fixed left-0 right-0 z-[65] rounded-t-3xl overflow-hidden"
        style={{
          bottom: 0,
          background: T.card,
          border: `1px solid ${T.brd}`,
          paddingBottom: 'max(28px, calc(env(safe-area-inset-bottom) + 16px))',
        }}
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: T.brd }} />
        </div>
        <form onSubmit={handleSubmit} className="px-5 pt-2 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-base" style={{ color: T.pri }}>Neuer Termin</span>
            <button type="button" onClick={onDismiss} className="p-1.5 rounded-full" style={{ background: T.hov }}>
              <X size={16} style={{ color: T.sec }} />
            </button>
          </div>

          <input
            autoFocus
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Titel des Termins…"
            className="w-full px-4 py-3 rounded-2xl text-sm font-semibold outline-none"
            style={{ background: T.hov, border: `1.5px solid ${selectedColor}`, color: T.pri }}
          />

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: T.mut }}>Datum</label>
              <input
                type="date"
                value={dateStr}
                onChange={e => setDateStr(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs font-semibold outline-none"
                style={{ background: T.hov, border: `1px solid ${T.brd}`, color: T.pri }}
              />
            </div>
            <div className="w-24">
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: T.mut }}>Von</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full px-2 py-2 rounded-xl text-xs font-semibold outline-none text-center"
                style={{ background: T.hov, border: `1px solid ${T.brd}`, color: T.pri }}
              />
            </div>
            <div className="w-24">
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: T.mut }}>Bis</label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full px-2 py-2 rounded-xl text-xs font-semibold outline-none text-center"
                style={{ background: T.hov, border: `1px solid ${T.brd}`, color: T.pri }}
              />
            </div>
          </div>

          {/* Color palette */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: T.mut }}>Farbe</label>
            <div className="flex gap-2">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  className="w-7 h-7 rounded-full transition-transform"
                  style={{
                    background: c,
                    outline: selectedColor === c ? '2.5px solid #fff' : 'none',
                    boxShadow: selectedColor === c ? `0 0 0 4px ${c}66` : 'none',
                    transform: selectedColor === c ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          </div>

          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Beschreibung / Notizen (optional)…"
            rows={2}
            className="w-full px-3 py-2 rounded-xl text-xs outline-none resize-none"
            style={{ background: T.hov, border: `1px solid ${T.brd}`, color: T.pri }}
          />

          <button
            type="submit"
            className="w-full py-3 rounded-2xl text-sm font-bold shadow-md transition-opacity active:opacity-85 mt-1"
            style={{ background: selectedColor, color: '#fff' }}
          >
            Termin anlegen
          </button>
        </form>
      </motion.div>
    </>
  );
};

export interface MobileEditEventSheetProps {
  event: {
    id: string;
    title?: string;
    start: Date | string;
    end?: Date | string;
    color?: string;
    description?: string;
  };
  onSave: (id: string, start: Date, end: Date, meta: { title: string; color: string; description?: string }) => void;
  onDismiss: () => void;
}

export const MobileEditEventSheet = ({
  event,
  onSave,
  onDismiss,
}: MobileEditEventSheetProps) => {
  const initialStart = React.useMemo(() => {
    try {
      const d = new Date(event.start);
      return isNaN(d.getTime()) ? new Date() : d;
    } catch {
      return new Date();
    }
  }, [event.start]);

  const initialEnd = React.useMemo(() => {
    try {
      const d = event.end ? new Date(event.end) : new Date(initialStart.getTime() + 3_600_000);
      return isNaN(d.getTime()) ? new Date(initialStart.getTime() + 3_600_000) : d;
    } catch {
      return new Date(initialStart.getTime() + 3_600_000);
    }
  }, [event.end, initialStart]);

  const [title, setTitle] = useState(event.title || '');
  const [dateStr, setDateStr] = useState(() => format(initialStart, 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState(() => {
    const h = initialStart.getHours();
    const m = initialStart.getMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
  const [endTime, setEndTime] = useState(() => {
    const h = initialEnd.getHours();
    const m = initialEnd.getMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
  const [selectedColor, setSelectedColor] = useState(event.color || COLOR_OPTIONS[0]);
  const [description, setDescription] = useState(event.description || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);

    const start = new Date(dateStr);
    start.setHours(isNaN(sH) ? 0 : sH, isNaN(sM) ? 0 : sM, 0, 0);

    const end = new Date(dateStr);
    end.setHours(isNaN(eH) ? 1 : eH, isNaN(eM) ? 0 : eM, 0, 0);
    if (end <= start) {
      end.setTime(start.getTime() + 3_600_000);
    }

    onSave(event.id, start, end, {
      title: title.trim(),
      color: selectedColor,
      description: description.trim() || undefined,
    });
    onDismiss();
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60]"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={onDismiss}
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        className="fixed left-0 right-0 z-[65] rounded-t-3xl overflow-hidden"
        style={{
          bottom: 0,
          background: T.card,
          border: `1px solid ${T.brd}`,
          paddingBottom: 'max(28px, calc(env(safe-area-inset-bottom) + 16px))',
        }}
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: T.brd }} />
        </div>
        <form onSubmit={handleSubmit} className="px-5 pt-2 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-base" style={{ color: T.pri }}>Termin bearbeiten</span>
            <button type="button" onClick={onDismiss} className="p-1.5 rounded-full" style={{ background: T.hov }}>
              <X size={16} style={{ color: T.sec }} />
            </button>
          </div>

          <input
            autoFocus
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Titel des Termins…"
            className="w-full px-4 py-3 rounded-2xl text-sm font-semibold outline-none"
            style={{ background: T.hov, border: `1.5px solid ${selectedColor}`, color: T.pri }}
          />

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: T.mut }}>Datum</label>
              <input
                type="date"
                value={dateStr}
                onChange={e => setDateStr(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs font-semibold outline-none"
                style={{ background: T.hov, border: `1px solid ${T.brd}`, color: T.pri }}
              />
            </div>
            <div className="w-24">
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: T.mut }}>Von</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full px-2 py-2 rounded-xl text-xs font-semibold outline-none text-center"
                style={{ background: T.hov, border: `1px solid ${T.brd}`, color: T.pri }}
              />
            </div>
            <div className="w-24">
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block" style={{ color: T.mut }}>Bis</label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full px-2 py-2 rounded-xl text-xs font-semibold outline-none text-center"
                style={{ background: T.hov, border: `1px solid ${T.brd}`, color: T.pri }}
              />
            </div>
          </div>

          {/* Color palette */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: T.mut }}>Farbe</label>
            <div className="flex gap-2">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  className="w-7 h-7 rounded-full transition-transform"
                  style={{
                    background: c,
                    outline: selectedColor === c ? '2.5px solid #fff' : 'none',
                    boxShadow: selectedColor === c ? `0 0 0 4px ${c}66` : 'none',
                    transform: selectedColor === c ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          </div>

          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Beschreibung / Notizen (optional)…"
            rows={2}
            className="w-full px-3 py-2 rounded-xl text-xs outline-none resize-none"
            style={{ background: T.hov, border: `1px solid ${T.brd}`, color: T.pri }}
          />

          <button
            type="submit"
            className="w-full py-3 rounded-2xl text-sm font-bold shadow-md transition-opacity active:opacity-85 mt-1"
            style={{ background: selectedColor, color: '#fff' }}
          >
            Änderungen speichern
          </button>
        </form>
      </motion.div>
    </>
  );
};

export interface MobileContextMenuTarget {
  type: 'note' | 'folder';
  id: string;
  title: string;
  parentId?: string | null;
}

export interface MobileContextMenuSheetProps {
  contextMenu: MobileContextMenuTarget;
  onClose: () => void;
  onOpenNote?: (id: string, title: string) => void;
  onNewNoteInFolder?: (folderId: string) => void;
  onNewFolderInFolder?: (folderId: string) => void;
  onRename?: (id: string, currentTitle: string) => void;
  onShare?: (id: string, title: string) => void;
  onDelete?: (id: string) => void;
}

export const MobileContextMenuSheet = ({
  contextMenu,
  onClose,
  onOpenNote,
  onNewNoteInFolder,
  onNewFolderInFolder,
  onRename,
  onShare,
  onDelete,
}: MobileContextMenuSheetProps) => {
  const items = [
    {
      label: 'Öffnen',
      icon: <FileText size={18} style={{ color: T.sec }} />,
      action: () => {
        onClose();
        if (contextMenu.type === 'note') {
          onOpenNote?.(contextMenu.id, contextMenu.title);
        }
      },
    },
    ...(contextMenu.type === 'folder'
      ? [
          {
            label: 'Neue Notiz hier',
            icon: <Plus size={18} style={{ color: T.sec }} />,
            action: () => {
              const pid = contextMenu.id;
              onClose();
              if (onNewNoteInFolder) {
                onNewNoteInFolder(pid);
              } else {
                window.dispatchEvent(new CustomEvent('mobile_set_parent', { detail: { parentId: pid } }));
              }
            },
          },
          {
            label: 'Neuer Ordner hier',
            icon: <FolderPlus size={18} style={{ color: T.sec }} />,
            action: () => {
              onClose();
              onNewFolderInFolder?.(contextMenu.id);
            },
          },
        ]
      : []),
    {
      label: 'Umbenennen',
      icon: <PenLine size={18} style={{ color: T.sec }} />,
      action: () => {
        onClose();
        onRename?.(contextMenu.id, contextMenu.title);
      },
    },
    {
      label: 'Teilen',
      icon: <Search size={18} style={{ color: T.sec }} />,
      action: () => {
        onClose();
        if (onShare) {
          onShare(contextMenu.id, contextMenu.title);
        } else {
          window.dispatchEvent(
            new CustomEvent('mobile_share_file', {
              detail: { id: contextMenu.id, title: contextMenu.title },
            })
          );
        }
      },
    },
    {
      label: 'Löschen',
      icon: <Trash2 size={18} style={{ color: T.danger }} />,
      danger: true,
      action: () => {
        onClose();
        onDelete?.(contextMenu.id);
      },
    },
  ];

  return (
    <>
      <motion.div
        key="cm-back"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70]"
        style={{ background: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />
      <motion.div
        key="cm"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        className="fixed left-0 right-0 z-[75] rounded-t-3xl overflow-hidden"
        style={{
          bottom: 0,
          background: T.card,
          paddingBottom: 'max(28px, calc(env(safe-area-inset-bottom) + 12px))',
        }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full" style={{ background: T.brd }} />
        </div>
        <div
          className="px-6 pt-2 pb-3 flex items-center gap-3"
          style={{ borderBottom: `1px solid ${T.brd}` }}
        >
          {contextMenu.type === 'folder' ? (
            <Folder size={16} style={{ color: T.sec }} />
          ) : (
            <FileText size={16} style={{ color: T.sec }} />
          )}
          <p className="text-sm font-bold truncate flex-1" style={{ color: T.pri }}>
            {contextMenu.title}
          </p>
        </div>
        {items.map((item, i, arr) => (
          <button
            key={item.label}
            onClick={item.action}
            className="w-full flex items-center gap-4 px-6 py-3.5"
            style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.brd}` : 'none' }}
          >
            {item.icon}
            <span
              className="text-base font-medium"
              style={{ color: item.danger ? T.danger : T.pri }}
            >
              {item.label}
            </span>
            {item.label === 'Sichtbarkeit' && (
              <ChevronRight size={16} style={{ color: T.mut, marginLeft: 'auto' }} />
            )}
          </button>
        ))}
      </motion.div>
    </>
  );
};

export interface MobileRenameModalProps {
  id: string;
  initialTitle?: string;
  value?: string;
  onChange?: (val: string) => void;
  onSave: (id: string, newTitle: string) => void;
  onClose: () => void;
}

export const MobileRenameModal = ({
  id,
  initialTitle = '',
  value,
  onChange,
  onSave,
  onClose,
}: MobileRenameModalProps) => {
  const [internalValue, setInternalValue] = useState(initialTitle);
  const isControlled = value !== undefined;
  const currentVal = isControlled ? value : internalValue;
  const handleChange = (newVal: string) => {
    if (isControlled) {
      onChange?.(newVal);
    } else {
      setInternalValue(newVal);
    }
  };

  const handleSave = () => {
    onSave(id, currentVal);
    onClose();
  };

  return (
    <motion.div
      key="rename-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full rounded-t-3xl p-6" style={{ background: T.card }}>
        <p className="text-sm font-bold mb-3" style={{ color: T.pri }}>
          Umbenennen
        </p>
        <input
          autoFocus
          value={currentVal}
          onChange={e => handleChange(e.target.value)}
          className="w-full px-4 py-3 rounded-2xl text-sm font-medium outline-none mb-3"
          style={{ background: T.hov, border: `1.5px solid ${T.accent}`, color: T.pri }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              handleSave();
            }
          }}
        />
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-2xl text-sm font-semibold"
            style={{ background: T.hov, color: T.sec }}
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-2xl text-sm font-semibold"
            style={{ background: T.accent, color: '#fff' }}
          >
            Speichern
          </button>
        </div>
      </div>
    </motion.div>
  );
};
