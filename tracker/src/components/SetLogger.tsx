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

  function handleClose() { setVisible(false); setTimeout(onClose, 280) }
  function onTouchStart(e: React.TouchEvent) { touchStartY.current = e.touches[0].clientY }
  function onTouchEnd(e: React.TouchEvent) { if (e.changedTouches[0].clientY - touchStartY.current > 60) handleClose() }

  const catColor = ex.category === 'strength' ? '#5BB8FF' : ex.category === 'cardio' ? '#4ADE80' : '#A855F7'

  const currentSets = activeWorkout?.exercises.find((we) => we.id === workoutExercise.id)?.sets ?? []

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
    setWeightKg(undefined); setReps(undefined); setDistanceKm(undefined)
    setDurationMin(undefined); setDurationSec(undefined); setRir(undefined); setRpe(undefined)
  }

  const isAddDisabled = (() => {
    if (type === 'weight_reps') return (!weightKg || weightKg === 0) && (!reps || reps === 0)
    const secs = ((durationMin ?? 0) * 60) + (durationSec ?? 0)
    if (type === 'distance_time') return (!distanceKm || distanceKm === 0) && secs === 0
    return secs === 0
  })()

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', background: visible ? 'rgba(0,0,0,0.5)' : 'transparent', transition: 'background 280ms' }}
      onClick={handleClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 430, background: '#2E2E38',
          borderRadius: '24px 24px 0 0', padding: 24,
          display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(88vh - 50px)', marginBottom: 50,
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 280ms ease-out',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      >
        <div style={{ width: 40, height: 4, background: '#4B5563', borderRadius: 9999, margin: '0 auto 20px', cursor: 'grab', flexShrink: 0 }} />

        {/* Exercise header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 24, borderRadius: 9999, background: catColor, flexShrink: 0 }} />
              <h2 style={{ color: '#F9FAFB', fontSize: 20, fontWeight: 800 }}>{ex.name}</h2>
            </div>
            <p style={{ color: '#9CA3AF', fontSize: 12, marginLeft: 11, marginTop: 2, textTransform: 'capitalize' }}>{ex.category}</p>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={20} color="#6B7280" />
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {/* Input fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            {type === 'weight_reps' && (
              <div style={{ display: 'flex', gap: 12 }}>
                <SpinnerInput label="Gewicht" unit="kg" value={weightKg} onChange={setWeightKg} step={2.5} decimals={1} min={0} max={500} />
                <SpinnerInput label="Wdh." value={reps} onChange={setReps} step={1} min={0} max={100} />
              </div>
            )}
            {type === 'distance_time' && (
              <div style={{ display: 'flex', gap: 12 }}>
                <SpinnerInput label="Distanz" unit="km" value={distanceKm} onChange={setDistanceKm} step={0.1} decimals={2} min={0} max={999} placeholder="0.0" />
                <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                  <SpinnerInput label="Min" value={durationMin} onChange={setDurationMin} step={1} min={0} max={999} />
                  <SpinnerInput label="Sek" value={durationSec} onChange={setDurationSec} step={5} min={0} max={59} />
                </div>
              </div>
            )}
            {type === 'time_only' && (
              <div style={{ display: 'flex', gap: 12 }}>
                <SpinnerInput label="Min" value={durationMin} onChange={setDurationMin} step={1} min={0} max={999} />
                <SpinnerInput label="Sek" value={durationSec} onChange={setDurationSec} step={5} min={0} max={59} />
              </div>
            )}

            {/* Toggles */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => setIsWarmup(!isWarmup)}
                style={{ fontSize: 11, padding: '5px 12px', borderRadius: 20, border: isWarmup ? '1px solid #F97316' : '1px solid #374151', background: isWarmup ? 'rgba(249,115,22,0.15)' : 'none', color: isWarmup ? '#F97316' : '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                🔥 Aufwärmsatz
              </button>
              <button
                onClick={() => setShowDetails(!showDetails)}
                style={{ fontSize: 11, padding: '5px 12px', borderRadius: 20, border: showDetails ? '1px solid #6B7280' : '1px solid #374151', background: showDetails ? '#374151' : 'none', color: showDetails ? '#F9FAFB' : '#6B7280', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                RIR / RPE
              </button>
            </div>

            {showDetails && (
              <div style={{ display: 'flex', gap: 12 }}>
                <SpinnerInput label="RIR" value={rir} onChange={setRir} step={1} min={0} max={5} placeholder="—" />
                <SpinnerInput label="RPE" value={rpe} onChange={setRpe} step={0.5} min={6} max={10} decimals={1} placeholder="—" />
              </div>
            )}
          </div>

          {/* Logged sets */}
          {currentSets.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
              {currentSets.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#27272F', borderRadius: 10, padding: '8px 12px' }}>
                  <span style={{ color: '#F9FAFB', fontSize: 12 }}>
                    Satz {i + 1}{s.isWarmup ? ' (W)' : ''}{' '}
                    {s.weightKg != null ? `${s.weightKg}kg` : ''}
                    {s.reps != null ? ` × ${s.reps}` : ''}
                    {s.distanceMeters != null ? ` ${(s.distanceMeters / 1000).toFixed(1)}km` : ''}
                    {s.durationSeconds != null ? ` ${formatSecs(s.durationSeconds)}` : ''}
                  </span>
                  <button onClick={() => removeSet(workoutExercise.id, s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#4B5563', fontSize: 14 }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={() => { void handleAddSet() }}
          disabled={isAddDisabled}
          style={{
            width: '100%', background: '#FF6B3D', border: 'none', borderRadius: 14,
            padding: 16, color: '#FFF', fontSize: 14, fontWeight: 800,
            fontFamily: 'inherit', cursor: isAddDisabled ? 'not-allowed' : 'pointer',
            marginTop: 14, opacity: isAddDisabled ? 0.4 : 1, flexShrink: 0,
            boxShadow: isAddDisabled ? 'none' : '0 4px 16px rgba(255,107,61,0.35)',
          }}
        >
          + Satz hinzufügen
        </button>
      </div>
    </div>
  )
}
