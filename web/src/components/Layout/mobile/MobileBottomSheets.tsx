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
  CheckSquare,
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useDataStore } from '@/store/useDataStore';
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
  onToggleComplete?: () => void;
}

export const EventSheet = ({
  event,
  now,
  onDelete,
  onEdit,
  onDismiss,
  onToggleComplete,
}: EventSheetProps) => {
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : start;
  const isPast = end < now;
  const isActive = start <= now && now < end;

  const isTask = !!(event.is_task || event.linkedTaskId);
  const tasks = useDataStore(state => state.tasks);
  const linkedTask = event.linkedTaskId ? tasks?.find(t => t.id === event.linkedTaskId) : undefined;
  const isCompleted = linkedTask ? !!linkedTask.isCompleted : !!event.is_completed;

  const handleToggleComplete = () => {
    if (onToggleComplete) {
      onToggleComplete();
    } else if (event.linkedTaskId) {
      useDataStore.getState().toggleTask(event.linkedTaskId);
    } else {
      useDataStore.setState(s => ({
        events: s.events.map(e =>
          e.id === event.id ? { ...e, is_completed: !isCompleted } : e
        )
      }));
    }
  };

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
            <p className={`text-base font-bold ${isCompleted ? 'line-through opacity-60' : ''}`} style={{ color: T.pri }}>
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
        <div className="flex gap-2.5 flex-wrap">
          {isTask && (
            <button
              onClick={handleToggleComplete}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
              style={{
                background: isCompleted ? 'rgba(16, 185, 129, 0.15)' : `${T.accent}14`,
                color: isCompleted ? '#10b981' : T.accent,
              }}
            >
              <CheckSquare size={15} />
              {isCompleted ? 'Erledigt' : 'Als erledigt markieren'}
            </button>
          )}
          <button
            onClick={() => {
              onEdit?.();
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
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#d946ef',
  '#ec4899',
  '#64748b',
];

export const RECURRENCE_OPTIONS: Array<{ value: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'; label: string }> = [
  { value: 'none', label: 'Nie' },
  { value: 'daily', label: 'Täglich' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'monthly', label: 'Monatlich' },
  { value: 'yearly', label: 'Jährlich' },
];

export interface MobileNewEventSheetProps {
  initialDate: Date;
  onSave: (
    start: Date,
    end: Date,
    meta: {
      title: string;
      color: string;
      description?: string;
      parent_id?: string | null;
      groupIds?: string[];
      recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
      recurrence_rule?: string;
      recurrence_end?: string;
    }
  ) => void;
  onDismiss: () => void;
  themes?: Array<{ id: string; title: string; color?: string; effect?: string }>;
}

export const MobileNewEventSheet = ({
  initialDate,
  onSave,
  onDismiss,
  themes,
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
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[5]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [recurrenceFreq, setRecurrenceFreq] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('none');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>('');
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

    const recurrenceRule = recurrenceFreq !== 'none' ? `FREQ=${recurrenceFreq.toUpperCase()}` : undefined;
    const recurrenceEnd = recurrenceFreq !== 'none' && recurrenceEndDate ? new Date(recurrenceEndDate).toISOString() : undefined;

    onSave(start, end, {
      title: title.trim(),
      color: selectedColor,
      description: description.trim() || undefined,
      parent_id: selectedGroupId || null,
      groupIds: selectedGroupId ? [selectedGroupId] : [],
      recurrence: recurrenceFreq !== 'none' ? recurrenceFreq : undefined,
      recurrence_rule: recurrenceRule,
      recurrence_end: recurrenceEnd,
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
        className="fixed left-0 right-0 z-[65] rounded-t-3xl overflow-hidden flex flex-col"
        style={{
          bottom: 0,
          background: T.card,
          border: `1px solid ${T.brd}`,
          maxHeight: '88vh',
          paddingBottom: 'max(28px, calc(env(safe-area-inset-bottom) + 16px))',
        }}
      >
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: T.brd }} />
        </div>
        <form onSubmit={handleSubmit} className="px-5 pt-2 flex flex-col gap-3 overflow-y-auto min-h-0 flex-1">
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

          {/* Groups / Themes selector */}
          {themes && themes.length > 0 && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: T.mut }}>Gruppe / Kategorie</label>
              <div className="flex items-center gap-1.5 overflow-x-auto py-1" style={{ scrollbarWidth: 'none' }}>
                <button
                  type="button"
                  onClick={() => setSelectedGroupId(null)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all cursor-pointer"
                  style={{
                    background: selectedGroupId === null ? T.hov : 'transparent',
                    border: `1.5px solid ${selectedGroupId === null ? T.accent : T.brd}`,
                    color: selectedGroupId === null ? T.accent : T.sec,
                  }}
                >
                  Keine
                </button>
                {themes.map(t => {
                  const isSelected = selectedGroupId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedGroupId(null);
                        } else {
                          setSelectedGroupId(t.id);
                          if (t.color) {
                            setSelectedColor(t.color);
                          }
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all cursor-pointer"
                      style={{
                        background: isSelected ? `${t.color || T.accent}22` : T.hov,
                        border: `1.5px solid ${isSelected ? (t.color || T.accent) : T.brd}`,
                        color: isSelected ? (t.color || T.accent) : T.pri,
                      }}
                    >
                      {t.color && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: t.color }}
                        />
                      )}
                      <span>{t.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Color palette */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: T.mut }}>Farbe</label>
            <div className="flex items-center gap-2 overflow-x-auto py-1.5 px-0.5" style={{ scrollbarWidth: 'none' }}>
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  className="w-7 h-7 rounded-full shrink-0 transition-transform cursor-pointer"
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

          {/* Recurrence controls */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: T.mut }}>Wiederholung</label>
            <div className="flex items-center gap-1.5 overflow-x-auto py-1" style={{ scrollbarWidth: 'none' }}>
              {RECURRENCE_OPTIONS.map(opt => {
                const isSelected = recurrenceFreq === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRecurrenceFreq(opt.value)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all cursor-pointer"
                    style={{
                      background: isSelected ? `${T.accent}20` : T.hov,
                      border: `1.5px solid ${isSelected ? T.accent : T.brd}`,
                      color: isSelected ? T.accent : T.pri,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {recurrenceFreq !== 'none' && (
              <div className="mt-2 flex items-center gap-2">
                <label className="text-xs font-medium shrink-0" style={{ color: T.sec }}>
                  Endet am:
                </label>
                <input
                  type="date"
                  value={recurrenceEndDate}
                  onChange={e => setRecurrenceEndDate(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-semibold outline-none"
                  style={{ background: T.hov, border: `1px solid ${T.brd}`, color: T.pri }}
                />
                {recurrenceEndDate && (
                  <button
                    type="button"
                    onClick={() => setRecurrenceEndDate('')}
                    className="p-1 rounded-full text-xs font-semibold"
                    style={{ color: T.mut }}
                    title="Kein Enddatum"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}
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
            className="w-full py-3 rounded-2xl text-sm font-bold shadow-md transition-opacity active:opacity-85 mt-1 shrink-0"
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
    parent_id?: string | null;
    groupIds?: string[];
    recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
    recurrence_rule?: string;
    recurrence_end?: string;
    is_task?: boolean;
    linkedTaskId?: string;
    is_completed?: boolean;
  };
  onSave: (
    id: string,
    start: Date,
    end: Date,
    meta: {
      title: string;
      color: string;
      description?: string;
      parent_id?: string | null;
      groupIds?: string[];
      recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
      recurrence_rule?: string;
      recurrence_end?: string;
    }
  ) => void;
  onDismiss: () => void;
  themes?: Array<{ id: string; title: string; color?: string; effect?: string }>;
}

export const MobileEditEventSheet = ({
  event,
  onSave,
  onDismiss,
  themes,
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
  const [selectedColor, setSelectedColor] = useState(event.color || COLOR_OPTIONS[5]);
  const [description, setDescription] = useState(event.description || '');

  const initialGroupId = (event.groupIds && event.groupIds[0]) || event.parent_id || null;
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(initialGroupId);

  const parseInitialFreq = (): 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' => {
    if (event.recurrence && ['none', 'daily', 'weekly', 'monthly', 'yearly'].includes(event.recurrence)) {
      return event.recurrence as any;
    }
    if (event.recurrence_rule) {
      const match = event.recurrence_rule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i);
      if (match) {
        return match[1].toLowerCase() as any;
      }
    }
    return 'none';
  };
  const [recurrenceFreq, setRecurrenceFreq] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'>(parseInitialFreq);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>(() => {
    if (event.recurrence_end) {
      try {
        return format(new Date(event.recurrence_end), 'yyyy-MM-dd');
      } catch {
        return event.recurrence_end;
      }
    }
    return '';
  });

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

    const recurrenceRule = recurrenceFreq !== 'none' ? `FREQ=${recurrenceFreq.toUpperCase()}` : 'none';
    const recurrenceEnd = recurrenceFreq !== 'none' && recurrenceEndDate ? new Date(recurrenceEndDate).toISOString() : '';

    onSave(event.id, start, end, {
      title: title.trim(),
      color: selectedColor,
      description: description.trim() || undefined,
      parent_id: selectedGroupId || null,
      groupIds: selectedGroupId ? [selectedGroupId] : [],
      recurrence: recurrenceFreq !== 'none' ? recurrenceFreq : 'none',
      recurrence_rule: recurrenceRule,
      recurrence_end: recurrenceEnd,
    });
    onDismiss();
  };

  return (
    <div className="fixed inset-0 z-[65] pointer-events-auto">
      <motion.div
        key="edit-sheet-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60]"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
      />
      <motion.div
        key="edit-sheet-content"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        className="fixed left-0 right-0 z-[65] rounded-t-3xl overflow-hidden flex flex-col"
        style={{
          bottom: 0,
          background: T.card,
          border: `1px solid ${T.brd}`,
          maxHeight: '88vh',
          paddingBottom: 'max(28px, calc(env(safe-area-inset-bottom) + 16px))',
        }}
      >
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: T.brd }} />
        </div>
        <form onSubmit={handleSubmit} className="px-5 pt-2 flex flex-col gap-3 overflow-y-auto min-h-0 flex-1">
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

          {/* Groups / Themes selector */}
          {themes && themes.length > 0 && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: T.mut }}>Gruppe / Kategorie</label>
              <div className="flex items-center gap-1.5 overflow-x-auto py-1" style={{ scrollbarWidth: 'none' }}>
                <button
                  type="button"
                  onClick={() => setSelectedGroupId(null)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all cursor-pointer"
                  style={{
                    background: selectedGroupId === null ? T.hov : 'transparent',
                    border: `1.5px solid ${selectedGroupId === null ? T.accent : T.brd}`,
                    color: selectedGroupId === null ? T.accent : T.sec,
                  }}
                >
                  Keine
                </button>
                {themes.map(t => {
                  const isSelected = selectedGroupId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedGroupId(null);
                        } else {
                          setSelectedGroupId(t.id);
                          if (t.color) {
                            setSelectedColor(t.color);
                          }
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all cursor-pointer"
                      style={{
                        background: isSelected ? `${t.color || T.accent}22` : T.hov,
                        border: `1.5px solid ${isSelected ? (t.color || T.accent) : T.brd}`,
                        color: isSelected ? (t.color || T.accent) : T.pri,
                      }}
                    >
                      {t.color && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: t.color }}
                        />
                      )}
                      <span>{t.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Color palette */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: T.mut }}>Farbe</label>
            <div className="flex items-center gap-2 overflow-x-auto py-1.5 px-0.5" style={{ scrollbarWidth: 'none' }}>
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  className="w-7 h-7 rounded-full shrink-0 transition-transform cursor-pointer"
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

          {/* Recurrence controls */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: T.mut }}>Wiederholung</label>
            <div className="flex items-center gap-1.5 overflow-x-auto py-1" style={{ scrollbarWidth: 'none' }}>
              {RECURRENCE_OPTIONS.map(opt => {
                const isSelected = recurrenceFreq === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRecurrenceFreq(opt.value)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all cursor-pointer"
                    style={{
                      background: isSelected ? `${T.accent}20` : T.hov,
                      border: `1.5px solid ${isSelected ? T.accent : T.brd}`,
                      color: isSelected ? T.accent : T.pri,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {recurrenceFreq !== 'none' && (
              <div className="mt-2 flex items-center gap-2">
                <label className="text-xs font-medium shrink-0" style={{ color: T.sec }}>
                  Endet am:
                </label>
                <input
                  type="date"
                  value={recurrenceEndDate}
                  onChange={e => setRecurrenceEndDate(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-semibold outline-none"
                  style={{ background: T.hov, border: `1px solid ${T.brd}`, color: T.pri }}
                />
                {recurrenceEndDate && (
                  <button
                    type="button"
                    onClick={() => setRecurrenceEndDate('')}
                    className="p-1 rounded-full text-xs font-semibold"
                    style={{ color: T.mut }}
                    title="Kein Enddatum"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}
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
            className="w-full py-3 rounded-2xl text-sm font-bold shadow-md transition-opacity active:opacity-85 mt-1 shrink-0"
            style={{ background: selectedColor, color: '#fff' }}
          >
            Änderungen speichern
          </button>
        </form>
      </motion.div>
    </div>
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
