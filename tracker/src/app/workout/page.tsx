'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTrackerStore } from '@/store/useTrackerStore'
import ActiveWorkoutView from '@/components/ActiveWorkoutView'

export default function WorkoutPage() {
  const { activeWorkout, startWorkout, fetchExercises } = useTrackerStore()
  const router = useRouter()
  const [workoutName, setWorkoutName] = useState('')

  useEffect(() => {
    fetchExercises()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleStart() {
    const name = workoutName.trim() || 'Training'
    await startWorkout(name)
  }

  if (activeWorkout) {
    return (
      <div className="px-4 pt-12 pb-24">
        <ActiveWorkoutView onFinish={() => router.push('/')} />
      </div>
    )
  }

  return (
    <div className="px-4 pt-12">
      <h1 className="text-2xl font-bold mb-6">Neues Workout</h1>
      <input
        type="text"
        value={workoutName}
        onChange={(e) => setWorkoutName(e.target.value)}
        placeholder="Name (z.B. Push Day)"
        className="w-full bg-white rounded-2xl px-4 py-4 text-lg font-medium outline-none shadow-sm mb-4"
      />
      <button
        onClick={handleStart}
        className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base"
      >
        Starten
      </button>
    </div>
  )
}
