import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDataStore, TaskItem, DataItem } from '../useDataStore';

// Mock API calls so store actions execute cleanly without network calls
vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
  }),
  getApiBase: vi.fn().mockReturnValue(''),
}));

// Ensure crypto.randomUUID is available in test environment
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as unknown as { crypto: Record<string, unknown> }).crypto = {};
}
if (!globalThis.crypto.randomUUID) {
  let count = 0;
  globalThis.crypto.randomUUID = (() => `test-uuid-${++count}-${Date.now()}`) as () => `${string}-${string}-${string}-${string}-${string}`;
}

describe('useDataStore', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
    useDataStore.setState({
      notes: [],
      events: [],
      tasks: [],
      activeNoteId: null,
      activeParentId: null,
      metadataCache: {},
      publicKey: null,
      privateKey: null,
      myId: null,
    });
  });

  describe('1. Initial Store State', () => {
    it('initializes notes, tasks, and events arrays', () => {
      const state = useDataStore.getState();
      expect(Array.isArray(state.notes)).toBe(true);
      expect(Array.isArray(state.tasks)).toBe(true);
      expect(Array.isArray(state.events)).toBe(true);
    });
  });

  describe('2. Tasks State Mutations', () => {
    it('setTasks: correctly sets the task list', () => {
      const initialTasks: TaskItem[] = [
        { id: 't-1', title: 'Task 1', isCompleted: false, status: 'todo' },
        { id: 't-2', title: 'Task 2', isCompleted: true, status: 'completed' },
      ];

      useDataStore.getState().setTasks(initialTasks);
      const state = useDataStore.getState();

      expect(state.tasks).toEqual(initialTasks);
      expect(state.tasks.length).toBe(2);
    });

    it('addTask: adds a new task with title, isCompleted: false, and generates an ID', async () => {
      const taskId = await useDataStore.getState().addTask({
        title: 'New Integration Test Task',
        isCompleted: false,
      });

      expect(taskId).toBeDefined();
      expect(typeof taskId).toBe('string');
      expect(taskId.length).toBeGreaterThan(0);

      const tasks = useDataStore.getState().tasks;
      const addedTask = tasks.find(t => t.id === taskId);

      expect(addedTask).toBeDefined();
      expect(addedTask?.title).toBe('New Integration Test Task');
      expect(addedTask?.isCompleted).toBe(false);
      expect(addedTask?.status).toBe('todo');
    });

    it('updateTask: updates partial properties of an existing task', async () => {
      const taskId = await useDataStore.getState().addTask({
        title: 'Task Before Update',
        isCompleted: false,
        priority: 'low',
      });

      await useDataStore.getState().updateTask(taskId, {
        title: 'Task After Update',
        priority: 'high',
        description: 'Updated description',
      });

      const updated = useDataStore.getState().tasks.find(t => t.id === taskId);
      expect(updated).toBeDefined();
      expect(updated?.title).toBe('Task After Update');
      expect(updated?.priority).toBe('high');
      expect(updated?.description).toBe('Updated description');
      expect(updated?.isCompleted).toBe(false);
    });

    it('toggleTask: toggles isCompleted from false to true and updates status', async () => {
      const taskId = await useDataStore.getState().addTask({
        title: 'Toggleable Task',
        isCompleted: false,
        status: 'todo',
      });

      // Toggle from false to true
      await useDataStore.getState().toggleTask(taskId);
      let task = useDataStore.getState().tasks.find(t => t.id === taskId);
      expect(task?.isCompleted).toBe(true);
      expect(task?.status).toBe('completed');
      expect(task?.completedAt).toBeDefined();

      // Toggle from true back to false
      await useDataStore.getState().toggleTask(taskId);
      task = useDataStore.getState().tasks.find(t => t.id === taskId);
      expect(task?.isCompleted).toBe(false);
      expect(task?.status).toBe('todo');
    });

    it('deleteTask: removes the task by ID from the tasks array', async () => {
      const task1Id = await useDataStore.getState().addTask({
        title: 'Task 1 to Keep',
        isCompleted: false,
      });
      const task2Id = await useDataStore.getState().addTask({
        title: 'Task 2 to Delete',
        isCompleted: false,
      });

      expect(useDataStore.getState().tasks.some(t => t.id === task2Id)).toBe(true);

      await useDataStore.getState().deleteTask(task2Id);

      const tasksAfterDelete = useDataStore.getState().tasks;
      expect(tasksAfterDelete.some(t => t.id === task2Id)).toBe(false);
      expect(tasksAfterDelete.some(t => t.id === task1Id)).toBe(true);
    });
  });

  describe('3. Notes & Events State Mutations', () => {
    it('setNotes: correctly updates the notes list', () => {
      const initialNotes: DataItem[] = [
        { id: 'note-1', title: 'First Note', type: 'note' },
        { id: 'note-2', title: 'Second Note', type: 'note' },
      ];

      useDataStore.getState().setNotes(initialNotes);
      expect(useDataStore.getState().notes).toEqual(initialNotes);

      const updatedNotes: DataItem[] = [
        { id: 'note-3', title: 'Replacement Note', type: 'canvas' },
      ];
      useDataStore.getState().setNotes(updatedNotes);
      expect(useDataStore.getState().notes).toEqual(updatedNotes);
    });

    it('setActiveNoteId: updates activeNoteId', () => {
      expect(useDataStore.getState().activeNoteId).toBeNull();

      useDataStore.getState().setActiveNoteId('note-abc-123');
      expect(useDataStore.getState().activeNoteId).toBe('note-abc-123');

      useDataStore.getState().setActiveNoteId(null);
      expect(useDataStore.getState().activeNoteId).toBeNull();
    });

    it('setActiveParentId: updates activeParentId', () => {
      expect(useDataStore.getState().activeParentId).toBeNull();

      useDataStore.getState().setActiveParentId('folder-xyz-789');
      expect(useDataStore.getState().activeParentId).toBe('folder-xyz-789');

      useDataStore.getState().setActiveParentId(null);
      expect(useDataStore.getState().activeParentId).toBeNull();
    });

    it('updateFileRaw: updates metadata on a specific file/note', () => {
      const notes: DataItem[] = [
        { id: 'file-1', title: 'Original Doc Title', type: 'note', isLocked: false },
        { id: 'file-2', title: 'Untouched Doc', type: 'note', isLocked: false },
      ];
      useDataStore.getState().setNotes(notes);

      useDataStore.getState().updateFileRaw('file-1', {
        title: 'Updated Doc Title',
        isLocked: true,
        customTag: 'important',
      });

      const updated = useDataStore.getState().notes.find(n => n.id === 'file-1');
      const untouched = useDataStore.getState().notes.find(n => n.id === 'file-2');

      expect(updated?.title).toBe('Updated Doc Title');
      expect(updated?.isLocked).toBe(true);
      expect(updated?.customTag).toBe('important');

      expect(untouched?.title).toBe('Untouched Doc');
      expect(untouched?.isLocked).toBe(false);
    });
  });

  describe('4. Optimistic UI Updates & Immutability', () => {
    it('returns new array references on task mutations without mutating previous state', async () => {
      const initialTask: TaskItem = { id: 'imm-1', title: 'Task Base', isCompleted: false, status: 'todo' };
      useDataStore.getState().setTasks([initialTask]);

      const tasksRefBeforeAdd = useDataStore.getState().tasks;
      const newTaskId = await useDataStore.getState().addTask({
        title: 'Newly Added Task',
        isCompleted: false,
      });
      const tasksRefAfterAdd = useDataStore.getState().tasks;

      // Immutability: array reference changed
      expect(tasksRefAfterAdd).not.toBe(tasksRefBeforeAdd);
      expect(tasksRefBeforeAdd.length).toBe(1);
      expect(tasksRefAfterAdd.length).toBe(2);

      // Immutability on updateTask
      const tasksRefBeforeUpdate = useDataStore.getState().tasks;
      await useDataStore.getState().updateTask(newTaskId, { title: 'Newly Added Task (Renamed)' });
      const tasksRefAfterUpdate = useDataStore.getState().tasks;

      expect(tasksRefAfterUpdate).not.toBe(tasksRefBeforeUpdate);

      // Immutability on deleteTask
      const tasksRefBeforeDelete = useDataStore.getState().tasks;
      await useDataStore.getState().deleteTask(newTaskId);
      const tasksRefAfterDelete = useDataStore.getState().tasks;

      expect(tasksRefAfterDelete).not.toBe(tasksRefBeforeDelete);
      expect(tasksRefAfterDelete.length).toBe(1);
    });

    it('returns new array references on note mutations via updateFileRaw', () => {
      const initialNotes: DataItem[] = [
        { id: 'imm-note-1', title: 'Note 1', type: 'note' },
      ];
      useDataStore.getState().setNotes(initialNotes);

      const notesRefBefore = useDataStore.getState().notes;
      useDataStore.getState().updateFileRaw('imm-note-1', { title: 'Note 1 Modified' });
      const notesRefAfter = useDataStore.getState().notes;

      expect(notesRefAfter).not.toBe(notesRefBefore);
      expect(notesRefBefore[0].title).toBe('Note 1');
      expect(notesRefAfter[0].title).toBe('Note 1 Modified');
    });
  });
});
