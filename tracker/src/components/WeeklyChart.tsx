'use client'
import { useMemo } from 'react'
import type { TrackerWorkout } from '@/types/tracker'

interface WeeklyChartProps {
  workouts: TrackerWorkout[]
}

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MAX_BAR_PX = 34

function getWeekDurationsMinutes(workouts: TrackerWorkout[]): number[] {
  const now = new Date()
  const dayOfWeek = (now.getDay() + 6) % 7 // 0 = Monday
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - dayOfWeek)
  weekStart.setHours(0, 0, 0, 0)

  const durations = new Array<number>(7).fill(0)
  for (const w of workouts) {
    if (!w.finishedAt) continue
    const started = new Date(w.startedAt)
    if (started < weekStart) continue
    const dayIndex = Math.min(6, Math.floor((started.getTime() - weekStart.getTime()) / 86_400_000))
    durations[dayIndex] += (new Date(w.finishedAt).getTime() - started.getTime()) / 60_000
  }
  return durations
}

export default function WeeklyChart({ workouts }: WeeklyChartProps) {
  const durations = useMemo(() => getWeekDurationsMinutes(workouts), [workouts])
  const todayIndex = (new Date().getDay() + 6) % 7
  const maxDur = Math.max(...durations, 1)

  // Average over completed workout days only (past days with a workout)
  const completedDurs = durations.filter((d, i) => i < todayIndex && d > 0)
  const avgDur = completedDurs.length > 0
    ? completedDurs.reduce((a, b) => a + b, 0) / completedDurs.length
    : 0
  const avgBarPx = avgDur > 0 ? Math.round((avgDur / maxDur) * MAX_BAR_PX) : 0

  return (
    <div style={{ background: '#FFFFFF', borderRadius: 14, padding: '12px 13px' }}>
      <div style={{
        color: '#374151', fontSize: 8, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
      }}>
        Aktivität diese Woche
      </div>

      <div style={{ position: 'relative', height: 46 }}>
        {/* Average dashed line */}
        {avgBarPx > 0 && (
          <>
            <div style={{
              position: 'absolute', left: 0, right: 20,
              bottom: avgBarPx + 8,
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

        {/* Bars */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 38, position: 'relative', zIndex: 1 }}>
          {DAYS.map((day, i) => {
            const barPx = durations[i] > 0
              ? Math.max(4, Math.round((durations[i] / maxDur) * MAX_BAR_PX))
              : 0
            const isToday = i === todayIndex
            const isEmpty = barPx === 0
            return (
              <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{
                  width: '100%',
                  borderRadius: '4px 4px 2px 2px',
                  height: isEmpty ? 4 : barPx,
                  background: isEmpty ? '#F3F4F6' : 'linear-gradient(to top, #FF6B3D, #FF9A7A)',
                  ...(isToday && isEmpty ? { border: '1px dashed #FF6B3D', boxSizing: 'border-box' as const } : {}),
                }} />
                <div style={{ color: isToday ? '#FF6B3D' : '#9CA3AF', fontSize: 6.5, fontWeight: isToday ? 700 : 400 }}>
                  {day}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
