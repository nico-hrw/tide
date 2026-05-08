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

function useElapsedTimer(startedAt: string): string {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    function update() {
      const ms = Date.now() - new Date(startedAt).getTime()
      const totalSecs = Math.floor(ms / 1000)
      const m = Math.floor(totalSecs / 60)
      const s = totalSecs % 60
      setElapsed(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [startedAt])
  return elapsed
}

export default function ActiveWorkoutView({ onFinish }: ActiveWorkoutViewProps) {
  const { activeWorkout, addExerciseToWorkout, removeExerciseFromWorkout, finishWorkout, cancelWorkout } =
    useTrackerStore()
  const [showPicker, setShowPicker] = useState(false)
  const [activeExercise, setActiveExercise] = useState<ActiveWorkoutExercise | null>(null)
  const [confirmFinish, setConfirmFinish] = useState(false)

  const elapsed = useElapsedTimer(activeWorkout?.startedAt ?? new Date().toISOString())

  if (!activeWorkout) return null

  async function handleSelectExercise(ex: TrackerExercise) {
    const newWe = await addExerciseToWorkout(ex)
    if (newWe) setActiveExercise(newWe)
  }

  async function handleFinish() {
    await finishWorkout()
    onFinish?.()
  }

  async function handleCancel() {
    await cancelWorkout()
  }

  const hasExercises = activeWorkout.exercises.length > 0

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="bg-black text-white rounded-2xl px-4 py-3 mb-4 flex items-center justify-between">
        <div>
          <div className="font-semibold text-base">{activeWorkout.name}</div>
          <div className="text-xs text-white/60 mt-0.5">{elapsed}</div>
        </div>
      </div>

      {/* Exercise list */}
      <div className="flex flex-col gap-3 mb-4">
        {activeWorkout.exercises.map((we) => {
          const completedSets = we.sets.filter((s) => s.completed).length
          const muscles = we.exercise.primaryMuscles?.length
            ? { primary: we.exercise.primaryMuscles, secondary: we.exercise.secondaryMuscles ?? [] }
            : getMusclesForExercise(we.exercise.name)

          return (
            <div key={we.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-2">
              <button
                onClick={() => setActiveExercise(we)}
                className="flex-1 text-left flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        we.exercise.category === 'strength'
                          ? 'bg-blue-500'
                          : we.exercise.category === 'cardio'
                            ? 'bg-green-500'
                            : 'bg-purple-500'
                      }`}
                    />
                    <span className="font-semibold text-black">{we.exercise.name}</span>
                  </div>
                  <span className="text-xs text-gray-500 ml-4">{completedSets} Sätze</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {completedSets > 0 && <CheckCircle size={18} className="text-green-500" />}
                  <MuscleSVG
                    size="sm"
                    primary={muscles.primary}
                    secondary={muscles.secondary}
                  />
                </div>
              </button>
              <button
                onClick={() => removeExerciseFromWorkout(we.id)}
                className="p-1 text-gray-300 hover:text-red-400 shrink-0"
              >
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Add exercise */}
      <button
        onClick={() => setShowPicker(true)}
        className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-4 flex items-center justify-center gap-2 text-gray-500 mb-6"
      >
        <Plus size={18} /> Übung hinzufügen
      </button>

      {/* Finish / Cancel */}
      {hasExercises ? (
        !confirmFinish ? (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setConfirmFinish(true)}
              className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base"
            >
              Workout abschließen
            </button>
            <button
              onClick={handleCancel}
              className="w-full text-gray-400 text-sm py-2"
            >
              Abbrechen
            </button>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-4 flex flex-col gap-3">
            <p className="text-sm text-gray-700 text-center font-medium">Workout wirklich beenden?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmFinish(false)}
                className="flex-1 border border-gray-200 rounded-xl py-3 text-sm text-gray-500"
              >
                Zurück
              </button>
              <button
                onClick={handleFinish}
                className="flex-1 bg-black text-white rounded-xl py-3 text-sm font-semibold"
              >
                Beenden ✓
              </button>
            </div>
          </div>
        )
      ) : (
        <button
          onClick={handleCancel}
          className="w-full border border-gray-200 text-gray-500 rounded-2xl py-4 text-sm font-medium"
        >
          Abbrechen
        </button>
      )}

      {showPicker && (
        <ExercisePicker onSelect={handleSelectExercise} onClose={() => setShowPicker(false)} />
      )}
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
