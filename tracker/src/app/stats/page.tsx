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
  if (!finished.length) return 0
  const total = finished.reduce((sum, w) => sum + (new Date(w.finishedAt!).getTime() - new Date(w.startedAt).getTime()), 0)
  return Math.round(total / finished.length / 60000)
}

function totalSetsCompleted(workouts: TrackerWorkout[]): number {
  return workouts.flatMap((w) => w.exercises.flatMap((e) => e.sets)).filter((s) => s.completed).length
}

const TOOLTIP_STYLE = {
  contentStyle: { background: '#27272F', border: '1px solid #374151', borderRadius: 8, color: '#F9FAFB', fontSize: 11 },
  labelStyle: { color: '#9CA3AF' },
  cursor: { stroke: '#374151' },
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

  const exercisesInHistory = useMemo(() => {
    const ids = new Set(workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)))
    return exercises.filter((ex) => ids.has(ex.id))
  }, [workouts, exercises])

  const statCards = [
    { label: 'Tage Streak', value: streak, accent: '#FF6B3D' },
    { label: 'Workouts / Woche', value: thisWeek, accent: '#5BB8FF' },
    { label: 'Ø Dauer', value: avgMin > 0 ? `${avgMin} min` : '—', accent: null },
    { label: 'Sätze gesamt', value: totalSets, accent: null },
  ]

  return (
    <div style={{ padding: '20px 16px 32px' }}>
      <h1 style={{ color: '#F9FAFB', fontSize: 24, fontWeight: 900, marginBottom: 20 }}>Statistiken</h1>

      {/* Summary grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        {statCards.map(({ label, value, accent }) => (
          <div key={label} style={{ background: '#27272F', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: accent ?? '#F9FAFB', marginBottom: 2 }}>{value}</div>
            <div style={{ fontSize: 10, color: '#6B7280' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Per-exercise charts */}
      {exercisesInHistory.length > 0 && (
        <div>
          <h2 style={{ color: '#6B7280', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            Fortschritt pro Übung
          </h2>
          <div style={{ display: 'flex', overflowX: 'auto', gap: 12, paddingBottom: 8, scrollbarWidth: 'none' }}>
            {exercisesInHistory.map((ex) => {
              const data = buildChartData(workouts, ex.id, ex.defaultTrackingType)
              if (!data.length) return null

              const latestSets = workouts
                .flatMap((w) => w.exercises.filter((e) => e.exerciseId === ex.id).flatMap((e) => e.sets))
                .filter((s) => s.completed && !s.isWarmup)

              const best1RM = ex.defaultTrackingType === 'weight_reps' ? calcOneRM(latestSets) : 0
              const totalVol = ex.defaultTrackingType === 'weight_reps' ? calcVolume(latestSets) : 0

              const dotColor = ex.category === 'strength' ? '#5BB8FF' : ex.category === 'cardio' ? '#4ADE80' : '#A855F7'

              return (
                <div
                  key={ex.id}
                  style={{ flexShrink: 0, background: '#27272F', borderRadius: 14, padding: '14px 16px', width: 'calc(100vw - 48px)', maxWidth: 382, scrollSnapAlign: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor }} />
                    <span style={{ color: '#F9FAFB', fontSize: 13, fontWeight: 700 }}>{ex.name}</span>
                  </div>

                  {ex.defaultTrackingType === 'weight_reps' && best1RM > 0 && (
                    <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
                      <div>
                        <div style={{ color: '#FF6B3D', fontSize: 18, fontWeight: 800 }}>{Math.round(best1RM)} kg</div>
                        <div style={{ color: '#6B7280', fontSize: 10 }}>1RM (Epley)</div>
                      </div>
                      <div>
                        <div style={{ color: '#5BB8FF', fontSize: 18, fontWeight: 800 }}>{Math.round(totalVol)} kg</div>
                        <div style={{ color: '#6B7280', fontSize: 10 }}>Gesamtvolumen</div>
                      </div>
                    </div>
                  )}

                  {ex.defaultTrackingType === 'weight_reps' && (
                    <>
                      <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4 }}>Volumen</p>
                      <ResponsiveContainer width="100%" height={100}>
                        <LineChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2E2E38" />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6B7280' }} tickFormatter={(d: string) => d.slice(5)} />
                          <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} width={35} />
                          <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => [`${Math.round(Number(v))} kg`, 'Vol']} />
                          <Line type="monotone" dataKey="volume" stroke="#FF6B3D" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                      <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4, marginTop: 12 }}>1RM</p>
                      <ResponsiveContainer width="100%" height={100}>
                        <LineChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2E2E38" />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6B7280' }} tickFormatter={(d: string) => d.slice(5)} />
                          <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} width={35} />
                          <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => [`${Math.round(Number(v))} kg`, '1RM']} />
                          <Line type="monotone" dataKey="oneRM" stroke="#5BB8FF" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </>
                  )}

                  {ex.defaultTrackingType === 'distance_time' && (
                    <>
                      <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4 }}>Pace (min/km)</p>
                      <ResponsiveContainer width="100%" height={100}>
                        <LineChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2E2E38" />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6B7280' }} tickFormatter={(d: string) => d.slice(5)} />
                          <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} width={40} tickFormatter={(v: number) => `${Math.floor(v)}:${Math.round((v % 1) * 60).toString().padStart(2, '0')}`} />
                          <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => [formatPace(Number(v)), 'Pace']} />
                          <Line type="monotone" dataKey="paceMinPerKm" stroke="#4ADE80" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                      <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4, marginTop: 12 }}>Distanz (km)</p>
                      <ResponsiveContainer width="100%" height={100}>
                        <BarChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2E2E38" />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6B7280' }} tickFormatter={(d: string) => d.slice(5)} />
                          <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} width={35} />
                          <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => [`${Number(v).toFixed(2)} km`, 'Dist']} />
                          <Bar dataKey="distanceKm" fill="#4ADE80" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  )}

                  {ex.defaultTrackingType === 'time_only' && (
                    <>
                      <p style={{ color: '#6B7280', fontSize: 10, marginBottom: 4 }}>Dauer (min)</p>
                      <ResponsiveContainer width="100%" height={100}>
                        <BarChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2E2E38" />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6B7280' }} tickFormatter={(d: string) => d.slice(5)} />
                          <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} width={35} />
                          <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => [`${Math.round(Number(v))} min`, 'Dauer']} />
                          <Bar dataKey="durationMin" fill="#A855F7" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  )}

                  <p style={{ color: '#374151', fontSize: 9, textAlign: 'center', marginTop: 8 }}>← swipen →</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {workouts.length === 0 && (
        <div style={{ textAlign: 'center', color: '#6B7280', marginTop: 80 }}>
          <p style={{ fontSize: 36, marginBottom: 16 }}>📊</p>
          <p style={{ color: '#F9FAFB', fontWeight: 600, fontSize: 14 }}>Noch keine Daten</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Beende dein erstes Workout, um Statistiken zu sehen.</p>
        </div>
      )}
    </div>
  )
}
