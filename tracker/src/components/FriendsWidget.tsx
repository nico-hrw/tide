'use client'
import { useEffect, useRef, useState } from 'react'

interface FriendActivity {
  name: string
  stat: string
  unit: string
  action: string
  time: string
}

// Static mock data — replace with real social API when available
const ACTIVITIES: FriendActivity[] = [
  { name: 'Jim', stat: '6', unit: 'km', action: 'gelaufen 🏃', time: 'vor 2 Std.' },
  { name: 'Oli', stat: '320', unit: 'kcal', action: 'verbrannt 🔥', time: 'vor 4 Std.' },
  { name: 'Max', stat: '45', unit: 'min', action: 'trainiert 💪', time: 'vor 6 Std.' },
]

export default function FriendsWidget() {
  const [index, setIndex] = useState(0)
  const touchStartX = useRef(0)

  // 10s auto-rotate (was 4s — too fast)
  useEffect(() => {
    if (ACTIVITIES.length <= 1) return
    const id = setInterval(() => setIndex((i) => (i + 1) % ACTIVITIES.length), 10000)
    return () => clearInterval(id)
  }, [])

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 30) {
      if (dx < 0) setIndex(i => (i + 1) % ACTIVITIES.length)
      else setIndex(i => (i - 1 + ACTIVITIES.length) % ACTIVITIES.length)
    }
  }

  if (ACTIVITIES.length === 0) {
    return (
      <div style={{
        background: '#5BB8FF', borderRadius: 16, padding: '14px 12px',
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxSizing: 'border-box',
      }}>
        <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 11, textAlign: 'center', fontWeight: 500, lineHeight: 1.4 }}>
          Noch keine Freunde aktiv heute 🤫
        </div>
      </div>
    )
  }

  const { name, stat, unit, action, time } = ACTIVITIES[index]

  return (
    <div
      style={{
        background: '#5BB8FF', borderRadius: 16, padding: '14px 13px 13px',
        height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', boxSizing: 'border-box', overflow: 'hidden',
        userSelect: 'none',
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Name — dimmed, subordinate */}
      <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 14, fontWeight: 700, lineHeight: 1, marginBottom: 4 }}>
        {name}
      </div>

      {/* Big stat — watch-face style, fills the widget */}
      <div style={{ color: '#0D1117', fontWeight: 900, lineHeight: 0.9, letterSpacing: '-2px', marginBottom: 6 }}>
        <span style={{ fontSize: 44 }}>{stat}</span>
        <span style={{ fontSize: 22, letterSpacing: '-0.5px' }}> {unit}</span>
      </div>

      {/* Action */}
      <div style={{ color: 'rgba(0,0,0,0.65)', fontSize: 13, fontWeight: 600, lineHeight: 1.2, marginBottom: 3 }}>
        {action}
      </div>

      {/* Timestamp */}
      <div style={{ color: 'rgba(0,0,0,0.35)', fontSize: 10 }}>
        {time}
      </div>

      {/* No dots — removed per user request */}
    </div>
  )
}
