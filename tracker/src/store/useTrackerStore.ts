'use client'
import { create } from 'zustand'
import * as idb from '@/lib/db'
import { triggerSync as runSync } from '@/lib/sync'
import { apiFetch } from '@/lib/api'
import type {
  TrackerExercise,
  TrackerWorkout,
  ActiveWorkout,
  ActiveWorkoutExercise,
  TrackerSet,
  SyncQueueEntry,
  BulkWorkoutPayload,
  MuscleId,
} from '@/types/tracker'

interface TrackerState {
  exercises: TrackerExercise[]
  activeWorkout: ActiveWorkout | null
  workouts: TrackerWorkout[]
  syncQueue: SyncQueueEntry[]
  syncStatus: 'idle' | 'syncing' | 'error'

  loadFromDB: () => Promise<void>
  fetchExercises: () => Promise<void>
  createExercise: (name: string, category: string, defaultTrackingType: string, muscles?: string) => Promise<void>
  startWorkout: (name: string, targetMuscles?: MuscleId[]) => Promise<void>
  addExerciseToWorkout: (exercise: TrackerExercise) => Promise<ActiveWorkoutExercise | undefined>
  removeExerciseFromWorkout: (workoutExerciseId: string) => Promise<void>
  addSet: (workoutExerciseId: string, setData: Partial<TrackerSet>) => Promise<void>
  updateSet: (workoutExerciseId: string, setId: string, updates: Partial<TrackerSet>) => Promise<void>
  removeSet: (workoutExerciseId: string, setId: string) => Promise<void>
  finishWorkout: () => Promise<void>
  cancelWorkout: () => Promise<void>
  fetchWorkouts: () => Promise<void>
  deleteExercise: (id: string) => Promise<void>
  deleteWorkout: (id: string) => Promise<void>
  refreshSyncQueue: () => Promise<void>
  triggerSync: () => Promise<void>
  exportQueue: () => void
  importQueue: (file: File) => Promise<void>
}

function uid(): string {
  return crypto.randomUUID()
}

export const useTrackerStore = create<TrackerState>((set, get) => ({
  exercises: [],
  activeWorkout: null,
  workouts: [],
  syncQueue: [],
  syncStatus: 'idle',

  loadFromDB: async () => {
    const [active, queue] = await Promise.all([idb.getActiveWorkout(), idb.getSyncQueue()])
    set({ activeWorkout: active ?? null, syncQueue: queue })
  },

  fetchExercises: async () => {
    const res = await apiFetch('/tracker/exercises')
    if (!res.ok) return
    const data: Array<{
      id: string
      user_id: string | null
      name: string
      category: string
      default_tracking_type: string
      muscles?: string
      created_at: string
    }> = await res.json()
    const exercises: TrackerExercise[] = data.map((e) => ({
      id: e.id,
      userId: e.user_id,
      name: e.name,
      category: e.category as TrackerExercise['category'],
      defaultTrackingType: e.default_tracking_type as TrackerExercise['defaultTrackingType'],
      muscles: e.muscles ?? '',
      createdAt: e.created_at,
    }))
    set({ exercises })
  },

  createExercise: async (name, category, defaultTrackingType, muscles = '') => {
    const res = await apiFetch('/tracker/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, default_tracking_type: defaultTrackingType, muscles }),
    })
    if (!res.ok) throw new Error('Failed to create exercise')
    await get().fetchExercises()
  },

  startWorkout: async (name, targetMuscles = []) => {
    const workout: ActiveWorkout = {
      id: uid(),
      name,
      startedAt: new Date().toISOString(),
      exercises: [],
      targetMuscles,
    }
    await idb.saveActiveWorkout(workout)
    set({ activeWorkout: workout })
  },

  addExerciseToWorkout: async (exercise) => {
    const { activeWorkout } = get()
    if (!activeWorkout) return undefined
    const we: ActiveWorkoutExercise = {
      id: uid(),
      exercise,
      sortOrder: activeWorkout.exercises.length,
      sets: [],
    }
    const updated = { ...activeWorkout, exercises: [...activeWorkout.exercises, we] }
    await idb.saveActiveWorkout(updated)
    set({ activeWorkout: updated })
    return we
  },

  removeExerciseFromWorkout: async (workoutExerciseId) => {
    const { activeWorkout } = get()
    if (!activeWorkout) return
    const updated = {
      ...activeWorkout,
      exercises: activeWorkout.exercises.filter((we) => we.id !== workoutExerciseId),
    }
    await idb.saveActiveWorkout(updated)
    set({ activeWorkout: updated })
  },

  addSet: async (workoutExerciseId, setData) => {
    const { activeWorkout } = get()
    if (!activeWorkout) return
    const updated = {
      ...activeWorkout,
      exercises: activeWorkout.exercises.map((we) => {
        if (we.id !== workoutExerciseId) return we
        const newSet: TrackerSet = {
          id: uid(),
          sortOrder: we.sets.length,
          isWarmup: false,
          completed: false,
          ...setData,
        }
        return { ...we, sets: [...we.sets, newSet] }
      }),
    }
    await idb.saveActiveWorkout(updated)
    set({ activeWorkout: updated })
  },

  updateSet: async (workoutExerciseId, setId, updates) => {
    const { activeWorkout } = get()
    if (!activeWorkout) return
    const updated = {
      ...activeWorkout,
      exercises: activeWorkout.exercises.map((we) => {
        if (we.id !== workoutExerciseId) return we
        return {
          ...we,
          sets: we.sets.map((s) => (s.id === setId ? { ...s, ...updates } : s)),
        }
      }),
    }
    await idb.saveActiveWorkout(updated)
    set({ activeWorkout: updated })
  },

  removeSet: async (workoutExerciseId, setId) => {
    const { activeWorkout } = get()
    if (!activeWorkout) return
    const updated = {
      ...activeWorkout,
      exercises: activeWorkout.exercises.map((we) => {
        if (we.id !== workoutExerciseId) return we
        return { ...we, sets: we.sets.filter((s) => s.id !== setId) }
      }),
    }
    await idb.saveActiveWorkout(updated)
    set({ activeWorkout: updated })
  },

  finishWorkout: async () => {
    const { activeWorkout } = get()
    if (!activeWorkout) return

    const payload: BulkWorkoutPayload = {
      id: activeWorkout.id,
      name: activeWorkout.name,
      started_at: activeWorkout.startedAt,
      finished_at: new Date().toISOString(),
      exercises: activeWorkout.exercises.map((we, eIdx) => ({
        id: we.id,
        exercise_id: we.exercise.id,
        sort_order: eIdx,
        sets: we.sets.map((s, sIdx) => ({
          id: s.id,
          sort_order: sIdx,
          reps: s.reps,
          weight_kg: s.weightKg,
          distance_meters: s.distanceMeters,
          duration_seconds: s.durationSeconds,
          is_warmup: s.isWarmup,
          completed: s.completed,
          rir: s.rir,
          rpe: s.rpe,
        })),
      })),
    }

    const entry: SyncQueueEntry = {
      id: activeWorkout.id,
      workout: payload,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
    }

    await Promise.all([idb.addToSyncQueue(entry), idb.clearActiveWorkout()])
    const queue = await idb.getSyncQueue()
    set({ activeWorkout: null, syncQueue: queue })
    get().triggerSync()
  },

  cancelWorkout: async () => {
    await idb.clearActiveWorkout()
    set({ activeWorkout: null })
  },

  fetchWorkouts: async () => {
    const res = await apiFetch('/tracker/workouts')
    if (!res.ok) return
    // API returns snake_case — map to camelCase TypeScript types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = await res.json()
    const workouts: TrackerWorkout[] = raw.map((w) => ({
      id: w.id,
      name: w.name,
      notes: w.notes,
      startedAt: w.started_at,
      finishedAt: w.finished_at,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exercises: (w.exercises ?? []).map((we: any) => ({
        id: we.id,
        exerciseId: we.exercise_id,
        sortOrder: we.sort_order,
        exercise: we.exercise
          ? {
              id: we.exercise.id,
              userId: we.exercise.user_id,
              name: we.exercise.name,
              category: we.exercise.category,
              defaultTrackingType: we.exercise.default_tracking_type,
              muscles: we.exercise.muscles ?? '',
              createdAt: we.exercise.created_at,
            }
          : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sets: (we.sets ?? []).map((s: any) => ({
          id: s.id,
          sortOrder: s.sort_order,
          reps: s.reps,
          weightKg: s.weight_kg,
          distanceMeters: s.distance_meters,
          durationSeconds: s.duration_seconds,
          isWarmup: s.is_warmup,
          completed: s.completed,
          rir: s.rir,
          rpe: s.rpe,
        })),
      })),
    }))
    set({ workouts })
  },

  deleteExercise: async (id) => {
    await apiFetch(`/tracker/exercises/${id}`, { method: 'DELETE' })
    await get().fetchExercises()
  },

  deleteWorkout: async (id) => {
    await apiFetch(`/tracker/workouts/${id}`, { method: 'DELETE' })
    set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id) }))
  },

  refreshSyncQueue: async () => {
    const queue = await idb.getSyncQueue()
    set({ syncQueue: queue })
  },

  triggerSync: async () => {
    set({ syncStatus: 'syncing' })
    await runSync()
    const queue = await idb.getSyncQueue()
    set({
      syncQueue: queue,
      syncStatus: queue.some((e) => e.status === 'failed') ? 'error' : 'idle',
    })
  },

  exportQueue: () => {
    const { syncQueue } = get()
    const data = syncQueue.map((e) => e.workout)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tracker-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  },

  importQueue: async (file) => {
    const text = await file.text()
    const payloads: BulkWorkoutPayload[] = JSON.parse(text)
    const entries: SyncQueueEntry[] = payloads.map((p) => ({
      id: p.id,
      workout: p,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
    }))
    await Promise.all(entries.map(idb.addToSyncQueue))
    get().triggerSync()
  },
}))
