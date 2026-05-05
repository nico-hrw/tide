'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { useTrackerStore } from '@/store/useTrackerStore'
import { buildChartData, formatPace } from '@/lib/analytics'

export default function StatsPage() {
  const { workouts, exercises, fetchWorkouts, fetchExercises } = useTrackerStore()
  const [selectedId, setSelectedId] = useState<string>('')

  useEffect(() => {
    fetchWorkouts()
    fetchExercises()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedId && exercises.length > 0) setSelectedId(exercises[0].id)
  }, [exercises, selectedId])

  const selected = exercises.find((e) => e.id === selectedId)
  const chartData = useMemo(
    () =>
      selected ? buildChartData(workouts, selectedId, selected.defaultTrackingType) : [],
    [workouts, selectedId, selected]
  )

  return (
    <div className="px-4 pt-12">
      <h1 className="text-2xl font-bold mb-6">Statistiken</h1>

      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="w-full bg-white rounded-2xl px-4 py-3 text-sm font-medium shadow-sm outline-none mb-6"
      >
        {exercises.map((ex) => (
          <option key={ex.id} value={ex.id}>
            {ex.name}
          </option>
        ))}
      </select>

      {chartData.length === 0 && (
        <div className="text-center text-gray-400 mt-20">
          <p className="text-4xl mb-4">📊</p>
          <p className="font-medium">Noch keine Daten</p>
          <p className="text-sm mt-1">Tracke diese Übung, um Statistiken zu sehen.</p>
        </div>
      )}

      {chartData.length > 0 && selected?.defaultTrackingType === 'weight_reps' && (
        <>
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">Volumen (kg total)</h2>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: unknown) => [`${Math.round(Number(v))} kg`, 'Volumen']} />
                <Line
                  type="monotone"
                  dataKey="volume"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">
              Geschätztes 1RM (Epley)
            </h2>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: unknown) => [`${Math.round(Number(v))} kg`, '1RM']} />
                <Line
                  type="monotone"
                  dataKey="oneRM"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {chartData.length > 0 && selected?.defaultTrackingType === 'distance_time' && (
        <>
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">Pace (min/km)</h2>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) =>
                    `${Math.floor(v)}:${Math.round((v % 1) * 60)
                      .toString()
                      .padStart(2, '0')}`
                  }
                />
                <Tooltip formatter={(v: unknown) => [formatPace(Number(v)), 'Pace']} />
                <Line
                  type="monotone"
                  dataKey="paceMinPerKm"
                  stroke="#22C55E"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">Distanz (km)</h2>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v: unknown) => [`${Number(v).toFixed(2)} km`, 'Distanz']}
                />
                <Bar dataKey="distanceKm" fill="#22C55E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {chartData.length > 0 && selected?.defaultTrackingType === 'time_only' && (
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">Dauer (Minuten)</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: unknown) => [`${Math.round(Number(v))} min`, 'Dauer']} />
              <Bar dataKey="durationMin" fill="#A855F7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
