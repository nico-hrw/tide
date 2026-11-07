"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Repeat,
  Flag,
  Tag,
  Clock,
  Calendar,
} from 'lucide-react';
import { format } from 'date-fns';
import { useDataStore } from '@/store/useDataStore';

export interface MobileCreateModalProps {
  isOpen: boolean;
  mode: 'event' | 'todo';
  initialDate?: Date;
  themes?: Array<{ id: string; title: string; color?: string; effect?: string }>;
  onClose: () => void;
  onSaveEvent?: (
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
  onSaveTodo?: (task: {
    title: string;
    priority?: 'low' | 'medium' | 'high';
    dueDate?: string;
    color?: string;
    tags?: string[];
    recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
    recurrence_rule?: string;
    recurrence_end?: string;
    showInCalendar?: boolean;
  }) => Promise<void> | void;
}

const PRESET_COLORS = [
  '#8b5cf6', // Violet
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#64748b', // Slate
];

type RecurrenceType = 'nie' | 'daily' | 'weekly' | 'monthly' | 'yearly';
type PriorityType = 'none' | 'low' | 'medium' | 'high';

export const MobileCreateModal: React.FC<MobileCreateModalProps> = ({
  isOpen,
  mode,
  initialDate,
  onClose,
  onSaveEvent,
  onSaveTodo,
}) => {
  const theme = useDataStore((s) => s.theme);
  const isDark = theme === 'dark';
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [color, setColor] = useState(() => (mode === 'todo' ? '#10b981' : '#8b5cf6'));
  const [dateStr, setDateStr] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');

  // Todo-specific dates
  const [dueDateStr, setDueDateStr] = useState('');
  const [dueTimeStr, setDueTimeStr] = useState('');

  // Recurrence
  const [repeatOption, setRepeatOption] = useState<RecurrenceType>('nie');
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatEndDate, setRepeatEndDate] = useState('');

  // Todo Priority & Tags
  const [priority, setPriority] = useState<PriorityType>('medium');
  const [tagsInput, setTagsInput] = useState('');
  const [showInCalendar, setShowInCalendar] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize values whenever modal opens or mode/initialDate changes
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setColor(mode === 'todo' ? '#10b981' : '#8b5cf6');

      const base = initialDate ? new Date(initialDate) : new Date();
      const formattedDate = format(base, 'yyyy-MM-dd');
      setDateStr(formattedDate);
      setDueDateStr(formattedDate);

      // Start time rounded to next 15-minute slot
      const startH = base.getHours();
      const startM = Math.ceil(base.getMinutes() / 15) * 15;
      const sDate = new Date(base);
      sDate.setHours(startH, startM, 0, 0);
      const eDate = new Date(sDate.getTime() + 3600000);

      const sStr = format(sDate, 'HH:mm');
      const eStr = format(eDate, 'HH:mm');
      setStartTime(sStr);
      setEndTime(eStr);
      setDueTimeStr('');

      setRepeatOption('nie');
      setRepeatInterval(1);
      setRepeatEndDate('');
      setPriority('medium');
      setTagsInput('');
      setShowInCalendar(true);
      setIsSubmitting(false);

      // Auto-focus input after transition
      const timer = setTimeout(() => {
        titleInputRef.current?.focus();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen, mode, initialDate]);

  if (!isOpen) return null;

  const repeatUnitLabel =
    repeatOption === 'daily'
      ? 'Tage'
      : repeatOption === 'weekly'
      ? 'Wochen'
      : repeatOption === 'monthly'
      ? 'Monate'
      : repeatOption === 'yearly'
      ? 'Jahre'
      : '';

  const handleCancel = () => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    onClose();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || isSubmitting) return;

    try {
      setIsSubmitting(true);

      const recurrenceRule =
        repeatOption !== 'nie'
          ? `FREQ=${repeatOption.toUpperCase()}${repeatInterval > 1 ? `;INTERVAL=${repeatInterval}` : ''}`
          : undefined;
      const recurrenceEnd =
        repeatOption !== 'nie' && repeatEndDate
          ? new Date(repeatEndDate).toISOString()
          : undefined;
      const recurrenceVal = repeatOption !== 'nie' ? repeatOption : undefined;

      if (mode === 'event') {
        const [sH, sM] = startTime.split(':').map(Number);
        const [eH, eM] = endTime.split(':').map(Number);

        const targetDate = dateStr || format(new Date(), 'yyyy-MM-dd');
        const start = new Date(targetDate);
        start.setHours(isNaN(sH) ? 9 : sH, isNaN(sM) ? 0 : sM, 0, 0);

        const end = new Date(targetDate);
        end.setHours(isNaN(eH) ? 10 : eH, isNaN(eM) ? 0 : eM, 0, 0);
        if (end <= start) {
          end.setTime(start.getTime() + 3_600_000);
        }

        if (onSaveEvent) {
          onSaveEvent(start, end, {
            title: cleanTitle,
            color,
            recurrence: recurrenceVal,
            recurrence_rule: recurrenceRule,
            recurrence_end: recurrenceEnd,
          });
        }
      } else {
        // Todo Mode
        const parsedTags = tagsInput
          .split(/[\s,]+/)
          .map((t) => t.replace(/^#/, '').trim())
          .filter(Boolean);

        const finalDueDate = dueDateStr
          ? dueTimeStr
            ? `${dueDateStr}T${dueTimeStr}:00`
            : dueDateStr
          : undefined;

        const priorityVal = priority === 'none' ? undefined : priority;

        if (onSaveTodo) {
          await onSaveTodo({
            title: cleanTitle,
            priority: priorityVal,
            dueDate: finalDueDate,
            color,
            tags: parsedTags.length > 0 ? parsedTags : undefined,
            recurrence: recurrenceVal,
            recurrence_rule: recurrenceRule,
            recurrence_end: recurrenceEnd,
            showInCalendar,
          });
        } else {
          await useDataStore.getState().addTask({
            title: cleanTitle,
            priority: priorityVal,
            dueDate: finalDueDate,
            scheduledDate: finalDueDate,
            color,
            tags: parsedTags.length > 0 ? parsedTags : undefined,
            recurrence: recurrenceVal,
            recurrence_rule: recurrenceRule,
            recurrence_end: recurrenceEnd,
            showInCalendar,
            isCompleted: false,
          });
        }
      }

      handleCancel();
    } catch (err) {
      console.error('[MobileCreateModal] Error creating item:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{
        background: isDark ? '#11141c' : '#f4f5f7',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      {/* Modal Header */}
      <div
        className="flex items-center justify-between px-4 py-3.5 z-10 shrink-0 border-b"
        style={{
          background: isDark ? '#1a1e28' : '#ffffff',
          borderColor: isDark ? '#262b38' : '#e5e7eb',
        }}
      >
        <button
          type="button"
          onClick={handleCancel}
          className="text-blue-500 font-medium text-[16px] hover:text-blue-600 transition-colors px-2 py-1 cursor-pointer"
        >
          Abbrechen
        </button>

        <h2
          className="font-bold text-[17px] tracking-tight"
          style={{ color: isDark ? '#f3f4f6' : '#111827' }}
        >
          {mode === 'todo' ? 'Neues To-Do' : 'Neuer Termin'}
        </h2>

        <button
          type="button"
          disabled={!title.trim() || isSubmitting}
          onClick={() => handleSubmit()}
          className={`font-semibold text-[16px] transition-colors px-2 py-1 ${
            title.trim() && !isSubmitting
              ? 'text-blue-500 hover:text-blue-600 cursor-pointer'
              : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
          }`}
        >
          Hinzufügen
        </button>
      </div>

      {/* Modal Content */}
      <form
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 pb-16"
      >
        {/* Card 1: Title and Color Badge */}
        <div
          className="flex flex-col gap-3 rounded-2xl p-4 shadow-sm border"
          style={{
            background: isDark ? '#1a1e28' : '#ffffff',
            borderColor: isDark ? '#262b38' : '#f1f2f5',
          }}
        >
          <div className="flex items-center gap-4">
            {/* Color Swatch & Native Color Picker */}
            <div
              className="relative shrink-0 w-8 h-8 rounded-full overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700 cursor-pointer transition-transform active:scale-95"
              style={{ backgroundColor: color }}
              title="Farbe wählen"
            >
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="absolute top-[-10px] left-[-10px] w-[50px] h-[50px] cursor-pointer opacity-0"
                aria-label="Farbe auswählen"
              />
            </div>

            {/* Title Input */}
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titel"
              className="w-full text-2xl font-semibold outline-none bg-transparent placeholder-gray-300 dark:placeholder-gray-600"
              style={{ color: isDark ? '#ffffff' : '#111827' }}
            />
          </div>

          {/* Preset Color Swatches */}
          <div
            className="flex items-center gap-2 pt-2 border-t overflow-x-auto scrollbar-none"
            style={{ borderColor: isDark ? '#262b38' : '#f3f4f6' }}
          >
            {PRESET_COLORS.map((c) => {
              const isSelected = color.toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-5 h-5 rounded-full shrink-0 transition-transform active:scale-90"
                  style={{
                    backgroundColor: c,
                    boxShadow: isSelected
                      ? `0 0 0 2px ${isDark ? '#1a1e28' : '#ffffff'}, 0 0 0 4px ${c}`
                      : 'none',
                  }}
                  title={c}
                />
              );
            })}
          </div>
        </div>

        {/* Card 2: Date & Time Pickers */}
        <div
          className="rounded-2xl shadow-sm border overflow-hidden flex flex-col"
          style={{
            background: isDark ? '#1a1e28' : '#ffffff',
            borderColor: isDark ? '#262b38' : '#f1f2f5',
          }}
        >
          {mode === 'event' ? (
            <>
              {/* Event Date */}
              <div
                className="flex justify-between items-center px-4 py-3.5 border-b"
                style={{ borderColor: isDark ? '#262b38' : '#f3f4f6' }}
              >
                <div className="flex items-center gap-2.5">
                  <Calendar size={18} className="text-blue-500" />
                  <span
                    className="text-[16px]"
                    style={{ color: isDark ? '#e5e7eb' : '#1f2937' }}
                  >
                    Datum
                  </span>
                </div>
                <input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="text-right text-[16px] text-gray-500 dark:text-gray-400 bg-transparent outline-none w-auto flex-1 ml-4 cursor-pointer"
                  style={{ colorScheme: isDark ? 'dark' : 'light' }}
                />
              </div>

              {/* Event Start Time */}
              <div
                className="flex justify-between items-center px-4 py-3.5 border-b"
                style={{ borderColor: isDark ? '#262b38' : '#f3f4f6' }}
              >
                <div className="flex items-center gap-2.5">
                  <Clock size={18} className="text-blue-500" />
                  <span
                    className="text-[16px]"
                    style={{ color: isDark ? '#e5e7eb' : '#1f2937' }}
                  >
                    Von
                  </span>
                </div>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="text-right text-[16px] text-gray-500 dark:text-gray-400 bg-transparent outline-none w-auto flex-1 ml-4 cursor-pointer"
                  style={{ colorScheme: isDark ? 'dark' : 'light' }}
                />
              </div>

              {/* Event End Time */}
              <div className="flex justify-between items-center px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  <Clock size={18} className="text-blue-400 opacity-60" />
                  <span
                    className="text-[16px]"
                    style={{ color: isDark ? '#e5e7eb' : '#1f2937' }}
                  >
                    Bis
                  </span>
                </div>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="text-right text-[16px] text-gray-500 dark:text-gray-400 bg-transparent outline-none w-auto flex-1 ml-4 cursor-pointer"
                  style={{ colorScheme: isDark ? 'dark' : 'light' }}
                />
              </div>
            </>
          ) : (
            <>
              {/* Todo Due Date */}
              <div
                className="flex justify-between items-center px-4 py-3.5 border-b"
                style={{ borderColor: isDark ? '#262b38' : '#f3f4f6' }}
              >
                <div className="flex items-center gap-2.5">
                  <Calendar size={18} className="text-green-500" />
                  <span
                    className="text-[16px]"
                    style={{ color: isDark ? '#e5e7eb' : '#1f2937' }}
                  >
                    Fälligkeitsdatum
                  </span>
                </div>
                <input
                  type="date"
                  value={dueDateStr}
                  onChange={(e) => setDueDateStr(e.target.value)}
                  className="text-right text-[16px] text-gray-500 dark:text-gray-400 bg-transparent outline-none w-auto flex-1 ml-4 cursor-pointer"
                  style={{ colorScheme: isDark ? 'dark' : 'light' }}
                />
              </div>

              {/* Todo Reminder / Time */}
              <div className="flex justify-between items-center px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  <Clock size={18} className="text-green-500" />
                  <span
                    className="text-[16px]"
                    style={{ color: isDark ? '#e5e7eb' : '#1f2937' }}
                  >
                    Erinnerung
                  </span>
                </div>
                <input
                  type="time"
                  value={dueTimeStr}
                  onChange={(e) => setDueTimeStr(e.target.value)}
                  className="text-right text-[16px] text-gray-500 dark:text-gray-400 bg-transparent outline-none w-auto flex-1 ml-4 cursor-pointer"
                  style={{ colorScheme: isDark ? 'dark' : 'light' }}
                />
              </div>
            </>
          )}
        </div>

        {/* Card 3: Mode-Specific Settings */}
        {mode === 'todo' && (
          <div
            className="rounded-2xl shadow-sm border overflow-hidden flex flex-col"
            style={{
              background: isDark ? '#1a1e28' : '#ffffff',
              borderColor: isDark ? '#262b38' : '#f1f2f5',
            }}
          >
            {/* Priority */}
            <div
              className="flex justify-between items-center px-4 py-3 border-b"
              style={{ borderColor: isDark ? '#262b38' : '#f3f4f6' }}
            >
              <div className="flex items-center gap-2.5">
                <Flag size={18} className="text-green-500" />
                <span
                  className="text-[16px]"
                  style={{ color: isDark ? '#e5e7eb' : '#1f2937' }}
                >
                  Priorität
                </span>
              </div>
              <div
                className="flex items-center gap-1 p-1 rounded-xl"
                style={{ background: isDark ? '#262b38' : '#f3f4f6' }}
              >
                {[
                  { id: 'none' as const, label: 'Keine' },
                  { id: 'low' as const, label: 'Niedrig' },
                  { id: 'medium' as const, label: 'Mittel' },
                  { id: 'high' as const, label: 'Hoch' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPriority(item.id)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      priority === item.id
                        ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div
              className="flex justify-between items-center px-4 py-3.5 border-b"
              style={{ borderColor: isDark ? '#262b38' : '#f3f4f6' }}
            >
              <div className="flex items-center gap-2.5">
                <Tag size={18} className="text-gray-400" />
                <span
                  className="text-[16px]"
                  style={{ color: isDark ? '#e5e7eb' : '#1f2937' }}
                >
                  Tags
                </span>
              </div>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="#Hinzufügen"
                className="text-right text-[16px] text-gray-500 dark:text-gray-400 bg-transparent outline-none w-auto flex-1 ml-4"
              />
            </div>

            {/* Show in Calendar Checkbox */}
            <div className="flex justify-between items-center px-4 py-3.5">
              <span
                className="text-[16px]"
                style={{ color: isDark ? '#e5e7eb' : '#1f2937' }}
              >
                Im Kalender anzeigen
              </span>
              <input
                type="checkbox"
                checked={showInCalendar}
                onChange={(e) => setShowInCalendar(e.target.checked)}
                className="h-5 w-5 accent-blue-600 rounded cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Card 4: Recurrence (Wiederholung) */}
        <div
          className="rounded-2xl shadow-sm border overflow-hidden flex flex-col transition-all duration-300"
          style={{
            background: isDark ? '#1a1e28' : '#ffffff',
            borderColor: isDark ? '#262b38' : '#f1f2f5',
          }}
        >
          <div className="flex justify-between items-center px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <Repeat size={18} className="text-purple-500" />
              <span
                className="text-[16px]"
                style={{ color: isDark ? '#e5e7eb' : '#1f2937' }}
              >
                Wiederholung
              </span>
            </div>
            <select
              value={repeatOption}
              onChange={(e) => setRepeatOption(e.target.value as RecurrenceType)}
              className="text-right text-[16px] text-gray-500 dark:text-gray-400 bg-transparent outline-none cursor-pointer appearance-none pr-1"
            >
              <option value="nie">Nie</option>
              <option value="daily">Täglich</option>
              <option value="weekly">Wöchentlich</option>
              <option value="monthly">Monatlich</option>
              <option value="yearly">Jährlich</option>
            </select>
          </div>

          {/* Dynamic Accordion when Recurrence is active */}
          {repeatOption !== 'nie' && (
            <div
              className="flex flex-col border-t"
              style={{
                borderColor: isDark ? '#262b38' : '#f3f4f6',
                background: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(249, 250, 251, 0.6)',
              }}
            >
              {/* Interval: Alle X Tage/Wochen/... */}
              <div
                className="flex justify-between items-center px-4 py-3.5 border-b"
                style={{ borderColor: isDark ? '#262b38' : '#f3f4f6' }}
              >
                <span
                  className="text-[16px]"
                  style={{ color: isDark ? '#9ca3af' : '#4b5563' }}
                >
                  Intervall
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-sm">alle</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={repeatInterval}
                    onChange={(e) =>
                      setRepeatInterval(Math.max(1, parseInt(e.target.value, 10) || 1))
                    }
                    className="w-14 text-center border rounded-md py-1 text-[16px] outline-none focus:border-blue-400"
                    style={{
                      background: isDark ? '#20242d' : '#ffffff',
                      borderColor: isDark ? '#374151' : '#e5e7eb',
                      color: isDark ? '#ffffff' : '#111827',
                    }}
                  />
                  <span className="text-gray-500 text-sm w-[60px] text-right">
                    {repeatUnitLabel}
                  </span>
                </div>
              </div>

              {/* End Date */}
              <div className="flex justify-between items-center px-4 py-3.5">
                <span
                  className="text-[16px]"
                  style={{ color: isDark ? '#9ca3af' : '#4b5563' }}
                >
                  Endet am
                </span>
                <input
                  type="date"
                  value={repeatEndDate}
                  onChange={(e) => setRepeatEndDate(e.target.value)}
                  className="text-right text-[16px] text-gray-500 dark:text-gray-400 bg-transparent outline-none w-auto flex-1 ml-4 cursor-pointer"
                  style={{ colorScheme: isDark ? 'dark' : 'light' }}
                />
              </div>
            </div>
          )}
        </div>
      </form>
    </motion.div>
  );
};

export default MobileCreateModal;
