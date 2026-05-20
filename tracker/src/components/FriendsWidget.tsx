'use client'
import { useEffect, useState } from 'react'

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

  useEffect(() => {
    if (ACTIVITIES.length <= 1) return
    const id = setInterval(() => setIndex((i) => (i + 1) % ACTIVITIES.length), 4000)
    return () => clearInterval(id)
  }, [])

  if (ACTIVITIES.length === 0) {
    return (
      <div style={{
        background: '#5BB8FF', borderRadius: 16, padding: '14px 12px',
        height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxSizing: 'border-box',
      }}>
        <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 10, textAlign: 'center', fontWeight: 500, lineHeight: 1.4 }}>
          Noch keine Freunde aktiv heute 🤫
        </div>
      </div>
    )
  }

  const { name, stat, unit, action, time } = ACTIVITIES[index]

  return (
    <div style={{
      background: '#5BB8FF', borderRadius: 16, padding: '13px 12px 11px',
      height: 120, display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', boxSizing: 'border-box', overflow: 'hidden',
    }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
        <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>
          {name}
        </div>
        <div style={{ color: '#0D1117', fontWeight: 900, lineHeight: 0.95, letterSpacing: '-1.5px' }}>
          <span style={{ fontSize: 34 }}>{stat}</span>
          <span style={{ fontSize: 20, letterSpacing: '-0.5px' }}> {unit}</span>
        </div>
        <div style={{ color: 'rgba(0,0,0,0.6)', fontSize: 11, fontWeight: 600, lineHeight: 1.2, marginTop: 3 }}>
          {action}
        </div>
        <div style={{ color: 'rgba(0,0,0,0.35)', fontSize: 9, marginTop: 2 }}>
          {time}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {ACTIVITIES.map((_, i) => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: '50%',
            background: i === index ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)',
          }} />
        ))}
      </div>
    </div>
  )
}
