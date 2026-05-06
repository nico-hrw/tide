'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, CheckCircle, Trash2 } from 'lucide-react'
import { useTrackerStore } from '@/store/useTrackerStore'
import ExercisePicker from '@/components/ExercisePicker'
import SetLogger from '@/components/SetLogger'
import type { ActiveWorkoutExercise, TrackerExercise } from '@/types/tracker'

export default function WorkoutPage() {
  const { activeWorkout, startWorkout, addExerciseToWorkout, finishWorkout, fetchExercises } =
    useTrackerStore()
  const router = useRouter()
  const [showPicker, setShowPicker] = useState(false)
  const [activeExercise, setActiveExercise] = useState<ActiveWorkoutExercise | null>(null)
  const [workoutName, setWorkoutName] = useState('')
  const [confirmFinish, setConfirmFinish] = useState(false)

  useEffect(() => {
    fetchExercises()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleStart() {
    const name = workoutName.trim() || 'Training'
    await startWorkout(name)
  }

  async function handleFinish() {
    await finishWorkout()
    router.push('/')
  }

  async function handleSelectExercise(ex: TrackerExercise) {
    await addExerciseToWorkout(ex)
  }

  if (!activeWorkout) {
    return (
      <div className="px-4 pt-12">
        <h1 className="text-2xl font-bold mb-6">Neues Workout</h1>
        <input
          type="text" value={workoutName} onChange={(e) => setWorkoutName(e.target.value)}
          placeholder="Name (z.B. Push Day)"
          className="w-full bg-white rounded-2xl px-4 py-4 text-lg font-medium outline-none shadow-sm mb-4"
        />
        <button onClick={handleStart} className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base">
          Starten
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 pt-12">
      <h1 className="text-2xl font-bold mb-1">{activeWorkout.name}</h1>
      <p className="text-sm text-gray-500 mb-6">
        Gestartet:{' '}
        {new Date(activeWorkout.startedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
      </p>

      <div className="flex flex-col gap-3 mb-4">
        {activeWorkout.exercises.map((we) => {
          const completedSets = we.sets.filter((s) => s.completed).length
          return (
            <button
              key={we.id}
              onClick={() => setActiveExercise(we)}
              className="bg-white rounded-2xl p-4 shadow-sm text-left flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${we.exercise.category === 'strength' ? 'bg-blue-500' : we.exercise.category === 'cardio' ? 'bg-green-500' : 'bg-purple-500'}`} />
                  <span className="font-semibold text-black">{we.exercise.name}</span>
                </div>
                <span className="text-xs text-gray-500 ml-4">{completedSets} Sätze</span>
              </div>
              {completedSets > 0 && <CheckCircle size={18} className="text-green-500" />}
            </button>
          )
        })}
      </div>

      <button
        onClick={() => setShowPicker(true)}
        className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-4 flex items-center justify-center gap-2 text-gray-500 mb-8"
      >
        <Plus size={18} /> Übung hinzufügen
      </button>

      {/* Workout beenden — am unteren Rand, weniger prominent, mit Bestätigung */}
      {!confirmFinish ? (
        <button
          onClick={() => setConfirmFinish(true)}
          className="w-full border border-gray-300 text-gray-500 rounded-2xl py-3 text-sm font-medium"
        >
          Workout beenden
        </button>
      ) : (
        <div className="bg-gray-50 rounded-2xl p-4 flex flex-col gap-3">
          <p className="text-sm text-gray-700 text-center font-medium">Workout wirklich beenden?</p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmFinish(false)}
              className="flex-1 border border-gray-200 rounded-xl py-3 text-sm text-gray-500"
            >
              Abbrechen
            </button>
            <button
              onClick={handleFinish}
              className="flex-1 bg-black text-white rounded-xl py-3 text-sm font-semibold"
            >
              Beenden ✓
            </button>
          </div>
        </div>
      )}

      {showPicker && (
        <ExercisePicker onSelect={handleSelectExercise} onClose={() => setShowPicker(false)} />
      )}
      {activeExercise && (
        <SetLogger
          workoutExercise={activeWorkout.exercises.find((e) => e.id === activeExercise.id) ?? activeExercise}
          onClose={() => setActiveExercise(null)}
        />
      )}
    </div>
  )
}
