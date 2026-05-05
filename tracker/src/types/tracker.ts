export type TrackingType = 'weight_reps' | 'distance_time' | 'time_only'
export type Category = 'strength' | 'cardio' | 'flexibility'

export interface TrackerExercise {
  id: string
  userId: string | null
  name: string
  category: Category
  defaultTrackingType: TrackingType
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

export interface BulkWorkoutPayload {
  id: string
  name: string
  notes?: string
  startedAt: string
  finishedAt: string
  exercises: Array<{
    id: string
    exerciseId: string
    sortOrder: number
    sets: Array<{
      id: string
      sortOrder: number
      reps?: number
      weightKg?: number
      distanceMeters?: number
      durationSeconds?: number
      isWarmup: boolean
      completed: boolean
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
