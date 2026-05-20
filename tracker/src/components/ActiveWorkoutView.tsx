'use client'
import { useEffect, useState } from 'react'
import { Plus, CheckCircle, X } from 'lucide-react'
import { useTrackerStore } from '@/store/useTrackerStore'
import ExercisePicker from '@/components/ExercisePicker'
import SetLogger from '@/components/SetLogger'
import MuscleSVG from '@/components/MuscleSVG'
import { getMusclesForExercise } from '@/lib/builtinExerciseMuscles'
import type { ActiveWorkoutExercise, TrackerExercise } from '@/types/tracker'

interface ActiveWorkoutViewProps {
  onFinish?: () => void
}

function useElapsedTimer(startedAt: string | null): string {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    if (!startedAt) return
    function update() {
      const ms = Date.now() - new Date(startedAt!).getTime()
      const m = Math.floor(ms / 60000)
      const s = Math.floor((ms % 60000) / 1000)
      setElapsed(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [startedAt])
  return elapsed
}

export default function ActiveWorkoutView({ onFinish }: ActiveWorkoutViewProps) {
  const { activeWorkout, addExerciseToWorkout, removeExerciseFromWorkout, finishWorkout, cancelWorkout } = useTrackerStore()
  const [showPicker, setShowPicker] = useState(false)
  const [activeExercise, setActiveExercise] = useState<ActiveWorkoutExercise | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const elapsed = useElapsedTimer(activeWorkout?.startedAt ?? null)

  if (!activeWorkout) return null

  async function handleSelectExercise(ex: TrackerExercise) {
    const newWe = await addExerciseToWorkout(ex)
    if (newWe) setActiveExercise(newWe)
  }

  async function handleFinish() {
    if (submitting) return
    setSubmitting(true)
    try {
      await finishWorkout()
      onFinish?.()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel() {
    if (submitting) return
    setSubmitting(true)
    await cancelWorkout()
  }

  const hasExercises = activeWorkout.exercises.length > 0

  const dotColor = (cat: string) =>
    cat === 'strength' ? '#5BB8FF' : cat === 'cardio' ? '#4ADE80' : '#A855F7'

  return (
    <div className="flex flex-col gap-3">
      {/* Header — orange card */}
      <div style={{
        background: '#FF6B3D', borderRadius: 14,
        padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ color: '#FFF', fontSize: 14, fontWeight: 800 }}>{activeWorkout.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: 700, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
            {elapsed}
          </div>
        </div>
      </div>

      {/* Exercise list */}
      {activeWorkout.exercises.map((we) => {
        const completedSets = we.sets.filter((s) => s.completed).length
        const muscles = we.exercise.primaryMuscles?.length
          ? { primary: we.exercise.primaryMuscles, secondary: we.exercise.secondaryMuscles ?? [] }
          : getMusclesForExercise(we.exercise.name)
        const isActive = activeExercise?.id === we.id

        return (
          <div
            key={we.id}
            style={{
              background: '#27272F', borderRadius: 12, padding: '10px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
              border: isActive ? '1px solid #FF6B3D' : '1px solid transparent',
            }}
          >
            <button onClick={() => setActiveExercise(we)} className="flex-1 text-left flex items-center justify-between">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor(we.exercise.category), flexShrink: 0 }} />
                  <span style={{ color: '#F9FAFB', fontSize: 11, fontWeight: 600 }}>{we.exercise.name}</span>
                </div>
                <span style={{ color: '#6B7280', fontSize: 8, marginLeft: 14 }}>{completedSets} Sätze</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {completedSets > 0 && <CheckCircle size={16} color="#4ADE80" />}
                <MuscleSVG size="sm" primary={muscles.primary} secondary={muscles.secondary} />
              </div>
            </button>
            <button onClick={() => removeExerciseFromWorkout(we.id)} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={15} color="#4B5563" />
            </button>
          </div>
        )
      })}

      {/* Add exercise */}
      <button
        onClick={() => setShowPicker(true)}
        style={{
          width: '100%', border: '1.5px dashed #2A2A35', borderRadius: 12,
          padding: '14px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 8, background: 'none', cursor: 'pointer',
          color: '#6B7280', fontSize: 12, fontFamily: 'inherit',
        }}
      >
        <Plus size={16} color="#6B7280" /> Übung hinzufügen
      </button>

      {/* Finish / Cancel */}
      {hasExercises ? (
        !confirmFinish ? (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setConfirmFinish(true)}
              style={{
                width: '100%', background: '#27272F', border: '1px solid #374151',
                borderRadius: 14, padding: 14, color: '#9CA3AF', fontSize: 12,
                fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              Workout beenden
            </button>
            <button
              onClick={handleCancel}
              disabled={submitting}
              style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', padding: 8, opacity: submitting ? 0.4 : 1 }}
            >
              Abbrechen
            </button>
          </div>
        ) : (
          <div style={{ background: '#27272F', borderRadius: 14, padding: 14 }}>
            <p style={{ color: '#F9FAFB', fontSize: 12, textAlign: 'center', fontWeight: 600, marginBottom: 12 }}>
              Workout wirklich beenden?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmFinish(false)}
                style={{ flex: 1, border: '1px solid #374151', borderRadius: 10, padding: 12, fontSize: 12, color: '#9CA3AF', background: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
              >
                Zurück
              </button>
              <button
                onClick={handleFinish}
                disabled={submitting}
                style={{ flex: 1, background: '#FF6B3D', border: 'none', borderRadius: 10, padding: 12, fontSize: 12, color: '#FFF', fontWeight: 700, fontFamily: 'inherit', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
              >
                {submitting ? '…' : 'Beenden ✓'}
              </button>
            </div>
          </div>
        )
      ) : (
        <button
          onClick={handleCancel}
          disabled={submitting}
          style={{ width: '100%', border: '1px solid #2E2E38', borderRadius: 14, padding: 14, color: '#6B7280', fontSize: 12, background: 'none', fontFamily: 'inherit', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}
        >
          Abbrechen
        </button>
      )}

      {showPicker && <ExercisePicker onSelect={handleSelectExercise} onClose={() => setShowPicker(false)} />}
      {activeExercise && (
        <SetLogger
          workoutExercise={
            activeWorkout.exercises.find((e) => e.id === activeExercise.id) ?? activeExercise
          }
          onClose={() => setActiveExercise(null)}
        />
      )}
    </div>
  )
}
