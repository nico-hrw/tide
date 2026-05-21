'use client'
import { useMemo, useRef, useState } from 'react'
import type { TrackerWorkout } from '@/types/tracker'

interface WeeklyChartProps {
  workouts: TrackerWorkout[]
}

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MAX_BAR_PX = 34

function getWeekStart(offsetWeeks: number): Date {
  const now = new Date()
  const dayOfWeek = (now.getDay() + 6) % 7 // 0 = Monday
  const ws = new Date(now)
  ws.setDate(now.getDate() - dayOfWeek + offsetWeeks * 7)
  ws.setHours(0, 0, 0, 0)
  return ws
}

function getWeekDurations(workouts: TrackerWorkout[], weekStart: Date): number[] {
  const durations = new Array<number>(7).fill(0)
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000)
  for (const w of workouts) {
    if (!w.finishedAt) continue
    const started = new Date(w.startedAt)
    if (started < weekStart || started >= weekEnd) continue
    const dayIndex = Math.min(6, Math.floor((started.getTime() - weekStart.getTime()) / 86_400_000))
    durations[dayIndex] += (new Date(w.finishedAt).getTime() - started.getTime()) / 60_000
  }
  return durations
}

function getMonthWeekTotals(workouts: TrackerWorkout[]): number[] {
  // 4 bars: 3 weeks ago, 2 weeks ago, last week, this week
  return [0, 1, 2, 3].map(i => {
    const ws = getWeekStart(i - 3)
    const we = new Date(ws.getTime() + 7 * 86_400_000)
    return workouts
      .filter(w => {
        if (!w.finishedAt) return false
        const s = new Date(w.startedAt)
        return s >= ws && s < we
      })
      .reduce((sum, w) => sum + (new Date(w.finishedAt!).getTime() - new Date(w.startedAt).getTime()) / 60_000, 0)
  })
}

function weekLabel(offset: number): string {
  if (offset === 0) return 'Diese Woche'
  if (offset === -1) return 'Letzte Woche'
  return `Vor ${-offset} Wochen`
}

export default function WeeklyChart({ workouts }: WeeklyChartProps) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  const weekStart = useMemo(() => getWeekStart(weekOffset), [weekOffset])
  const todayIndex = weekOffset === 0 ? (new Date().getDay() + 6) % 7 : -1

  const weekDurations = useMemo(() => getWeekDurations(workouts, weekStart), [workouts, weekStart])
  const monthTotals = useMemo(() => getMonthWeekTotals(workouts), [workouts])

  const displayData = viewMode === 'week' ? weekDurations : monthTotals
  const maxDur = Math.max(...displayData, 1)

  const completedDurs = viewMode === 'week'
    ? weekDurations.filter((d, i) => i < todayIndex && d > 0)
    : monthTotals.slice(0, 3).filter(d => d > 0)
  const avgDur = completedDurs.length > 0
    ? completedDurs.reduce((a, b) => a + b, 0) / completedDurs.length
    : 0
  const avgBarPx = avgDur > 0 ? Math.round((avgDur / maxDur) * MAX_BAR_PX) : 0

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    const isHorizontal = Math.abs(dx) > Math.abs(dy)

    if (!isHorizontal && dy > 40) {
      setViewMode(v => v === 'week' ? 'month' : 'week')
      return
    }
    if (isHorizontal && Math.abs(dx) > 30 && viewMode === 'week') {
      setWeekOffset(o => dx < 0 ? Math.max(o - 1, -52) : Math.min(o + 1, 0))
    }
  }

  const labels = viewMode === 'week' ? DAYS : ['-3W', '-2W', '-1W', '0W']

  return (
    <div
      style={{ background: '#FFFFFF', borderRadius: 14, padding: '12px 13px', userSelect: 'none' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ color: '#374151', fontSize: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {viewMode === 'week' ? weekLabel(weekOffset) : 'Letzter Monat'}
        </div>
        {viewMode === 'month' && (
          <div style={{ color: '#9CA3AF', fontSize: 7 }}>↑ zurück zur Woche</div>
        )}
        {viewMode === 'week' && weekOffset < 0 && (
          <div style={{ color: '#9CA3AF', fontSize: 7 }}>{weekOffset}</div>
        )}
      </div>

      <div style={{ position: 'relative', height: 46 }}>
        {avgBarPx > 0 && (
          <>
            <div style={{
              position: 'absolute', left: 0, right: 20,
              bottom: avgBarPx + 11,
              borderTop: '1.5px dashed #D1D5DB', zIndex: 2,
            }} />
            <div style={{
              position: 'absolute', right: 0, bottom: avgBarPx + 10,
              background: '#F3F4F6', borderRadius: 3, padding: '1px 4px', zIndex: 3,
            }}>
              <div style={{ color: '#9CA3AF', fontSize: 6, fontWeight: 700 }}>Ø</div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 38, position: 'relative', zIndex: 1 }}>
          {displayData.map((dur, i) => {
            const barPx = dur > 0 ? Math.max(4, Math.round((dur / maxDur) * MAX_BAR_PX)) : 0
            const isToday = viewMode === 'week' && i === todayIndex
            const isEmpty = barPx === 0
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{
                  width: '100%',
                  borderRadius: '4px 4px 2px 2px',
                  height: isEmpty ? 4 : barPx,
                  background: isEmpty ? '#F3F4F6' : 'linear-gradient(to top, #FF6B3D, #FF9A7A)',
                  ...(isToday && isEmpty ? { border: '1px dashed #FF6B3D', boxSizing: 'border-box' as const } : {}),
                }} />
                <div style={{ color: isToday ? '#FF6B3D' : '#9CA3AF', fontSize: 6.5, fontWeight: isToday ? 700 : 400 }}>
                  {labels[i]}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
