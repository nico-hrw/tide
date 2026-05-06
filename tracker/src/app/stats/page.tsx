'use client'
import { useEffect, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useTrackerStore } from '@/store/useTrackerStore'
import {
  buildChartData, calcStreak, workoutsThisWeek,
  calcVolume, calcOneRM, formatPace,
} from '@/lib/analytics'
import type { TrackerWorkout } from '@/types/tracker'

function avgDurationMin(workouts: TrackerWorkout[]): number {
  const finished = workouts.filter((w) => w.finishedAt)
  if (finished.length === 0) return 0
  const total = finished.reduce((sum, w) => {
    return sum + (new Date(w.finishedAt!).getTime() - new Date(w.startedAt).getTime())
  }, 0)
  return Math.round(total / finished.length / 60000)
}

function totalSetsCompleted(workouts: TrackerWorkout[]): number {
  return workouts.flatMap((w) => w.exercises.flatMap((e) => e.sets)).filter((s) => s.completed).length
}

export default function StatsPage() {
  const { workouts, exercises, fetchWorkouts, fetchExercises } = useTrackerStore()

  useEffect(() => {
    fetchWorkouts()
    fetchExercises()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const streak = calcStreak(workouts)
  const thisWeek = workoutsThisWeek(workouts)
  const avgMin = avgDurationMin(workouts)
  const totalSets = totalSetsCompleted(workouts)

  const lastWorkout = workouts[0] ?? null

  // Build per-exercise chart data for all exercises that appear in any workout
  const exercisesInHistory = useMemo(() => {
    const ids = new Set(workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)))
    return exercises.filter((ex) => ids.has(ex.id))
  }, [workouts, exercises])

  return (
    <div className="px-4 pt-12 pb-8">
      <h1 className="text-2xl font-bold mb-6">Statistiken</h1>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-2xl font-bold">{streak} 🔥</div>
          <div className="text-xs text-gray-500 mt-0.5">Tage Streak</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-2xl font-bold">{thisWeek}</div>
          <div className="text-xs text-gray-500 mt-0.5">Workouts diese Woche</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-2xl font-bold">{avgMin > 0 ? `${avgMin} min` : '—'}</div>
          <div className="text-xs text-gray-500 mt-0.5">Ø Dauer</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-2xl font-bold">{totalSets}</div>
          <div className="text-xs text-gray-500 mt-0.5">Sätze gesamt</div>
        </div>
      </div>

      {/* ── Letztes Workout ── */}
      {lastWorkout && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Letztes Workout
          </h2>
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="font-semibold text-black mb-2">{lastWorkout.name}</div>
            {lastWorkout.exercises.map((we) => {
              const completedSets = we.sets.filter((s) => s.completed && !s.isWarmup)
              return (
                <div key={we.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${we.exercise?.category === 'strength' ? 'bg-blue-500' : we.exercise?.category === 'cardio' ? 'bg-green-500' : 'bg-purple-500'}`} />
                    <span className="text-sm text-gray-700">{we.exercise?.name ?? '—'}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {completedSets.length > 0
                      ? completedSets[0].weightKg != null
                        ? `${completedSets.length}×${completedSets[0].reps ?? '?'} @ ${completedSets[0].weightKg}kg`
                        : `${completedSets.length} Sätze`
                      : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Pro-Übung Charts (horizontal scrollable) ── */}
      {exercisesInHistory.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Fortschritt pro Übung
          </h2>
          <div
            className="flex overflow-x-auto gap-4 pb-2 snap-x snap-mandatory"
            style={{ scrollbarWidth: 'none' }}
          >
            {exercisesInHistory.map((ex) => {
              const data = buildChartData(workouts, ex.id, ex.defaultTrackingType)
              if (data.length === 0) return null

              const latestSets = workouts
                .flatMap((w) => w.exercises.filter((e) => e.exerciseId === ex.id).flatMap((e) => e.sets))
                .filter((s) => s.completed && !s.isWarmup)

              const best1RM = ex.defaultTrackingType === 'weight_reps' ? calcOneRM(latestSets) : 0
              const totalVol = ex.defaultTrackingType === 'weight_reps' ? calcVolume(latestSets) : 0

              return (
                <div
                  key={ex.id}
                  className="snap-center shrink-0 bg-white rounded-2xl shadow-sm p-4"
                  style={{ width: 'calc(100vw - 48px)', maxWidth: 382 }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full ${ex.category === 'strength' ? 'bg-blue-500' : ex.category === 'cardio' ? 'bg-green-500' : 'bg-purple-500'}`} />
                    <span className="font-semibold text-sm">{ex.name}</span>
                  </div>

                  {ex.defaultTrackingType === 'weight_reps' && best1RM > 0 && (
                    <div className="flex gap-4 mb-3">
                      <div>
                        <div className="text-lg font-bold">{Math.round(best1RM)} kg</div>
                        <div className="text-xs text-gray-400">1RM (Epley)</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold">{Math.round(totalVol)} kg</div>
                        <div className="text-xs text-gray-400">Gesamtvolumen</div>
                      </div>
                    </div>
                  )}

                  {ex.defaultTrackingType === 'weight_reps' && (
                    <>
                      <p className="text-xs text-gray-400 mb-1">Volumen</p>
                      <ResponsiveContainer width="100%" height={110}>
                        <LineChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d: string) => d.slice(5)} />
                          <YAxis tick={{ fontSize: 9 }} width={35} />
                          <Tooltip formatter={(v: unknown) => [`${Math.round(Number(v))} kg`, 'Vol']} />
                          <Line type="monotone" dataKey="volume" stroke="#3B82F6" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                      <p className="text-xs text-gray-400 mb-1 mt-3">1RM</p>
                      <ResponsiveContainer width="100%" height={110}>
                        <LineChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d: string) => d.slice(5)} />
                          <YAxis tick={{ fontSize: 9 }} width={35} />
                          <Tooltip formatter={(v: unknown) => [`${Math.round(Number(v))} kg`, '1RM']} />
                          <Line type="monotone" dataKey="oneRM" stroke="#8B5CF6" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </>
                  )}

                  {ex.defaultTrackingType === 'distance_time' && (
                    <>
                      <p className="text-xs text-gray-400 mb-1">Pace (min/km)</p>
                      <ResponsiveContainer width="100%" height={110}>
                        <LineChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d: string) => d.slice(5)} />
                          <YAxis tick={{ fontSize: 9 }} width={40} tickFormatter={(v: number) => `${Math.floor(v)}:${Math.round((v % 1) * 60).toString().padStart(2, '0')}`} />
                          <Tooltip formatter={(v: unknown) => [formatPace(Number(v)), 'Pace']} />
                          <Line type="monotone" dataKey="paceMinPerKm" stroke="#22C55E" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                      <p className="text-xs text-gray-400 mb-1 mt-3">Distanz (km)</p>
                      <ResponsiveContainer width="100%" height={110}>
                        <BarChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d: string) => d.slice(5)} />
                          <YAxis tick={{ fontSize: 9 }} width={35} />
                          <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(2)} km`, 'Dist']} />
                          <Bar dataKey="distanceKm" fill="#22C55E" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  )}

                  {ex.defaultTrackingType === 'time_only' && (
                    <>
                      <p className="text-xs text-gray-400 mb-1">Dauer (min)</p>
                      <ResponsiveContainer width="100%" height={110}>
                        <BarChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d: string) => d.slice(5)} />
                          <YAxis tick={{ fontSize: 9 }} width={35} />
                          <Tooltip formatter={(v: unknown) => [`${Math.round(Number(v))} min`, 'Dauer']} />
                          <Bar dataKey="durationMin" fill="#A855F7" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  )}

                  <p className="text-xs text-gray-300 text-center mt-2">← swipen →</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {workouts.length === 0 && (
        <div className="text-center text-gray-400 mt-20">
          <p className="text-4xl mb-4">📊</p>
          <p className="font-medium">Noch keine Daten</p>
          <p className="text-sm mt-1">Beende dein erstes Workout, um Statistiken zu sehen.</p>
        </div>
      )}
    </div>
  )
}
