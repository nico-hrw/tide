'use client'
import { MUSCLE_GROUPS } from '@/lib/muscles'
import { MUSCLE_PATHS } from '@/lib/musclePaths'
import type { MuscleId } from '@/types/tracker'

interface MuscleSVGProps {
  primary: MuscleId[]
  secondary: MuscleId[]
  interactive?: boolean
  onToggle?: (id: MuscleId) => void
  size: 'sm' | 'md' | 'lg'
  /** Optional: when provided, overrides primary/secondary coloring.
   *  Values are 0–1 (normalized frequency). Higher = more orange / more opaque. */
  intensityMap?: Partial<Record<MuscleId, number>>
}

const SIZE_MAP = {
  sm: { w: 30, h: 50 },
  md: { w: 55, h: 92 },
  lg: { w: 72, h: 120 },
}

function getMuscleStyle(
  id: MuscleId,
  primary: MuscleId[],
  secondary: MuscleId[],
  intensityMap?: Partial<Record<MuscleId, number>>,
): { fill: string; opacity: number } {
  if (intensityMap) {
    const intensity = intensityMap[id]
    if (intensity != null) {
      // opacity: 0.3 (one exercise) → 1.0 (most-hit muscle in this workout)
      return { fill: '#FF6B3D', opacity: 0.3 + intensity * 0.7 }
    }
    return { fill: '#4B5563', opacity: 1 }
  }
  if (primary.includes(id)) return { fill: '#FF6B3D', opacity: 1 }
  if (secondary.includes(id)) return { fill: '#5BB8FF', opacity: 0.7 }
  return { fill: '#4B5563', opacity: 1 }
}

interface FigureProps {
  view: 'front' | 'back'
  primary: MuscleId[]
  secondary: MuscleId[]
  interactive: boolean
  onToggle?: (id: MuscleId) => void
  width: number
  height: number
  intensityMap?: Partial<Record<MuscleId, number>>
}

function Figure({ view, primary, secondary, interactive, onToggle, width, height, intensityMap }: FigureProps) {
  const muscles = MUSCLE_GROUPS.filter((m) => m.view === view || m.view === 'both')

  return (
    <svg width={width} height={height} viewBox="0 0 60 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* TODO: Interactive muscle selection — replace pills with direct SVG tap targets.
          Each <path> receives onClick + visual highlight when interactive=true.
          Also: consider replacing SVG paths with high-quality anatomical PNG/WebP images
          per muscle group for a premium look. The interactive prop and onToggle callback
          are already wired — swap the SVG content when assets are ready. */}
      <circle cx="30" cy="7" r="5.5" fill="#4B5563" />
      {muscles.map((muscle) => {
        const pathData = view === 'front'
          ? MUSCLE_PATHS[muscle.id].front
          : MUSCLE_PATHS[muscle.id].back
        if (!pathData) return null
        const style = getMuscleStyle(muscle.id, primary, secondary, intensityMap)
        return (
          <path
            key={muscle.id}
            d={pathData}
            fill={style.fill}
            opacity={style.opacity}
            style={interactive && onToggle ? { cursor: 'pointer' } : undefined}
            onClick={interactive && onToggle ? () => onToggle(muscle.id) : undefined}
          />
        )
      })}
    </svg>
  )
}

export default function MuscleSVG({ primary, secondary, interactive = false, onToggle, size, intensityMap }: MuscleSVGProps) {
  const dims = SIZE_MAP[size]

  if (size === 'sm') {
    return (
      <Figure
        view="front"
        primary={primary}
        secondary={secondary}
        interactive={interactive}
        onToggle={onToggle}
        width={dims.w}
        height={dims.h}
        intensityMap={intensityMap}
      />
    )
  }

  return (
    <div style={{ display: 'flex', gap: size === 'lg' ? 16 : 8, alignItems: 'flex-start' }}>
      <div style={{ textAlign: 'center' }}>
        {size === 'lg' && <p style={{ fontSize: 10, color: '#6B7280', marginBottom: 4 }}>Vorne</p>}
        <Figure view="front" primary={primary} secondary={secondary} interactive={interactive} onToggle={onToggle} width={dims.w} height={dims.h} intensityMap={intensityMap} />
      </div>
      <div style={{ textAlign: 'center' }}>
        {size === 'lg' && <p style={{ fontSize: 10, color: '#6B7280', marginBottom: 4 }}>Hinten</p>}
        <Figure view="back" primary={primary} secondary={secondary} interactive={interactive} onToggle={onToggle} width={dims.w} height={dims.h} intensityMap={intensityMap} />
      </div>
    </div>
  )
}
