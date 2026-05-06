'use client'
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useTrackerStore } from '@/store/useTrackerStore'
import SpinnerInput from '@/components/SpinnerInput'
import type { ActiveWorkoutExercise, TrackerSet } from '@/types/tracker'

interface SetLoggerProps {
  workoutExercise: ActiveWorkoutExercise
  onClose: () => void
}

function formatSecs(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function SetLogger({ workoutExercise, onClose }: SetLoggerProps) {
  const { addSet, removeSet, activeWorkout } = useTrackerStore()
  const ex = workoutExercise.exercise
  const type = ex.defaultTrackingType

  const [visible, setVisible] = useState(false)
  const [weightKg, setWeightKg] = useState<number | undefined>(undefined)
  const [reps, setReps] = useState<number | undefined>(undefined)
  const [distanceKm, setDistanceKm] = useState<number | undefined>(undefined)
  const [durationMin, setDurationMin] = useState<number | undefined>(undefined)
  const [durationSec, setDurationSec] = useState<number | undefined>(undefined)
  const [isWarmup, setIsWarmup] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [rir, setRir] = useState<number | undefined>(undefined)
  const [rpe, setRpe] = useState<number | undefined>(undefined)

  const touchStartY = useRef(0)

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (e.changedTouches[0].clientY - touchStartY.current > 60) handleClose()
  }

  const catColor =
    ex.category === 'strength' ? 'bg-blue-500'
      : ex.category === 'cardio' ? 'bg-green-500'
        : 'bg-purple-500'

  const currentSets =
    activeWorkout?.exercises.find((we) => we.id === workoutExercise.id)?.sets ?? []

  async function handleAddSet() {
    const setData: Partial<TrackerSet> = { isWarmup, completed: true }
    if (rir != null) setData.rir = rir
    if (rpe != null) setData.rpe = rpe
    if (type === 'weight_reps') {
      if (weightKg != null) setData.weightKg = weightKg
      if (reps != null) setData.reps = reps
    } else if (type === 'distance_time') {
      if (distanceKm != null) setData.distanceMeters = distanceKm * 1000
      const totalSecs = ((durationMin ?? 0) * 60) + (durationSec ?? 0)
      if (totalSecs > 0) setData.durationSeconds = totalSecs
    } else {
      const totalSecs = ((durationMin ?? 0) * 60) + (durationSec ?? 0)
      if (totalSecs > 0) setData.durationSeconds = totalSecs
    }
    await addSet(workoutExercise.id, setData)
    setWeightKg(undefined)
    setReps(undefined)
    setDistanceKm(undefined)
    setDurationMin(undefined)
    setDurationSec(undefined)
    setRir(undefined)
    setRpe(undefined)
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end transition-colors duration-300 ${visible ? 'bg-black/20' : 'bg-transparent'}`}
      onClick={handleClose}
    >
      {/* mb-[58px] = nav bar height so the sheet sits above it */}
      <div
        className={`w-full max-w-[430px] mx-auto bg-white rounded-t-3xl shadow-2xl p-6 flex flex-col transform transition-transform duration-300 ease-out ${visible ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: 'calc(88vh - 58px)', marginBottom: 58 }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 cursor-grab shrink-0" />

        <div className="flex items-start justify-between mb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <div className={`w-1 h-6 rounded-full ${catColor}`} />
              <h2 className="text-xl font-bold text-black">{ex.name}</h2>
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-500 capitalize">{ex.category}</p>
              {ex.muscles && <p className="text-xs text-gray-400">{ex.muscles}</p>}
            </div>
          </div>
          <button onClick={handleClose}><X size={20} className="text-gray-400" /></button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="flex flex-col gap-3 mb-4">
            {type === 'weight_reps' && (
              <div className="flex gap-3">
                <SpinnerInput label="Gewicht" unit="kg" value={weightKg} onChange={setWeightKg} step={2.5} decimals={1} min={0} max={500} />
                <SpinnerInput label="Wdh." value={reps} onChange={setReps} step={1} min={0} max={100} />
              </div>
            )}
            {type === 'distance_time' && (
              <div className="flex gap-3">
                <SpinnerInput label="Distanz" unit="km" value={distanceKm} onChange={setDistanceKm} step={0.1} decimals={2} min={0} max={999} placeholder="0.0" />
                <div className="flex gap-1 flex-1">
                  <SpinnerInput label="Min" value={durationMin} onChange={setDurationMin} step={1} min={0} max={999} />
                  <SpinnerInput label="Sek" value={durationSec} onChange={setDurationSec} step={5} min={0} max={59} />
                </div>
              </div>
            )}
            {type === 'time_only' && (
              <div className="flex gap-3">
                <SpinnerInput label="Min" value={durationMin} onChange={setDurationMin} step={1} min={0} max={999} />
                <SpinnerInput label="Sek" value={durationSec} onChange={setDurationSec} step={5} min={0} max={59} />
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setIsWarmup(!isWarmup)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${isWarmup ? 'border-orange-300 bg-orange-50 text-orange-500' : 'border-gray-200 text-gray-400'}`}
              >
                🔥 Aufwärmsatz
              </button>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${showDetails ? 'border-gray-400 bg-gray-100 text-gray-600' : 'border-gray-200 text-gray-400'}`}
              >
                RIR / RPE
              </button>
            </div>

            {showDetails && (
              <div className="flex gap-3">
                <SpinnerInput label="RIR" value={rir} onChange={setRir} step={1} min={0} max={5} placeholder="—" />
                <SpinnerInput label="RPE" value={rpe} onChange={setRpe} step={0.5} min={6} max={10} decimals={1} placeholder="—" />
              </div>
            )}
          </div>

          {currentSets.length > 0 && (
            <div className="mb-2 flex flex-col gap-1">
              {currentSets.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                  <span className="text-sm text-gray-700">
                    Satz {i + 1}{s.isWarmup ? ' (W)' : ''}{' '}
                    {s.weightKg != null ? `${s.weightKg}kg` : ''}
                    {s.reps != null ? ` × ${s.reps}` : ''}
                    {s.distanceMeters != null ? ` ${(s.distanceMeters / 1000).toFixed(1)}km` : ''}
                    {s.durationSeconds != null ? ` ${formatSecs(s.durationSeconds)}` : ''}
                  </span>
                  <button onClick={() => removeSet(workoutExercise.id, s.id)} className="text-gray-300 hover:text-red-400 ml-2 p-1">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => { void handleAddSet() }}
          className="w-full bg-black text-white rounded-2xl py-4 font-semibold text-base mt-4 shrink-0"
        >
          + Satz hinzufügen
        </button>
      </div>
    </div>
  )
}
