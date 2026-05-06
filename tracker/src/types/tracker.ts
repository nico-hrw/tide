export type TrackingType = 'weight_reps' | 'distance_time' | 'time_only'
export type Category = 'strength' | 'cardio' | 'flexibility'

export interface TrackerExercise {
  id: string
  userId: string | null
  name: string
  category: Category
  defaultTrackingType: TrackingType
  muscles: string
  createdAt: string
}

export interface TrackerSet {
  id: string
  sortOrder: number
  reps?: number
  weightKg?: number
  distanceMeters?: number
  durationSeconds?: number
  isWarmup: boolean
  completed: boolean
  rir?: number
  rpe?: number
}

export interface TrackerWorkoutExercise {
  id: string
  exerciseId: string
  exercise?: TrackerExercise
  sortOrder: number
  sets: TrackerSet[]
}

export interface TrackerWorkout {
  id: string
  name: string
  notes?: string
  startedAt: string
  finishedAt?: string
  exercises: TrackerWorkoutExercise[]
}

export interface ActiveWorkout {
  id: string
  name: string
  startedAt: string
  exercises: ActiveWorkoutExercise[]
}

export interface ActiveWorkoutExercise {
  id: string
  exercise: TrackerExercise
  sortOrder: number
  sets: TrackerSet[]
}

// Wire format — snake_case to match Go JSON tags exactly
export interface BulkWorkoutPayload {
  id: string
  name: string
  notes?: string
  started_at: string
  finished_at: string
  exercises: Array<{
    id: string
    exercise_id: string
    sort_order: number
    sets: Array<{
      id: string
      sort_order: number
      reps?: number
      weight_kg?: number
      distance_meters?: number
      duration_seconds?: number
      is_warmup: boolean
      completed: boolean
      rir?: number
      rpe?: number
    }>
  }>
}

export interface SyncQueueEntry {
  id: string
  workout: BulkWorkoutPayload
  status: 'pending' | 'failed'
  attempts: number
  lastError?: string
  createdAt: string
}
