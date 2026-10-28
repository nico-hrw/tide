import { TaskItem } from '@/store/useDataStore';
import { TaskWithChildren } from './types';

/**
 * Builds a hierarchical tree from a flat list of tasks.
 * Root tasks are tasks where !t.parentId or parentId does not exist in flatTasks.
 * Children are nested under their respective parents in task.children.
 */
export function buildTaskTree(flatTasks: TaskItem[]): TaskWithChildren[] {
  const taskMap = new Map<string, TaskWithChildren>();

  // Clone all tasks and initialize empty children array
  for (const t of flatTasks) {
    taskMap.set(t.id, { ...t, children: [] });
  }

  const roots: TaskWithChildren[] = [];

  for (const t of flatTasks) {
    const item = taskMap.get(t.id)!;
    if (t.parentId && taskMap.has(t.parentId)) {
      const parent = taskMap.get(t.parentId)!;
      parent.children = parent.children || [];
      parent.children.push(item);
    } else {
      roots.push(item);
    }
  }

  // Sort children by order (if set), then completion status
  for (const item of taskMap.values()) {
    if (item.children && item.children.length > 0) {
      item.children.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        if (a.isCompleted !== b.isCompleted) {
          return a.isCompleted ? 1 : -1;
        }
        return 0;
      });
    }
  }

  return roots;
}

/**
 * Finds a task by ID anywhere within a task tree.
 */
export function findTaskInTree(tree: TaskWithChildren[], id: string): TaskWithChildren | null {
  for (const task of tree) {
    if (task.id === id) return task;
    if (task.children && task.children.length > 0) {
      const found = findTaskInTree(task.children, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Counts total and completed subtasks recursively.
 */
export function countAllSubtasks(task: TaskWithChildren): { total: number; completed: number } {
  let total = 0;
  let completed = 0;

  if (!task.children || task.children.length === 0) {
    return { total, completed };
  }

  for (const child of task.children) {
    total += 1;
    if (child.isCompleted) completed += 1;
    const sub = countAllSubtasks(child);
    total += sub.total;
    completed += sub.completed;
  }

  return { total, completed };
}
