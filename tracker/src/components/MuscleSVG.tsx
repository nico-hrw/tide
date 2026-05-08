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
}

const SIZE_MAP = {
  sm: { w: 30, h: 50 },
  md: { w: 55, h: 92 },
  lg: { w: 72, h: 120 },
}

function getFill(id: MuscleId, primary: MuscleId[], secondary: MuscleId[]): string {
  if (primary.includes(id)) return '#111111'
  if (secondary.includes(id)) return '#111111'
  return '#E5E7EB'
}

function getOpacity(id: MuscleId, primary: MuscleId[], secondary: MuscleId[]): number {
  if (primary.includes(id)) return 1
  if (secondary.includes(id)) return 0.3
  return 1
}

interface FigureProps {
  view: 'front' | 'back'
  primary: MuscleId[]
  secondary: MuscleId[]
  interactive: boolean
  onToggle?: (id: MuscleId) => void
  width: number
  height: number
}

function Figure({ view, primary, secondary, interactive, onToggle, width, height }: FigureProps) {
  const muscles = MUSCLE_GROUPS.filter((m) => m.view === view || m.view === 'both')

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 60 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Head outline */}
      <circle
        cx="30" cy="7" r="5.5"
        fill="#E5E7EB"
      />
      {muscles.map((muscle) => {
        const pathData = view === 'front'
          ? MUSCLE_PATHS[muscle.id].front
          : MUSCLE_PATHS[muscle.id].back
        if (!pathData) return null
        const fill = getFill(muscle.id, primary, secondary)
        const opacity = getOpacity(muscle.id, primary, secondary)
        return (
          <path
            key={muscle.id}
            d={pathData}
            fill={fill}
            opacity={opacity}
            style={interactive ? { cursor: 'pointer' } : undefined}
            onClick={interactive && onToggle ? () => onToggle(muscle.id) : undefined}
          />
        )
      })}
    </svg>
  )
}

export default function MuscleSVG({ primary, secondary, interactive = false, onToggle, size }: MuscleSVGProps) {
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
      />
    )
  }

  return (
    <div style={{ display: 'flex', gap: size === 'lg' ? 16 : 8, alignItems: 'flex-start' }}>
      <div style={{ textAlign: 'center' }}>
        {size === 'lg' && (
          <p style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 4 }}>Vorne</p>
        )}
        <Figure
          view="front"
          primary={primary}
          secondary={secondary}
          interactive={interactive}
          onToggle={onToggle}
          width={dims.w}
          height={dims.h}
        />
      </div>
      <div style={{ textAlign: 'center' }}>
        {size === 'lg' && (
          <p style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 4 }}>Hinten</p>
        )}
        <Figure
          view="back"
          primary={primary}
          secondary={secondary}
          interactive={interactive}
          onToggle={onToggle}
          width={dims.w}
          height={dims.h}
        />
      </div>
    </div>
  )
}
