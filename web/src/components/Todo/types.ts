import { Clock, Calendar, History } from 'lucide-react';
import {
  format,
  isToday,
  isTomorrow,
  isBefore,
  startOfDay,
  parseISO,
} from 'date-fns';
import { TaskItem } from '@/store/useDataStore';

export type Priority = 'low' | 'medium' | 'high';
export type FilterStatus = 'all' | 'active' | 'in_progress' | 'completed' | 'archived';
export type SortOption = 'created' | 'deadline' | 'priority' | 'tag' | 'title';
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type ArchiveTier = 'week' | 'month' | 'year';

export interface TodoListProps {
  className?: string;
  onSelectTask?: (task: TaskItem) => void;
}

export interface TaskEditDraft {
  title: string;
  description: string;
  priority: Priority;
  status: 'todo' | 'in_progress' | 'completed';
  dueDate: string;
  recurrence: RecurrenceType;
  recurrenceEnd: string;
  folder: string;
  tags: string[];
  showInCalendar: boolean;
  color?: string;
}

export interface TaskWithChildren extends TaskItem {
  children?: TaskWithChildren[];
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#3b82f6',
};

export const PRIORITY_CONFIG: Record<Priority, { label: string; bg: string; text: string; border: string; dot: string }> = {
  high: { label: 'Hoch', bg: 'bg-rose-500/10 dark:bg-rose-500/20', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/30', dot: 'bg-rose-500' },
  medium: { label: 'Mittel', bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  low: { label: 'Niedrig', bg: 'bg-emerald-500/10 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-500' },
};

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'low', label: '🟢 Niedrig' },
  { value: 'medium', label: '🟡 Mittel' },
  { value: 'high', label: '🔴 Hoch' },
];

export const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: 'none', label: 'Keine' },
  { value: 'daily', label: 'Täglich' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'monthly', label: 'Monatlich' },
  { value: 'yearly', label: 'Jährlich' },
];

export const PRIORITY_WEIGHT: Record<Priority, number> = { high: 3, medium: 2, low: 1 };

export function getTaskPriority(task: TaskItem): Priority {
  if (task.priority) return task.priority;
  if (task.color === 'high' || task.color === 'rose' || task.color === 'red' || task.color === '#ef4444') return 'high';
  if (task.color === 'low' || task.color === 'emerald' || task.color === 'green' || task.color === '#3b82f6') return 'low';
  return 'medium';
}

export function getPriorityColor(priority: Priority, explicitColor?: string): string {
  if (explicitColor && explicitColor !== 'low' && explicitColor !== 'medium' && explicitColor !== 'high') {
    return explicitColor;
  }
  return PRIORITY_COLORS[priority] || '#f59e0b';
}

export function buildRecurrenceRule(recurrence: RecurrenceType): string | undefined {
  return recurrence === 'none' ? undefined : `FREQ=${recurrence.toUpperCase()};INTERVAL=1`;
}

export function parseDateSafe(dateStr?: string): Date | null {
  if (!dateStr) return null;
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    const parsed = parseISO(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

export function getDeadlineInfo(dateStr?: string): { status: 'overdue' | 'today' | 'tomorrow' | 'upcoming'; label: string } | null {
  const d = parseDateSafe(dateStr);
  if (!d) return null;
  const today = startOfDay(new Date());
  if (isBefore(startOfDay(d), today)) return { status: 'overdue', label: `Überfällig (${format(d, 'dd.MM.')})` };
  if (isToday(d)) return { status: 'today', label: 'Heute fällig' };
  if (isTomorrow(d)) return { status: 'tomorrow', label: 'Morgen fällig' };
  return { status: 'upcoming', label: `Fällig ${format(d, 'dd.MM.yyyy')}` };
}

export function getDeadlineChipClasses(status: string, isCompleted: boolean): string {
  if (isCompleted) return 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/5';
  if (status === 'overdue') return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
  if (status === 'today') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
  if (status === 'tomorrow') return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
  return 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/10';
}

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
export const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function getTaskCompletionTime(task: TaskItem): number | null {
  if (task.completedAt) {
    const t = new Date(task.completedAt).getTime();
    if (!isNaN(t)) return t;
  }
  const fallbackStr = task.dueDate || task.scheduledDate;
  if (fallbackStr) {
    const d = parseDateSafe(fallbackStr);
    if (d && !isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

export function isTaskArchived(task: TaskItem): boolean {
  if (task.isArchived) return true;
  if (!task.isCompleted) return false;
  const time = getTaskCompletionTime(task);
  if (time !== null) {
    return Date.now() - time > SEVEN_DAYS_MS;
  }
  return false;
}

export function getTaskArchiveTier(task: TaskItem): ArchiveTier {
  const time = getTaskCompletionTime(task);
  if (time !== null) {
    const diff = Date.now() - time;
    if (diff > ONE_YEAR_MS) return 'year';
    if (diff > THIRTY_DAYS_MS) return 'month';
    return 'week';
  }
  return 'week';
}

export const ARCHIVE_TIER_CONFIG = [
  {
    key: 'week' as const,
    label: '> 1 Woche',
    sublabel: '7 – 30 Tage',
    icon: Clock,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10 dark:bg-blue-500/20',
  },
  {
    key: 'month' as const,
    label: '> 1 Monat',
    sublabel: '1 – 12 Monate',
    icon: Calendar,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10 dark:bg-amber-500/20',
  },
  {
    key: 'year' as const,
    label: '> 1 Jahr',
    sublabel: 'Älter als 1 Jahr',
    icon: History,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10 dark:bg-purple-500/20',
  },
];
