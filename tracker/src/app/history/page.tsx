'use client'
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { useTrackerStore } from '@/store/useTrackerStore'
import MuscleSVG from '@/components/MuscleSVG'
import { getMusclesForExercise } from '@/lib/builtinExerciseMuscles'
import { MUSCLE_BY_ID } from '@/lib/muscles'
import type { MuscleId, TrackerWorkout } from '@/types/tracker'

function durationStr(w: TrackerWorkout): string {
  if (!w.finishedAt) return 'Aktiv'
  const mins = Math.round((new Date(w.finishedAt).getTime() - new Date(w.startedAt).getTime()) / 60000)
  return `${mins} Min`
}

function aggregateMuscles(w: TrackerWorkout): { primary: MuscleId[]; secondary: MuscleId[] } {
  const primary = new Set<MuscleId>()
  const secondary = new Set<MuscleId>()
  for (const we of w.exercises) {
    const muscles = we.exercise?.primaryMuscles?.length
      ? { primary: we.exercise.primaryMuscles, secondary: we.exercise.secondaryMuscles ?? [] }
      : getMusclesForExercise(we.exercise?.name ?? '')
    muscles.primary.forEach((m) => primary.add(m))
    muscles.secondary.forEach((m) => { if (!primary.has(m)) secondary.add(m) })
  }
  return { primary: Array.from(primary), secondary: Array.from(secondary) }
}

export default function HistoryPage() {
  const { workouts, fetchWorkouts, deleteWorkout } = useTrackerStore()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchWorkouts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (workouts.length === 0) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center', color: '#6B7280' }}>
        <p style={{ fontSize: 36, marginBottom: 16 }}>🏋️</p>
        <p style={{ color: '#F9FAFB', fontWeight: 600, fontSize: 15 }}>Noch keine Workouts</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>Starte dein erstes Training!</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 16px 16px' }}>
      <h1 style={{ color: '#F9FAFB', fontSize: 24, fontWeight: 900, marginBottom: 20 }}>Verlauf</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {workouts.map((w) => (
          <div key={w.id} style={{ background: '#27272F', borderRadius: 14, overflow: 'hidden' }}>
            <button
              style={{ width: '100%', padding: '14px 16px', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => setExpanded(prev => {
  const next = new Set(prev)
  next.has(w.id) ? next.delete(w.id) : next.add(w.id)
  return next
})}

            >
              <div style={{ flex: 1 }}>
                <div style={{ color: '#F9FAFB', fontSize: 13, fontWeight: 700 }}>{w.name}</div>
                <div style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>
                  {new Date(w.startedAt).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {' · '}{durationStr(w)}{' · '}{w.exercises.length} Übungen
                </div>
              </div>
              {expanded.has(w.id)
                ? <ChevronUp size={16} color="#6B7280" />
                : <ChevronDown size={16} color="#6B7280" />}
            </button>

            {expanded.has(w.id) && (
              <div style={{ padding: '0 16px 16px', borderTop: '1px solid #2E2E38' }}>
                <button
                  onClick={() => { if (confirm('Workout löschen?')) deleteWorkout(w.id) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#EF4444', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', marginTop: 12, marginBottom: 4, fontFamily: 'inherit' }}
                >
                  <Trash2 size={12} /> Workout löschen
                </button>

                {/* Muscle summary */}
                {(() => {
                  const muscles = aggregateMuscles(w)
                  if (!muscles.primary.length && !muscles.secondary.length) return null
                  return (
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ color: '#6B7280', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: 8 }}>Trainierte Muskeln</p>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        <MuscleSVG size="lg" primary={muscles.primary} secondary={muscles.secondary} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                          {muscles.primary.map((id) => (
                            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF6B3D' }} />
                              <span style={{ color: '#F9FAFB', fontSize: 11 }}>{MUSCLE_BY_ID[id]?.name ?? id}</span>
                            </div>
                          ))}
                          {muscles.secondary.map((id) => (
                            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#5BB8FF', opacity: 0.7 }} />
                              <span style={{ color: '#6B7280', fontSize: 11 }}>{MUSCLE_BY_ID[id]?.name ?? id}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* Set details */}
                {w.exercises.map((we) => (
                  <div key={we.id} style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: we.exercise?.category === 'strength' ? '#5BB8FF' : we.exercise?.category === 'cardio' ? '#4ADE80' : '#A855F7' }} />
                      <span style={{ color: '#F9FAFB', fontSize: 12, fontWeight: 600 }}>{we.exercise?.name ?? we.exerciseId}</span>
                    </div>
                    {we.sets.filter((s) => s.completed).map((s, i) => (
                      <div key={s.id} style={{ color: '#9CA3AF', fontSize: 11, marginLeft: 14, marginBottom: 2 }}>
                        Satz {i + 1}{s.isWarmup ? ' (W)' : ''}:{' '}
                        {s.weightKg != null ? `${s.weightKg}kg` : ''}
                        {s.reps != null ? ` × ${s.reps}` : ''}
                        {s.distanceMeters != null ? ` ${(s.distanceMeters / 1000).toFixed(2)}km` : ''}
                        {s.durationSeconds != null ? ` ${Math.floor(s.durationSeconds / 60)}:${(s.durationSeconds % 60).toString().padStart(2, '0')}` : ''}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
