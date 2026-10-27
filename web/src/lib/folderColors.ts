export interface FolderColorDef {
  id: string;
  name: string;
  hex: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

export const FOLDER_PALETTE: readonly FolderColorDef[] = [
  { id: 'slate', name: 'Schiefer', hex: '#64748b', bgClass: 'bg-slate-500/10', textClass: 'text-slate-500', borderClass: 'border-slate-500/30' },
  { id: 'blue', name: 'Blau', hex: '#3b82f6', bgClass: 'bg-blue-500/10', textClass: 'text-blue-500', borderClass: 'border-blue-500/30' },
  { id: 'emerald', name: 'Smaragd', hex: '#10b981', bgClass: 'bg-emerald-500/10', textClass: 'text-emerald-500', borderClass: 'border-emerald-500/30' },
  { id: 'amber', name: 'Bernstein', hex: '#f59e0b', bgClass: 'bg-amber-500/10', textClass: 'text-amber-500', borderClass: 'border-amber-500/30' },
  { id: 'rose', name: 'Rose', hex: '#f43f5e', bgClass: 'bg-rose-500/10', textClass: 'text-rose-500', borderClass: 'border-rose-500/30' },
  { id: 'violet', name: 'Violett', hex: '#8b5cf6', bgClass: 'bg-violet-500/10', textClass: 'text-violet-500', borderClass: 'border-violet-500/30' },
  { id: 'cyan', name: 'Türkis', hex: '#06b6d4', bgClass: 'bg-cyan-500/10', textClass: 'text-cyan-500', borderClass: 'border-cyan-500/30' },
  { id: 'orange', name: 'Orange', hex: '#f97316', bgClass: 'bg-orange-500/10', textClass: 'text-orange-500', borderClass: 'border-orange-500/30' },
  { id: 'indigo', name: 'Indigo', hex: '#6366f1', bgClass: 'bg-indigo-500/10', textClass: 'text-indigo-500', borderClass: 'border-indigo-500/30' },
] as const;

export interface TodoFolderMeta {
  id: string;
  name: string;
  color?: string;
  showInCalendar?: boolean;
}

const DEFAULT_COLOR: FolderColorDef = FOLDER_PALETTE[0];

export function getFolderColor(colorIdOrHex?: string): FolderColorDef {
  if (!colorIdOrHex) return DEFAULT_COLOR;
  const match = FOLDER_PALETTE.find(
    (c) => c.id.toLowerCase() === colorIdOrHex.toLowerCase() || c.hex.toLowerCase() === colorIdOrHex.toLowerCase()
  );
  if (match) return match;
  return {
    id: colorIdOrHex,
    name: colorIdOrHex,
    hex: colorIdOrHex,
    bgClass: 'bg-primary/10',
    textClass: 'text-primary',
    borderClass: 'border-primary/30',
  };
}

export function loadTodoFoldersMeta(): Record<string, TodoFolderMeta> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('tide_todo_folders_meta');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, TodoFolderMeta>;
      }
    }

    // Fallback: migrate or read from 'tide_todo_folders'
    const legacyRaw = localStorage.getItem('tide_todo_folders');
    if (legacyRaw) {
      const parsedLegacy = JSON.parse(legacyRaw);
      const result: Record<string, TodoFolderMeta> = {};
      if (Array.isArray(parsedLegacy)) {
        parsedLegacy.forEach((item, index) => {
          if (typeof item === 'string') {
            result[item] = {
              id: item,
              name: item,
              color: FOLDER_PALETTE[index % FOLDER_PALETTE.length]?.id,
              showInCalendar: true,
            };
          } else if (item && typeof item === 'object' && 'name' in item) {
            const folderObj = item as Partial<TodoFolderMeta>;
            const key = folderObj.id || folderObj.name || String(index);
            result[key] = {
              id: key,
              name: folderObj.name || key,
              color: folderObj.color || FOLDER_PALETTE[index % FOLDER_PALETTE.length]?.id,
              showInCalendar: folderObj.showInCalendar !== false,
            };
          }
        });
        return result;
      }
    }
  } catch (e) {
    console.error('Failed to load todo folders metadata', e);
  }
  return {};
}

export function saveTodoFoldersMeta(meta: Record<string, TodoFolderMeta>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('tide_todo_folders_meta', JSON.stringify(meta));
  } catch (e) {
    console.error('Failed to save todo folders metadata', e);
  }
}

export function isTaskVisibleInCalendar(
  task: { showInCalendar?: boolean; folder?: string },
  foldersMeta?: Record<string, TodoFolderMeta>
): boolean {
  if (task.showInCalendar !== undefined) {
    return task.showInCalendar;
  }
  if (task.folder && foldersMeta && foldersMeta[task.folder]) {
    return foldersMeta[task.folder].showInCalendar !== false;
  }
  return true;
}
