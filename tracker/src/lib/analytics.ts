import type { TrackerSet, TrackerWorkout, TrackingType } from '@/types/tracker'

export function calcVolume(sets: TrackerSet[]): number {
  return sets
    .filter((s) => s.completed && !s.isWarmup)
    .reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0)
}

export function calcOneRM(sets: TrackerSet[]): number {
  const values = sets
    .filter((s) => s.completed && !s.isWarmup && s.weightKg && s.reps && s.reps > 0)
    .map((s) => s.weightKg! * (1 + s.reps! / 30))
  return values.length > 0 ? Math.max(...values) : 0
}

export function calcPaceMinPerKm(durationSeconds: number, distanceMeters: number): number {
  if (distanceMeters === 0) return 0
  return durationSeconds / 60 / (distanceMeters / 1000)
}

export function formatPace(minPerKm: number): string {
  if (minPerKm === 0) return '—'
  const mins = Math.floor(minPerKm)
  const secs = Math.round((minPerKm - mins) * 60)
  return `${mins}:${secs.toString().padStart(2, '0')} /km`
}

export interface WorkoutDataPoint {
  date: string
  volume?: number
  oneRM?: number
  paceMinPerKm?: number
  distanceKm?: number
  durationMin?: number
}

export function buildChartData(
  workouts: TrackerWorkout[],
  exerciseId: string,
  trackingType: TrackingType
): WorkoutDataPoint[] {
  return workouts
    .filter((w) => w.finishedAt)
    .flatMap((w) => {
      const we = w.exercises.find((e) => e.exerciseId === exerciseId)
      if (!we) return []
      const sets = we.sets

      const point: WorkoutDataPoint = { date: w.startedAt.slice(0, 10) }

      if (trackingType === 'weight_reps') {
        point.volume = calcVolume(sets)
        point.oneRM = calcOneRM(sets)
      } else if (trackingType === 'distance_time') {
        const totalDist = sets
          .filter((s) => s.completed)
          .reduce((sum, s) => sum + (s.distanceMeters ?? 0), 0)
        const totalDur = sets
          .filter((s) => s.completed)
          .reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0)
        point.distanceKm = totalDist / 1000
        point.paceMinPerKm = calcPaceMinPerKm(totalDur, totalDist)
      } else {
        const totalDur = sets
          .filter((s) => s.completed)
          .reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0)
        point.durationMin = totalDur / 60
      }

      return [point]
    })
    .reverse()
}

export function calcStreak(workouts: TrackerWorkout[]): number {
  const days = new Set(
    workouts.filter((w) => w.finishedAt).map((w) => w.startedAt.slice(0, 10))
  )
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    if (days.has(key)) {
      streak++
    } else if (i > 0) {
      break
    }
  }
  return streak
}

export function workoutsThisWeek(workouts: TrackerWorkout[]): number {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return workouts.filter((w) => w.finishedAt && new Date(w.startedAt) >= monday).length
}

export function volumeThisWeek(workouts: TrackerWorkout[]): number {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return workouts
    .filter((w) => w.finishedAt && new Date(w.startedAt) >= monday)
    .flatMap((w) => w.exercises.flatMap((e) => e.sets))
    .filter((s) => s.completed && !s.isWarmup)
    .reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0)
}
