'use client';

import React, { useState } from 'react';
import { format, isToday, isBefore, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { TaskItem } from '@/store/useDataStore';
import { TaskWithChildren, getTaskPriority, parseDateSafe } from './types';
import { TodoCheckbox, TodoPriorityIcon } from './TodoCardParts';

/** Dauer des Ausblendens eines abgehakten Untertodos, bevor das nächste nachrückt. */
const LEAVE_MS = 420;
const PEEK_COUNT = 3;

export interface TodoCardProps {
  task: TaskWithChildren;
  isSelected: boolean;
  isExpanded: boolean;
  isCompleting: boolean;
  onActivate: (task: TaskWithChildren) => void;
  onToggleTask: (task: TaskItem) => void;
  onToggleSubtask: (id: string) => void;
}

export const TodoCard: React.FC<TodoCardProps> = ({
  task, isSelected, isExpanded, isCompleting, onActivate, onToggleTask, onToggleSubtask,
}) => {
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const subs = task.children || [];
  const due = parseDateSafe(task.dueDate || task.scheduledDate);
  const today = due ? isToday(due) : false;
  const overdue = due && !task.isCompleted && !today ? isBefore(startOfDay(due), startOfDay(new Date())) : false;
  const priority = getTaskPriority(task);
  const dark = today && !task.isCompleted;

  const openSubs = subs.filter((s) => !s.isCompleted || leaving.has(s.id));
  const openCount = subs.filter((s) => !s.isCompleted).length;
  const shown = isExpanded ? subs : openSubs.slice(0, PEEK_COUNT);
  const hiddenCount = Math.max(0, openCount - PEEK_COUNT);

  const tickSub = (e: React.MouseEvent, sub: TaskItem) => {
    e.stopPropagation();
    if (sub.isCompleted) {
      onToggleSubtask(sub.id);
      return;
    }
    if (leaving.has(sub.id)) return;
    setLeaving((prev) => new Set(prev).add(sub.id));
    setTimeout(() => {
      onToggleSubtask(sub.id);
      setLeaving((prev) => {
        const next = new Set(prev);
        next.delete(sub.id);
        return next;
      });
    }, LEAVE_MS);
  };

  const surface = dark
    ? 'bg-cal-praktikum text-white'
    : 'bg-[color-mix(in_srgb,#5C6E6C_8%,var(--t2-bg))] text-t2-ink';
  const ring = isSelected ? (dark ? 'ring-1 ring-white/40' : 'ring-1 ring-[color-mix(in_srgb,var(--t2-ink)_20%,transparent)]') : '';
  const muted = dark ? 'text-white/70' : 'text-t2-ink-3';

  return (
    <div
      role="button"
      tabIndex={0}
      data-task-id={task.id}
      onClick={() => onActivate(task)}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onActivate(task); }}
      className={`flex items-start gap-3 py-3.5 pr-3.5 pl-1.5 rounded-[14px] cursor-pointer transition-[box-shadow,opacity] hover:ring-1 hover:ring-[color-mix(in_srgb,var(--t2-ink)_15%,transparent)] ${surface} ${ring} ${isCompleting ? 'opacity-50' : ''}`}
    >
      <div className={`w-[54px] shrink-0 text-center leading-[1.15] pt-px ${muted}`}>
        {due && (today ? (
          <b className="block text-[15px] font-bold">Heute</b>
        ) : (
          <>
            <b className="block text-[15px] font-bold text-t2-ink">{format(due, 'd', { locale: de })}.</b>
            <small className="text-[11px] font-semibold tracking-wide uppercase text-t2-ink-2">{format(due, 'MMM', { locale: de })}</small>
          </>
        ))}
      </div>
      <div className="mt-px">
        <TodoCheckbox
          checked={task.isCompleted}
          onDark={dark}
          label={`${task.title} abhaken`}
          onClick={(e) => { e.stopPropagation(); onToggleTask(task); }}
        />
      </div>
      <span className="w-[18px] h-5 grid place-items-center shrink-0">
        <TodoPriorityIcon priority={priority} size={16} onDark={dark} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <b className={`flex-1 min-w-0 block text-[15px] font-medium leading-5 ${task.isCompleted ? 'line-through opacity-60' : ''}`}>{task.title}</b>
          {overdue && (
            <span className="shrink-0 rounded-full bg-t2-late px-2 py-0.5 text-[11px] font-bold text-white">Überfällig</span>
          )}
        </div>
        {subs.length > 0 && (
          <div className="mt-2.5 flex flex-col gap-[7px]">
            {shown.map((s) => {
              const gone = leaving.has(s.id) || s.isCompleted;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-[9px] text-[13px] transition-all duration-300 ${dark ? 'text-white/70' : 'text-t2-ink-2'} ${
                    gone ? 'opacity-35 line-through translate-x-1.5' : ''
                  }`}
                >
                  <TodoCheckbox checked={gone} size={15} onDark={dark} label={`${s.title} abhaken`} onClick={(e) => tickSub(e, s)} />
                  <span className="truncate">{s.title}</span>
                </div>
              );
            })}
            {!isExpanded && hiddenCount > 0 && <div className={`text-xs pl-6 ${muted}`}>+ {hiddenCount} weitere</div>}
            {openCount === 0 && !isExpanded && <div className={`text-xs pl-6 ${muted}`}>Alle Untertodos erledigt</div>}
          </div>
        )}
      </div>
    </div>
  );
};

export default TodoCard;
